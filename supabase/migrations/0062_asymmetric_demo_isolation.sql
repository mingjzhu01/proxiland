-- Fixes a real bug from 0060: the demo/real isolation check was symmetric (caller.is_demo
-- must exactly equal the scope's/candidate's is_demo), which was correct for the intended
-- goal (a demo account should never appear in or see a real event) but wrongly also hid a
-- REAL account from a scope that's flagged is_demo — including the pre-existing "Demo Test
-- Event", now retroactively flagged is_demo=true, which a real account (the founder's own,
-- doing manual testing) is specifically meant to keep using. The correct rule is one-directional:
-- hide a demo account from a real scope; a real account may freely see/join a demo scope.

create or replace function join_event(p_event_id uuid, p_join_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_scope scopes;
  v_caller_is_demo boolean;
  v_existing scope_members;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_scope from scopes where id = p_event_id and kind = 'venue';
  if not found then
    raise exception 'No such event';
  end if;
  if v_scope.status <> 'active' then
    raise exception 'This event is no longer active';
  end if;
  if v_scope.ends_at is not null and v_scope.ends_at <= now() then
    raise exception 'This event has ended';
  end if;

  select coalesce(is_demo, false) into v_caller_is_demo from profiles where id = v_user;
  -- Only block a demo account from joining a real (non-demo) scope. A real account joining a
  -- demo scope is exactly how manual testing of a seeded demo event is supposed to work.
  if v_caller_is_demo and not v_scope.is_demo then
    raise exception 'This event is not available to your account';
  end if;

  select * into v_existing from scope_members where scope_id = p_event_id and user_id = v_user;
  if found and v_existing.removed_at is not null then
    raise exception 'You have been removed from this event by its organiser';
  end if;

  insert into scope_members (scope_id, user_id, join_method, status, joined_at, left_at)
  values (p_event_id, v_user, p_join_method, 'active', now(), null)
  on conflict (scope_id, user_id) do update
    set status = 'active',
        join_method = excluded.join_method,
        joined_at = now(),
        left_at = null
    where scope_members.removed_at is null;
end;
$$;

revoke execute on function join_event(uuid, text) from public;
grant execute on function join_event(uuid, text) to authenticated;

create or replace function eligible_event_candidates(p_scope_id uuid)
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
  v_caller_member scope_members;
  v_caller_attrs profile_attributes;
  v_scope_is_demo boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_caller_member from scope_members
    where scope_id = p_scope_id and user_id = v_caller and status = 'active';
  if not found then
    raise exception 'Not authorized: you are not a member of this event';
  end if;
  if v_caller_member.checked_in_at is null then
    raise exception 'Check in to this event to see who else is here';
  end if;

  select coalesce(is_demo, false) into v_scope_is_demo from scopes where id = p_scope_id;
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
    from scope_members sm
    join event_intents ei on ei.scope_id = p_scope_id and ei.user_id = sm.user_id
    join profiles p on p.id = sm.user_id
    left join profile_attributes pa on pa.user_id = sm.user_id
    where sm.scope_id = p_scope_id
      and sm.status = 'active'
      and sm.user_id <> v_caller
      and sm.checked_in_at is not null
      -- Asymmetric: a demo scope shows everyone in it (that's the point of a demo event); a
      -- real scope hides demo accounts from it.
      and (v_scope_is_demo or not coalesce(p.is_demo, false))
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
  photo_url text,
  role_category role_category
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_member scope_members;
  v_scope_is_demo boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_caller_member from scope_members sm2
    where sm2.scope_id = p_event_id and sm2.user_id = v_caller and sm2.status = 'active';
  if not found then
    raise exception 'Not authorized: you are not a member of this event';
  end if;
  if v_caller_member.checked_in_at is null then
    raise exception 'Check in to this event to see who else is here';
  end if;

  select coalesce(is_demo, false) into v_scope_is_demo from scopes where id = p_event_id;

  return query
    select p.id, p.full_name, p.headline, p.employer, p.title,
           p.undergrad_school, p.undergrad_year, p.grad_school, p.grad_year, p.photo_url,
           pa.role_category
    from scope_members sm
    join profiles p on p.id = sm.user_id
    left join profile_attributes pa on pa.user_id = sm.user_id
    where sm.scope_id = p_event_id
      and sm.status = 'active'
      and sm.user_id <> v_caller
      and sm.checked_in_at is not null
      and (v_scope_is_demo or not coalesce(p.is_demo, false))
      and exists (
        select 1 from event_intents ei
        where ei.scope_id = p_event_id and ei.user_id = sm.user_id and ei.completed_at is not null
      )
      and not exists (select 1 from blocks b where b.blocker_id = v_caller and b.target_id = sm.user_id)
      and not exists (select 1 from blocks b where b.blocker_id = sm.user_id and b.target_id = v_caller);
end;
$$;

revoke execute on function get_event_attendees(uuid) from public;
grant execute on function get_event_attendees(uuid) to authenticated;
