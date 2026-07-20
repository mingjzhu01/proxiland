-- Previously, accepting EITHER a connect or coffee request created a
-- Connection row, making the two request types indistinguishable in
-- outcome. Now only accepting a "connect" request establishes a
-- Connection; "coffee" stays a lightweight, separate interaction.
create or replace function handle_request_accepted()
returns trigger as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' and new.type = 'connect' then
    insert into connections (user_a, user_b)
    values (
      least(new.sender_id, new.receiver_id),
      greatest(new.sender_id, new.receiver_id)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;
