-- Spec v4 section 14 step 10: reveal_requests state machine, expiry, rate limits.
-- Schema matches section 12 exactly.

create type reveal_state as enum ('pending', 'revealed', 'expired', 'withdrawn');

create table reveal_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  scope_id uuid references scopes (id) on delete set null,
  state reveal_state not null default 'pending',
  connection_line text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  resolved_at timestamptz,
  constraint no_self_reveal_request check (requester_id <> target_id)
);

create index reveal_requests_requester_idx on reveal_requests (requester_id, state, created_at);
create index reveal_requests_target_idx on reveal_requests (target_id, state);

alter table reveal_requests enable row level security;

-- Section 11.2: "The person being asked can read the requester's identity. The requester
-- can never read the target's identity, nor any status beyond 'pending'." requester_id and
-- target_id are opaque uuids either way (identity resolution goes through the now-locked-down
-- profiles table, migration 0025) — what this policy specifically guarantees is that the
-- requester loses read access to the row entirely the moment it stops being 'pending', so
-- there is no channel for them to observe 'revealed' vs 'expired' vs 'withdrawn'. Section
-- 5.4's "no visible rejection" and the mutual-reveal notification both flow through the
-- connections table instead (wired in step 11), never through this table for the requester.
create policy "target reads requests addressed to them"
  on reveal_requests for select
  to authenticated
  using (target_id = auth.uid());

create policy "requester reads their own request only while pending"
  on reveal_requests for select
  to authenticated
  using (requester_id = auth.uid() and state = 'pending' and expires_at > now());

-- No direct insert/update policies — all writes go through the security-definer functions
-- below, so rate limiting and the pending-only transition rules can't be bypassed by a
-- direct table write from the client.

-- "Maximum 3 outstanding requests per person per day" — read as: fewer than 3 requests
-- currently pending that this requester created in the trailing 24 hours. Enforced here,
-- not in the app, per section 11's "separate policies, not conditions in the app code."
create function create_reveal_request(p_target_id uuid, p_connection_line text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_outstanding int;
  v_id uuid;
begin
  if v_requester is null then
    raise exception 'Not authenticated';
  end if;
  if v_requester = p_target_id then
    raise exception 'Cannot request a reveal from yourself';
  end if;

  select count(*) into v_outstanding
  from reveal_requests
  where requester_id = v_requester
    and state = 'pending'
    and created_at > now() - interval '24 hours';

  if v_outstanding >= 3 then
    raise exception 'Rate limit: maximum 3 outstanding requests per day';
  end if;

  insert into reveal_requests (requester_id, target_id, connection_line)
  values (v_requester, p_target_id, p_connection_line)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function create_reveal_request(uuid, text) from public;
grant execute on function create_reveal_request(uuid, text) to authenticated;

-- Pure state transition for step 10. Step 11 extends this (create or replace, same
-- signature) to also create the connections row and unlock chat.
create function reveal_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := auth.uid();
  v_row reveal_requests;
begin
  select * into v_row from reveal_requests where id = p_request_id for update;

  if not found then
    raise exception 'No such request';
  end if;
  if v_row.target_id <> v_target then
    raise exception 'Not authorized';
  end if;
  if v_row.state <> 'pending' or v_row.expires_at <= now() then
    raise exception 'Request is no longer pending';
  end if;

  update reveal_requests
  set state = 'revealed', resolved_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function reveal_request(uuid) from public;
grant execute on function reveal_request(uuid) to authenticated;

create function withdraw_reveal_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
begin
  update reveal_requests
  set state = 'withdrawn', resolved_at = now()
  where id = p_request_id
    and requester_id = v_requester
    and state = 'pending';

  if not found then
    raise exception 'No pending request to withdraw';
  end if;
end;
$$;

revoke execute on function withdraw_reveal_request(uuid) from public;
grant execute on function withdraw_reveal_request(uuid) to authenticated;

-- Bookkeeping sweep, not correctness-critical: the select policy above already excludes
-- expired-by-time rows for the requester regardless of whether this has run. Run
-- periodically (pg_cron, or an edge function on a schedule) to keep `state` itself tidy —
-- e.g. so future rate-limit counts and any admin views reflect reality without relying on
-- expires_at math everywhere. Restricted to service_role since it's a bulk admin sweep, not
-- a per-user action.
create function expire_reveal_requests()
returns void
language sql
security definer
set search_path = public
as $$
  update reveal_requests
  set state = 'expired', resolved_at = now()
  where state = 'pending' and expires_at <= now();
$$;

revoke execute on function expire_reveal_requests() from public;
revoke execute on function expire_reveal_requests() from authenticated;
grant execute on function expire_reveal_requests() to service_role;
