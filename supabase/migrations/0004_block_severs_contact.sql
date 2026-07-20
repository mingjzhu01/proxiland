-- Blocking someone should cut all contact, not just hide them from Nearby:
-- it should remove any existing connection between the two users, cancel any
-- pending requests between them, and prevent either side from sending new
-- requests going forward.

create function handle_block_created()
returns trigger as $$
begin
  delete from connections
  where (user_a = new.blocker_id and user_b = new.target_id)
     or (user_a = new.target_id and user_b = new.blocker_id);

  update connection_requests
  set status = 'declined'
  where status = 'pending'
    and ((sender_id = new.blocker_id and receiver_id = new.target_id)
      or (sender_id = new.target_id and receiver_id = new.blocker_id));

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_block_created
  after insert on blocks
  for each row
  execute function handle_block_created();

create function prevent_blocked_requests()
returns trigger as $$
begin
  if exists (
    select 1 from blocks
    where (blocker_id = new.sender_id and target_id = new.receiver_id)
       or (blocker_id = new.receiver_id and target_id = new.sender_id)
  ) then
    raise exception 'Cannot send a request to a blocked user';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_connection_request_check_block
  before insert on connection_requests
  for each row
  execute function prevent_blocked_requests();
