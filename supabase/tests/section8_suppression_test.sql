-- Spec v4, section 14 step 2: tests covering the full fact-dropping sequence for
-- suppression_for_user + assemble_line. Run this whole file in the SQL Editor. It creates
-- synthetic auth.users/profile_attributes rows, asserts against them, then ROLLS BACK —
-- nothing persists in the real database either way. If every scenario passes, the editor
-- will just show "Success. No rows returned" once the final ROLLBACK runs. If anything
-- fails, an assertion error will name exactly which scenario and field broke.

begin;

-- Scenario A: candidate + 4 others share every field identically. k_min = 5, full match
-- count = 5, so nothing should be dropped.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'k-test-a1@example.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'k-test-a2@example.invalid'),
  ('00000000-0000-0000-0000-000000000003', 'k-test-a3@example.invalid'),
  ('00000000-0000-0000-0000-000000000004', 'k-test-a4@example.invalid'),
  ('00000000-0000-0000-0000-000000000005', 'k-test-a5@example.invalid');

insert into profile_attributes
  (user_id, role_category, seniority_band, industry, stage, school, prior_employer, tenure_band, source_hash)
values
  ('00000000-0000-0000-0000-000000000001', 'founder', 'mid', 'climate', 'seed', 'MIT', 'Tesla', '2 to 5y', 'test'),
  ('00000000-0000-0000-0000-000000000002', 'founder', 'mid', 'climate', 'seed', 'MIT', 'Tesla', '2 to 5y', 'test'),
  ('00000000-0000-0000-0000-000000000003', 'founder', 'mid', 'climate', 'seed', 'MIT', 'Tesla', '2 to 5y', 'test'),
  ('00000000-0000-0000-0000-000000000004', 'founder', 'mid', 'climate', 'seed', 'MIT', 'Tesla', '2 to 5y', 'test'),
  ('00000000-0000-0000-0000-000000000005', 'founder', 'mid', 'climate', 'seed', 'MIT', 'Tesla', '2 to 5y', 'test');

-- Scenario B: candidate has a unique prior_employer AND a unique school; 4 others share
-- role/seniority/industry/stage/tenure but differ on prior_employer and school. Expects
-- the drop sequence to remove prior_employer first, recheck (still short), then remove
-- school, then clear at 5.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'k-test-b1@example.invalid'),
  ('00000000-0000-0000-0000-000000000012', 'k-test-b2@example.invalid'),
  ('00000000-0000-0000-0000-000000000013', 'k-test-b3@example.invalid'),
  ('00000000-0000-0000-0000-000000000014', 'k-test-b4@example.invalid'),
  ('00000000-0000-0000-0000-000000000015', 'k-test-b5@example.invalid');

insert into profile_attributes
  (user_id, role_category, seniority_band, industry, stage, school, prior_employer, tenure_band, source_hash)
values
  ('00000000-0000-0000-0000-000000000011', 'investor', 'senior', 'fintech', 'series a', 'Wharton', 'Goldman Sachs', '5y plus', 'test'),
  ('00000000-0000-0000-0000-000000000012', 'investor', 'senior', 'fintech', 'series a', 'INSEAD', 'Morgan Stanley', '5y plus', 'test'),
  ('00000000-0000-0000-0000-000000000013', 'investor', 'senior', 'fintech', 'series a', 'LBS', 'Credit Suisse', '5y plus', 'test'),
  ('00000000-0000-0000-0000-000000000014', 'investor', 'senior', 'fintech', 'series a', 'HBS', 'JP Morgan', '5y plus', 'test'),
  ('00000000-0000-0000-0000-000000000015', 'investor', 'senior', 'fintech', 'series a', 'Stanford', 'Citi', '5y plus', 'test');

-- Scenario C: candidate's role+seniority bucket only has 2 people total, below k_min even
-- with everything else dropped. Expects used_generic = true.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'k-test-c1@example.invalid'),
  ('00000000-0000-0000-0000-000000000022', 'k-test-c2@example.invalid');

