-- Spec v4, section 14 step 3: "Database access policies, plus a test suite that tries to
-- read named data as an unauthorized user and asserts that it fails. This is the gate.
-- Nothing else ships until it passes."
--
-- Run this whole file in the SQL Editor. It creates two synthetic users, then simulates
-- being authenticated as one of them (via SET ROLE + request.jwt.claims — the same
-- mechanism PostgREST uses to enforce RLS for real API callers, NOT the SQL Editor's
-- default superuser/table-owner connection, which bypasses RLS entirely and would give a
-- false pass). Everything rolls back at the end regardless of outcome.
--
-- Extend this file as new v4 tables land (scopes, reveal_requests, session_events,
-- colocation_events) — the gate is a standing discipline, not a one-time checkbox. Right
-- now only profile_attributes exists to test.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'gate-test-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'gate-test-b@example.invalid');

insert into profile_attributes (user_id, role_category, seniority_band, industry, source_hash)
values ('00000000-0000-0000-0000-0000000000a1', 'founder', 'mid', 'climate', 'test');

-- From here on, act as user B (not the owner) — the way an unauthorized caller hitting
-- the real API would be scoped.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  select count(*) into cnt
  from profile_attributes
  where user_id = '00000000-0000-0000-0000-0000000000a1';
  assert cnt = 0,
    format('GATE FAILED: unauthorized SELECT returned %s row(s) of another user''s named profile data', cnt);
  raise notice 'Gate test 1 passed: unauthorized SELECT correctly returned 0 rows.';

  update profile_attributes set industry = 'fintech'
  where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics cnt = row_count;
  assert cnt = 0,
    format('GATE FAILED: unauthorized UPDATE affected %s row(s) of another user''s profile', cnt);
  raise notice 'Gate test 2 passed: unauthorized UPDATE correctly affected 0 rows.';

  delete from profile_attributes
  where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics cnt = row_count;
  assert cnt = 0,
    format('GATE FAILED: unauthorized DELETE affected %s row(s) of another user''s profile', cnt);
  raise notice 'Gate test 3 passed: unauthorized DELETE correctly affected 0 rows.';

  raise notice 'RLS gate passed: an unauthorized user cannot read, modify, or delete another user''s profile_attributes row.';
end $$;

reset role;
rollback;
