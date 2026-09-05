# Proxiland v2 — Implementation Plan (Phase 0 deliverable)

*Branch: `v2/event-matching-mvp`. Written before any v2 code, per the spec's own section 22 and the explicit instruction to plan before building. Decisions already confirmed with the founder: build in parallel with the pending v1.0 App Store review; same production Supabase project, additive migrations only; Nearby flips to full-identity-by-default with anonymity as an opt-in; build the full 8-phase MVP with a check-in after each phase.*

---

## 1. Architecture assessment — what already exists that maps to this spec

The single biggest finding: **the `scopes` table already has a `venue` kind that is structurally an event**, built as "schema-and-stub only" back in migration 0016 and never activated. This isn't a coincidence — the v2 spec itself says "reuse the existing scopes model and venue-scope functionality where possible" (§11.1). Concretely:

| Spec concept | Existing equivalent | Gap |
|---|---|---|
| `events` table | `scopes` where `kind = 'venue'` | Missing: organizer, description, lat/lng + geofence radius for venue kind (currently only `geo` kind has `center`/`radius_m`), `identity_mode`, `join_mode`, `matching_mode`, `overlap_display_mode`, `qr_join_token_hash`, `status` |
| `event_memberships` | `scope_members` (scope_id, user_id, joined_at) | Missing: `join_method`, `status`, `left_at` |
| Population query | `population_for_scope()` already dispatches on `kind`; for `venue` it returns the raw `scope_members` list (no geo math) | None — this already does exactly what event population needs |
| Geofence-based discovery | `geo_scope_population()` exists for `kind='geo'` but venue scopes have no coordinates today | Need to add lat/lng + radius to venue scopes and a new `detect_nearby_events()` that checks venue scopes the same way |
| `event_intents` | Nothing existing — closest analogue is `profile_attributes.looking_for`/`can_offer`, which are permanent-profile fields | New table needed; must NOT reuse the permanent fields (spec explicitly says event intent must not overwrite the core profile) |
| Match recommendations, scores | Nothing existing — closest analogue is `overlap_cache` (phrase-overlap), but that's a single cached sentence with a 0-3 strength score, not a ranked list with categories | New tables needed (`match_runs`, `match_recommendations`); the *pattern* (deterministic feature calc → AI call via `askModel()` → cached, validated result) is exactly how `phrase-overlap` and `polish-line` already work, so the engineering pattern is proven, just the schema is new |
| Connection request + accept | `reveal_requests` (asymmetric, immediate identity reveal to target) or `connection_requests` (symmetric, accept/decline) | For event mode specifically, `connection_requests` is the closer fit — both identities are already visible, mutual acceptance just needs to create a `connections` row, which is exactly what `connection_requests`'s existing `handle_request_accepted()` trigger already does for `type='connect'`. `reveal_requests` is the wrong fit for event mode (it's built around asymmetric identity disclosure, which events don't need since both sides are already visible) |
| Nearby identity toggle | Doesn't exist — Nearby is unconditionally anonymous today | New: a `nearby_identity_visibility` column + a real rework of `individual_cards_for_scope`/`AnonCard` rendering (scoped to Phase 6, not now) |
| `askModel()` abstraction | Exists, Anthropic-only, already used by 5 edge functions | Directly reusable for match ranking |
| Blocking, reporting, account deletion | All exist and already cascade correctly via FK | Event tables will follow the same cascade pattern; no changes needed to those systems themselves |

**Conflicts identified:**
1. Venue scopes currently have no way to detect proximity at all (no coordinates) — geofence-based event discovery needs this added.
2. `reveal_requests`' RLS and functions are built around asymmetric disclosure; reusing `connection_requests` for event connections instead avoids fighting that model, but means event connection requests need a `context_type`/`event_id` extension to the existing table rather than a new one, exactly as the spec suggests (§11.7).
3. The spec's suggested `events.qr_join_token_hash` — need to decide the actual token scheme (see Phase 1 below).

## 2. Migration plan (additive only, in order)

All new tables/columns, nothing destructive. Each is its own migration file, matching this repo's existing convention (one focused change per file, full context in a header comment).

