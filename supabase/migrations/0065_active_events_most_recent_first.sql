-- get_my_active_events had no ORDER BY, so "the most recent event" — which the Nearby event
-- strip renders as its single filled chip — was whatever the planner returned first. Same
-- signature and columns; only a guaranteed order is added (most recently joined first).

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
  order by sm.joined_at desc
$$;
