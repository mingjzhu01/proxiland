-- get_my_organized_events (0060) deliberately returns a lean list shape for the My Events
-- screen — it doesn't include center/radius_m, which the edit form needs to prefill the
-- optional-coordinates fields. Rather than widen that list function's return shape (used
-- by a screen that has no use for those columns), this is a dedicated organizer-only lookup
-- for the edit screen specifically.
create or replace function get_event_for_edit(p_event_id uuid)
returns table (
  id uuid, name text, organizer_name text, description text,
  venue_name text, venue_address text,
  lat double precision, lng double precision, radius_m int,
  starts_at timestamptz, ends_at timestamptz, timezone text, status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_scope scopes;
  v_is_admin boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_scope from scopes where id = p_event_id and kind = 'venue';
  if not found then
    raise exception 'No such event';
  end if;

  select coalesce(is_admin, false) into v_is_admin from profiles where id = v_caller;
  if v_scope.created_by <> v_caller and not v_is_admin then
    raise exception 'Not authorized: you do not manage this event';
  end if;

  return query
    select
      v_scope.id, v_scope.name, v_scope.organizer_name, v_scope.description,
      v_scope.venue_name, v_scope.venue_address,
      case when v_scope.center is not null then st_y(v_scope.center::geometry) else null end,
      case when v_scope.center is not null then st_x(v_scope.center::geometry) else null end,
      v_scope.radius_m,
      v_scope.starts_at, v_scope.ends_at, v_scope.timezone, v_scope.status;
end;
$$;

revoke execute on function get_event_for_edit(uuid) from public;
grant execute on function get_event_for_edit(uuid) to authenticated;