1. **`scopes` additions**: `organizer_name text`, `description text`, `identity_mode text`, `join_mode text`, `matching_mode text`, `overlap_display_mode text`, `qr_join_token_hash text`, `status text default 'active'`. For venue-kind geofencing, reuse the existing `center`/`radius_m` columns (currently comment-labeled "geo only" — just relax that to also apply to venue-kind rows used for geofence detection) rather than adding duplicate columns.
2. **`scope_members` additions**: `join_method text`, `status text default 'active'`, `left_at timestamptz`.
3. **`event_intents`** (new table): id, scope_id (references scopes), user_id, ask_text, offer_text, desired_connection_text, ask_tags/offer_tags/desired_connection_tags (text[]), active boolean, created_at, updated_at. RLS: owner manages their own row for a scope they're a member of.
4. **`match_runs`** + **`match_recommendations`** (new tables, per spec §11.5-11.6). RLS: recommendations visible only to `source_user_id`.
5. **`connection_requests` additions**: `context_type text default 'nearby'`, `event_id uuid references scopes(id)`, `source_identity_was_hidden boolean`, `target_identity_was_hidden boolean`.
6. **`nearby_identity_visibility`** column on `profile_attributes` (or `profiles` — needs one more look at which table is the better fit; leaning `profile_attributes` since it's already the "how you're shown" table) — **deferred to Phase 6, not created now**, so it doesn't sit unused for 5 phases.

## 3. RLS / privacy plan

- Events: authenticated users can read *active* events (needed for discovery); `qr_join_token_hash` never returned to clients directly — join-by-QR goes through a security-definer function (`get_event_by_qr_token`) that validates the raw token against the hash server-side and returns only the event id, same pattern as this repo already uses for anything sensitive (e.g. `suppression_for_user` being unreachable except through a wrapper function).
- `event_intents`: owner-only, same shape as every other "manage your own row" policy in this repo (`profile_attributes`, `visibility_sessions`, etc.).
- `match_recommendations`: select policy scoped to `source_user_id = auth.uid()` only — a user never sees recommendations generated for someone else, and match reasons are validated (§10.4) to never surface a field the target has hidden.
- Blocks/reports override event recommendations at the eligibility-filtering step (deterministic, before AI ever sees a candidate) — enforced in `generate_event_matches()`, not left to the AI.
- Expired event participation stops exposing intent — enforced by checking `scope.status`/`ends_at` in every read path, not by deleting the row (so post-event outcome measurement and history still work).

## 4. Matching pipeline design

Following §10 exactly, as a Supabase edge function `generate-event-matches` (new), mirroring the existing `phrase-overlap` pattern closely since it's the same shape (deterministic prep → `askModel()` → validate → cache):

1. **Eligibility filter** (SQL, deterministic): exclude self, blocked (either direction), reported/suspended, non-members, expired members, insufficient profile/intent data, existing connections. This is a new SQL function, `eligible_event_candidates(event_id, user_id)`.
2. **Feature scores** (SQL, deterministic): intent-complement, reciprocal-relevance, professional-overlap, context/trust — computed per candidate, stored on `match_recommendations` even before AI runs.
3. **AI ranking** (edge function, `askModel()`): batches eligible candidates (capped — need a sane batch size given prompt length, likely 15-25 candidates per call, more requires pagination) with structured JSON output validated against the `AIMatchAssessment` shape before anything is stored, same validation discipline already used for `phrase-overlap`'s and `draft-bio`'s JSON parsing (extract `{...}` substring, reject anything that doesn't parse).
4. **Final ranking**: the weighted formula from §10.5, stored as a config row (not hardcoded) so it's tunable without a redeploy — reusing the `app_config` table pattern already established for `k_min`.
5. **Fallback**: if the AI call fails/times out (reusing `askModel()`'s existing `timeoutMs` option), fall back to pure deterministic feature-score ranking, flagged internally via `match_runs.status`. Never surfaces a raw error to the user — same silent-fallback discipline already used throughout `polish-line`/`expand-bio`.
6. **Caching**: `match_runs` records when a user's recommendations were last generated; refresh only on intent completion/material update or manual pull-to-refresh (rate-limited), not on every screen open — same discipline as `overlap_cache`.

## 5. Implementation sequence

Following the spec's own 8 phases (§20) as-is — it's already well-ordered (foundation → integration → intent → matching → connection flow → identity toggle → measurement → tests), and importantly puts the risky Nearby-identity-default-flip *last* among the functional phases, which correctly isolates it from the new, purely-additive event work. I'll check in with you after each phase with changed files, schema changes, and any risk before continuing — per both the spec and your instruction.

## 6. Testing plan

- SQL: exercise `eligible_event_candidates` directly against seeded event+attendee data (reusing the existing demo-mode seed script pattern — likely a second seed script, `seed-demo-event.mjs`, spinning up a demo event with demo NPCs as attendees, distinct from the existing Nearby demo mode).
- RLS: verify a non-member cannot read `event_intents` or `match_recommendations` for others; verify blocked users never appear as candidates.
- AI-output validation: feed the edge function malformed/partial JSON and confirm it falls back cleanly (same manual test style already used to debug `draft-bio`/`polish-line` this session).
- Geofence/QR: test both join paths, including the "multiple overlapping events → forced to QR" case.
- End-to-end: two demo accounts join the same demo event, complete intent, get matched, connect, chat — mirroring exactly how the existing Nearby demo mode was validated.
- Before any TestFlight build: confirm existing v1 flows (sign-up, Nearby, connections, chat) are fully unaffected on the v2 branch.

## 7. Risks / open items requiring confirmation

1. **QR token scheme** — the spec wants "a secure event join token or deep link, not raw privileged credentials." Plan: a random opaque token generated at event-creation time, only its SHA-256 hash stored in `qr_join_token_hash`, the raw token embedded in a deep link (`proxiland://event-join/<token>`) baked into the generated QR image. This mirrors how this repo already handles the LinkedIn OAuth flow's state token. Flagging for confirmation rather than assuming.
2. **`nearby_identity_visibility` table placement** (`profiles` vs `profile_attributes`) — deferred to Phase 6 planning specifically, not blocking now.
3. **AI batch size for match ranking** — no hard answer yet; will tune based on real prompt-length testing in Phase 4, same way `STYLE_ANGLES`/verification thresholds were tuned empirically earlier this session.
4. **Internal event-creation tool** (§16) — simplest path is a service-role seed/admin script (matching `seed-demo-data.mjs`'s existing pattern) rather than any UI, since no organizer portal is in scope. Confirm this is fine for now.

---

Ready to start Phase 1 (event foundation: scopes/venue additions, event_intents table, RLS, internal event-creation script, QR token generation) on your go-ahead.
