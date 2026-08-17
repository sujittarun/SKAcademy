-- ============================================================
-- 2026-08-17b · Register tenant 'ska' — Super Kings Academy, Coimbatore
-- scope: ska
--
-- First tenant to COMMIT to using the platform in production (go-live
-- 2026-09-01). Everything else on the platform is pilot or demo, so this
-- row is the first one where being wrong costs a real academy real money.
--
-- WHAT THEY ARE, precisely, because it drives every choice below:
-- a CSK-affiliated cricket academy AND a facility-rental business at one
-- venue. Two revenue lines that the platform already models separately:
--
--   coaching  → members/enrollments/batches/fee_rules, resolve_fee(),
--               record_fee_payment(), the reminder ladder.
--   rental    → bookings, priced server-side.
--
-- They run TWO venues. Only ONE is being onboarded: the client bought a
-- two-month trial on a single venue and adds the second only if it
-- lands. So exactly one centres row exists, and the second venue is a
-- future INSERT, not a config edit — which is the whole reason centres
-- is a table and not a jsonb key.
--
-- ------------------------------------------------------------
-- WHY 'ground' AND 'nets' ARE MODELLED AS TWO "sports"
-- ------------------------------------------------------------
-- They are not sports; they are bookable facility types. The platform's
-- booking model keys everything — courts, rates, court ids — on the
-- string it calls `sport`, so a facility type IS what that column means
-- here. PLATFORM.md's forcing question ("can one SQL function answer
-- this for every tenant?") passes: slot pricing and slot claiming stay
-- one code path for Leo's tennis courts and SKA's nets alike.
--
-- record_booking() derives the court id as upper(left(sport,1)) || i,
-- so the first letters must be distinct across facility types:
--     nets   → N1 N2 N3 N4
--     ground → G1
-- 'nets' and 'ground' differ on N/G. Do not add a facility type starting
-- with N or G without re-checking this — the collision is silent and
-- presents as a booking landing on the wrong court.
--
-- ------------------------------------------------------------
-- WHY THE GROUND IS PRICED IN A 'daily' BLOCK AND NOT peak/offPeak
-- ------------------------------------------------------------
-- The nets rent by the hour. The ground rents by the DAY, at a rate that
-- depends on the day of week:
--     Mon–Thu ₹10,000   Fri ₹20,000   Sat–Sun ₹25,000
--
-- shared slot_rate(p_tenant, p_sport, p_hour) cannot express that: it
-- takes no date, so it cannot know the weekday, and its only axis is a
-- peakFrom hour cutoff. This is PLATFORM.md's "same word, different
-- shape" case — booking means both things — and the decision, made out
-- loud before writing this file, is:
--
--   · SAME TABLE. A ground-day and a net-hour are both honestly "a
--     customer reserved a facility for a period and owes money for it".
--     Not a new noun, so not a new table.
--   · NEW PRICING PATH. Money is money, so it lives in Postgres, not in
--     the app. A companion shared migration adds a date-aware pricing
--     function that reads the 'daily' block below and falls back to the
--     existing peak/offPeak behaviour for every other tenant.
--
-- This file only writes the CONFIG the shared function will read. It is
-- deliberately inert until that shared migration lands — a rates block
-- nothing reads is harmless; a client computing ₹25,000 in JavaScript is
-- the thing the house rule exists to prevent.
--
-- ------------------------------------------------------------
-- WHY hour = 0 MEANS "FULL DAY" FOR THE GROUND
-- ------------------------------------------------------------
-- bookings has CHECK (hour >= 0 AND hour <= 23), so there is no room for
-- a -1 sentinel, and bookings_slot_unique is on
-- (tenant_id, date, hour, court) WHERE court is not null and status
-- <> 'cancelled'.
--
-- The ground is never bookable by the hour (confirmed with the client:
-- full-day only), so hour = 0 carries no other meaning for court G1 and
-- is free to mean "the whole day". That makes the EXISTING unique index
-- do the work: one un-cancelled row per (ska, date, 0, G1) — the ground
-- cannot be double-sold for a date, with no new constraint and no new
-- table.
--
-- The alternative — one row per hour — was rejected because it splits
-- one ₹25,000 rental across N rows, so Finance sums it in fragments and
-- a cancellation becomes N deletes. One booking, one amount.
--
-- ------------------------------------------------------------
-- WHAT IS DELIBERATELY ABSENT
-- ------------------------------------------------------------
-- · NO UPI ID. resolve_upi() falls back to config.billing.upiIds->>0,
--   and PLATFORM.md forbids a real-looking payment handle that has not
--   been confirmed: a plausible id belonging to someone else is how a
--   parent's fee reaches a stranger. billing carries the payee name only
--   until the client supplies the real collection id.
-- · whatsapp.enabled = false, dryRun = true. The WhatsApp Business
--   number is not provisioned yet. A tenant with whatsapp enabled and no
--   number does not fail loudly — it queues reminders that never send.
-- · features.publicTimetable = false. New tenants are private by
--   default; they publish a BOOKING page, not a class timetable.
-- · modules.payouts = false. Single venue, no revenue share to split.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The tenant.
-- ------------------------------------------------------------
insert into tenants (id, name, kind, config)
values (
  'ska',
  'Super Kings Academy',
  'academy',
  jsonb_build_object(
    -- The operator console renders `cfg.sport || ' · ' || cfg.city`
    -- undefaulted, so omitting either prints the literal "undefined · ".
    'sport', 'Cricket',
    'city',  'Coimbatore',
    'brand', 'Super Kings Academy',
    'owner', 'Super Kings Academy Coimbatore',

    -- court_count() reads these. 0 would make every slot read "slot full".
    'courts', jsonb_build_object('nets', 4, 'ground', 1),

    -- Surface labels for the 4 nets. The client asked for ONE pool of
    -- four rather than separate Astro/Matting pools, so the surface is
    -- presentation, not a pricing axis: same ₹500 either way. Kept in
    -- config so the app and any future SQL agree on which net is which
    -- instead of each hard-coding the mapping.
    'courtLabels', jsonb_build_object(
      'N1', 'Astro Net 1',
      'N2', 'Astro Net 2',
      'N3', 'Matting Net 1',
      'N4', 'Matting Net 2'),

    'rates', jsonb_build_object(
      -- Nets: flat ₹500/hr. peak = offPeak is intentional, not a
      -- placeholder duplicated by accident — the client has not set an
      -- evening premium yet, and slot_rate() requires both keys or it
      -- raises 'unknown sport'. Raising the evening rate later is an
      -- edit to 'peak' alone.
      'nets', jsonb_build_object('peak', 500, 'offPeak', 500),
      'peakFrom', 16,
      -- Ground: full-day, by weekday. Keys are lowercase three-letter
      -- day names as produced by to_char(date, 'dy'), so the pricing
      -- function can look the rate up directly without a CASE ladder.
      'ground', jsonb_build_object(
        'fullDay', true,
        'daily', jsonb_build_object(
          'mon', 10000, 'tue', 10000, 'wed', 10000, 'thu', 10000,
          'fri', 20000,
          'sat', 25000, 'sun', 25000))),

    'billing', jsonb_build_object(
      'payee', 'Super Kings Academy',
      -- Empty ON PURPOSE. See header: no invented UPI id.
      'upiIds', '[]'::jsonb,
      'upiWindowDays', 5),

    'modules', jsonb_build_object(
      'booking',  true,   -- nets + ground rental
      'courts',   true,
      'coaching', true,   -- academy: batches, fees, attendance
      'payouts',  false,  -- single venue, nothing to split
      'whatsapp', true),  -- sold; gated below until the number exists

    'features', jsonb_build_object(
      -- The public landing page shows live availability before booking,
      -- which is an anonymous read of slots. Opt-in, and opted in
      -- deliberately here.
      'publicSlots',     true,
      'publicTimetable', false,
      -- Not sold. The client explicitly does not want player progression.
      'playerTracking',  false),

    'whatsapp', jsonb_build_object(
      'enabled', false,
      'mode',    'manual',
      'dryRun',  true)
  )
)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. The one venue.
--
-- VAKAMAN FE is capitalised exactly as the client writes it and as their
-- own Google listing reads ("Super Kings Academy Coimbatore (SKA
-- Coimbatore) | Vakaman FE"). Do not title-case it.
-- ------------------------------------------------------------
insert into centres (tenant_id, code, name, short_name, address, active, sort)
values ('ska', 'VAKAMAN', 'VAKAMAN FE', 'VAKAMAN FE', 'Coimbatore, Tamil Nadu', true, 1)
on conflict do nothing;

