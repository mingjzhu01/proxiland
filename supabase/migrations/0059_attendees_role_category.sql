-- Visual redesign, event screen's "Everyone" tab: attendees are grouped by role category
-- (FOUNDERS / INVESTORS / etc.) — get_event_attendees didn't return that field. Additive:
-- one extra column, same eligibility/blocking logic as before (0058), return type change so
-- needs a drop first.
drop function if exists get_event_attendees(uuid);

create function get_event_attendees(p_event_id uuid)
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
           p.undergrad_school, p.undergrad_year, p.grad_school, p.grad_year, p.photo_url,
           pa.role_category
    from scope_members sm
    join profiles p on p.id = sm.user_id
    left join profile_attributes pa on pa.user_id = sm.user_id
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

revoke execute on function get_event_attendees(uuid) from public;
grant execute on function get_event_attendees(uuid) to authenticated;
