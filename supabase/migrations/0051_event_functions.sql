-- v2 event mode, phase 1: safe accessor + mutation functions for events.
-- All security definer, matching the existing pattern (e.g. suppression_for_user is locked
-- down and only reachable via wrapper functions) since RLS can't restrict columns — direct
-- table access to `scopes` would leak qr_join_token_hash to anyone who could read the row.
-- Supabase installs pgcrypto into the "extensions" schema, not "public" — every function
-- below that needs digest() must include extensions in its search_path or the call fails
-- with "function digest(text, unknown) does not exist".
create extension if not exists pgcrypto with schema extensions;

-- Discovery: active venue events whose geofence contains the caller's current position.
-- Never returns qr_join_token_hash or other internal columns.
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
    and s.center is not null
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at is null or s.ends_at > now())
    and st_dwithin(s.center, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, coalesce(s.radius_m, 150))
$$;

revoke execute on function detect_nearby_events(double precision, double precision) from public;
grant execute on function detect_nearby_events(double precision, double precision) to authenticated;

-- QR join: caller presents the raw token from the scanned deep link; we hash it and match
-- against qr_join_token_hash server-side. The raw token itself is never stored anywhere.
create or replace function get_event_by_qr_token(p_token text)
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
set search_path = public, extensions
as $$
  select s.id, s.name, s.organizer_name, s.description, s.starts_at, s.ends_at
  from scopes s
  where s.kind = 'venue'
    and s.status = 'active'
    and s.qr_join_token_hash = encode(digest(p_token, 'sha256'), 'hex')
$$;

revoke execute on function get_event_by_qr_token(text) from public;
grant execute on function get_event_by_qr_token(text) to authenticated;

-- Join: validates the event is actually active before creating/reactivating membership.
-- Upserts rather than inserting so a user who left and rejoins reuses the same row (the
-- (scope_id, user_id) primary key on scope_members already forbids a second row anyway).
create or replace function join_event(p_event_id uuid, p_join_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_scope scopes;
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

  insert into scope_members (scope_id, user_id, join_method, status, joined_at, left_at)
  values (p_event_id, v_user, p_join_method, 'active', now(), null)
  on conflict (scope_id, user_id) do update
    set status = 'active',
        join_method = excluded.join_method,
        joined_at = now(),
        left_at = null;
end;
$$;

revoke execute on function join_event(uuid, text) from public;
grant execute on function join_event(uuid, text) to authenticated;

-- Leave: soft — flips status rather than deleting, so post-event history/measurement still
-- works (spec's own "measurement" phase needs this).
create or replace function leave_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update scope_members
  set status = 'left', left_at = now()
  where scope_id = p_event_id and user_id = auth.uid();
end;
$$;

revoke execute on function leave_event(uuid) from public;
grant execute on function leave_event(uuid) to authenticated;

-- Intent: only an active member of the event may set/update their own intent for it.
create or replace function upsert_event_intent(
  p_event_id uuid,
  p_ask_text text,
  p_offer_text text,
  p_desired_connection_text text,
  p_ask_tags text[] default null,
  p_offer_tags text[] default null,
  p_desired_connection_tags text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from scope_members
    where scope_id = p_event_id and user_id = v_user and status = 'active'
  ) then
    raise exception 'You must join this event before setting your intent';
  end if;

  insert into event_intents (
    scope_id, user_id, ask_text, offer_text, desired_connection_text,
    ask_tags, offer_tags, desired_connection_tags, active, updated_at
  )
  values (
    p_event_id, v_user, p_ask_text, p_offer_text, p_desired_connection_text,
    p_ask_tags, p_offer_tags, p_desired_connection_tags, true, now()
  )
  on conflict (scope_id, user_id) do update
    set ask_text = excluded.ask_text,
        offer_text = excluded.offer_text,
        desired_connection_text = excluded.desired_connection_text,
        ask_tags = excluded.ask_tags,
        offer_tags = excluded.offer_tags,
        desired_connection_tags = excluded.desired_connection_tags,
        active = true,
        updated_at = now();
end;
$$;

revoke execute on function upsert_event_intent(uuid, text, text, text, text[], text[], text[]) from public;
grant execute on function upsert_event_intent(uuid, text, text, text, text[], text[], text[]) to authenticated;
