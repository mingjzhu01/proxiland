-- v2 event mode, phase 1: per-event intent, distinct from the permanent profile
-- (profile_attributes.looking_for/can_offer) since the spec requires event intent to never
-- overwrite the core profile. Owner-only RLS for now, matching every other "manage your own
-- row" table in this schema (profile_attributes, visibility_sessions). Cross-user visibility
-- of someone's intent (for match cards, the full event-profile screen) is NOT solved here —
-- it comes in Phase 4/5 via security-definer functions reading this table server-side, the
-- same pattern already used to read profile_attributes cross-user (never direct RLS).
create table event_intents (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references scopes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ask_text text,
  offer_text text,
  desired_connection_text text,
  ask_tags text[],
  offer_tags text[],
  desired_connection_tags text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_id, user_id)
);

alter table event_intents enable row level security;

create policy "users manage their own event intent"
  on event_intents
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
