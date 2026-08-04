# Proxiland version 4: anonymized discovery and mutual reveal

Save as `docs/spec-v4.md`. Read fully before writing code. Supersedes all earlier specs
in this repository.

Terms are spelled out on first use throughout. Please keep it that way in code comments
and commit messages.

---

## 1. Why the product changed

The app began as a proximity networking app where strangers asked each other for coffee.
That model was abandoned. The reasons constrain what gets built now, so do not re-open them.

**The meeting-based model has a known failure pattern.** Shapr raised roughly $16.5 million,
reached over a million users, ran human moderators on every profile, and shut down in 2023.
Bumble Bizz launched on top of a 20-million-user base and was phased out entirely. Both died
of retention, not of getting users. Professional networking intent is occasional, the value
flows one direction (the senior person gains nothing from a match), and open free networking
apps fill up with recruiters and salespeople, which drives out the people who made the pool
worth joining in the first place.

**Paid and expert-network models were evaluated and rejected.** Once you charge for someone's
time, being physically nearby stops mattering, because you would just take the video call.
Small token payments are worse than free: they turn a favour into an underpaid job. Closed.

**What this version does instead.** Remove the obligation to meet. Show anonymous one-line
summaries of professionals nearby. Optionally ask to connect, which reveals *you* to them
first. Meeting stays possible but the product never pushes it.

---

## 2. What user testing showed (19 people, July 2026)

A static mockup was sent one-to-one to 19 people; 18 replied. This is directional only, since
they reacted to a picture of something that does not exist. Three findings are strong enough
to build around.

**Finding 1: it reads as a dating app.** Seven of eighteen independently said dating, hookup,
or speed dating. One compared it to WeChat's "people nearby" feature, which in that market
means hookups. The cause is design language: distance in metres, anonymous cards, a mutual
reveal, and a line saying you have been in the same café six times. This is a build problem,
not a wording problem. See section 7.

**Finding 2: almost every "yes" came with an active reason.** Looking for a cofounder at a
tech week, raising money, at a conference, new to a country, new in a role, job hunting.
Exactly one person out of eighteen described browsing purely out of curiosity.

The founder believes curiosity is real and that people cannot judge a product that does not
exist yet. That is a fair position, and the product should not be repositioned on survey
answers alone. **But the build must be instrumented so real usage settles it.** See section 10.

**Finding 3: three people raised bad actors without being asked.** Scammers, insurance and
property salespeople, and "the people who need an app to network are transactional or
socially awkward." Two others asked how profiles would be verified. Their own suggested fixes
were a high bar to entry, or tying the app to a specific community.

**Other things worth carrying forward:**
- The reveal mechanic tested well. Several people liked controlling their own exposure. Protect it.
- Impressiveness does not pull; relevance does. One respondent: a Stanford doctorate is
  impressive but irrelevant to my life, so why would I approach them. Another asked for
  profiles to say what a person wants and what they can offer. So the shared-connection line
  belongs **in the feed**, not hidden behind a request.
- The one senior respondent said senior professionals already have their own ways to network.
  Assume the supply side is the hard side.
- One respondent argued Singapore is too small, that one step out everyone already knows each
  other. That is both a demand concern and a restatement of the identification risk in
  section 8.

---

## 3. Current state of the code

**Technology**
- React Native with Expo, software development kit version 54
- Supabase for the whole backend: Postgres with the PostGIS extension for location queries,
  plus authentication, storage, server-side functions, and realtime updates
- Expo Application Services for building, submitting, and pushing updates
- Resend for outgoing email
- Private GitHub repository `mingjzhu01/proxiland`

