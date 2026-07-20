-- NearbyPro initial schema
-- Run this in the Supabase SQL editor, or via `supabase db push` if using the CLI.

create extension if not exists postgis;

-- ── profiles ─────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  headline text,
  employer text,
  title text,
  education text,
  photo_url text,
  bio text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on profiles for select
  to authenticated
  using (true);

create policy "users manage their own profile"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "users update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

-- ── visibility_sessions ──────────────────────────────────────────────────
-- This table is the entire "opt-in visibility" mechanism. A row here is the
-- only thing that makes a user discoverable in nearby_users(). No location
-- is ever written outside of an active session, and no other user can read
-- this table directly (only via the nearby_users RPC below), so raw
-- coordinates never reach another user's device.
create table visibility_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location geography(point, 4326) not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_active boolean not null default true
);

create index visibility_sessions_geo_idx on visibility_sessions using gist (location);
create index visibility_sessions_active_idx on visibility_sessions (user_id, is_active, expires_at);

alter table visibility_sessions enable row level security;

create policy "users manage their own visibility sessions"
  on visibility_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Deliberately no "select" policy for other users — the table is only
-- readable by its owner. Everyone else must go through nearby_users(),
-- which runs as the function owner and returns distance, not coordinates.

-- ── connection_requests ──────────────────────────────────────────────────
create type request_type as enum ('connect', 'coffee');
create type request_status as enum ('pending', 'accepted', 'declined');

create table connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  type request_type not null,
  message text,
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint no_self_request check (sender_id <> receiver_id)
);

create index connection_requests_receiver_idx on connection_requests (receiver_id, status);
create index connection_requests_sender_idx on connection_requests (sender_id);

alter table connection_requests enable row level security;

create policy "participants can read their requests"
  on connection_requests for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "senders can create requests"
  on connection_requests for insert
  to authenticated
  with check (sender_id = auth.uid());

create policy "receivers can respond to requests"
  on connection_requests for update
  to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

-- ── connections ──────────────────────────────────────────────────────────
create table connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  connected_at timestamptz not null default now(),
  constraint ordered_pair check (user_a < user_b)
);

create unique index connections_pair_idx on connections (user_a, user_b);

alter table connections enable row level security;

create policy "participants can read their connections"
  on connections for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- When a request is accepted, create the connection row (ordered pair to
-- satisfy the uniqueness constraint regardless of who sent the request).
create function handle_request_accepted()
returns trigger as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into connections (user_a, user_b)
    values (
      least(new.sender_id, new.receiver_id),
      greatest(new.sender_id, new.receiver_id)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_request_accepted
  after update on connection_requests
  for each row
  execute function handle_request_accepted();

-- ── blocks & reports ─────────────────────────────────────────────────────
create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint no_self_block check (blocker_id <> target_id)
);

create unique index blocks_pair_idx on blocks (blocker_id, target_id);

alter table blocks enable row level security;

create policy "users manage their own blocks"
  on blocks for all
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "users can create reports"
  on reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "users can read their own reports"
  on reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- ── nearby_users RPC ─────────────────────────────────────────────────────
-- The only way to discover another user's proximity. Runs as security
-- definer so it can read visibility_sessions across users, but only ever
-- returns a computed distance — never the raw location column — and
-- excludes anyone with a block relationship in either direction.
create function nearby_users(lat double precision, lng double precision, radius_m integer default 5000)
returns table (
  id uuid,
  full_name text,
  headline text,
  employer text,
  title text,
  education text,
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
    p.education,
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

-- ── avatars storage bucket ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
