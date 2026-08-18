-- ============================================================
-- 2026-08-18c · Astro and Matting become separate facilities, and the
--               academy gets a UPI collection id
-- scope: ska
--
-- ------------------------------------------------------------
-- 1. WHY THE ONE POOL OF FOUR IS BEING SPLIT
-- ------------------------------------------------------------
-- 2026-08-17b deliberately modelled the four nets as ONE facility with
-- the surface carried as a label, because the client asked for exactly
-- that: "no pooling just give 4 with difference in text, keep it simple."
-- Its own header recorded the condition under which that stops working:
--
--     "If Astro is ever priced above Matting they must become separate
--      facility types, which is a migration, not a config edit."
--
-- That is now the case — Astro ₹500/hour, Matting ₹400/hour. A label
-- cannot carry a price, so the split is the migration that header
-- anticipated. This is not a reversal; it is the documented next step.
--
-- COURT IDS. record_booking derives them as upper(left(sport,1)) || i:
--     astro   → A1 A2
--     matting → M1 M2
--     ground  → G1
-- A, M and G are distinct, which is the rule that keeps a booking off the
-- wrong court. Do not add a facility starting with any of those letters.
--
-- ------------------------------------------------------------
-- 2. THE EXISTING BOOKING IS MOVED, NOT ORPHANED
-- ------------------------------------------------------------
-- One row already exists on sport='nets', court='N1' — a test booking
-- made through the public page. After this migration 'nets' is not a
-- facility any more, so that row would price as 'unknown sport' and would
-- render on no board: invisible, but still occupying its slot.
--
-- It is moved to astro/A1, which preserves both the hour it holds and the
-- ₹500 it was charged. Deleting it would have been easier and would have
-- taught this migration nothing about the case where the rows are real.
--
-- ------------------------------------------------------------
-- 3. THE UPI ID IS PROVISIONAL — READ THIS BEFORE TRUSTING IT
-- ------------------------------------------------------------
-- 9585491000@ybl was supplied with the words "i am not sure if this is
-- correct but for now use this".
--
-- config.billing.upiIds was deliberately left EMPTY until now, because an
-- unverified payment handle that looks real is how a parent's fee reaches
-- a stranger. That risk has not gone away — it has been accepted
-- temporarily and knowingly.
--
-- BEFORE THE ACADEMY TAKES ITS FIRST REAL RUPEE: send ₹1 to this handle
-- and confirm the payee name shown by the UPI app is Super Kings
-- Academy's. If it is not, correct it here — it is one UPDATE, and this
-- is the only place it lives, which is why resolve_upi() exists.
-- ============================================================

-- ------------------------------------------------------------
-- Config: two net facilities, priced apart, plus the collection id.
-- jsonb_set on a missing key silently does nothing, so the whole object
-- is rebuilt by merge (||) instead — the same trap that took Raj's
-- timetable down in 0004.
-- ------------------------------------------------------------
update tenants
   set config = config
     || jsonb_build_object(
          'courts', jsonb_build_object(
            'astro',   2,
            'matting', 2,
            'ground',  1),
          'rates', jsonb_build_object(
            -- peak = offPeak on both: no evening premium has been set.
            -- Raising the evening rate later is an edit to 'peak' alone.
            'astro',   jsonb_build_object('peak', 500, 'offPeak', 500),
            'matting', jsonb_build_object('peak', 400, 'offPeak', 400),
            'peakFrom', 16,
            'ground', jsonb_build_object(
              'fullDay', true,
              'daily', jsonb_build_object(
                'mon', 10000, 'tue', 10000, 'wed', 10000, 'thu', 10000,
                'fri', 20000,
                'sat', 25000, 'sun', 25000))),
          'courtLabels', jsonb_build_object(
            'A1', 'Astro Net 1',
            'A2', 'Astro Net 2',
            'M1', 'Matting Net 1',
            'M2', 'Matting Net 2',
            'G1', 'Main Ground'),
          'billing', jsonb_build_object(
            'payee',  'Super Kings Academy',
            -- resolve_upi() reads upiIds->>0. See the header: provisional.
            'upiIds', jsonb_build_array('9585491000@ybl'),
            'upiWindowDays', 5))
 where id = 'ska';

