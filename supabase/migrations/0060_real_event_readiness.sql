-- Real-event readiness, phase 1: organizer permission model, presence/check-in distinct from
-- joining, human-typeable join codes, a public-safe landing-page function, and closing three
-- real gaps found while auditing for this work:
--   1. Venue (event) creation/management had zero RLS-based permission model — any signed-in
--      user could in principle have inserted a `scopes` row directly, since the old blanket
--      "users manage scopes they created" policy covered both geo and venue kinds with no
--      admin gate. Tightened to geo-only; venue creation now exclusively goes through the
--      admin-checked functions below.
--   2. `scope_members` had a blanket owner-write policy, meaning a client could have inserted
--      a membership row directly (bypassing join_event's token/status/ends_at checks) simply
--      by knowing a scope's uuid, or self-set checked_in_at at any time regardless of whether
--      the event was even live. Tightened to select-only; every mutation now goes through a
--      security-definer function (all of which bypass RLS as the table owner, same as the
--      already-working join_event/leave_event did before this migration).
--   3. Demo-account isolation (profiles.is_demo) was enforced for the geo-scope Nearby feed
--      (population_for_scope, migration 0043) but never extended to venue/event functions —
--      join_event, eligible_event_candidates, and get_event_attendees had no is_demo check at
--      all. A demo NPC could have joined and appeared in a real event with nothing stopping it.

-- ---------------------------------------------------------------------------
-- 1. profiles.is_admin — pilot-scoped organizer/admin flag
-- ---------------------------------------------------------------------------

alter table profiles add column is_admin boolean not null default false;

-- Same write-guard pattern as guard_is_demo_column() (0043): silently neutralizes any attempt
-- to set this through PostgREST, from any authenticated or anon client. Only a direct SQL
-- statement (i.e. Ming running this by hand, once, for her own account) can ever set it true.
create or replace function guard_is_admin_column()
returns trigger
language plpgsql
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    elsif tg_op = 'UPDATE' then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_is_admin_write_guard
  before insert or update on profiles
  for each row
  execute function guard_is_admin_column();

-- ---------------------------------------------------------------------------
-- 2. scopes: demo flag, timezone, venue name/address, short join code
-- ---------------------------------------------------------------------------

alter table scopes add column is_demo boolean not null default false;
alter table scopes add column timezone text;
alter table scopes add column venue_name text;
alter table scopes add column venue_address text;
alter table scopes add column short_code_hash text unique;

-- Retroactively marks the existing hand-seeded test event so it's isolated by the same
-- mechanism as everything real going forward.
update scopes set is_demo = true where kind = 'venue' and name = 'Demo Test Event';

-- Closes gap #1 above: venue creation/management now exclusively goes through the
-- security-definer functions below, all of which check created_by/is_admin explicitly.
drop policy "users manage scopes they created" on scopes;

create policy "users manage geo scopes they created"
  on scopes for all
  to authenticated
  using (kind = 'geo' and created_by = auth.uid())
  with check (kind = 'geo' and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. scope_members: presence + removal, and closing gap #2 above
-- ---------------------------------------------------------------------------

alter table scope_members add column checked_in_at timestamptz;
alter table scope_members add column removed_at timestamptz;
alter table scope_members add column removed_by uuid references auth.users (id) on delete set null;

drop policy "users manage their own scope membership" on scope_members;

create policy "users view their own scope membership"
  on scope_members for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. event_feedback + event_code_attempts (new small tables)
-- ---------------------------------------------------------------------------

create table event_feedback (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references scopes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  found_useful boolean,
  comment text,
  created_at timestamptz not null default now(),
  unique (scope_id, user_id)
);

alter table event_feedback enable row level security;

create policy "users manage their own event feedback"
  on event_feedback for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Internal-only attempt counter for the code/token lookup functions below — no client policy
-- at all, written only by those functions (which run with elevated privilege as the table
-- owner, same as every other security-definer function here).
create table event_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

alter table event_code_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Organizer functions
-- ---------------------------------------------------------------------------

create or replace function create_event(
  p_name text,
  p_organizer_name text,
  p_description text,
  p_venue_name text,
  p_venue_address text,
  p_lat double precision,
  p_lng double precision,
  p_radius_m int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_event_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(is_admin, false) into v_is_admin from profiles where id = v_caller;
  if not v_is_admin then
    raise exception 'Not authorized: only admins can create events';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Event name is required';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  insert into scopes (
    kind, name, organizer_name, description, venue_name, venue_address, center, radius_m,
    starts_at, ends_at, timezone, created_by, identity_mode, join_mode,
    matching_mode, overlap_display_mode, status, is_demo
  )
  values (
    'venue', trim(p_name), nullif(trim(p_organizer_name), ''), nullif(trim(p_description), ''),
    nullif(trim(p_venue_name), ''), nullif(trim(p_venue_address), ''),
    case when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null end,
    p_radius_m, p_starts_at, p_ends_at, p_timezone, v_caller,
    'full_required', 'qr_only', 'hybrid_ai', 'lower_ranked', 'draft', false
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke execute on function create_event(text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text) from public;
grant execute on function create_event(text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text) to authenticated;

create or replace function update_event(
  p_event_id uuid,
  p_name text,
  p_organizer_name text,
  p_description text,
  p_venue_name text,
  p_venue_address text,
  p_lat double precision,
  p_lng double precision,
  p_radius_m int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
)
returns void
language plpgsql
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

  if p_name is null or trim(p_name) = '' then
    raise exception 'Event name is required';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  update scopes set
    name = trim(p_name),
    organizer_name = nullif(trim(p_organizer_name), ''),
    description = nullif(trim(p_description), ''),
    venue_name = nullif(trim(p_venue_name), ''),
    venue_address = nullif(trim(p_venue_address), ''),
    center = case when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null end,
    radius_m = p_radius_m,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    timezone = p_timezone
  where id = p_event_id;
end;
$$;

revoke execute on function update_event(uuid, text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text) from public;
grant execute on function update_event(uuid, text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text) to authenticated;

-- Generates a fresh raw invite token + a 6-character human-typeable code (uppercase, no
-- 0/O/1/I ambiguity). Only the sha256 hash of each is ever stored — same principle as the
-- original QR token design (0049/0051) — so this returns the raw values exactly once; if
-- lost, call it again to rotate (which invalidates the old link/code).
create or replace function rotate_event_invite(p_event_id uuid)
returns table (raw_token text, raw_short_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_scope scopes;
  v_is_admin boolean;
  v_token text;
  v_code text;
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

  v_token := encode(gen_random_bytes(24), 'hex');
  -- floor() before the +1, not a bare ::int cast — Postgres rounds float->int casts rather
  -- than truncating, so a bare cast could occasionally land on index 33 of a 32-char alphabet
  -- and silently drop a character from the code.
  v_code := (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1), '')
    from generate_series(1, 6)
  );

  update scopes set
    qr_join_token_hash = encode(digest(v_token, 'sha256'), 'hex'),
    short_code_hash = encode(digest(v_code, 'sha256'), 'hex')
  where id = p_event_id;

  return query select v_token, v_code;
end;
$$;

revoke execute on function rotate_event_invite(uuid) from public;
grant execute on function rotate_event_invite(uuid) to authenticated;

create or replace function publish_event(p_event_id uuid)
returns void
language plpgsql
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

  if v_scope.status <> 'draft' then
    raise exception 'Only a draft event can be published';
  end if;
  if v_scope.qr_join_token_hash is null then
    raise exception 'Generate an invite link before publishing';
  end if;
  if v_scope.starts_at is not null and v_scope.ends_at is not null and v_scope.ends_at <= v_scope.starts_at then
    raise exception 'End time must be after start time';
  end if;

  update scopes set status = 'active' where id = p_event_id;
end;
$$;

revoke execute on function publish_event(uuid) from public;
grant execute on function publish_event(uuid) to authenticated;

create or replace function end_event_early(p_event_id uuid)
returns void
language plpgsql
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

  if v_scope.status <> 'active' then
    raise exception 'Only a live event can be ended';
  end if;

  update scopes set status = 'ended', ends_at = least(coalesce(ends_at, now()), now()) where id = p_event_id;
end;
$$;

revoke execute on function end_event_early(uuid) from public;
grant execute on function end_event_early(uuid) to authenticated;

create or replace function get_my_organized_events()
returns table (
  id uuid, name text, organizer_name text, description text,
  venue_name text, venue_address text, starts_at timestamptz, ends_at timestamptz,
  timezone text, status text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.organizer_name, s.description, s.venue_name, s.venue_address,
         s.starts_at, s.ends_at, s.timezone, s.status
  from scopes s
  where s.kind = 'venue'
    and (
      s.created_by = auth.uid()
      or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    )
  order by s.created_at desc
$$;

revoke execute on function get_my_organized_events() from public;
grant execute on function get_my_organized_events() to authenticated;

create or replace function get_event_management_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_scope scopes;
  v_is_admin boolean;
  v_joined int;
  v_completed_intent int;
  v_checked_in int;
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

  select count(*) into v_joined from scope_members where scope_id = p_event_id and status = 'active';
  select count(*) into v_completed_intent
    from event_intents ei
    join scope_members sm on sm.scope_id = ei.scope_id and sm.user_id = ei.user_id and sm.status = 'active'
    where ei.scope_id = p_event_id and ei.completed_at is not null;
  select count(*) into v_checked_in
    from scope_members where scope_id = p_event_id and status = 'active' and checked_in_at is not null;

  return jsonb_build_object(
    'joined_count', v_joined,
    'completed_intent_count', v_completed_intent,
    'checked_in_count', v_checked_in,
    'status', v_scope.status
  );
end;
$$;

revoke execute on function get_event_management_summary(uuid) from public;
grant execute on function get_event_management_summary(uuid) to authenticated;

-- Organizer-facing participant list — deliberately separate from get_event_attendees (the
-- peer-facing one): includes people regardless of intent completion, and the organizer
-- doesn't need to be a member/checked-in themselves to see it.
create or replace function get_event_participants_for_organizer(p_event_id uuid)
returns table (
  user_id uuid, full_name text, joined_at timestamptz, checked_in_at timestamptz,
  intent_completed boolean, status text
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
    select sm.user_id, p.full_name, sm.joined_at, sm.checked_in_at,
           (ei.completed_at is not null) as intent_completed, sm.status
    from scope_members sm
    join profiles p on p.id = sm.user_id
    left join event_intents ei on ei.scope_id = sm.scope_id and ei.user_id = sm.user_id
    where sm.scope_id = p_event_id
    order by sm.joined_at asc;
end;
$$;

revoke execute on function get_event_participants_for_organizer(uuid) from public;
grant execute on function get_event_participants_for_organizer(uuid) to authenticated;

create or replace function remove_event_participant(p_event_id uuid, p_target_user_id uuid)
returns void
language plpgsql
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

  update scope_members
  set status = 'left', left_at = now(), removed_at = now(), removed_by = v_caller, checked_in_at = null
  where scope_id = p_event_id and user_id = p_target_user_id;
end;
$$;

revoke execute on function remove_event_participant(uuid, uuid) from public;
grant execute on function remove_event_participant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Presence: check in / check out
-- ---------------------------------------------------------------------------

create or replace function check_in_to_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_scope scopes;
  v_updated int;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_scope from scopes where id = p_event_id and kind = 'venue';
  if not found then
    raise exception 'No such event';
  end if;
  if v_scope.status <> 'active' then
    raise exception 'This event is not currently live';
  end if;
  if v_scope.ends_at is not null and v_scope.ends_at <= now() then
    raise exception 'This event has ended';
  end if;

  update scope_members
  set checked_in_at = now()
  where scope_id = p_event_id and user_id = v_user and status = 'active';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'You must join this event before checking in';
  end if;
end;
$$;

revoke execute on function check_in_to_event(uuid) from public;
grant execute on function check_in_to_event(uuid) to authenticated;

create or replace function check_out_of_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update scope_members
  set checked_in_at = null
  where scope_id = p_event_id and user_id = auth.uid() and status = 'active';
end;
$$;

revoke execute on function check_out_of_event(uuid) from public;
grant execute on function check_out_of_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Short-code join lookup (rate-limited) + public-safe landing-page info
-- ---------------------------------------------------------------------------

create or replace function get_event_by_short_code(p_code text)
returns table (
  id uuid, name text, organizer_name text, description text, starts_at timestamptz, ends_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_recent_attempts int;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  delete from event_code_attempts where attempted_at < now() - interval '10 minutes';

  select count(*) into v_recent_attempts
  from event_code_attempts
  where user_id = v_user and attempted_at > now() - interval '10 minutes';

  if v_recent_attempts >= 20 then
    raise exception 'Too many attempts — wait a few minutes and try again';
  end if;

  insert into event_code_attempts (user_id) values (v_user);

  return query
    select s.id, s.name, s.organizer_name, s.description, s.starts_at, s.ends_at
    from scopes s
    where s.kind = 'venue'
      and s.status = 'active'
      and s.short_code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex');
end;
$$;

revoke execute on function get_event_by_short_code(text) from public;
grant execute on function get_event_by_short_code(text) to authenticated;

-- Same rate-limit guard added to the existing QR lookup for consistency (token space is huge,
-- so this is defense-in-depth rather than the primary protection there).
create or replace function get_event_by_qr_token(p_token text)
returns table (
  id uuid, name text, organizer_name text, description text, starts_at timestamptz, ends_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_recent_attempts int;
begin
  if v_user is not null then
    delete from event_code_attempts where attempted_at < now() - interval '10 minutes';

    select count(*) into v_recent_attempts
    from event_code_attempts
    where user_id = v_user and attempted_at > now() - interval '10 minutes';

    if v_recent_attempts >= 20 then
      raise exception 'Too many attempts — wait a few minutes and try again';
    end if;

    insert into event_code_attempts (user_id) values (v_user);
  end if;

  return query
    select s.id, s.name, s.organizer_name, s.description, s.starts_at, s.ends_at
    from scopes s
    where s.kind = 'venue'
      and s.status = 'active'
      and s.qr_join_token_hash = encode(digest(p_token, 'sha256'), 'hex');
end;
$$;

revoke execute on function get_event_by_qr_token(text) from public;
grant execute on function get_event_by_qr_token(text) to authenticated;

-- Public-safe: callable with the anon key from the pre-install web landing page (no session).
-- Deliberately token-only (not short-code) since it has no per-caller rate limit to attach to
-- an anonymous request — the short code stays an authenticated-only recovery path. Zero
-- attendee data ever returned here, matching "public landing pages cannot retrieve attendee
-- information."
create or replace function get_event_landing_info(p_token text)
returns table (
  name text, organizer_name text, description text, venue_name text, venue_address text,
  starts_at timestamptz, ends_at timestamptz, timezone text, status text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.name, s.organizer_name, s.description, s.venue_name, s.venue_address,
         s.starts_at, s.ends_at, s.timezone, s.status
  from scopes s
  where s.kind = 'venue'
    and s.status in ('active', 'ended')
    and s.qr_join_token_hash = encode(digest(p_token, 'sha256'), 'hex')
  limit 1
$$;

revoke execute on function get_event_landing_info(text) from public;
grant execute on function get_event_landing_info(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Tighten join_event: block re-entry after removal, enforce demo/real isolation
-- ---------------------------------------------------------------------------

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
  if v_caller_is_demo <> v_scope.is_demo then
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

-- ---------------------------------------------------------------------------
-- 9. Tighten discovery/matching: require check-in, enforce demo/real isolation
-- ---------------------------------------------------------------------------

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
  v_caller_is_demo boolean;
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

  select coalesce(is_demo, false) into v_caller_is_demo from profiles where id = v_caller;
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
      and coalesce(p.is_demo, false) = v_caller_is_demo
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
  v_caller_is_demo boolean;
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

  select coalesce(is_demo, false) into v_caller_is_demo from profiles where id = v_caller;

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
      and coalesce(p.is_demo, false) = v_caller_is_demo
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

-- ---------------------------------------------------------------------------
-- 10. Tighten ambient discovery: only geofence_prompt events leak by proximity, and only to
--     accounts on the same side of the demo/real line.
-- ---------------------------------------------------------------------------

create or replace function detect_nearby_events(p_lat double precision, p_lng double precision)
returns table (
  id uuid,
  name text,
  organizer_name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.organizer_name, s.description, s.starts_at, s.ends_at
  from scopes s
  where s.kind = 'venue'
    and s.status = 'active'
    and s.join_mode = 'geofence_prompt'
    and s.center is not null
    and s.is_demo = coalesce((select p.is_demo from profiles p where p.id = auth.uid()), false)
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at is null or s.ends_at > now())
    and st_dwithin(s.center, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, coalesce(s.radius_m, 150))
$$;

revoke execute on function detect_nearby_events(double precision, double precision) from public;
grant execute on function detect_nearby_events(double precision, double precision) to authenticated;
