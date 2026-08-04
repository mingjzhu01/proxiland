-- Spec v4 section 14 step 11: mutual reveal wired into the existing v1 connection/chat
-- system. Section 5's reveal flow, steps 2 and 3:
--   "A's real identity is shown to B immediately... B reveals back, which creates a mutual
--    connection... On a mutual reveal, both see full profiles and the existing chat opens."
--
-- Two things this requires that migration 0026 didn't yet cover:
-- 1. B (the target) must be able to read A's (the requester's) full profile the moment the
--    request exists — before any connections row exists, since revealing IS the act that
--    creates the connection. Migration 0025 locked profiles down to self+connected; this
--    adds the one legitimate asymmetric case.
-- 2. reveal_request() must create the connections row atomically with the state flip, so
--    the existing chat/connections UI just works — same shape v1's
--    handle_request_accepted() trigger already produces for connect requests.

create policy "target of a pending request reads the requester's profile"
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from reveal_requests rr
      where rr.requester_id = profiles.id
        and rr.target_id = auth.uid()
        and rr.state = 'pending'
        and rr.expires_at > now()
    )
  );

create or replace function reveal_request(p_request_id uuid)
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

  insert into connections (user_a, user_b)
  values (least(v_row.requester_id, v_row.target_id), greatest(v_row.requester_id, v_row.target_id))
  on conflict do nothing;
end;
$$;

revoke execute on function reveal_request(uuid) from public;
grant execute on function reveal_request(uuid) to authenticated;
