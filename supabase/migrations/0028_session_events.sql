-- Spec v4 section 14 step 12 + section 10: the instrumentation this build exists to answer.
-- "The share of app opens that come from people whose current answer is 'none of these.'"

alter table profiles
  add column intent_state text
    check (intent_state is null or intent_state in
      ('job_hunting', 'raising_money', 'new_to_city', 'at_event', 'just_curious')),
  add column intent_state_updated_at timestamptz;

create table session_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  scope_id uuid references scopes (id) on delete set null,
  intent_state text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index session_events_user_idx on session_events (user_id, created_at);
create index session_events_type_idx on session_events (event_type, created_at);

alter table session_events enable row level security;

-- Write-only from the client's perspective — no select policy for `authenticated`. This is
-- an analytics stream read by the founder via the SQL editor / service role, not something
-- an individual user has a reason to read back through the app.
create policy "users log their own session events"
  on session_events for insert
  to authenticated
  with check (user_id = auth.uid());

-- Stamps the user's current intent_state onto every event automatically, per section 10
-- ("stamp it on every recorded session event") — callers never pass it themselves, so it
-- can't drift from what's actually on the user's profile at event time.
create function log_session_event(p_event_type text, p_scope_id uuid default null, p_metadata jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_intent_state text;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select intent_state into v_intent_state from profiles where id = v_user;

  insert into session_events (user_id, event_type, scope_id, intent_state, metadata)
  values (v_user, p_event_type, p_scope_id, v_intent_state, p_metadata);
end;
$$;

revoke execute on function log_session_event(text, uuid, jsonb) from public;
grant execute on function log_session_event(text, uuid, jsonb) to authenticated;

create function set_intent_state(p_intent_state text)
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
  if p_intent_state not in ('job_hunting', 'raising_money', 'new_to_city', 'at_event', 'just_curious') then
    raise exception 'Invalid intent_state: %', p_intent_state;
  end if;

  update profiles
  set intent_state = p_intent_state, intent_state_updated_at = now()
  where id = v_user;
end;
$$;

revoke execute on function set_intent_state(text) from public;
grant execute on function set_intent_state(text) to authenticated;
