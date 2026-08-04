-- Spec v4, section 14 step 10 gate test: reveal_requests state machine, asymmetric
-- visibility (section 11.2), and the rate limit. Same discipline as
-- section11_rls_gate_test.sql — SET ROLE + request.jwt.claims to simulate real
-- unauthorized/authorized API callers, not the SQL Editor's superuser connection. Rolls
-- back at the end regardless of outcome.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'gate-test-c-requester@example.invalid'),
  ('00000000-0000-0000-0000-0000000000c2', 'gate-test-c-target@example.invalid'),
  ('00000000-0000-0000-0000-0000000000c3', 'gate-test-c-stranger@example.invalid');

-- Act as the requester (C1): create a request targeting C2.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

do $$
declare
  v_id uuid;
begin
  v_id := create_reveal_request('00000000-0000-0000-0000-0000000000c2', 'You both went to Wesleyan.');
  assert v_id is not null, 'GATE FAILED: create_reveal_request did not return an id';
  raise notice 'Gate test 1 passed: requester can create a reveal request.';
end $$;

-- A stranger (C3) must not be able to read the request at all.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  select count(*) into cnt from reveal_requests
  where requester_id = '00000000-0000-0000-0000-0000000000c1'
    and target_id = '00000000-0000-0000-0000-0000000000c2';
  assert cnt = 0, format('GATE FAILED: an unrelated user could read %s reveal_request row(s)', cnt);
  raise notice 'Gate test 2 passed: an unrelated user cannot read the request.';
end $$;

-- The target (C2) can read it while pending, and can reveal it.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  select count(*) into cnt from reveal_requests
  where requester_id = '00000000-0000-0000-0000-0000000000c1'
    and target_id = '00000000-0000-0000-0000-0000000000c2';
  assert cnt = 1, format('GATE FAILED: target could not read the request addressed to them (%s rows)', cnt);
  raise notice 'Gate test 3 passed: target can read the request addressed to them.';

  perform reveal_request(id) from reveal_requests
  where requester_id = '00000000-0000-0000-0000-0000000000c1'
    and target_id = '00000000-0000-0000-0000-0000000000c2';
  raise notice 'Gate test 4 passed: target can reveal the request.';
end $$;

-- Section 11.2: once revealed, the requester must lose read access to the row (no channel
-- to observe status beyond "pending").
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  select count(*) into cnt from reveal_requests
  where requester_id = '00000000-0000-0000-0000-0000000000c1'
    and target_id = '00000000-0000-0000-0000-0000000000c2';
  assert cnt = 0,
    format('GATE FAILED: requester could still read %s row(s) after state left pending', cnt);
  raise notice 'Gate test 5 passed: requester loses read access once the request is no longer pending.';
end $$;

-- A stranger must not be able to reveal a request that isn't addressed to them.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

do $$
declare
  v_id uuid;
begin
  v_id := create_reveal_request('00000000-0000-0000-0000-0000000000c2', 'Second request, for the impersonation test.');

  reset role;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';

  begin
    perform reveal_request(v_id);
    raise exception 'GATE FAILED: a stranger was able to reveal a request not addressed to them';
  exception
    when others then
      if sqlerrm like 'GATE FAILED%' then
        raise;
      end if;
      raise notice 'Gate test 6 passed: a stranger cannot reveal someone else''s request (%).', sqlerrm;
  end;
end $$;

-- Rate limit: a 4th outstanding request in the trailing 24h must be rejected.
-- Creating auth.users rows requires the SQL Editor's default (superuser/table-owner) role
-- — must happen before switching to `authenticated`, same as every other synthetic user in
-- this file.
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c4', 'gate-test-c-target2@example.invalid'),
  ('00000000-0000-0000-0000-0000000000c5', 'gate-test-c-target3@example.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

do $$
declare
  v_target2 uuid := '00000000-0000-0000-0000-0000000000c4';
  v_target3 uuid := '00000000-0000-0000-0000-0000000000c5';
begin
  -- C1 already has 1 pending (created above, targeting a fresh target so it doesn't
  -- collide with the revealed one) plus these two makes 3 outstanding.
  perform create_reveal_request(v_target2, 'Third request.');
  perform create_reveal_request(v_target3, 'Fourth attempt below.');

  begin
    perform create_reveal_request('00000000-0000-0000-0000-0000000000c2', 'Should be blocked by rate limit.');
    raise exception 'GATE FAILED: a 4th outstanding request in 24h was allowed through';
  exception
    when others then
      if sqlerrm like 'GATE FAILED%' then
        raise;
      end if;
      raise notice 'Gate test 7 passed: rate limit blocked the 4th outstanding request (%).', sqlerrm;
  end;
end $$;

reset role;
rollback;
