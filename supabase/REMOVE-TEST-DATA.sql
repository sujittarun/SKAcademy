-- ============================================================
-- Remove everything the 2026-08-18 scenario test created.
-- Run this before the academy goes live on 2026-09-01.
--
--   AcademyManager/scripts/_sql.py SuperKingsAcademy/supabase/REMOVE-TEST-DATA.sql
--
-- It is keyed on members.is_demo — the platform's own marker for sample
-- rows — and on the synthetic 90000 phone block, so it cannot touch a
-- real family. Children first, because attendance_records.enrollment_id
-- has no ON DELETE CASCADE.
--
-- IT DOES NOT TOUCH: the batches (Morning/Evening are real), the fee
-- rules (placeholders the academy should correct, not delete), or the
-- two genuine rows made while testing the app by hand ('sujit',
-- 'tarun', 'kumar') — remove those yourself if you want them gone.
-- ============================================================

-- 1. bookings made by the seed (synthetic phones only)
delete from bookings
 where tenant_id = 'ska'
   and (phone like '900005%' or phone like '900003%')
;

-- 2. the maintenance block the test left on the ground
delete from bookings
 where tenant_id = 'ska' and source = 'Maintenance' and name = 'Pitch relaying';

-- 3. the five seeded students, children first
delete from member_timeline
 where tenant_id = 'ska'
   and member_id in (select id from members where tenant_id='ska' and is_demo);

delete from payments
 where tenant_id = 'ska'
   and enrollment_id in (select id from enrollments where tenant_id='ska'
                          and member_id in (select id from members where tenant_id='ska' and is_demo));

delete from attendance_records
 where enrollment_id in (select id from enrollments where tenant_id='ska'
                          and member_id in (select id from members where tenant_id='ska' and is_demo));

delete from enrollments
 where tenant_id = 'ska'
   and member_id in (select id from members where tenant_id='ska' and is_demo);

delete from applications
 where tenant_id = 'ska' and phone like '900004%';

delete from members where tenant_id = 'ska' and is_demo;

-- 3b. the empty registers those students leave behind.
--
-- A session is "this batch met on this date"; the marks hang off it. Once
-- the seeded students are gone their sessions survive with nothing in
-- them, and attendance_dashboard() then reports a class that met and
-- nobody attended — worse than no record at all. Only sessions with no
-- marks LEFT are removed, so a session holding a real student's
-- attendance is never touched.
delete from sessions s
 where s.tenant_id = 'ska'
   and not exists (select 1 from attendance_records ar where ar.session_id = s.id);

-- 4. what is left should be only what you made by hand
select 'members'      as t, count(*) from members      where tenant_id='ska'
union all select 'enrollments', count(*) from enrollments where tenant_id='ska'
union all select 'bookings',    count(*) from bookings    where tenant_id='ska'
union all select 'applications',count(*) from applications where tenant_id='ska'
union all select 'fee_rules',   count(*) from fee_rules   where tenant_id='ska'
union all select 'batches',     count(*) from batches     where tenant_id='ska'
union all select 'sessions',     count(*) from sessions     where tenant_id='ska'
union all select 'attendance',   count(*) from attendance_records ar
                                  join sessions s on s.id = ar.session_id
                                 where s.tenant_id='ska'
union all select 'payments',     count(*) from payments     where tenant_id='ska';
