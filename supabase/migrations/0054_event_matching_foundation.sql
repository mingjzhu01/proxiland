-- v2 event mode, phase 4 (matching pipeline), part 1: deterministic prep. Per
-- v2-implementation-plan.md's matching pipeline design — eligibility + feature scores are
-- computed here in SQL (deterministic, cannot be overridden by the AI, per the spec's core
-- principle); the AI step (generate-event-matches edge function) only ranks within this
-- already-safe candidate set.
--
-- The four feature scores are intentionally simple, not a claim of sophisticated matching —
-- they exist as (a) a fallback ranking if the AI call fails and (b) auxiliary signal handed
-- to the AI alongside the free-text intent. The real matching judgment is the AI's job.
-- pg_trgm's similarity() gives a cheap fuzzy-text-overlap score without building real NLP.
create extension if not exists pg_trgm with schema extensions;

create or replace function eligible_event_candidates(p_scope_id uuid)
returns table (
  candidate_user_id uuid,
  intent_complement numeric,
  reciprocal_relevance numeric,
  professional_overlap numeric,
  context_trust numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_is_member boolean;
  v_caller_intent event_intents;
  v_caller_attrs profile_attributes;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select exists(
    select 1 from scope_members
    where scope_id = p_scope_id and user_id = v_caller and status = 'active'
  ) into v_is_member;
  if not v_is_member then
    raise exception 'Not authorized: you are not a member of this event';
  end if;

  select * into v_caller_intent from event_intents where scope_id = p_scope_id and user_id = v_caller;
  select * into v_caller_attrs from profile_attributes where user_id = v_caller;

  return query
    select
      sm.user_id,
      round(coalesce(
        greatest(
          similarity(coalesce(v_caller_intent.ask_text, ''), coalesce(ei.offer_text, '')),
          similarity(coalesce(v_caller_intent.offer_text, ''), coalesce(ei.ask_text, ''))
        ), 0)::numeric, 3) as intent_complement,
      round(coalesce(
        (similarity(coalesce(v_caller_intent.ask_text, ''), coalesce(ei.offer_text, ''))
         + similarity(coalesce(ei.ask_text, ''), coalesce(v_caller_intent.offer_text, ''))) / 2.0
      , 0)::numeric, 3) as reciprocal_relevance,
      round((
        (case when pa.industry is not distinct from v_caller_attrs.industry and pa.industry is not null then 1 else 0 end) +
        (case when pa.role_category is not distinct from v_caller_attrs.role_category and pa.role_category is not null then 1 else 0 end) +
        (case when pa.school is not distinct from v_caller_attrs.school and pa.school is not null then 1 else 0 end) +
        (case when pa.stage is not distinct from v_caller_attrs.stage and pa.stage is not null then 1 else 0 end)
      )::numeric / 4.0, 3) as professional_overlap,
      round((
        (case when p.photo_url is not null then 1 else 0 end) +
        (case when p.bio is not null and length(trim(p.bio)) > 0 then 1 else 0 end) +
        (case when p.employer is not null then 1 else 0 end)
      )::numeric / 3.0, 3) as context_trust
    from scope_members sm
    join profiles p on p.id = sm.user_id
    left join profile_attributes pa on pa.user_id = sm.user_id
    left join event_intents ei on ei.scope_id = p_scope_id and ei.user_id = sm.user_id
    where sm.scope_id = p_scope_id
      and sm.status = 'active'
      and sm.user_id <> v_caller
      and not exists (select 1 from blocks b where b.blocker_id = v_caller and b.target_id = sm.user_id)
      and not exists (select 1 from blocks b where b.blocker_id = sm.user_id and b.target_id = v_caller)
      and not exists (
        select 1 from connections c
        where c.user_a = least(v_caller, sm.user_id) and c.user_b = greatest(v_caller, sm.user_id)
      )
      and (ei.ask_text is not null or ei.offer_text is not null);
end;
$$;

revoke execute on function eligible_event_candidates(uuid) from public;
grant execute on function eligible_event_candidates(uuid) to authenticated;

-- Tunable, same "founder controls the dial without a redeploy" spirit as k_min (0035).
alter table app_config add column match_weight_intent_complement numeric not null default 0.4;
alter table app_config add column match_weight_reciprocal_relevance numeric not null default 0.3;
alter table app_config add column match_weight_professional_overlap numeric not null default 0.2;
alter table app_config add column match_weight_context_trust numeric not null default 0.1;

create function get_match_weights()
returns table (
  intent_complement numeric,
  reciprocal_relevance numeric,
  professional_overlap numeric,
  context_trust numeric
)
language sql
stable
as $$
  select match_weight_intent_complement, match_weight_reciprocal_relevance,
         match_weight_professional_overlap, match_weight_context_trust
  from app_config limit 1;
$$;

-- match_runs: one row per time a user's recommendations were (re)generated for an event —
-- an audit trail of whether the AI actually ran or the deterministic fallback kicked in.
-- Written only by the generate-event-matches edge function via the service-role key, which
-- bypasses RLS — no insert/update/delete policy needed here.
create table match_runs (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references scopes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('ai', 'deterministic_fallback')),
  created_at timestamptz not null default now()
);

alter table match_runs enable row level security;

create policy "users read their own match runs"
  on match_runs for select
  to authenticated
  using (user_id = auth.uid());

-- match_recommendations: always reflects the CURRENT ranked set for (scope_id,
-- source_user_id) — the edge function deletes old rows for that pair before inserting fresh
-- ones on every regeneration, rather than accumulating history here (match_runs is the
-- history). Only candidate_user_id + numbers/text are stored — no other person's profile
-- fields — so a direct client read is safe; the client cross-references candidate_user_id
-- against get_event_attendees (already scoped to fellow active members) for display.
create table match_recommendations (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid not null references match_runs(id) on delete cascade,
  scope_id uuid not null references scopes(id) on delete cascade,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  score numeric not null,
  intent_complement numeric,
  reciprocal_relevance numeric,
  professional_overlap numeric,
  context_trust numeric,
  match_reason text,
  created_at timestamptz not null default now()
);

create index match_recommendations_source_idx on match_recommendations (scope_id, source_user_id);

alter table match_recommendations enable row level security;

create policy "users read their own match recommendations"
  on match_recommendations for select
  to authenticated
  using (source_user_id = auth.uid());
