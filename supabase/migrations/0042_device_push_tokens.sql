-- Project Buzz: real push notifications. One row per (user, device) — a person can have the
-- app on more than one device, and each needs its own Expo push token. Re-registering the
-- same token (app reinstall, re-login) just updates updated_at rather than duplicating.
create table device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, push_token)
);

create index device_push_tokens_user_idx on device_push_tokens (user_id);

alter table device_push_tokens enable row level security;

-- Client only ever manages its own device's row. Reading other people's tokens is never
-- needed from the client — the send-push edge function reads across users via the
-- service-role key, bypassing RLS entirely, same pattern as every other admin-side function.
create policy "users manage their own push tokens"
  on device_push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
