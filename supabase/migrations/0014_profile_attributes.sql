-- v4 spec, section 12 + section 14 step 1. Additive — does not touch v1 tables.

create type role_category as enum (
  'founder', 'investor', 'operator', 'engineer', 'designer', 'researcher', 'student'
);

create type seniority_band as enum ('early', 'mid', 'senior', 'executive');

-- industry, stage, and tenure_band stay as `text` (matching the v4 schema in section 12)
-- rather than Postgres enums, but are still controlled vocabularies: validated against a
-- fixed allowed list in the parse-profile edge function (reject rather than coerce), and
-- guarded here too as a second line of defense. Values carried forward from the v2 spec's
-- field taxonomy, since v4 doesn't restate them — flagged to the user as an assumption.
create table profile_attributes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role_category role_category not null,
  seniority_band seniority_band not null,
  industry text not null
    check (industry in ('fintech', 'foodtech', 'climate', 'healthtech', 'logistics', 'consumer', 'enterprise')),
  stage text
    check (stage is null or stage in ('pre seed', 'seed', 'series a', 'series b plus', 'public')),
  school text,
  prior_employer text,
  tenure_band text
    check (tenure_band is null or tenure_band in ('under 2y', '2 to 5y', '5y plus')),
  looking_for text check (looking_for is null or char_length(looking_for) <= 60),
  can_offer text check (can_offer is null or char_length(can_offer) <= 60),
  line_assembled text,
  line_polished text,
  user_edited boolean not null default false,
  generated_at timestamptz not null default now(),
  source_hash text not null
);

alter table profile_attributes enable row level security;

-- Deliberately narrow for now: owner can read/write their own row. Nearby-feed reads
-- happen through a security-definer function added in step 3 (the RLS gate), not through
-- a direct select policy on this table — so no "readable by any authenticated user" policy
-- exists here, unlike v1's profiles table. This is intentional per section 11.1.
create policy "users manage their own profile attributes"
  on profile_attributes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
