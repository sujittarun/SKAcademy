-- ============================================================
-- 2026-08-18g · Morning and Evening batches
-- scope: ska
--
-- The roster had a Batch column and nothing to put in it, because the
-- academy has no batches: a member is enrolled at a CENTRE but in no
-- group, so `batch_id` is null on every enrolment and the column reads
-- blank. The admission form's "preferred time" was also a free-text
-- string going nowhere.
--
-- Two batches, which is what the client says they run for now: morning
-- and evening. Deliberately NOT a guess at age groups — Sub-Junior,
-- Junior and Senior are real distinctions this academy may well make, but
-- inventing them would put children into groups nobody chose. Two honest
-- rows beat six invented ones, and adding more is an INSERT.
--
-- TIMES are the ones the nets are open around, not a claim about when
-- coaching actually runs. Correct them when the client says.
--
-- `days` is an int[] of ISO weekday numbers (1 = Monday). Monday-Saturday
-- for both; Sunday is left out because a full-size ground on a Sunday is
-- the ₹25,000 rental, and running a coaching batch across it would put
-- the academy's two revenue lines on the same grass at the same time.
--
-- NO FEE RULES. The client has deferred them, so resolve_fee() still
-- returns 'unset' and reminder_queue() still marks these members
-- 'fee_not_set' and declines to chase them. That is the correct behaviour
-- and this migration deliberately does not paper over it: a batch is a
-- time, not a price.
-- ============================================================

insert into batches (tenant_id, centre_id, code, name, sport, days,
                     start_time, end_time, capacity, active, sort)
select 'ska', c.id, v.code, v.name, 'cricket', array[1,2,3,4,5,6],
       v.starts::time, v.ends::time, 30, true, v.sort
  from centres c
  cross join (values
    ('MORNING', 'Morning', '06:00', '08:00', 1),
    ('EVENING', 'Evening', '16:00', '18:00', 2)
  ) as v(code, name, starts, ends, sort)
 where c.tenant_id = 'ska' and c.code = 'VAKAMAN'
on conflict do nothing;

-- ------------------------------------------------------------
-- Prove it, and put the one existing member somewhere.
--
-- 'tarun' was approved before any batch existed, so the enrolment carries
-- centre but no batch. Left like that the roster shows a member in no
-- group — which is exactly the blank the client reported. Morning is the
-- default because it is the first batch, and it is one dropdown to change.
-- ------------------------------------------------------------
do $$
declare v_morning bigint; v_n int;
begin
  select id into v_morning
    from batches where tenant_id = 'ska' and code = 'MORNING';
  if v_morning is null then
    raise exception 'the Morning batch was not created';
  end if;

  select count(*) into v_n from batches where tenant_id = 'ska' and active;
  if v_n <> 2 then
    raise exception 'expected 2 batches, found %', v_n;
  end if;

  -- Only enrolments with NO batch at all. Never move someone already placed.
  update enrollments
     set batch_id = v_morning
   where tenant_id = 'ska' and batch_id is null and status = 'active';

  if exists (select 1 from enrollments
              where tenant_id = 'ska' and status = 'active' and batch_id is null) then
    raise exception 'an active enrolment is still in no batch';
  end if;

  -- The batch must belong to the same academy as the enrolment it is on.
  if exists (
    select 1 from enrollments e
      join batches b on b.id = e.batch_id
     where e.tenant_id = 'ska' and b.tenant_id <> 'ska') then
    raise exception 'an enrolment points at another academy''s batch';
  end if;
end $$;
