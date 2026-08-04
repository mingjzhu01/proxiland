-- Reciprocity gate: you can only see full profiles of people nearby if
-- you are currently visible yourself. If you're signed in but not
-- currently visible, nearby_users still returns everyone in range (so
-- you know who's around and can decide to opt in) but strips every
-- field except headline and distance.
create or replace function nearby_users(lat double precision, lng double precision, radius_m integer default 5000)
returns table (
  id uuid,
  full_name text,
  headline text,
  employer text,
  title text,
  undergrad_school text,
  undergrad_year text,
  grad_degree_type text,
  grad_school text,
  grad_year text,
  photo_url text,
  distance_meters double precision
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    case when caller.is_visible then p.full_name else null end as full_name,
    p.headline,
    case when caller.is_visible then p.employer else null end as employer,
    case when caller.is_visible then p.title else null end as title,
    case when caller.is_visible then p.undergrad_school else null end as undergrad_school,
    case when caller.is_visible then p.undergrad_year else null end as undergrad_year,
    case when caller.is_visible then p.grad_degree_type else null end as grad_degree_type,
    case when caller.is_visible then p.grad_school else null end as grad_school,
    case when caller.is_visible then p.grad_year else null end as grad_year,
    case when caller.is_visible then p.photo_url else null end as photo_url,
    st_distance(vs.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_meters
  from visibility_sessions vs
  join profiles p on p.id = vs.user_id
  cross join lateral (
    select exists (
      select 1 from visibility_sessions me
      where me.user_id = auth.uid() and me.is_active = true and me.expires_at > now()
    ) as is_visible
  ) as caller
  where vs.is_active = true
    and vs.expires_at > now()
    and vs.user_id <> auth.uid()
    and st_dwithin(vs.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.target_id = vs.user_id)
         or (b.blocker_id = vs.user_id and b.target_id = auth.uid())
    )
  order by distance_meters asc;
$$;