insert into profile_attributes
  (user_id, role_category, seniority_band, industry, stage, school, prior_employer, tenure_band, source_hash)
values
  ('00000000-0000-0000-0000-000000000021', 'researcher', 'executive', 'healthtech', null, null, null, null, 'test'),
  ('00000000-0000-0000-0000-000000000022', 'researcher', 'executive', 'consumer', null, null, null, null, 'test');

do $$
declare
  r record;
  pop_a uuid[] := array[
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000004'::uuid,
    '00000000-0000-0000-0000-000000000005'::uuid
  ];
  pop_b uuid[] := array[
    '00000000-0000-0000-0000-000000000011'::uuid,
    '00000000-0000-0000-0000-000000000012'::uuid,
    '00000000-0000-0000-0000-000000000013'::uuid,
    '00000000-0000-0000-0000-000000000014'::uuid,
    '00000000-0000-0000-0000-000000000015'::uuid
  ];
  pop_c uuid[] := array[
    '00000000-0000-0000-0000-000000000021'::uuid,
    '00000000-0000-0000-0000-000000000022'::uuid
  ];
  line text;
begin
  -- Scenario A: no suppression needed.
  select * into r from suppression_for_user('00000000-0000-0000-0000-000000000001', pop_a, 5);
  assert r.keep_industry = true, 'A: expected keep_industry = true';
  assert r.keep_stage = true, 'A: expected keep_stage = true';
  assert r.keep_school = true, 'A: expected keep_school = true';
  assert r.keep_prior_employer = true, 'A: expected keep_prior_employer = true';
  assert r.keep_tenure_band = true, 'A: expected keep_tenure_band = true';
  assert r.used_generic = false, 'A: expected used_generic = false';
  assert r.match_count = 5, format('A: expected match_count = 5, got %s', r.match_count);

  line := assemble_line('founder', 'climate', 'seed', 'MIT', 'Tesla', '2 to 5y',
    r.keep_industry, r.keep_stage, r.keep_school, r.keep_prior_employer, r.keep_tenure_band, r.used_generic);
  assert line = 'Seed climate founder, ex Tesla, MIT grad, 2 to 5y experience',
    format('A: unexpected line: %s', line);
  raise notice 'Scenario A passed: %', line;

  -- Scenario B: expects prior_employer AND school dropped, stage/tenure/industry kept.
  select * into r from suppression_for_user('00000000-0000-0000-0000-000000000011', pop_b, 5);
  assert r.keep_prior_employer = false, 'B: expected keep_prior_employer = false (dropped first)';
  assert r.keep_school = false, 'B: expected keep_school = false (dropped second)';
  assert r.keep_stage = true, 'B: expected keep_stage = true (never needed to drop this far)';
  assert r.keep_tenure_band = true, 'B: expected keep_tenure_band = true';
  assert r.keep_industry = true, 'B: expected keep_industry = true';
  assert r.used_generic = false, 'B: expected used_generic = false';
  assert r.match_count = 5, format('B: expected match_count = 5, got %s', r.match_count);

  line := assemble_line('investor', 'fintech', 'series a', 'Wharton', 'Goldman Sachs', '5y plus',
    r.keep_industry, r.keep_stage, r.keep_school, r.keep_prior_employer, r.keep_tenure_band, r.used_generic);
  assert line = 'Series a fintech investor, 5y plus experience',
    format('B: unexpected line: %s', line);
  raise notice 'Scenario B passed: %', line;

  -- Scenario C: even the base role+seniority bucket is too small. Generic fallback.
  select * into r from suppression_for_user('00000000-0000-0000-0000-000000000021', pop_c, 5);
  assert r.used_generic = true, 'C: expected used_generic = true';

  line := assemble_line('researcher', 'healthtech', null, null, null, null,
    r.keep_industry, r.keep_stage, r.keep_school, r.keep_prior_employer, r.keep_tenure_band, r.used_generic);
  assert line = 'Researcher', format('C: unexpected generic line: %s', line);
  raise notice 'Scenario C passed: %', line;

  raise notice 'All suppression/assemble_line scenarios passed.';
end $$;

rollback;
