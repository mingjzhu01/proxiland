-- Backs the "Expand" interaction on feed cards: a longer, AI-written paragraph version of
-- a person's line, shown alongside the short headline. Same anonymity discipline as
-- everything else in section 8 — built ONLY from facts that already survived this specific
-- scope's k-anonymity suppression (the same `line` individual_cards_for_scope returns) plus
-- looking_for/can_offer (never part of the suppression drop sequence, always safe), never
-- from the person's raw unsuppressed profile. Cached per (person, scope) since the input is
-- identical for every viewer in that scope — same "never generate the same sentence twice"
-- cost-control principle as overlap_cache.
create table card_bio_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  scope_id uuid not null references scopes (id) on delete cascade,
  source_fingerprint text not null,
  bio text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scope_id)
);

alter table card_bio_cache enable row level security;

-- No select/insert policy for `authenticated` — this is only ever read/written by the
-- expand-bio edge function via the service role, after it has independently recomputed the
-- suppressed line itself (never trusting a client-supplied line, to avoid a viewer poisoning
-- the shared per-scope cache with a fabricated version of someone else's card).