**Shipped and being kept (build #8, live on TestFlight)**
- Opt-in visibility windows, one to twenty-four hours, chosen by the user with a scroll picker.
  No always-on location tracking.
- Reciprocity gating: you only see full profiles of nearby people while you are visible
  yourself. Already enforced on the server inside the location query, not just hidden in the
  interface. Keep it that way.
- Connect and Coffee are separate. Connect creates a lasting connection. Coffee requires an
  existing connection and sends a real calendar invitation by email once accepted.
- Realtime in-app chat, limited to connections.
- Block, report, unblock. Blocking severs connections and pending requests through database
  triggers.
- Structured education fields, displayed like "HBS'22, Wesleyan'15".
- LinkedIn sign-in verification. This proves the person owns a real, unique LinkedIn account.
  It does **not** prove their claims are true and does **not** import their work history,
  because LinkedIn's public interface only returns name, email address, and profile picture.
- Swipe to delete on request and coffee history, which hides the row for that one user rather
  than deleting it for both, since a request belongs to two people.
- Email verification reminder banner in the sign-up flow.

**Still open**
- Bug: the chat message box disappears when the keyboard opens and the user types. Two
  attempts failed, one adjusting the list layout and one adjusting the keyboard offset.
- No in-app account deletion. Apple requires this before a full App Store release.

**This version is additive. Do not drop or rewrite version 1 tables.**

---

## 4. The single most important design decision: scope

Two futures are plausible for this product. One is everyday browsing near where you are. The
other is short bursts at conferences, events, and after moving somewhere new. The user
testing points at the second. The founder's instinct points at the first.

**Do not choose. Build one system that serves both.**

A **scope** answers "who counts as nearby right now." It has two kinds:

- `geo` — a radius around the user's current location. Default, and ships in this phase.
- `venue` — an event, conference, building, or community that people join with a code.
  Schema and stub only in this phase.

The feed queries a scope. Anonymization, the identification check, the reveal flow, and chat
are identical for both. Adding venues later should mean adding a join-code screen and a
membership table, not a rewrite.

---

## 5. The mechanic

### Browsing
Each nearby person shows as one anonymous line, roughly six to ten words, plus a rough
location hint. No name, no photo, no employer that identifies one person.

**Requirement: browsing must be worth doing even if nobody ever asks to connect.** If the app
is only good when requests happen, this is the old marketplace with extra steps.

### Shared connections in the feed
Where the viewer and the viewed genuinely share something (same school, same former employer,
matching wants and offers, same industry), append it to the line in the feed. This was the
highest-value change from testing. `AI engineer, inference infrastructure, also Wesleyan`
beats `AI engineer, inference infrastructure, Stanford doctorate, 5,000+ citations`.

### The reveal flow
1. Person A taps **Ask to connect** on a card.
2. **A's real identity is shown to B immediately**, along with one sentence naming what they
   share.
3. B reveals back, which creates a mutual connection. Or B does nothing, and the request
   quietly expires.
4. A never learns whether B declined or simply ignored it. There is no visible rejection.
5. On a mutual reveal, both see full profiles and the existing chat opens. **No meeting
   prompt, ever.**

### Rules that do not bend
- Requests expire silently after 48 hours.
- Maximum 3 outstanding requests per person per day, enforced on the server.
- The reciprocity gate is absolute. No browsing while invisible. This is the answer to every
  surveillance objection and the only thing that turns viewers into supply. Never weaken it
  for growth.
- Shared-connection lines describe **what two people have in common, never a business
  opportunity.** Nothing that reads like "investor meets founder."

---

## 6. The artificial intelligence layer

Three jobs. Only two of them use a language model.

### Job 1: understanding (uses a language model)
Take whatever the person gives you, a pasted resume or a few typed sentences, and fill in a
structured set of fields. This is the part no ordinary code can do. A model can read "I left
Tesla two years ago to start something in carbon capture, we just closed our seed" and produce
role: founder, stage: seed, industry: climate, former employer: Tesla.

Runs once at sign-up, and again only when the person edits their profile.

### Job 2: writing the line (ordinary code, then optional polish)

**Step 2a, assembly. No model.** Take the approved fields and build the sentence from a fixed
template. This exists so that:
- the identification check knows exactly which facts are in the line and can remove them one
  at a time
- the safety behaviour does not change when you switch model providers
- the same person always renders the same way

**Step 2b, polish. Optional, uses a language model, tightly fenced.** After the fields are
locked, a model may rewrite the sentence for readability only. Hard rules:
- it may use **only** the approved facts passed to it, and may not add, infer, or embellish
  anything
- output must be a single line, 12 words or fewer
- after generation, verify the output mentions no fact outside the approved set; if the
  check fails, silently fall back to the plain assembled version
- store both the assembled version and the polished version, so you can always fall back
- put this behind an on/off setting, default on, so it can be disabled instantly if it
  misbehaves

### Job 3: shared connections (mostly ordinary code, model for phrasing only)

**Find the match in the database, not with a model.** Same school is a text comparison. Same
former employer is a text comparison. The database can do this instantly and for free.

**Use the model only to phrase the sentence,** and only when a match already exists.

**Cache the result against the pair of people.** Never regenerate the same sentence twice.
This is the single biggest cost control in the app: without it you pay per pair, per screen
load, forever.

### One place to call models
Create a single file, for example `lib/ai.ts`, exposing one function:

```ts
askModel(prompt: string, opts?: { maxTokens?: number }): Promise<string>
```

Nothing else in the codebase talks to a model provider directly. The provider is chosen by a
setting (`AI_PROVIDER`), so switching later is a change inside that one file plus a
configuration value.

**Start with Claude Haiku 4.5.** It is the cheapest current Claude model, capable enough to
read a resume, and roughly a quarter of a US cent per sign-up.

Keep a folder `test/profiles/` with about twenty example inputs and the fields you expect from
each. Any model change or upgrade is then a five-minute check rather than a guess.

---

## 7. Making it not look like a dating app

Seven of eighteen testers read the mockup as one. These are requirements.

| Change | From | To |
|---|---|---|
| Distance | `40m away` | Rough band: `in this building`, `nearby` |
| Repeat visits | `six times this month` | `you've crossed paths before` — no counts |
| Main button | `Request reveal` | `Ask to connect` |
| Confirm button | `Reveal me first` | `Share my profile` |
| Feed title | `Around you` | `Who's working nearby` |
| Avatar | Silhouette of a head | Neutral shape or role symbol |

Dropping exact distance also reduces legal exposure under Singapore's Personal Data
Protection Act and makes people harder to identify. One change, three wins.

---

## 8. Keeping people unidentifiable

### The problem
A line specific enough to be interesting is often specific enough to name one person.
`Investor in artificial intelligence and consumer, ex investment banking, Wharton` is close to
one person in Singapore. `Investor in technology` is anonymous and dull. The product lives
between those, and in a small market that gap is narrow.

### The rule
Before showing a card, count how many people in the current scope match that combination of
facts. If fewer than the threshold match, drop facts one at a time until enough do:

1. former employer
2. school
3. company stage
4. years of experience
5. industry

Re-count after each drop. Stop as soon as it clears. If nothing clears, show a plain generic
line and **record that it happened**.

### Settings
- `K_MIN` — the threshold. **Set to 5.** Stored as a configuration value, changeable without
  touching code.
- Be honest in the code comments about what 5 means: it is a light filter, not a guarantee.
  Someone who knows the local scene may still guess correctly. Design so this number can be
  raised later without changes elsewhere.

### The number to watch
How often the app falls back to the generic line. A high rate means the market is too small
for this idea to work. That is a finding, not a bug. Make it visible.

Implement as a Postgres function so it can be tested on its own.

---

## 9. Signing up

**Target: under thirty seconds, and the person never leaves the app.**

Do not ask people to download or upload anything from LinkedIn. It takes them out of the app
and most will not come back.

### One screen, three parts

**Part 1, quick fields.** Tap to select, never type. Role, industry, seniority, school. These
guarantee you always have the structured data the identification check needs, even from
someone who skips everything else.

**Part 2, one open box.** Optional. Placeholder text: "Anything else? Paste your resume, or
just describe yourself." This is where the interesting detail comes from. The model in job 1
reads it.

Note: the iPhone keyboard already has a dictation button. That gives you voice input for free,
with no extra service, no microphone permission of your own, and no audio leaving the phone.
**Do not build a separate voice recorder or add a transcription service.** If usage later
shows people want a dedicated record button, revisit it then.

**Part 3, two short prompts.** "What are you looking for?" and "What can you offer?" Sixty
characters each, optional. These came directly from tester feedback and drive the
shared-connection matching.

### Then the confirmation screen
Show the person their own line, editable. Once they edit it, set `user_edited` to true and
never overwrite it automatically again.

This screen is not optional. People care a great deal about how they are described, and this
is what stops a wrong line reaching other people.

---

## 10. Instrumentation: the question this build exists to answer

Testing suggested every use was need-driven. The founder believes idle curiosity is real.
**Settle it with data, not opinion.**

On first launch, and roughly every fourteen days after, ask one question. One tap, skippable:

> What best describes you right now?
> · Job hunting or exploring · Raising money · New to this city or role
> · At an event or travelling · None of these, just curious

Store as `intent_state` on the user, and stamp it on every recorded session event.

**The number that decides the product's direction:**

> The share of app opens that come from people whose current answer is "none of these."

Also track, split by that answer: sessions per week, card expansions per session, connect
requests per session, acceptance rate, and how many people are still using it after 7 and
after 30 days.

Agreed in advance, before any data exists:
- **Above roughly 30% of sessions from no-reason users, and their 30-day retention holds** →
  curiosity is real. Build the everyday version, keep location-based scope as the default.
- **Below roughly 10%** → the product is event and transition driven. Ship venue scopes,
  build for bursts, stop chasing a daily habit.
- **In between** → keep both and let usage of each scope decide.

Do not move these numbers after seeing the data.

---

## 11. Security and privacy

**Build and test this before any screens.**

1. **Anonymity lives in the database, never in the app.** If the server sends full profiles
   and the app hides the names, anyone with basic tools can read every real name in the city.
   Feed queries must go through a database view or a security-definer function that returns
   only the rendered anonymous string. Postgres calls this Row Level Security, meaning the
   database itself decides, row by row, who may see what.
2. **Asymmetric visibility on requests.** The person being asked can read the requester's
   identity. The requester can never read the target's identity, nor any status beyond
   "pending." Separate policies, not conditions in the app code.
3. **Location history.** Thirty-day retention, deleted on a schedule, stored as rough venue
   bands rather than precise coordinates wherever possible. Section 7 already removes exact
   distance from the interface, so there is little reason to keep precise traces. State the
   policy in one sentence in the privacy policy.
4. **Rate limits on the server** for connect requests and feed queries.
5. **Verification is already shipped.** Surface the LinkedIn verified state on cards, since
   three testers raised fake profiles unprompted. Be accurate in the wording: it proves the
   account is real, not that the claims are true.
6. **Design for the most exposed user, not for yourself.** One bad story about surveillance
   ends the app.
7. Blocking must hide anonymous cards too, not only named profiles.

---

## 12. Data model

Additive. Do not modify version 1 tables.

```sql
create type role_category as enum ('founder','investor','operator','engineer','designer','researcher','student');
create type seniority_band as enum ('early','mid','senior','executive');
create type scope_kind as enum ('geo','venue');
create type reveal_state as enum ('pending','revealed','expired','withdrawn');

create table scopes (
  id uuid primary key default gen_random_uuid(),
  kind scope_kind not null,
  name text,
  join_code text unique,          -- venue only
  center geography(point),        -- geo only
  radius_m int,                   -- geo only
  starts_at timestamptz,          -- venue only
  ends_at timestamptz,            -- venue only
  created_at timestamptz not null default now()
);

create table scope_members (
  scope_id uuid not null references scopes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (scope_id, user_id)
);

create table profile_attributes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_category role_category not null,
  seniority_band seniority_band not null,
  industry text not null,
  stage text,
  school text,
  prior_employer text,
  tenure_band text,
  looking_for text,               -- max 60 chars, user written
  can_offer text,                 -- max 60 chars, user written
  line_assembled text,            -- built by template, always present
  line_polished text,             -- optional model output, may be null
  user_edited boolean not null default false,
  generated_at timestamptz not null default now(),
  source_hash text not null
);

create table reveal_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  scope_id uuid references scopes(id) on delete set null,
  state reveal_state not null default 'pending',
  connection_line text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  resolved_at timestamptz
);

-- cached shared-connection sentences, so no pair is ever generated twice
create table overlap_cache (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  overlap_type text not null,     -- school, employer, industry, wants_offers
  phrase text not null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b)
);

create table session_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,       -- session_open, card_expand, connect_request, connect_accept
  scope_id uuid references scopes(id) on delete set null,
  intent_state text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table colocation_events (
  id bigserial primary key,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  venue_hint text,
  observed_at timestamptz not null default now()
);
```

`source_hash` avoids re-running the model when nothing changed. `user_edited` protects a line
someone has corrected by hand. Storing both `line_assembled` and `line_polished` means you can
always fall back if the polish step misbehaves.

---

## 13. Server-side functions

### `parse-profile`
Runs at sign-up and when the profile changes. Input: the quick fields plus the open text box.
Output: JSON matching `profile_attributes`, nothing else, no explanation, no code fences.
Validate against the allowed values on the server and reject rather than guess. Never
overwrite a row where `user_edited` is true without asking the person.

### `assemble-line`
**No model.** A Postgres function or plain TypeScript that takes the fields plus the
identification-check result and returns the display string. Testable on its own.

### `polish-line`
Optional, model-based, fenced as described in section 6, job 2b. Verify the output against the
approved facts. On any failure, fall back silently to `line_assembled`.

### `find-overlap`
**No model.** Given two people, return the strongest genuine thing they share: same school,
same former employer, matching wants and offers, same industry, or having crossed paths.
Returns nothing if there is none.

### `phrase-overlap`
Model-based, only called when `find-overlap` returned something, and only when nothing is
cached for that pair. One sentence, 25 words or fewer. No commercial framing, no "you should
meet," no comparing seniority. Write the result to `overlap_cache`.

---

## 14. Build order

Do not skip ahead to screens.

1. `profile_attributes`, the allowed value lists, and `parse-profile`.
2. `assemble-line` plus the identification-check function, with tests covering the full
   fact-dropping sequence.
3. **Database access policies, plus a test suite that tries to read named data as an
   unauthorized user and asserts that it fails. This is the gate. Nothing else ships until it
   passes.**
4. `scopes` and `scope_members`, with location-based scope working and venue scope stubbed.
5. Aggregate view first: "14 people nearby: 6 founders, 3 investors." This works at low
   density where a sparse list looks dead.
6. Individual anonymous cards, with section 7's language changes applied from the start.
7. `find-overlap` and `phrase-overlap`, with caching, wired into the feed line.
8. `polish-line` behind its on/off setting.
9. The new sign-up flow from section 9, replacing the current one.
10. `reveal_requests` state machine, expiry job, rate limits.
11. Mutual reveal wired into the existing connection and chat system.
12. `session_events` and the one-question prompt from section 10. **Do not defer this. It is
    the reason the build exists.**

Then the carried-over items: the chat keyboard bug, and in-app account deletion for App Store
submission.

---

## 15. Not doing

- No payments, bidding, or priced time. Closed.
- No global search beyond your current scope.
- No Android until iOS retention is proven.
- No push notifications until browsing retains.
- No prompting or nudging toward meeting. Coffee stays available and unpromoted.
- No feed, posts, or content. This is not a social network.
- No LinkedIn scraping, ever. Only what the person gives you directly.
- No separate voice recorder or transcription service. The phone's dictation is enough.
- No repositioning based on survey answers alone. Section 10 decides.

---

## 16. Standing risks

1. **People may still be identifiable in a small market.** Most likely failure. Watch the
   generic-line fallback rate from day one.
2. **Curiosity may not be a real motive.** Section 10 answers this honestly, either way.
3. **The browser gains, the browsed gains nothing.** The reciprocity gate is the only defence.
4. **Bad actors.** Raised unprompted by three testers, and it is what killed Shapr despite
   full-time human moderation. Verification and, if needed, bounded communities are the levers.
5. **Cold start is worse for an everyday product than for a marketplace.** A near-empty list
   looks dead. Hence the aggregate view before individual cards.
6. **The dating-app misread.** Seven of eighteen. Section 7 is the fix; re-test after.
7. **Model costs, if caching is skipped.** Shared-connection sentences are per pair. Without
   `overlap_cache` the bill grows with the square of your user count.
