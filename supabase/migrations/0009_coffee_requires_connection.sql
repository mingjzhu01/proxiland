-- Coffee requests may only be sent between users who are already connected.
create function prevent_coffee_without_connection()
returns trigger as $$
declare
  a uuid;
  b uuid;
begin
  if new.type = 'coffee' then
    a := least(new.sender_id, new.receiver_id);
    b := greatest(new.sender_id, new.receiver_id);
    if not exists (select 1 from connections where user_a = a and user_b = b) then
      raise exception 'Must be connected before requesting coffee';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_connection_request_check_coffee
  before insert on connection_requests
  for each row
  execute function prevent_coffee_without_connection();
