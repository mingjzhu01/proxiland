-- Replace the single free-text "education" field with structured
-- undergrad + advanced-degree fields, so the app can render them as
-- "HBS'22, Wesleyan'15" instead of whatever format the user typed.

alter table profiles
  drop column if exists education,
  add column undergrad_school text,
  add column undergrad_year text,
  add column grad_degree_type text check (grad_degree_type in ('Masters', 'MBA', 'PhD')),
  add column grad_school text,
  add column grad_year text;

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
    p.full_name,
    p.headline,
    p.employer,
    p.title,
    p.undergrad_school,
    p.undergrad_year,
    p.grad_degree_type,
    p.grad_school,
    p.grad_year,
    p.photo_url,
    st_distance(vs.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_meters
  from visibility_sessions vs
  join profiles p on p.id = vs.user_id
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

grant execute on function nearby_users(double precision, double precision, integer) to authenticated;
