-- unread_message_count() (migration 0030) only returns a single total, used for the tab
-- badge. The Connections list has no way to show WHICH thread has unread messages — same
-- underlying logic, just grouped by connection instead of summed.
create function unread_counts_by_connection()
returns table (connection_id uuid, unread_count int)
language sql
security definer
set search_path = public
as $$
  select m.connection_id, count(*)::int as unread_count
  from messages m
  join connections c on c.id = m.connection_id
  where (c.user_a = auth.uid() or c.user_b = auth.uid())
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(
      (select last_read_at from message_reads mr where mr.connection_id = m.connection_id and mr.user_id = auth.uid()),
      'epoch'::timestamptz
    )
  group by m.connection_id;
$$;

revoke execute on function unread_counts_by_connection() from public;
grant execute on function unread_counts_by_connection() to authenticated;
