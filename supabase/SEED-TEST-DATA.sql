-- ============================================================
-- 150 sample students for UI testing at real scale.
--
--   AcademyManager/scripts/_sql.py SuperKingsAcademy/supabase/SEED-TEST-DATA.sql
--
-- REMOVE IT AGAIN WITH SuperKingsAcademy/supabase/REMOVE-TEST-DATA.sql,
-- which is keyed on members.is_demo — every row here sets it, so the
-- cleanup cannot miss them and cannot touch a real family.
--
-- WHY THIS EXISTS
-- The app was designed against five students. The client has 125-130, and
-- the screens that matter (roster, register, chase queue) behave
-- completely differently at that size — one of them drew 23,000px of list.
-- Sample data at the real size is the only way to see it.
--
-- NAMES ARE SYNTHETIC AND CHECKED. Composed from two pools, then every
-- generated name is compared against members ACROSS EVERY TENANT before a
-- single row is written; the block aborts if any collides. The demo repo
-- once shipped five real member names in public fixtures, and this is the
-- cheap defence against repeating it.
--
-- PHONES are the platform's synthetic 90000 block, so no real handset is
-- reachable from any of it.
-- ============================================================

do $$
declare
  v_centre  bigint;
  v_morning bigint;
  v_evening bigint;
  v_names   text[];
  v_clash   text;
  v_first   text[] := array[
    'Aarav','Vihaan','Dhruv','Kavin','Nithin','Pranav','Rithvik','Sanjay','Tharun','Vishal',
    'Yuvan','Adhya','Ishani','Keerthana','Nivedha','Swetha','Bhavesh','Charan','Deepak','Eshwar',
    'Gokul','Harish','Jeeva','Karthik','Lokesh','Mithun','Naveen','Prithvi','Rohit','Surya'];
  /* FIVE surnames, paired with the thirty first names by INTEGER DIVISION
     — first[i % 30] with last[i / 30] — which gives 30 x 5 = 150 distinct
     people.

     The first version used last[(i * 7 + 3) % 15]. 210 % 15 = 0, so member
     i and member i+30 got the same first name AND the same surname: 150
     students sharing 30 names, five copies each. A register full of
     identical names cannot be tested against, because you cannot tell
     which row you just tapped. */
  v_last    text[] := array[
    'Krishnamurthy','Sundaravel','Rajasekar','Balachandar','Chidambaram'];
  i         int;
  v_name    text;
  v_member  bigint;
  v_batch   bigint;
  v_renew   date;
  v_count   int;
begin
  select id into v_centre  from centres where tenant_id='ska' and code='VAKAMAN';
  select id into v_morning from batches where tenant_id='ska' and code='MORNING';
  select id into v_evening from batches where tenant_id='ska' and code='EVENING';
  if v_centre is null or v_morning is null or v_evening is null then
    raise exception 'ska is missing its centre or batches — run the tenant migrations first';
  end if;

  -- ---------- build the names, then prove none is a real person ----------
  v_names := array[]::text[];
  for i in 0 .. 149 loop
    v_names := v_names || (v_first[1 + (i % 30)] || ' ' || v_last[1 + (i / 30)]);
  end loop;

  select string_agg(distinct m.name, ', ') into v_clash
    from members m
   where lower(btrim(m.name)) = any (
           select lower(btrim(n)) from unnest(v_names) n);
  if v_clash is not null then
    raise exception 'generated name(s) collide with real members: %', v_clash;
  end if;

  -- ---------- the students ----------
  for i in 0 .. 149 loop
    v_name  := v_names[i + 1];
    v_batch := case when i % 2 = 0 then v_morning else v_evening end;

    /* A spread worth testing against, not 150 identical rows:
         every 11th is well overdue  -> the chase queue and the red states
         every 7th is a day or two   -> "due today" and the +5 rung
         the rest are spread a month -> the ordinary case                */
    v_renew := case
      when i % 11 = 0 then ist_today() - ((3 + (i % 17)))::int
      when i % 7  = 0 then ist_today() - ((1 + (i % 3)))::int
      else                 ist_today() + ((i % 30) + 1)::int
    end;

    insert into members (tenant_id, name, phone, parent_name, parent_phone,
                         program, status, is_demo, joined, dob, gender, added_by)
    values ('ska', v_name,
            '90000' || lpad((10000 + i)::text, 5, '0'),
            'Parent of ' || split_part(v_name, ' ', 1),
            '90000' || lpad((10000 + i)::text, 5, '0'),
            'Cricket coaching',
            case when i % 23 = 0 then 'paused' else 'active' end,
            true,
            (ist_today() - ((40 + (i % 300)))::int),
            (ist_today() - ((8 + (i % 8)) * 365)::int),
            case when i % 5 = 0 then 'female' else 'male' end,
            'seed')
    returning id into v_member;

    insert into enrollments (tenant_id, member_id, centre_id, batch_id,
                             plan_months, joined_on, renewal_on, status)
    values ('ska', v_member, v_centre, v_batch,
            1, (ist_today() - ((40 + (i % 300)))::int), v_renew, 'active');
  end loop;

  -- ---------- prove it ----------
  select count(*) into v_count from members where tenant_id='ska' and is_demo;
  if v_count <> 150 then
    raise exception 'expected 150 sample students, found %', v_count;
  end if;

  if exists (select 1 from enrollments e
              where e.tenant_id='ska' and e.batch_id is null and e.status='active') then
    raise exception 'a seeded enrolment has no batch';
  end if;

  -- nothing may have landed on another academy
  if exists (select 1 from members where is_demo and tenant_id <> 'ska'
              and added_by = 'seed') then
    raise exception 'seed wrote outside ska';
  end if;
end $$;

select 'members (demo)' as t, count(*)::text as n from members where tenant_id='ska' and is_demo
union all select 'members (total)', count(*)::text from members where tenant_id='ska'
union all select 'enrollments',     count(*)::text from enrollments where tenant_id='ska'
union all select 'morning',         count(*)::text from enrollments e join batches b on b.id=e.batch_id
                                     where e.tenant_id='ska' and b.code='MORNING'
union all select 'evening',         count(*)::text from enrollments e join batches b on b.id=e.batch_id
                                     where e.tenant_id='ska' and b.code='EVENING'
union all select 'overdue today',   count(*)::text from enrollments
                                     where tenant_id='ska' and renewal_on < ist_today();