-- ------------------------------------------------------------
-- The facility rows the app lists.
-- ------------------------------------------------------------
update sports set active = false where tenant_id = 'ska' and code = 'nets';

insert into sports (tenant_id, code, name, active, sort)
values
  ('ska', 'astro',   'Astro Nets',   true, 2),
  ('ska', 'matting', 'Matting Nets', true, 3)
on conflict do nothing;

update sports set sort = 4 where tenant_id = 'ska' and code = 'ground';

-- ------------------------------------------------------------
-- Move the existing booking. tenant_id is in the WHERE clause: ids are
-- global on this platform, and a bare update on sport would reach every
-- academy's rows.
-- ------------------------------------------------------------
update bookings
   set sport = 'astro',
       court = case court when 'N1' then 'A1' when 'N2' then 'A2'
                          when 'N3' then 'M1' when 'N4' then 'M2'
                          else court end
 where tenant_id = 'ska' and sport = 'nets';

-- A matting court cannot sit under the astro facility. Split the moved
-- rows that belong to matting.
update bookings
   set sport = 'matting'
 where tenant_id = 'ska' and sport = 'astro' and court in ('M1', 'M2');

-- ------------------------------------------------------------
-- Prove it.
-- ------------------------------------------------------------
do $$
declare v_cfg jsonb; v_left int; r record; q jsonb;
begin
  select config into v_cfg from tenants where id = 'ska';

  if court_count(v_cfg, 'astro')   <> 2 then raise exception 'astro court count wrong'; end if;
  if court_count(v_cfg, 'matting') <> 2 then raise exception 'matting court count wrong'; end if;
  if court_count(v_cfg, 'ground')  <> 1 then raise exception 'ground court count wrong'; end if;

  -- The two surfaces must price APART. This is the whole point.
  if slot_price('ska','astro',   current_date, 9)  <> 500 then raise exception 'astro is not 500'; end if;
  if slot_price('ska','matting', current_date, 9)  <> 400 then raise exception 'matting is not 400'; end if;
  if slot_price('ska','astro',   current_date, 19) <> 500 then raise exception 'astro evening drifted'; end if;
  if slot_price('ska','matting', current_date, 19) <> 400 then raise exception 'matting evening drifted'; end if;

  -- The ground is untouched by this migration.
  if slot_price('ska','ground', date '2026-09-05', 0) <> 25000 then raise exception 'ground Sat drifted'; end if;
  if not is_full_day('ska','ground') then raise exception 'ground stopped being full day'; end if;

  -- 'nets' must no longer price at all — if it does, the split is partial.
  begin
    perform slot_price('ska','nets', current_date, 9);
    raise exception 'nets still prices; the split did not take';
  exception when others then
    if sqlerrm <> 'unknown sport' then raise; end if;
  end;

  -- NOTHING may be left stranded on the retired facility.
  select count(*) into v_left from bookings where tenant_id='ska' and sport='nets';
  if v_left <> 0 then raise exception '% booking(s) still on nets', v_left; end if;

  -- Every remaining ska booking must price under its new facility, and
  -- sit on a court that facility can actually generate.
  for r in select id, sport, court, amount from bookings
            where tenant_id='ska' and status <> 'cancelled' loop
    if r.sport not in ('astro','matting','ground') then
      raise exception 'booking % is on unknown facility %', r.id, r.sport;
    end if;
    if left(r.court,1) <> upper(left(r.sport,1)) then
      raise exception 'booking % is on court % which facility % cannot generate',
        r.id, r.court, r.sport;
    end if;
  end loop;

  -- The public quote must answer for both surfaces, at the two prices.
  q := public_quote('ska','astro',   current_date + 2, array[18,19]);
  if (q->>'total')::int <> 1000 then raise exception 'astro 2h quoted %', q->>'total'; end if;
  q := public_quote('ska','matting', current_date + 2, array[18,19]);
  if (q->>'total')::int <> 800  then raise exception 'matting 2h quoted %', q->>'total'; end if;

  -- The collection id must resolve, or fees have nowhere to go.
  if resolve_upi('ska', null, null) is null then
    raise exception 'resolve_upi returned nothing';
  end if;
end $$;
