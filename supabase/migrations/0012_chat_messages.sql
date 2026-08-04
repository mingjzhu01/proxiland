create table messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_connection_idx on messages (connection_id, created_at);

alter table messages enable row level security;

create policy "connection participants can read messages"
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "connection participants can send messages"
  on messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

alter publication supabase_realtime add table messages;
