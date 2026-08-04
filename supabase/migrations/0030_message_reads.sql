-- Backs an unread-message count on the Connections tab. One row per (connection, user) —
-- last_read_at is bumped whenever that user opens that chat thread.
create table message_reads (
  connection_id uuid not null references connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (connection_id, user_id)
);

alter table message_reads enable row level security;

create policy "users manage their own read receipts"
  on message_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- unread_message_count: total messages across all of the caller's connections sent by the
-- other participant, after the caller's last_read_at for that connection (or all of them,
-- if they've never opened it).
create function unread_message_count()
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from messages m
  join connections c on c.id = m.connection_id
  where (c.user_a = auth.uid() or c.user_b = auth.uid())
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(
      (select last_read_at from message_reads mr where mr.connection_id = m.connection_id and mr.user_id = auth.uid()),
      'epoch'::timestamptz
    );
$$;

revoke execute on function unread_message_count() from public;
grant execute on function unread_message_count() to authenticated;

create function mark_connection_read(p_connection_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into message_reads (connection_id, user_id, last_read_at)
  values (p_connection_id, auth.uid(), now())
  on conflict (connection_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;

revoke execute on function mark_connection_read(uuid) from public;
grant execute on function mark_connection_read(uuid) to authenticated;

alter publication supabase_realtime add table message_reads;
