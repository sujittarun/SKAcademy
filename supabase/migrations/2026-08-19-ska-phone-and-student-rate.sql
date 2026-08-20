-- ============================================================
-- 2026-08-19 · SKA's phone number, and the 10% student rate
-- scope: ska
--
-- Two figures the academy gave us on 2026-08-19:
--   · the number families should call or message  — +91 98430 23911
--   · the discount for their own students on nets — 10%
--
-- NOT jsonb_set FOR THE PHONE. `contact` does not exist as a key on this
-- tenant, and jsonb_set with create_missing creates only the FINAL key of
-- the path — so jsonb_set(config,'{contact,phone}',…) writes nothing at
-- all and reports success. That exact mistake took Raj's public timetable
-- down (migration 0004). Object merge, then assert.
--
-- The discount is read by request_booking() as config.rates
-- .studentDiscountPct. It is data rather than code so this academy can
-- change its mind without a migration, and so the next tenant can want a
-- different number.
--
-- STORED AS TEN DIGITS. Every phone on this platform is ten digits —
-- members.phone, bookings.phone, right(phone,10) in half a dozen
-- functions — and a stored "+91 98430 23911" would be the one that does
-- not match any of them. Presentation belongs to the page.
-- ============================================================

update tenants
   set config = config
     || jsonb_build_object('contact',
          coalesce(config -> 'contact', '{}'::jsonb)
            || jsonb_build_object('phone', '9843023911', 'whatsapp', '9843023911'))
     || jsonb_build_object('rates',
          coalesce(config -> 'rates', '{}'::jsonb)
            || jsonb_build_object('studentDiscountPct', 10))
 where id = 'ska';

do $$
declare v_phone text; v_wa text; v_pct numeric; v_rates jsonb;
begin
  select config #>> '{contact,phone}',
         config #>> '{contact,whatsapp}',
         (config #>> '{rates,studentDiscountPct}')::numeric,
         config -> 'rates'
    into v_phone, v_wa, v_pct, v_rates
    from tenants where id = 'ska';

  if v_phone <> '9843023911' then
    raise exception 'the phone did not land: %', coalesce(v_phone, '<null>');
  end if;
  if v_wa <> '9843023911' then
    raise exception 'the whatsapp number did not land: %', coalesce(v_wa, '<null>');
  end if;
  if v_pct <> 10 then
    raise exception 'the student rate did not land: %', coalesce(v_pct::text, '<null>');
  end if;

  /* The merge must have ADDED to rates, not replaced it. Losing the net
     and ground prices to a careless || is the failure this checks for. */
  if not (v_rates ? 'astro' and v_rates ? 'matting' and v_rates ? 'ground') then
    raise exception 'the rates block lost its prices: %', v_rates;
  end if;
  if (v_rates #>> '{ground,daily,sat}')::int <> 25000 then
    raise exception 'the ground prices changed';
  end if;
end $$;
