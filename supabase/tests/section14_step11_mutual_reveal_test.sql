-- Spec v4, section 14 step 11 gate test: the target can read the requester's identity while
-- a request is pending (section 5 step 2), a stranger still cannot, and revealing creates a
-- mutual connections row so both sides can now read each other's full profile.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'gate-test-d-requester@example.invalid'),
  ('00000000-0000-0000-0000-0000000000d2', 'gate-test-d-target@example.invalid'),
  ('00000000-0000-0000-0000-0000000000d3', 'gate-test-d-stranger@example.invalid');

-- migration 0002's trigger already auto-created a profiles row for each of these on the
-- auth.users insert above (with an empty full_name) — update rather than insert.
update profiles set full_name = 'Requester D1' where id = '00000000-0000-0000-0000-0000000000d1';
update profiles set full_name = 'Target D2' where id = '00000000-0000-0000-0000-0000000000d2';
update profiles set full_name = 'Stranger D3' where id = '00000000-0000-0000-0000-0000000000d3';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

do $$
begin
  perform create_reveal_request('00000000-0000-0000-0000-0000000000d2', 'You both went to Wesleyan.');
  raise notice 'Setup: D1 requested a reveal from D2.';
end $$;

-- Target D2 should be able to read D1's full profile immediately, while pending.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

do $$
declare
  v_name text;
begin
  select full_name into v_name from profiles where id = '00000000-0000-0000-0000-0000000000d1';
  assert v_name = 'Requester D1',
    format('GATE FAILED: target could not read requester''s identity while pending (got %s)', v_name);
  raise notice 'Gate test 1 passed: target can read the requester''s identity while pending.';
end $$;

-- A stranger must still not be able to read D1's profile via this path.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  select count(*) into cnt from profiles where id = '00000000-0000-0000-0000-0000000000d1';
  assert cnt = 0, format('GATE FAILED: a stranger could read %s row(s) of the requester''s profile', cnt);
  raise notice 'Gate test 2 passed: a stranger cannot read the requester''s identity.';
end $$;

-- D2 reveals back — should create a mutual connection.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

do $$
begin
  perform reveal_request(id) from reveal_requests
  where requester_id = '00000000-0000-0000-0000-0000000000d1'
    and target_id = '00000000-0000-0000-0000-0000000000d2';
end $$;

reset role;
do $$
declare
  cnt int;
begin
  select count(*) into cnt from connections
  where (user_a = '00000000-0000-0000-0000-0000000000d1' and user_b = '00000000-0000-0000-0000-0000000000d2')
     or (user_a = '00000000-0000-0000-0000-0000000000d2' and user_b = '00000000-0000-0000-0000-0000000000d1');
  assert cnt = 1, format('GATE FAILED: expected exactly 1 connections row after reveal, got %s', cnt);
  raise notice 'Gate test 3 passed: revealing created exactly one mutual connections row.';
end $$;

-- Now D1 (the original requester) should be able to read D2's full profile too, via the
-- connections-based policy from migration 0025 — not the pending-request policy, since the
-- request is no longer pending.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

do $$
declare
  v_name text;
begin
  select full_name into v_name from profiles where id = '00000000-0000-0000-0000-0000000000d2';
  assert v_name = 'Target D2',
    format('GATE FAILED: requester could not read target''s identity after mutual reveal (got %s)', v_name);
  raise notice 'Gate test 4 passed: after mutual reveal, requester can read target''s identity via the connection.';
end $$;

reset role;
rollback;
