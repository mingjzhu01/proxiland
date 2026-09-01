-- Rate limit for the "Draft with AI" bio feature (draft-bio edge function): max 5 calls per
-- user per hour. No select/insert policy for `authenticated` — only ever written/read by
-- draft-bio via the service role, same "locked down by default" pattern as every other
-- table in this project. Nothing here is exposed to the client directly.
create table ai_bio_requests (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_bio_requests_user_idx on ai_bio_requests (user_id, created_at);

alter table ai_bio_requests enable row level security;
