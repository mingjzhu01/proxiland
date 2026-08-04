-- Spec v4, section 14 step 4: scopes + scope_members. Geo scope fully working; venue is
-- schema-and-stub only per section 4 ("Schema and stub only in this phase").
--
-- One deliberate addition beyond the literal section 12 schema: a `created_by` column on
-- `scopes`. The spec's schema doesn't include it, but RLS needs some way to establish
-- per-row ownership, and join_code alone doesn't give single-owner semantics for the geo
-- case. Flagged here in case this should be reconsidered.

create type scope_kind as enum ('geo', 'venue');

create table scopes (
  id uuid primary key default gen_random_uuid(),
  kind scope_kind not null,
  name text,
  join_code text unique,           -- venue only
  center geography(point, 4326),   -- geo only
  radius_m int,                    -- geo only
  starts_at timestamptz,           -- venue only
  ends_at timestamptz,             -- venue only
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table scopes enable row level security;

-- Deliberately narrow, same pattern as profile_attributes: no direct cross-user select
-- policy. A geo scope's `center` is a precise coordinate — exactly the kind of raw
-- location data v1 never exposes directly (see nearby_users), so this must not either.
-- Cross-scope population reads go through geo_scope_population() below, which returns
-- only user_ids, never the center point.
create policy "users manage scopes they created"
  on scopes for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create table scope_members (
  scope_id uuid not null references scopes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (scope_id, user_id)
);

alter table scope_members enable row level security;

create policy "users manage their own scope membership"
  on scope_members for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- get_or_create_geo_scope: creates a fresh geo scope for the caller's current location.
-- Always creates a new row rather than trying to reuse/dedupe a nearby existing scope —
-- simplest correct behavior for now; revisit if scope row volume becomes a real concern.
create or replace function get_or_create_geo_scope(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope_id uuid;
begin
  insert into scopes (kind, center, radius_m, created_by)
  values (
    'geo',
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_radius_m,
    auth.uid()
  )
  returning id into v_scope_id;

  insert into scope_members (scope_id, user_id) values (v_scope_id, auth.uid())
  on conflict do nothing;

  return v_scope_id;
end;
$$;

grant execute on function get_or_create_geo_scope(double precision, double precision, int) to authenticated;

-- geo_scope_population: for a geo scope, returns the user_ids of everyone currently
-- visible (per v1's visibility_sessions — reusing that table's existing opt-in-visibility
-- and proximity logic exactly as nearby_users does) within the scope's radius, who also
-- have a profile_attributes row (feed-eligible). Does NOT rely on scope_members listing
-- every nearby stranger — geo membership is continuous/dynamic, not a fixed join, so
-- population is computed at query time instead of kept in sync via writes.
create or replace function geo_scope_population(p_scope_id uuid)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scopes;
begin
  select * into v_scope from scopes where id = p_scope_id and kind = 'geo';
  if not found then
    raise exception 'No geo scope %', p_scope_id;
  end if;

  return query
    select vs.user_id
    from visibility_sessions vs
    join profile_attributes pa on pa.user_id = vs.user_id
    where vs.is_active = true
      and vs.expires_at > now()
      and st_dwithin(vs.location, v_scope.center, v_scope.radius_m);
end;
$$;

grant execute on function geo_scope_population(uuid) to authenticated;