-- ------------------------------------------------------------
-- 3. Facility types, as sports rows.
--
-- 'cricket' is the coaching sport that batches and fee_rules hang off.
-- 'nets' and 'ground' are the bookable facilities; they carry the same
-- codes used in config.courts and config.rates, because record_booking()
-- and slot_rate() look them up by that string. Changing a code here
-- without changing config breaks booking silently.
-- ------------------------------------------------------------
insert into sports (tenant_id, code, name, active, sort)
values
  ('ska', 'cricket', 'Cricket',        true, 1),
  ('ska', 'nets',    'Practice Nets',  true, 2),
  ('ska', 'ground',  'Main Ground',    true, 3)
on conflict do nothing;

-- ------------------------------------------------------------
-- 4. Prove the row is readable the way the platform will read it.
--
-- A migration that inserts and does not assert is a migration that
-- reports success while the console renders "undefined · undefined".
-- ------------------------------------------------------------
do $$
declare v_cfg jsonb; v_centre text;
begin
  select config into v_cfg from tenants where id = 'ska';
  if v_cfg is null then
    raise exception 'tenant ska was not created';
  end if;
  if v_cfg->>'sport' is null or v_cfg->>'city' is null then
    raise exception 'console would render "undefined · undefined"';
  end if;
  if court_count(v_cfg, 'nets') <> 4 or court_count(v_cfg, 'ground') <> 1 then
    raise exception 'court_count disagrees with config.courts';
  end if;
  -- The nets must price through the EXISTING shared function today,
  -- before any new pricing code exists. If this fails, booking a net
  -- fails.
  if slot_rate('ska', 'nets', 9) <> 500 or slot_rate('ska', 'nets', 19) <> 500 then
    raise exception 'slot_rate does not return 500 for nets';
  end if;
  select name into v_centre from centres where tenant_id = 'ska' and code = 'VAKAMAN';
  if v_centre <> 'VAKAMAN FE' then
    raise exception 'centre name is %, expected VAKAMAN FE', coalesce(v_centre, '<missing>');
  end if;
end $$;
