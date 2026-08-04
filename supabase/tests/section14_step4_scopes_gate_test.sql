-- Extends the RLS gate (section11_rls_gate_test.sql) to the tables added in step 4:
-- scopes and scope_members. Same pattern — SET ROLE + simulated JWT to act as a real
-- unauthorized API caller, not the SQL Editor's superuser connection. Rolls back always.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'gate-test-c@example.invalid'),
  ('00000000-0000-0000-0000-0000000000d1', 'gate-test-d@example.invalid');

-- Give user C a geo scope with a real (fake) precise center point — this is exactly the
-- kind of raw coordinate that must never be readable by anyone but its creator.
insert into scopes (id, kind, center, radius_m, created_by)
values (
  '00000000-0000-0000-0000-0000000000e1',
  'geo',
  st_setsrid(st_makepoint(103.8198, 1.3521), 4326)::geography,
  5000,
  '00000000-0000-0000-0000-0000000000c1'
);

insert into scope_members (scope_id, user_id)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1');

-- Act as user D (not C, not a member of C's scope).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  select count(*) into cnt
  from scopes
  where id = '00000000-0000-0000-0000-0000000000e1';
  assert cnt = 0,
    format('GATE FAILED: unauthorized user could read another user''s scope (including its precise center point) — %s row(s)', cnt);
  raise notice 'Gate test 4 passed: unauthorized SELECT on scopes correctly returned 0 rows.';

  select count(*) into cnt
  from scope_members
  where scope_id = '00000000-0000-0000-0000-0000000000e1';
  assert cnt = 0,
    format('GATE FAILED: unauthorized user could read another user''s scope_members row — %s row(s)', cnt);
  raise notice 'Gate test 5 passed: unauthorized SELECT on scope_members correctly returned 0 rows.';

  raise notice 'Step 4 gate passed: scopes and scope_members are correctly locked to their owner.';
end $$;

reset role;
rollback;
