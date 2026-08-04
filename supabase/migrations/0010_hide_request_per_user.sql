-- "Delete" from history is per-viewer, not shared: a request row is
-- jointly owned by sender and receiver, so hiding it for one side must
-- not affect the other. Two boolean flags track that independently.
alter table connection_requests
  add column hidden_by_sender boolean not null default false,
  add column hidden_by_receiver boolean not null default false;

-- Runs as security definer so it can update a row the caller doesn't
-- have a general UPDATE policy for, but it only ever sets the flag
-- matching the caller's own role on that request — never status or
-- any other field — so this can't be used to bypass accept/decline.
create function hide_request_for_me(request_id uuid)
returns void as $$
declare
  req record;
begin
  select sender_id, receiver_id into req from connection_requests where id = request_id;

  if req.sender_id is null then
    raise exception 'Request not found';
  end if;

  if req.sender_id = auth.uid() then
    update connection_requests set hidden_by_sender = true where id = request_id;
  elsif req.receiver_id = auth.uid() then
    update connection_requests set hidden_by_receiver = true where id = request_id;
  else
    raise exception 'Not authorized';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function hide_request_for_me(uuid) to authenticated;
