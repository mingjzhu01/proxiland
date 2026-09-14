-- The host is a member of their own event from the moment it's created.
--
-- Before this, create_event only wrote the scopes row; the creator had no scope_members row, so
-- their own event didn't appear in Nearby's "You're in" list until they joined it by typing the
-- code — which reads as broken to a host who just tapped Create. Membership is inserted here, in
-- the same transaction as the event, rather than by a follow-up join_event call from the client:
-- a second round trip can be lost to a crash or a bad connection and leave the host stranded.
--
-- checked_in_at is set too. The host is, by definition, at the venue — and discovery/ranking for
-- other attendees only considers checked-in members (0060), so an un-checked-in host would be
-- invisible to the people at their own event.
--
-- join_method gains a 'host' value so this membership is distinguishable from a scan or a typed
-- code. The check constraint is the auto-named inline one from 0049
-- (scope_members_join_method_check), recreated with the new value.

alter table scope_members drop constraint if exists scope_members_join_method_check;
alter table scope_members add constraint scope_members_join_method_check
  check (join_method in ('geofence_prompt', 'qr', 'admin_test', 'host'));

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
returns table (event_id uuid, raw_token text, raw_short_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_has_profile boolean;
  v_event_id uuid;
  v_token text;
  v_code text;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select exists (select 1 from profile_attributes where user_id = v_caller) into v_has_profile;
  if not v_has_profile then
    raise exception 'Complete your profile before hosting an event';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Event name is required';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_code := (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1), '')
    from generate_series(1, 6)
  );

  insert into scopes (
    kind, name, organizer_name, description, venue_name, venue_address, center, radius_m,
    starts_at, ends_at, timezone, created_by, identity_mode, join_mode,
    matching_mode, overlap_display_mode, status, is_demo,
    qr_join_token_hash, short_code_hash
  )
  values (
    'venue', trim(p_name), nullif(trim(p_organizer_name), ''), nullif(trim(p_description), ''),
    nullif(trim(p_venue_name), ''), nullif(trim(p_venue_address), ''),
    case when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null end,
    p_radius_m, p_starts_at, p_ends_at, p_timezone, v_caller,
    'full_required', 'qr_only', 'hybrid_ai', 'lower_ranked', 'active', false,
    encode(digest(v_token, 'sha256'), 'hex'),
    encode(digest(v_code, 'sha256'), 'hex')
  )
  returning id into v_event_id;

  insert into scope_members (scope_id, user_id, join_method, status, joined_at, checked_in_at)
  values (v_event_id, v_caller, 'host', 'active', now(), now());

  return query select v_event_id, v_token, v_code;
end;
$$;
