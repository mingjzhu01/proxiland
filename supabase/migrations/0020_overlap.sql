-- Spec v4, section 14 step 7: find-overlap (no model, pure database matching) and the
-- overlap_cache table it and phrase-overlap write to. phrase-overlap itself is an edge
-- function (model calls only happen server-side via _shared/ai.ts), added separately.
--
-- Note: section 13 lists "having crossed paths" as a fifth overlap type, backed by
-- colocation_events in section 12's schema — but colocation_events isn't referenced by
-- any of the 12 numbered build steps, so it hasn't been created yet. find_overlap below
-- covers the other four types (employer, school, wants/offers, industry) and omits
-- "crossed paths" until that table exists. Flagged as a known gap, not silently dropped.

create table overlap_cache (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  overlap_type text not null,
  phrase text not null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint overlap_cache_ordered check (user_a < user_b)
);

alter table overlap_cache enable row level security;

create policy "participants can read their cached overlap"
  on overlap_cache for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- No insert/update policy for regular users — writes only happen through the
-- phrase-overlap edge function using the service role key. Same "locked down by
-- default" pattern as every other table so far.

-- words_overlap: crude, deliberately simple free-text heuristic for matching a
-- looking_for string against a can_offer string — case-insensitive shared-word check,
-- words 4+ characters (a rough stopword filter). Not sophisticated, but it is genuinely
-- free (no model), which is the explicit requirement in section 6, job 3.
create or replace function words_overlap(a text, b text)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(regexp_split_to_array(lower(coalesce(a, '')), '\W+')) w1
    join unnest(regexp_split_to_array(lower(coalesce(b, '')), '\W+')) w2 on w1 = w2
    where length(w1) >= 4
  );
$$;

-- find_overlap: the strongest genuine thing two people share, checked in priority order
-- (most specific/concrete first): former employer, school, wants/offers alignment,
-- industry. Returns no rows if there's no genuine overlap — callers must not invent one.
create or replace function find_overlap(p_user_a uuid, p_user_b uuid)
returns table (overlap_type text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  a profile_attributes%rowtype;
  b profile_attributes%rowtype;
begin
  select * into a from profile_attributes where user_id = p_user_a;
  select * into b from profile_attributes where user_id = p_user_b;

  if a.user_id is null or b.user_id is null then
    return;
  end if;

  if a.prior_employer is not null and b.prior_employer is not null
     and lower(a.prior_employer) = lower(b.prior_employer) then
    return query select 'employer'::text, a.prior_employer;
    return;
  end if;

  if a.school is not null and b.school is not null
     and lower(a.school) = lower(b.school) then
    return query select 'school'::text, a.school;
    return;
  end if;

  if words_overlap(a.looking_for, b.can_offer) or words_overlap(b.looking_for, a.can_offer) then
    return query select 'wants_offers'::text, 'wants and offers align'::text;
    return;
  end if;

  if a.industry = b.industry then
    return query select 'industry'::text, a.industry;
    return;
  end if;

  return;
end;
$$;

grant execute on function find_overlap(uuid, uuid) to authenticated;
