-- v2 event mode, phase 1: activate the existing (until now schema-and-stub-only) venue scope
-- kind as the events system, per the spec's own instruction to reuse scopes/venue-scope
-- functionality rather than build a parallel events table. Additive only — every new column
-- is only ever populated/read for kind='venue' rows, so kind='geo' (ordinary Nearby) behavior
-- is completely unchanged.
alter table scopes add column organizer_name text;
alter table scopes add column description text;
alter table scopes add column identity_mode text not null default 'full_required'
  check (identity_mode in ('full_required', 'user_choice', 'hidden_until_connected'));
alter table scopes add column join_mode text not null default 'geofence_prompt'
  check (join_mode in ('geofence_prompt', 'auto_join', 'qr_only'));
alter table scopes add column matching_mode text not null default 'hybrid_ai'
  check (matching_mode in ('hybrid_ai', 'ai_only', 'deterministic_only'));
alter table scopes add column overlap_display_mode text not null default 'lower_ranked'
  check (overlap_display_mode in ('lower_ranked', 'separate_section', 'hidden'));
alter table scopes add column qr_join_token_hash text unique;
alter table scopes add column status text not null default 'active'
  check (status in ('active', 'ended', 'cancelled'));

comment on column scopes.center is 'geo scopes: the caller''s own live location at query time. venue scopes: the event''s fixed location, used for geofence-based event detection.';
comment on column scopes.radius_m is 'geo scopes: the nearby-feed search radius. venue scopes: the geofence radius used to detect attendees are at the event.';

-- scope_members: extend for event semantics. join_method/status/left_at are null-safe for
-- existing geo-scope rows (which never set them) — no behavior change there.
alter table scope_members add column join_method text
  check (join_method in ('geofence_prompt', 'qr', 'admin_test'));
alter table scope_members add column status text not null default 'active'
  check (status in ('active', 'left'));
alter table scope_members add column left_at timestamptz;
