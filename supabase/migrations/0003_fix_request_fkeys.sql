-- connection_requests.sender_id/receiver_id and connections.user_a/user_b were
-- referencing auth.users(id). That's correct data-wise (profiles.id IS
-- auth.users.id), but PostgREST's embedded-resource joins (used to fetch a
-- request's sender/receiver profile in one query) require the foreign key to
-- point directly at the table being embedded — profiles, not auth.users.
-- Without this, the app's requests/connections screens silently fail.

alter table connection_requests
  drop constraint connection_requests_sender_id_fkey,
  drop constraint connection_requests_receiver_id_fkey;

alter table connection_requests
  add constraint connection_requests_sender_id_fkey
    foreign key (sender_id) references profiles (id) on delete cascade,
  add constraint connection_requests_receiver_id_fkey
    foreign key (receiver_id) references profiles (id) on delete cascade;

alter table connections
  drop constraint connections_user_a_fkey,
  drop constraint connections_user_b_fkey;

alter table connections
  add constraint connections_user_a_fkey
    foreign key (user_a) references profiles (id) on delete cascade,
  add constraint connections_user_b_fkey
    foreign key (user_b) references profiles (id) on delete cascade;
