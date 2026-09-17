-- Two people who request each other become connected instead of holding two pending requests.
--
-- The client already handles the common case (if A taps Connect on B while B's request to A is
-- sitting in A's inbox, the app accepts B's request rather than sending a new one). This
-- trigger closes the true race — both taps landing before either client has refreshed — and
-- also covers any path that inserts a request without going through the app.
--
-- On insert of a pending connect request, if the reverse pending connect request exists it is
-- accepted (which fires handle_request_accepted from 0001 and creates the connections row), and
-- the new row is stored as accepted too so both sides keep their provenance (context_type,
-- event_id). The connections insert is `on conflict do nothing`, so a second accept can't
-- create a duplicate pair.

create or replace function resolve_mutual_connect_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reverse_id uuid;
begin
  if new.type <> 'connect' or new.status <> 'pending' then
    return new;
  end if;

  select id into v_reverse_id
  from connection_requests
  where sender_id = new.receiver_id
    and receiver_id = new.sender_id
    and type = 'connect'
    and status = 'pending'
  limit 1;

  if v_reverse_id is not null then
    update connection_requests set status = 'accepted' where id = v_reverse_id;
    new.status := 'accepted';
  end if;

  return new;
end;
$$;

drop trigger if exists on_request_insert_resolve_mutual on connection_requests;
create trigger on_request_insert_resolve_mutual
  before insert on connection_requests
  for each row
  execute function resolve_mutual_connect_request();
