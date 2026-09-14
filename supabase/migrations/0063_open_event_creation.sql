-- Opens event creation to every user with a completed profile, and makes a created event live
-- and joinable in one step.
--
-- Three changes to create_event, all deliberate:
--
-- 1. The is_admin gate is replaced by a completed-profile gate. Event creation was admin-only
--    for the hand-run pilot; the product now lets anyone host. A completed profile is the
--    guardrail — the same bar the app already enforces before a new sign-up can do anything
--    else (app/_layout.tsx redirects to /edit-profile when hasProfile is false), so this adds
--    no new concept, just reuses the existing one as an anti-spam floor.
--
-- 2. status is now 'active', not 'draft'. The draft/publish split existed for an organizer
--    workflow that the new design removes — a host taps Create and immediately gets a code to
--    share. This also fixes a latent bug: scopes.status has only ever permitted
--    ('active','ended','cancelled') per 0049, so the 'draft' insert would always have failed a
--    check constraint. publish_event is left in place for any event already in that state, but
--    nothing creates drafts any more.
--
-- 3. The invite token and short code are generated here rather than in a follow-up
--    rotate_event_invite call, and returned to the caller once. A live event with a null
--    qr_join_token_hash/short_code_hash is unjoinable, so generating them at creation is what
--    makes "publish immediately" actually true. Same hash-only storage rule as everywhere else:
--    only the sha256 of each is persisted, the raw values are returned exactly once, and
--    rotate_event_invite still exists to reissue them.
--
-- The return type changes (uuid -> table), so the old signature is dropped first.

drop function if exists create_event(text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text);

create function create_event(
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
  -- floor() before the +1, not a bare ::int cast — Postgres rounds float->int casts rather than
  -- truncating, so a bare cast could land on index 33 of this 32-char alphabet and drop a
  -- character. Alphabet excludes 0/O/1/I so a code read aloud or off a screen isn't ambiguous.
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

  return query select v_event_id, v_token, v_code;
end;
$$;

revoke execute on function create_event(text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text) from public;
grant execute on function create_event(text, text, text, text, text, double precision, double precision, int, timestamptz, timestamptz, text) to authenticated;
