-- Mandatory structured event intent: ask/offer become required multi-select (1-3 each,
-- stable option ids) with optional free text, replacing the old three-free-text-box design.
-- The third question ("who do you want to meet") is removed without replacement.
--
-- Data preservation: ask_text/offer_text are NOT wiped — they become the "optional detail
-- text" fields under the new structured pickers. ask_tags/offer_tags already existed
-- (migration 0050) but were always written as null by the old client; this is what finally
-- uses them, to store selected option ids (never display labels). desired_connection_text/
-- desired_connection_tags are left in place, nullable, simply never read or written again —
-- no destructive migration for a column that's safe to leave unused.
--
-- completed_at is new: null means incomplete (never appears in anyone's matching), set once
-- on first successful completion and never overwritten after — an honest "first completion
-- vs later edit" signal, and the authoritative eligibility gate everywhere else reads.
alter table event_intents add column completed_at timestamptz;
alter table event_intents add constraint ask_tags_max_three check (ask_tags is null or array_length(ask_tags, 1) <= 3);
alter table event_intents add constraint offer_tags_max_three check (offer_tags is null or array_length(offer_tags, 1) <= 3);

-- Signature changes (structured ids replace free-text-only params), so the old function must
-- be dropped rather than replaced in place.
drop function if exists upsert_event_intent(uuid, text, text, text, text[], text[], text[]);

create function upsert_event_intent(
  p_event_id uuid,
  p_ask_option_ids text[],
  p_ask_detail_text text,
  p_offer_option_ids text[],
  p_offer_detail_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ask_count int := coalesce(array_length(p_ask_option_ids, 1), 0);
  v_offer_count int := coalesce(array_length(p_offer_option_ids, 1), 0);
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from scope_members
    where scope_id = p_event_id and user_id = v_user and status = 'active'
  ) then
    raise exception 'You must join this event before setting your intent';
  end if;

  -- Authoritative server-side validation (spec: "server-side validation is authoritative") —
  -- the picker UI already enforces this, this is the backstop, not the primary defense.
  if v_ask_count < 1 or v_ask_count > 3 then
    raise exception 'Choose 1 to 3 options for what you are looking for';
  end if;
  if v_offer_count < 1 or v_offer_count > 3 then
    raise exception 'Choose 1 to 3 options for what you can offer';
  end if;
  if 'ask_other' = any(p_ask_option_ids) and coalesce(trim(p_ask_detail_text), '') = '' then
    raise exception 'Add a few words since you selected "Other" for what you are looking for';
  end if;
  if 'offer_other' = any(p_offer_option_ids) and coalesce(trim(p_offer_detail_text), '') = '' then
    raise exception 'Add a few words since you selected "Other" for what you can offer';
  end if;

  insert into event_intents (
    scope_id, user_id, ask_tags, ask_text, offer_tags, offer_text, active, completed_at, updated_at
  )
  values (
    p_event_id, v_user, p_ask_option_ids, nullif(trim(p_ask_detail_text), ''),
    p_offer_option_ids, nullif(trim(p_offer_detail_text), ''), true, now(), now()
  )
  on conflict (scope_id, user_id) do update
    set ask_tags = excluded.ask_tags,
        ask_text = excluded.ask_text,
        offer_tags = excluded.offer_tags,
        offer_text = excluded.offer_text,
        active = true,
        completed_at = coalesce(event_intents.completed_at, now()),
        updated_at = now();
end;
$$;

revoke execute on function upsert_event_intent(uuid, text[], text, text[], text) from public;
grant execute on function upsert_event_intent(uuid, text[], text, text[], text) to authenticated;

-- Return shape changes (structured tags replace precomputed text-similarity scores — the
-- deterministic ask/offer complement now lives in the edge function, computed from the raw
-- tags this returns, using the compatibility map in
-- supabase/functions/_shared/eventIntentTaxonomy.ts), so this also needs a drop first.
drop function if exists eligible_event_candidates(uuid);

create function eligible_event_candidates(p_scope_id uuid)
returns table (
  candidate_user_id uuid,
  candidate_ask_tags text[],
  candidate_offer_tags text[],
  professional_overlap numeric,
  context_trust numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_member boolean;
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

  select * into v_caller_attrs from profile_attributes where user_id = v_caller;

  return query
    select
      sm.user_id,
      ei.ask_tags,
      ei.offer_tags,
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
    -- Inner join, not left: a candidate with no event_intents row at all can never have
    -- completed_at set, so they'd be excluded either way — the inner join just makes that
    -- explicit instead of relying on a null check.
    from scope_members sm
    join event_intents ei on ei.scope_id = p_scope_id and ei.user_id = sm.user_id
    join profiles p on p.id = sm.user_id
    left join profile_attributes pa on pa.user_id = sm.user_id
    where sm.scope_id = p_scope_id
      and sm.status = 'active'
      and sm.user_id <> v_caller
      and ei.completed_at is not null
      and not exists (select 1 from blocks b where b.blocker_id = v_caller and b.target_id = sm.user_id)
      and not exists (select 1 from blocks b where b.blocker_id = sm.user_id and b.target_id = v_caller)
      and not exists (
        select 1 from connections c
        where c.user_a = least(v_caller, sm.user_id) and c.user_b = greatest(v_caller, sm.user_id)
      );
end;
$$;

revoke execute on function eligible_event_candidates(uuid) from public;
grant execute on function eligible_event_candidates(uuid) to authenticated;

-- get_event_attendees (0053): per spec, the plain attendee list must also hide real
-- participants who haven't completed their own event intent yet — not just matching
-- (eligible_event_candidates). With the intent screen now a hard gate on every visit, this
-- only matters for the narrow window between joining and completing; return type unchanged,
-- so a plain replace is fine here.
create or replace function get_event_attendees(p_event_id uuid)
returns table (
  user_id uuid,
  full_name text,
  headline text,
  employer text,
  title text,
  undergrad_school text,
  undergrad_year text,
  grad_school text,
  grad_year text,
  photo_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_member boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select exists(
    select 1 from scope_members sm2
    where sm2.scope_id = p_event_id and sm2.user_id = v_caller and sm2.status = 'active'
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Not authorized: you are not a member of this event';
  end if;

  return query
    select p.id, p.full_name, p.headline, p.employer, p.title,
           p.undergrad_school, p.undergrad_year, p.grad_school, p.grad_year, p.photo_url
    from scope_members sm
    join profiles p on p.id = sm.user_id
    where sm.scope_id = p_event_id
      and sm.status = 'active'
      and sm.user_id <> v_caller
      and exists (
        select 1 from event_intents ei
        where ei.scope_id = p_event_id and ei.user_id = sm.user_id and ei.completed_at is not null
      )
      and not exists (select 1 from blocks b where b.blocker_id = v_caller and b.target_id = sm.user_id)
      and not exists (select 1 from blocks b where b.blocker_id = sm.user_id and b.target_id = v_caller);
end;
$$;

-- event_report (0057): "attendees_with_intent" now means "completed", not "typed something
-- into a box" — same completed_at gate as everywhere else. Return type unchanged, so a plain
-- replace is fine here.
create or replace function event_report(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope scopes;
  v_total_attendees int;
  v_attendees_with_intent int;
  v_total_recommendations int;
  v_users_with_recommendations int;
  v_requests_sent int;
  v_requests_accepted int;
  v_requests_declined int;
  v_requests_pending int;
  v_recommended_pairs_connected int;
  v_ai_runs int;
  v_fallback_runs int;
begin
  select * into v_scope from scopes where id = p_event_id and kind = 'venue';
  if not found then
    raise exception 'No such event';
  end if;

  select count(*) into v_total_attendees
  from scope_members where scope_id = p_event_id and status = 'active';

  select count(*) into v_attendees_with_intent
  from event_intents ei
  join scope_members sm on sm.scope_id = ei.scope_id and sm.user_id = ei.user_id and sm.status = 'active'
  where ei.scope_id = p_event_id and ei.completed_at is not null;

  select count(*), count(distinct source_user_id) into v_total_recommendations, v_users_with_recommendations
  from match_recommendations where scope_id = p_event_id;

  select
    count(*) filter (where true),
    count(*) filter (where status = 'accepted'),
    count(*) filter (where status = 'declined'),
    count(*) filter (where status = 'pending')
  into v_requests_sent, v_requests_accepted, v_requests_declined, v_requests_pending
  from connection_requests
  where context_type = 'event' and event_id = p_event_id and type = 'connect';

  select count(*) into v_recommended_pairs_connected
  from match_recommendations mr
  where mr.scope_id = p_event_id
    and exists (
      select 1 from connections c
      where c.user_a = least(mr.source_user_id, mr.candidate_user_id)
        and c.user_b = greatest(mr.source_user_id, mr.candidate_user_id)
    );

  select
    count(*) filter (where status = 'ai'),
    count(*) filter (where status = 'deterministic_fallback')
  into v_ai_runs, v_fallback_runs
  from match_runs where scope_id = p_event_id;

  return jsonb_build_object(
    'event_name', v_scope.name,
    'total_attendees', v_total_attendees,
    'attendees_with_intent_set', v_attendees_with_intent,
    'total_match_recommendations', v_total_recommendations,
    'attendees_who_generated_matches', v_users_with_recommendations,
    'connect_requests_sent_from_this_event', v_requests_sent,
    'connect_requests_accepted', v_requests_accepted,
    'connect_requests_declined', v_requests_declined,
    'connect_requests_pending', v_requests_pending,
    'recommended_pairs_that_became_connections', v_recommended_pairs_connected,
    'match_runs_using_ai', v_ai_runs,
    'match_runs_using_fallback', v_fallback_runs
  );
end;
$$;
