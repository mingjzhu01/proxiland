-- v2 event mode, phase 2 (Nearby integration): once someone joins an event, they need to see
-- who else is there. profiles' RLS (migration 0025) only allows reading your own profile, a
-- connection's, or a pending requester's — nothing about fellow event attendees. Rather than
-- widen that RLS (which would leak profiles more broadly than intended), this is a
-- security-definer accessor scoped to "you're both active members of the same event," same
-- pattern as every other cross-user read in this schema.
--
-- NOTE: this always returns full identity, correct only for identity_mode = 'full_required'
-- (the default, and the only mode events actually use before Phase 6). user_choice and
-- hidden_until_connected are NOT implemented here — that's explicitly deferred to Phase 6
-- per v2-implementation-plan.md.
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
      and not exists (select 1 from blocks b where b.blocker_id = v_caller and b.target_id = sm.user_id)
      and not exists (select 1 from blocks b where b.blocker_id = sm.user_id and b.target_id = v_caller);
end;
$$;

revoke execute on function get_event_attendees(uuid) from public;
grant execute on function get_event_attendees(uuid) to authenticated;

-- Lets the Nearby tab and the event screen show "you're part of X" without needing to
-- re-detect the geofence or re-scan the QR every time.
create or replace function get_my_active_events()
returns table (
  id uuid,
  name text,
  organizer_name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.organizer_name, s.description, s.starts_at, s.ends_at, s.status
  from scopes s
  join scope_members sm on sm.scope_id = s.id
  where s.kind = 'venue'
    and sm.user_id = auth.uid()
    and sm.status = 'active'
$$;

revoke execute on function get_my_active_events() from public;
grant execute on function get_my_active_events() to authenticated;
