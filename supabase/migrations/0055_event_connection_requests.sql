-- v2 event mode, phase 5: connection flow. Per v2-implementation-plan.md's architecture
-- assessment — event connections reuse the EXISTING connection_requests/connections system
-- (type='connect'), not reveal_requests, because both identities are already visible in event
-- mode (identity_mode='full_required'); reveal_requests is built around asymmetric identity
-- disclosure, which doesn't apply here. handle_request_accepted() (migration 0001) already
-- creates the connections row on accept for any type — nothing to change there. The existing
-- Requests tab (app/(tabs)/requests.tsx) and lib/api/requests.ts already fully handle
-- sending, accepting, declining, and push notifications for type='connect' — this migration
-- only adds provenance (so an event-sourced request can be told apart from a Nearby one) and
-- the one missing permission: reading the other party's profile before any connection exists.
--
-- Deliberately NOT adding source_identity_was_hidden/target_identity_was_hidden columns from
-- the original plan sketch — those only matter once Phase 6's partial-identity event modes
-- exist. Adding always-false columns now would be unused scaffolding; add them in Phase 6
-- when there's an actual value to store.
alter table connection_requests add column context_type text not null default 'nearby'
  check (context_type in ('nearby', 'event'));
alter table connection_requests add column event_id uuid references scopes(id) on delete set null;

-- Mirrors migration 0027's reveal_requests policy exactly, just for connection_requests and
-- symmetric (both the Requests tab's incoming AND outgoing lists join profiles for the OTHER
-- party, so both directions need to resolve before a connections row exists).
create policy "participants in a connect request read each other's profile"
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from connection_requests cr
      where cr.type = 'connect'
        and cr.status in ('pending', 'accepted')
        and (
          (cr.sender_id = profiles.id and cr.receiver_id = auth.uid())
          or (cr.receiver_id = profiles.id and cr.sender_id = auth.uid())
        )
    )
  );
