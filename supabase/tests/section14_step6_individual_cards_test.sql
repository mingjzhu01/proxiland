-- Spec v4, section 14 step 6: individual_cards_for_scope. Self-contained synthetic test —
-- rolls back regardless of outcome. Verifies: the viewer never sees their own card, a
-- genuinely nearby person's card is returned with a correctly-computed rough distance
-- band (never exact metres, per section 7), and a far-away person is excluded.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cards-test-viewer@example.invalid'),
  ('00000000-0000-0000-0000-0000000000f2', 'cards-test-nearby@example.invalid'),
  ('00000000-0000-0000-0000-0000000000f3', 'cards-test-faraway@example.invalid');

insert into profile_attributes (user_id, role_category, seniority_band, industry, source_hash)
values
  ('00000000-0000-0000-0000-0000000000f1', 'founder', 'mid', 'climate', 'test'),
  ('00000000-0000-0000-0000-0000000000f2', 'investor', 'senior', 'fintech', 'test'),
  ('00000000-0000-0000-0000-0000000000f3', 'engineer', 'early', 'consumer', 'test');

-- Viewer and "nearby" person both close to Marina Bay Sands. "faraway" person is
-- genuinely elsewhere (Tokyo) — outside any reasonable scope radius.
insert into visibility_sessions (user_id, location, expires_at, is_active) values
  ('00000000-0000-0000-0000-0000000000f1', st_setsrid(st_makepoint(103.8560, 1.2836), 4326)::geography, now() + interval '2 hours', true),
  ('00000000-0000-0000-0000-0000000000f2', st_setsrid(st_makepoint(103.8567, 1.2840), 4326)::geography, now() + interval '2 hours', true),
  ('00000000-0000-0000-0000-0000000000f3', st_setsrid(st_makepoint(139.6503, 35.6762), 4326)::geography, now() + interval '2 hours', true);

insert into scopes (id, kind, center, radius_m, created_by)
values (
  '00000000-0000-0000-0000-0000000000f9',
  'geo',
  st_setsrid(st_makepoint(103.8560, 1.2836), 4326)::geography,
  5000,
  '00000000-0000-0000-0000-0000000000f1'
);

insert into scope_members (scope_id, user_id)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

do $$
declare
  r record;
  cnt int := 0;
  found_nearby boolean := false;
begin
  for r in select * from individual_cards_for_scope('00000000-0000-0000-0000-0000000000f9') loop
    cnt := cnt + 1;
    assert r.user_id <> '00000000-0000-0000-0000-0000000000f1',
      'FAILED: viewer''s own card appeared in their own feed';
    assert r.user_id <> '00000000-0000-0000-0000-0000000000f3',
      'FAILED: a person genuinely far away (Tokyo) appeared in a 5km Singapore scope';
    if r.user_id = '00000000-0000-0000-0000-0000000000f2' then
      found_nearby := true;
      assert r.distance_band in ('in this building', 'nearby'),
        format('FAILED: expected a rough distance band for the nearby person, got %s', r.distance_band);
      raise notice 'Nearby person card: line=%, distance_band=%, used_generic=%', r.line, r.distance_band, r.used_generic;
    end if;
  end loop;

  assert cnt = 1, format('FAILED: expected exactly 1 card (the nearby person only), got %s', cnt);
  assert found_nearby, 'FAILED: the nearby person''s card was never returned';

  raise notice 'Step 6 test passed: viewer excluded, far-away person excluded, nearby person returned with a rough (non-exact) distance band.';
end $$;

reset role;
rollback;
