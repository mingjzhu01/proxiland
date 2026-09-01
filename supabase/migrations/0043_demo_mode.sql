-- App Store review demo mode. Goal: a single flagged account (appreview@proxiland.app) always
-- sees a populated, fully-interactive feed regardless of where the reviewer physically is,
-- while running through the exact same card-building / suppression / reveal pipeline real
-- users go through — no parallel fake renderer. Twelve flagged "NPC" profiles supply the
-- population; a demo account's own location dynamically relocates them (never a hardcoded
-- coordinate) so this works wherever the reviewer happens to be.
--
-- Containment is enforced here, at the query/RLS level, not in client code:
--   1. `profiles.is_demo` can only ever be set true by service_role (the seed script) — a
--      trigger forces it back to false/unchanged for any authenticated/anon-role write.
--   2. `geo_scope_population` (called by both the feed and the aggregate count) now requires
--      the viewer's own is_demo flag to MATCH the row being returned — a real user can never
--      see a demo row, and the demo account can never see a real one. This is the single
--      chokepoint every population read passes through, so it covers the Nearby feed, the
--      aggregate "X people nearby" count, and (transitively) requests/chat, since a real user
--      can never discover an NPC's user_id to begin with.
--   3. Demo NPCs are seeded with zero `device_push_tokens` rows, so `send-push`'s existing
--      early-return already guarantees they can never trigger a push to anyone (see that
--      function's own comment) — no change needed there.

-- ---------------------------------------------------------------------------
-- 1. is_demo flag + write guard
-- ---------------------------------------------------------------------------

alter table profiles add column is_demo boolean not null default false;

-- Blocks the flag from ever being set through PostgREST (i.e. by any client, authenticated or
-- anon) regardless of what the request body contains — only a service_role write (the seed
-- script) or a direct SQL-editor/migration statement can set it. This is deliberately a
-- blanket override, not a check constraint, so it silently neutralizes the attempt rather than
-- erroring — a client trying to smuggle is_demo:true in a normal profile save should just work
-- as a normal save, not blow up.
create or replace function guard_is_demo_column()
returns trigger
language plpgsql
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_demo := false;
    elsif tg_op = 'UPDATE' then
      new.is_demo := old.is_demo;
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_is_demo_write_guard
  before insert or update on profiles
  for each row
  execute function guard_is_demo_column();

-- ---------------------------------------------------------------------------
-- 2. Relocate demo NPCs to wherever the demo account's scope was just created
-- ---------------------------------------------------------------------------

-- Not directly callable by any client (no grant to authenticated/anon, matching the
-- suppression_for_user lockdown pattern from migrations 0022/0023) — only reachable via
-- get_or_create_geo_scope's internal call below.
create or replace function sync_demo_npc_visibility(p_scope_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scopes;
  v_caller uuid := auth.uid();
  v_npc record;
begin
  select * into v_scope from scopes where id = p_scope_id;
  if not found then
    return;
  end if;

  for v_npc in select id from profiles where is_demo = true and id <> v_caller loop
    update visibility_sessions set is_active = false
    where user_id = v_npc.id and is_active = true;

    insert into visibility_sessions (user_id, location, expires_at, is_active)
    values (v_npc.id, v_scope.center, now() + interval '1 hour', true);
  end loop;
end;
$$;

revoke execute on function sync_demo_npc_visibility(uuid) from public;

-- Body-only change from migration 0016: adds the demo-relocation call, everything else
-- (including the "always create a fresh scope row" behavior) is unchanged.
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

  if exists (select 1 from profiles where id = auth.uid() and is_demo) then
    perform sync_demo_npc_visibility(v_scope_id);
  end if;

  return v_scope_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Containment: population_for_scope's geo branch now matches is_demo both ways
-- ---------------------------------------------------------------------------

-- Body-only change from migration 0016: adds the is_demo match. aggregate_view_for_scope and
-- individual_cards_for_scope both consume this indirectly via population_for_scope, so both
-- inherit containment automatically — no changes needed in either of those functions.
create or replace function geo_scope_population(p_scope_id uuid)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scopes;
  v_caller_is_demo boolean;
begin
  select * into v_scope from scopes where id = p_scope_id and kind = 'geo';
  if not found then
    raise exception 'No geo scope %', p_scope_id;
  end if;

  select coalesce(is_demo, false) into v_caller_is_demo from profiles where id = auth.uid();

  return query
    select vs.user_id
    from visibility_sessions vs
    join profile_attributes pa on pa.user_id = vs.user_id
    join profiles pf on pf.id = vs.user_id
    where vs.is_active = true
      and vs.expires_at > now()
      and st_dwithin(vs.location, v_scope.center, v_scope.radius_m)
      and coalesce(pf.is_demo, false) = v_caller_is_demo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Scheduled demo-only reciprocation: auto-reveal + one canned chat reply
-- ---------------------------------------------------------------------------

-- Nothing in this codebase has ever needed a "do X seconds after Y" primitive before (see the
-- never-scheduled expire_reveal_requests() from migration 0026) — pg_cron is the standard
-- Supabase-documented way to add one. Minute-granularity (rather than a pg_cron seconds-based
-- schedule, which isn't guaranteed available on every project) means the ~10s target in
-- practice resolves within roughly 10-70s — acceptable for a review demo, and cron.schedule
-- upserts by job name so rerunning this migration doesn't create duplicate jobs.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'demo-mode-auto-reveal',
  '* * * * *',
  $cron$
    with newly_revealed as (
      update reveal_requests rr
      set state = 'revealed', resolved_at = now()
      where rr.state = 'pending'
        and rr.expires_at > now()
        and rr.created_at <= now() - interval '10 seconds'
        and exists (select 1 from profiles pr where pr.id = rr.requester_id and pr.is_demo)
        and exists (select 1 from profiles pt where pt.id = rr.target_id and pt.is_demo)
      returning requester_id, target_id
    )
    insert into connections (user_a, user_b)
    select least(requester_id, target_id), greatest(requester_id, target_id) from newly_revealed
    on conflict do nothing;
  $cron$
);

select cron.schedule(
  'demo-mode-canned-reply',
  '* * * * *',
  $cron$
    do $do$
    declare
      v_demo_account_id uuid;
    begin
      select p.id into v_demo_account_id
      from profiles p
      join auth.users u on u.id = p.id
      where p.is_demo and u.email = 'appreview@proxiland.app';

      if v_demo_account_id is null then
        return;
      end if;

      insert into messages (connection_id, sender_id, body)
      select
        c.id,
        case when c.user_a = v_demo_account_id then c.user_b else c.user_a end,
        'Nice to meet you! This is a demo conversation.'
      from connections c
      where (c.user_a = v_demo_account_id or c.user_b = v_demo_account_id)
        and exists (
          select 1 from messages m
          where m.connection_id = c.id
            and m.sender_id = v_demo_account_id
            and m.created_at <= now() - interval '5 seconds'
        )
        and not exists (
          select 1 from messages m2
          where m2.connection_id = c.id
            and m2.sender_id = case when c.user_a = v_demo_account_id then c.user_b else c.user_a end
        );
    end;
    $do$;
  $cron$
);
