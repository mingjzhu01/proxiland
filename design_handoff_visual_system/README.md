# Handoff: Proxiland visual system — "Warm Ledger"

## Overview

A full visual redesign of the Proxiland React Native / Expo app (`mingjzhu01/proxiland`). The app is functional but was never design-passed: generic `#111` black pills, `#eee` hairlines, and an unrelated `#3b5bdb` blue doing all the "AI reasoning" work at 12–13px. The brand (`#4A3B31` brown / `#F5EFE6` cream) only appeared on the splash screen.

This handoff defines one coherent system, **Warm Ledger**, and applies it to 13 screens across both product modes:

1. **Nearby** — anonymized "who's working nearby" feed
2. **Events** — QR-joinable in-person events with AI-matched connections

Three structural problems are fixed, not just recolored:

- **Anonymous cards are genuinely redacted.** Today an "anonymous" card shows a generic person glyph and a grey pill — it doesn't communicate concealment. Now: a diagonally-striped name bar, a blurred portrait, and a `HIDDEN` label.
- **Match rationale is a pull-quote.** The "why you two" AI sentence was 13px blue body text (and 12px italic blue on event cards). It is now 18–20px Newsreader under a small brass label — it reads as the reason you'd cross the room.
- **The event screen has real section separation.** `Top matches` / `Shared overlap` / `See all attendees` were three 16px bold labels in one scroll with no visual boundary. They are now a segmented control with live counts, on a warmer ground than Nearby.

## About the design files

The files in this bundle are **design references written in HTML** — prototypes showing intended look, spacing and hierarchy. They are **not production code to copy**.

The target codebase is **React Native + Expo Router with `StyleSheet.create`** (see "Target codebase" below). The task is to recreate these designs there using the app's existing patterns — `View` / `Text` / `Pressable` / `FlatList`, `StyleSheet` objects, `expo-router` navigation — not to introduce web CSS, DOM elements, or a new styling library.

The HTML uses inline styles and CSS features (`repeating-linear-gradient`, `filter: blur()`, `backdrop-filter`) purely to visualise the design in a browser. Their React Native equivalents are noted where relevant.

## Fidelity

**High-fidelity.** Every color, type size, radius and spacing value below is final and exact. Recreate pixel-for-pixel. The one deliberate placeholder: user avatars are lettered circles (`#E9DFCF` ground, Newsreader initial) — real `photo_url` images replace them at the same size and radius.

## Target codebase

| | |
| --- | --- |
| Repo | `mingjzhu01/proxiland` |
| Branch for Nearby / Profile / Chat / Requests / Schedule / Connections | `main` |
| Branch for the event flow | `v2/event-matching-mvp` |
| Stack | Expo (React Native), `expo-router` file routes, Supabase, `@expo/vector-icons` (Ionicons), `expo-camera` |

The event screens (`app/event/[id]/*`, `app/event-join/[token].tsx`, `app/scan-event.tsx`, `components/EventAttendeeCard.tsx`, `components/IntentOptionPicker.tsx`) exist **only** on `v2/event-matching-mvp`. Everything else is on `main`.

**No data-layer or API changes are required.** Every value shown is already available from the existing API modules (`lib/api/feed.ts`, `reveal.ts`, `events.ts`, `requests.ts`, `connections.ts`, `messages.ts`, `visibility.ts`, `profile.ts`, `onboarding.ts`). This is a presentation-layer change. Where a design shows something the API doesn't return today, it is called out explicitly under that screen as **[NEW DATA]**.

---

## Design tokens

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `paper` | `#F7F3EC` | Screen background, all standard screens |
| `paperEvent` | `#FBF7F0` | Screen background inside an event (the warm shift) |
| `surface` | `#FFFFFF` | Cards |
| `surfaceSunken` | `#FCFAF6` | The "why you two" panel inside a card; inset info blocks |
| `brand` | `#4A3B31` | Splash ground, event header ground, visibility card, active tab icon/label |
| `ink` | `#241C16` | Primary text, primary buttons, selected chips |
| `inkOn` | `#F7F3EC` | Text on `ink` and `brand` |
| `textSecondary` | `#6B5F52` | Card subtitles (role · company) |
| `textTertiary` | `#5E5449` | Body support, helper text, inactive segment labels |
| `textMuted` | `#6E6357` | Small caps labels, timestamps, disabled button text, inactive tab labels |
| `rule` | `#E4DACB` | Card borders, screen dividers, tab-bar top border |
| `ruleInner` | `#EFE7DA` | Dividers **inside** a card |
| `brass` | `#8A6A2F` | All AI-rationale labels, badge dots, notification badges |
| `brassOnDark` | `#E8C98A` | Same role, on `brand` ground |
| `brassChipBg` | `#F1E7D4` | Role chips, "your ask" chips, rank badges |
| `brassChipText` | `#7A5C26` | Text on `brassChipBg` |
| `neutralChipBg` | `#F2EDE4` | Secondary chips (industry, distance, "their offer") |
| `live` | `#3F6B4F` | Visible/live dot, "Connected" state |
| `liveChipBg` | `#EDF2EE` | Ground for `live` text and badges |
| `liveChipText` | `#31563E` | Text on `liveChipBg` |
| `avatarGround` | `#E9DFCF` | Lettered avatar circles |
| `avatarLetter` | `#4A3B31` | The letter inside them |
| `redactBar` | `repeating-linear-gradient(115deg, #241C16 0 6px, #3a2f26 6px 12px)` | Redacted name bar |
| `redactBarSub` | `#DED3C2` | Redacted secondary line |
| `dashedBorder` | `#CFC2AE` | "Add one more" dashed chips, unchecked checkboxes |

**Removed from the palette entirely:** `#3b5bdb` (the old AI blue), `#111` (generic black — use `ink`), `#a05a2c` (old coffee/warning orange — use `brass`), `#0A66C2` (LinkedIn blue — verification now uses `live`), `#2ecc71` (use `live`).

Contrast: every text/ground pair in the system clears **4.5:1**. Do not lighten `textMuted`, `textTertiary` or any label color — they sit right at the boundary and were already corrected once.

### Typography

Three families, each with one job.

| Role | Family | Notes |
| --- | --- | --- |
| Wordmark | **Yeseva One** | Display only — splash, app store, marketing. Never below ~18px. Load via `expo-font` / `@expo-google-fonts/yeseva-one`. |
| Screen headlines + match rationale | **Newsreader** (400) | `@expo-google-fonts/newsreader`. Also used for avatar initials and large numerals. |
| Everything else | System sans | RN default (`-apple-system` / Roboto). Never below 11px. |
| Small-caps labels | System **monospace** | `Menlo` / `monospace`, uppercase, letter-spacing as noted. |

| Style | Spec |
| --- | --- |
| Wordmark (splash) | Yeseva One 42 / lh 1.08, `inkOn` |
| Tagline (splash) | System sans 14 / lh 1.5, letter-spacing 0.02em, sentence case, `rgba(247,243,236,.78)`. Copy: **"Bringing people around you closer"** |
| Screen headline | Newsreader 30–31 / lh 1.12–1.14, letter-spacing −0.01em, `ink` |
| Event title (in header) | Newsreader 29 / lh 1.14, `inkOn` |
| Match rationale (card) | Newsreader 19–20 / lh 1.40–1.42, `ink` |
| Match rationale (chat banner) | Newsreader 17 / lh 1.42, `ink` |
| Card name | 17 / weight 600 / letter-spacing −0.01em, `ink` |
| Card subtitle | 13.5, `textSecondary` |
| Card tertiary line | 12.5, `textMuted` |
| Anon descriptive line | 16.5 / weight 500 / lh 1.4, `ink` |
| Section label (mono) | 10 / uppercase / letter-spacing 0.16–0.18em |
| Chip | 11 / weight 600 |
| Primary button | 14.5–15.5 / weight 600 |
| Body | 13–15 / lh 1.45–1.55 |
| Helper | 12–12.5 / lh 1.5 |
| Tab label | 9.5 / weight 600 |

### Spacing, radius, elevation

- **Screen gutter: 20px** (up from the current 12–16px). All cards are `marginHorizontal: 20`.
- Card padding 16–17. Vertical rhythm inside a card: 13 / 14 / 15.
- Section label → content: 8–10. Between cards: 12–14. Between sections: 22–26.
- Radius: cards **16**, buttons/inputs **11–13**, chips and pills **999** (full), segmented control **11** outer / **9** inner, avatars full, icon buttons **10**, sheets **22** top corners.
- Elevation: almost none. The only shadow is the active segment of the segmented control: `0 1px 3px rgba(36,28,22,.10)`. Everything else separates with `rule` borders.
- Hairlines are **1px** `rule` (screen level) or `ruleInner` (inside a card).
- Minimum hit target 44×44 — icon buttons are 34×34 visually with hit slop to 44.

### Recurring components

**Card** — `surface`, 1px `rule`, radius 16, padding 16–17, gutter 20.

**Section label** — mono 10, uppercase, letter-spacing 0.16em. `brass` when it labels AI output or the current/primary group; `textMuted` when it labels a neutral group. Example: `ANONYMOUS · 5`, `WHY YOU TWO`, `SHOWING FULL IDENTITY · 2`.

**"Why you two" block** — the system's signature. Mono 10 `brass` uppercase label, 8px gap, then Newsreader 19–20 `ink`. Inside a feed card it sits in a `surfaceSunken` panel with a `ruleInner` top border and no radius (it spans the card's full width, card `overflow: hidden` clips it). On a profile-style card it is a plain block above a `ruleInner` divider. **Never** a colored box with small type.

**Primary button** — `ink` ground, `inkOn` text, radius 11–13, `paddingVertical` 12–15, full width.
**Secondary button** — transparent, 1px `rule`, `ink` or `textTertiary` text.
**Disabled / resolved state** — 1px `rule` border, `textMuted` text, no fill. Used for "Asked · waiting to hear back" and "Requested".

**Chip** — radius 999, `padding: 4px 8px` (metadata) or `8px 13px` (interactive). Selected interactive chip = `ink` ground + `inkOn` text + a close glyph at `rgba(247,243,236,.7)`. "Add" chip = 1px **dashed** `dashedBorder`, `textTertiary`, with a `+` glyph.

**Segmented control** — `#EFE7DA` container, radius 11, padding 3. Active segment `surface`, radius 9, `ink` 12.5/600, the one shadow. Inactive `textTertiary`. Each label carries its count as a trailing span — `brass` on the active segment, `textMuted` on inactive.

**Tab bar** — `rgba(247,243,236,.92)` + blur, 1px `rule` top border, `paddingTop: 9`, `paddingBottom: 26` (safe area), 5 items. Active `brand` icon + label; inactive `textMuted`. Labels renamed: `Nearby · Requests · Schedule · People · You` (was `Connections` / `Profile`). Badge: `brass` ground, white 10/700, radius 9, min 17×17, offset `top: -2, left: 50% + 9`.

**Lettered avatar** — `avatarGround` circle, Newsreader initial in `avatarLetter`. Sizes: 72 (own profile), 52 (feed/match card), 50 (message row), 46 (attendee row), 44 (anon), 40 (compact row), 36 (chat header).

**Redacted identity** (the anon-card treatment):
- Portrait: 44×44 circle, `#EFE7DA` ground, 1px `rule`, containing two blurred radial blobs (`#B9A88F` at 50%/34%, `#8F7C64` at 50%/96%, `blur(7px)`, inset −8). *RN: an absolutely-positioned `View` pair inside `overflow: hidden` with `expo-blur`, or ship a static asset — do not attempt CSS blur.*
- Name bar: 11px tall, 118px wide, radius 3, diagonal stripe fill. *RN: a 6px-period diagonal stripe image, or two overlaid `View`s.*
- Secondary bar: 9px tall, 74px wide, radius 3, `redactBarSub`.
- `HIDDEN` in mono 9.5, letter-spacing 0.1em, `textMuted`, top-right.

---

## Screens

All 13 are in `Proxiland-Design-Pack.dc.html`, each frame carrying a `data-screen-label`. Frames are 402×874 (iPhone 16 logical size); status bar occupies the top 62px, home indicator the bottom 34px.

### 1. Splash — `app/_layout.tsx` (`BrandedSplash`)

`brand` ground with a vertical pinstripe overlay (`rgba(245,239,230,.05)` 1px lines every 34px — RN: a repeating background image or omit). Centered: `assets/icon.png` at 76×76 radius 20, 28px gap, wordmark Yeseva One 42, 18px gap, tagline sentence-case 14 sans. Hold 1200ms as today.

**Copy change:** the wordmark is now cased "Proxiland", not letterspaced `PROXILAND`. Tagline is new.

> The app icon still has a terracotta orbiting dot that clashes slightly with `brass`. Recolor the dot to `#8A6A2F` when regenerating app icons (a navy variant, `assets/icon-navy.png`, was produced for a rejected direction — ignore it).

### 2. Nearby feed — `app/(tabs)/nearby.tsx`

Replaces the current `VisibilityToggle` bar + plain header.

**Header** (gutter 20, `paddingTop` 14, `paddingBottom` 16, `rule` bottom border):
- Row: mono 10 `brass` `NEARBY` · spacer · visibility pill · QR button.
- Visibility pill: `surface`, 1px `rule`, radius 999, `padding: 5px 11px`; 7px `live` dot with `boxShadow: 0 0 0 3px rgba(63,107,79,.16)` (*RN: a 13px `live`-at-16% circle behind a 7px dot*), then `Visible · 3h` at 12/600 `ink`. Tapping opens the existing duration/stop control.
- QR button: 34×34, radius 10, `ink` ground, `qr-code-outline` 18 in `inkOn`. Routes to `/scan-event`.
- Headline: Newsreader 31, `Seven people are working near you` (count from `aggregate.total_count`; singular "person").

**Active-event banner** (when `getMyActiveEvents()` is non-empty) — `brand` card, radius 12, `padding: 12px 14px`, gutter 20: `people` glyph 17 `brassOnDark`, then event name 13.5/600 `inkOn` over `You're in · 5 top matches waiting` 11.5 at `rgba(245,239,230,.6)`, then `chevron-forward`. Replaces the old blue `eventPill`. **[NEW DATA]** the match count — either count `getMyEventMatches` above threshold, or drop the second line.

**Feed grouping.** The feed is now explicitly grouped, each group under a section label: `ANONYMOUS · n` then `SHOWING FULL IDENTITY · n`. Connected people and incoming reveals keep their existing priority position at the top of the identity group.

**Anonymous card** — `surface`, `rule`, radius 16, `overflow: hidden`:
1. `padding: 16 16 0`: redacted portrait + name/secondary bars + `HIDDEN`.
2. `padding: 14 16 0`: chips — role (`brassChipBg`), industry and distance band (`neutralChipBg`) — then the descriptive `line` at 16.5/500.
3. "Why you two" panel: `surfaceSunken`, `ruleInner` top border, `padding: 14px 16px`, mono `brass` label + Newsreader 19. Omit the panel entirely when `overlap` is null.
4. `padding: 14 16 16`: primary button `Ask to connect`, then the privacy hint centered at 11.5 `textMuted`, lh 1.45 — *"They see your name first. You see theirs only if they share back."*
5. Asked state: replace the button with the bordered disabled treatment, and drop card opacity to 0.72.
6. The report flag moves off the card into the profile sheet (it was competing with the identity treatment at 16px).

**Full-identity card** (`identity_visibility === 'full'`) — `surface` card, padding 16: 52px avatar + name 17/600 + subtitle 13.5 + education 12.5; then a `ruleInner` divider and the "why you two" block using `overlap_phrase`; then a row of `Connect` (flex 1, primary) + a 48px bordered icon button (`bookmark-outline`). Connected people use the same card with the hint line *"You're connected — tap to message"* and a `Message` primary.

### 3. Scan event QR — `app/scan-event.tsx`

Camera fills the frame. Overlay: a warm dark scrim (radial `#33261C` → `#1A130F`), a 250×250 cutout with radius 26 and four 46px `brassOnDark` 3px corner brackets (replacing the current 3px white square), then Newsreader 22 `inkOn` *"Point at the organiser's code"* and 13 support *"You'll see the event before you join anything."* Close button top-left: 34×34, `rgba(247,243,236,.14)`, radius 10. Bottom: `Enter a code instead` at 14/600 — **[NEW DATA]**, a manual token entry route; cut it if that isn't in scope.

Permission-denied state: `paper` background, Newsreader headline, primary `Allow camera access`.

### 4. Event join — `app/event-join/[token].tsx`

`paper`, close top-left, content at gutter 20:
- Live pill: `liveChipBg`, radius 999, 7px `live` dot, `Happening now · ends 9:30 PM` 11.5/600 `liveChipText`. **[NEW DATA]** end time — use `EventSummary.ends_at` if present, else just "Happening now".
- Newsreader 33 event name; 14 `textTertiary` organiser · venue.
- Card: description 14.5/lh 1.55, then a `ruleInner` divider and a 3-up stat row — Newsreader 26 numeral over mono 10 `textMuted` label: `24 HERE NOW` / `60 INVITED` / `3h LEFT`. **[NEW DATA]** invited count and time-left; drop either column if unavailable — the row is designed to work with two.
- Disclosure block: `surfaceSunken`, `rule`, radius 14, mono `brass` `WHAT JOINING DOES` + 13.5 body — *"Attendees see your real name and photo for the length of the event — no anonymous cards in here. It ends when the event does."* This is new copy and matters: it's the only place the mode switch is explained.
- Bottom: primary `Join event`, then `Not now` at 14/600 `textTertiary`.

Not-found and joined states reuse the same shell (Newsreader headline + body + one primary).

### 5. Intent picker — `app/event/[id]/intent.tsx`

`paper`. Top row: close, spacer, mono 10 `brass` `STEP 1 OF 1`.

Newsreader 30 *"What would make tonight worth it?"*, then 13 `textTertiary` *"Only for this event. It resets when the event ends and never touches your profile."*

Two identical cards, `ask` then `offer`:
- Header row: mono 10 `brass` (`I'M ASKING FOR` / `I CAN OFFER`) · spacer · count `2 / 3` at 11/600 `textMuted`.
- Selected chips: `ink` pill 13/600 with a close glyph; plus one dashed `Add` / `One more` chip. The current "Edit selections" button is gone — the dashed chip opens the sheet, and a chip's own × removes it.
- `ruleInner` divider, then helper 12 `textTertiary` *"Add a detail and the matching gets sharper"* and the free-text value at 14.5 `ink` (placeholder at `textMuted`).

Bottom: primary `Find my matches` (radius 13, `paddingVertical` 15) — enabled only when both lists have ≥1 and any `_other` selection has detail text, exactly as today — then `Not now`. Keep the existing `handleCancel` branch: `router.back()` when intent was already complete, `router.replace('/(tabs)/nearby')` when this was the gate.

The `_other` validation error stays inline under its card at 12 in a red you should take from the codebase's existing error color, not from this palette.

### 6. Intent multi-select sheet — `components/IntentOptionPicker.tsx`

Bottom sheet on a `rgba(36,28,22,.42)` scrim. `paper` ground, radius 22 top, max height 88%.
- 38×4 `#DED3C2` grab handle, centered.
- Header: Newsreader 24 title + `Pick up to three · 2 chosen` at 12.5 `textTertiary`; close glyph right. `rule` bottom border.
- Groups: mono 10 `brass` group label, then **full-width option rows** — radius 12, padding 14, 8px gap between rows. Unselected: `surface` + 1px `rule` + 20px radius-6 checkbox with 1.5px `dashedBorder`. Selected: `ink` ground, `inkOn` 15/500 text, `paper` checkbox with an `ink` checkmark. (Today's 20px checkbox + 10px-padding row is a much weaker target; these rows are 48px tall.)
- Footer above the safe area: primary `Done · 2 selected`, `rule` top border. Disabled when nothing is selected.
- Limit message: when the max is hit, show `You can pick up to 3 — remove one to add another.` at 12 `brass` under the subtitle.

### 7. Event screen — `app/event/[id]/index.tsx`

Background `paperEvent` — the whole warm shift is this plus the header.

**Header** — `brand` ground, pinstripe overlay, `padding: 8px 20px 18px`:
- Row: `chevron-back` at `rgba(245,239,230,.78)` · mono 10 `brassOnDark` `LIVE EVENT` · spacer · `ellipsis-horizontal` (leave / report menu — replaces the destructive red "Leave event" button at the bottom of the scroll).
- Newsreader 29 event name (wraps to 2 lines), 12.5 `rgba(245,239,230,.66)` organiser · `24 here now`.
- Row: `Edit your ask & offer` (flex 1, `paper` ground, `ink` text, radius 10) + 44px bordered QR button (`rgba(245,239,230,.28)` border) for showing your own code.

**Segmented control** — in a 14/20/12 band with a `#EADFCD` bottom border: `Top matches 5` · `Overlap 3` · `Everyone 24`. This is the fix for "users can't tell there are different sections". `See all attendees` is no longer a button at the end of the scroll — it's the third tab.

**Top matches tab** — 12.5 `textTertiary` explainer *"Ranked on how your ask meets their offer."*, then match cards (gutter 20, 14px gap): 52px avatar + name 17/600 + subtitle 13.5 + a rank badge (`brassChipBg`, mono 10 `brassChipText`, `01`/`02`); `ruleInner` divider; the "why you two" block at Newsreader 20 using `match_reason`; a chip pair `Your ask · Funding` (`brassChipBg`) and `Her offer · Capital` (`neutralChipBg`) — **[NEW DATA]**, derivable client-side by intersecting the two intents' option labels via `compatibleOptionIds`, or omit; then `Connect` + a 48px bordered `person-outline` button (opens the profile).

`Requested` and `Connected` use the standard resolved states. Empty state: *"No strong matches yet — check back as more people join."* at 13 `textTertiary` inside a bordered card, not bare text.

**Overlap tab** — identical cards, no rank badge, rationale from `professional_overlap`.

**Everyone tab** — search field (`surface`, `rule`, radius 999, `padding: 9px 14px`, `search` glyph + 14 `textMuted` placeholder *"Search name, company, school"*), then attendees grouped by role category with mono 10 group labels (`FOUNDERS · 9`, `INVESTORS · 6`, `OPERATORS & ENGINEERS · 9`). Rows: 46px avatar + name 15.5/600 + subtitle 12.5 + optional `Top match` micro-badge; trailing pill `Connect` (`ink`) / `Requested` (bordered) / `Connected` (`liveChipBg`). `ruleInner` between rows. Grouping is a client-side sort on `role_category`; search is client-side over the already-loaded attendee list.

### 8. Requests — `app/(tabs)/requests.tsx`

Header: mono `brass` `REQUESTS`, Newsreader 30 *"Two people are waiting on you"*, then a segmented control `Waiting 2` · `Sent 4`. This replaces three stacked 18px bold headings (`Asking to connect` / `Incoming` / `Sent`) — reveal requests and connection requests both live under **Waiting**, since to the user they're the same job.

**Reveal request card**: avatar + name + subtitle + `ASKED` badge (`brassChipBg`); `ruleInner`; `WHY SHE ASKED` + Newsreader 19 `connection_line`; 12 `textTertiary` explainer *"She can already see your profile. Sharing back is what opens the conversation."*; then `Share my profile` (primary, flex 1) + `Ignore` (bordered).

**Coffee request card**: same head with a `COFFEE` badge (`liveChipBg`); then a `surfaceSunken` block, `ruleInner`, radius 12, with `calendar-outline` + `Thu 10 Sep · 9:30 AM` and `location-outline` + venue, both 13.5 (the old treatment was a single 13px orange line); the message at 14 in quotes; `Accept` + `Decline`.

**Sent tab**: compact rows — 40px avatar, name 15/600, status 12.5 (`Connection · pending` `textTertiary`; `Coffee · accepted` `liveChipText` 600), trailing `time-outline` or `checkmark-circle`. Keep swipe-to-delete via the existing `SwipeToDelete`.

### 9. Schedule — `app/(tabs)/schedule.tsx`

Header: mono `brass` `SCHEDULE`, Newsreader 30 *"Three coffees this week"*.

Grouped by relative day, mono 10 label (`TOMORROW` in `brass`, later days in `textMuted`). Each item is a card with a 54px time column — Newsreader 25 `9:30` over mono 10 `AM` — a 1px `ruleInner` vertical divider, then name 16.5/600, venue 13 `textTertiary`, and the note at 13.5 in quotes. Next-up item adds a `ruleInner` footer with `Message` + `Directions` (both bordered, flex 1). Footer hint *"Swipe a card left to remove it"* at 12.5, centered.

### 10. People — `app/(tabs)/connections.tsx`

Connections and the message inbox are merged into one list — the current screen shows a profile row with a separate chat icon and an unread dot, which splits one intent in two.

Header: mono `brass` `PEOPLE`, Newsreader 30 *"Twelve connections"*, search field.

Rows grouped `UNREAD` (`brass` label) / `EARLIER` (`textMuted`): 50px avatar with an 12px `brass` unread dot (2px `paper` ring) when unread; name 16/600 with the timestamp right-aligned at 11.5 `textMuted`; preview line 13.5 — `ink` 500 when unread, `textTertiary` when read; single-line ellipsis. People with no messages yet show *"Met at <event>"* or *"Say hi — no messages yet"*. Tapping the row opens chat; tapping the avatar opens the profile (keep the existing `onPhotoPress` split). Tab badge on `People`.

### 11. Chat — `app/chat/[connectionId].tsx`

Custom header (replace the stack header): `chevron-back`, 36px avatar, name 15.5/600 over role 11.5 `textMuted`, `ellipsis-horizontal` for block/report. `rule` bottom border.

**The first thing in the thread is the reason you connected** — a `surfaceSunken` card, `rule`, radius 14, padding 14, with the mono `brass` `WHY YOU TWO` label and the rationale at Newsreader 17. It scrolls with the messages as the conversation's origin.

Bubbles: mine `ink` / `inkOn`, radius `16 16 5 16`; theirs `surface` + 1px `rule`, radius `16 16 16 5`; 15/lh 1.4, max width 78%, 9px gap. Composer: `surface` pill input, `rule`, radius 999, `padding: 11px 16px`; send is a 42px `ink` circle with `arrow-up` in `inkOn` (replaces the text "Send"), disabled at 40% when empty.

### 12. Your profile — `app/(tabs)/profile.tsx`

Header row: mono `brass` `YOU` · spacer · `settings-outline` (moves sign-out, blocked users and delete account off the main scroll into a settings screen — they currently sit under the profile as three red-ish links).

Identity: 72px avatar + Newsreader 26 name + 13.5 `textSecondary` role · company + a `liveChipBg` verified badge (`checkmark-circle` `live` + 11/600 `liveChipText` `LinkedIn verified`) — the LinkedIn blue is gone. Unverified shows a bordered `Verify with LinkedIn` chip instead.

**Visibility card** — the hero, because it's the app's central privacy control. `brand` ground, radius 16, padding 17, pinstripe overlay: mono 10 `brassOnDark` `HOW YOU APPEAR NEARBY`, 15/600 `inkOn` state line (`Anonymous until asked` / `Full identity`), platform `Switch` right-aligned. Then a `rgba(245,239,230,.16)` divider and a live preview of the anon card line: a 34px blurred portrait + the `line` at Newsreader 16 `inkOn`. When full identity is on, swap the preview for the name/photo pair.

Details: one `surface` card, `rule`, radius 16, `overflow: hidden`, with `ruleInner`-separated rows — mono 10 `textMuted` label over 15 `ink` value: Employer & title / Education / Role · Industry · Seniority / Looking for / Can offer / Bio. Then `Edit profile` as a bordered full-width button.

### 13. Other people's profile — `app/profile/[id].tsx`

Not drawn as its own frame; compose it from the same parts: 72px avatar + Newsreader 26 name + verified badge, the "why you two" block if an overlap exists, the same detail card, then `Message` + `Ask for coffee` (both primary-weight; coffee gets the bordered treatment) or `Connect` when not yet connected. Block/report goes in the header `ellipsis-horizontal`. The coffee modal becomes a bottom sheet matching screen 6's shell — grab handle, Newsreader 24 title, `rule`-separated fields, primary `Send coffee request` in the footer.

---

## Interactions & behavior

Behavior is unchanged from the current build. Preserve every rule as implemented:

- Reveal flow: asking shows your identity to them immediately; theirs unlocks only if they share back. The `Asked · waiting to hear back` state and `askedTargetIds` optimism stay as-is.
- Locked state for incomplete profiles: browsing is allowed; `Ask to connect` fires `handleLockedTap` and its alert.
- Intent is required before the event screen renders (`isIntentComplete` → `router.replace` to `/intent`).
- Matching thresholds and limits stay in `lib/eventIntentConfig.ts` (`topMatchesLimit: 5`, `sharedOverlapLimit: 3`, thresholds 0.3 / 0.25).
- Pull-to-refresh on the event screen regenerates matches and logs `event_matches_regenerated`. Every existing `logSessionEvent` call is preserved.
- Realtime chat subscription, unread counts, read receipts, swipe-to-delete, block/report: unchanged.

Motion — currently there is none; keep it restrained:

- Segment change: cross-fade content 140ms `ease-out`; the active pill slides 180ms `cubic-bezier(.2,.7,.2,1)`.
- Chip select/deselect: 120ms background + color transition.
- Card entry on refresh: 12px translateY + fade, 200ms, staggered 30ms, first 6 items only.
- Sheets: standard platform slide. Scrims fade 160ms.
- The visibility toggle and live dot do **not** pulse or animate — a privacy state that moves reads as unstable.

Loading: keep `ActivityIndicator` but tint it `brand`. For the feed, prefer skeletons at final metrics — `#EFE7DA` blocks at the card's real dimensions.

---

## Assets

| Asset | Source |
| --- | --- |
| `assets/icon.png` | Existing app icon, from the repo. Terracotta orbiting dot should move to `#8A6A2F`. |
| `assets/icons/*.svg` (26 files) | **Authored for this handoff**, MIT-equivalent, in the Ionicons naming scheme so they map 1:1 onto the app's existing `<Ionicons name="…">` calls. The RN app already ships `@expo/vector-icons` — keep using it; these SVGs exist only so the HTML prototype renders without a CDN. Names in use: add, arrow-up, bookmark-outline, calendar, calendar-outline, checkmark, checkmark-circle, chevron-back, chevron-forward, close, ellipsis-horizontal, flag-outline, location-outline, navigate, navigate-outline, paper-plane, paper-plane-outline, people, people-outline, person, person-outline, qr-code-outline, search, settings-outline, sparkles, time-outline. |
| Fonts | Yeseva One and Newsreader, both Google Fonts / OFL. Add `@expo-google-fonts/yeseva-one` and `@expo-google-fonts/newsreader`, load with `expo-font` before hiding the splash. |
| `assets/icon-navy.png` | From a rejected direction. Ignore or delete. |
| Avatar images | Real user `photo_url`s. Lettered circles are the fallback, not the design. |

---

## Files in this bundle

| File | What it is |
| --- | --- |
| `Proxiland-Design-Pack.dc.html` | **The deliverable.** All 13 screens in the final system. Open in a browser. |
| `Proxiland-Current.dc.html` | Pixel-faithful recreation of the app as it is today, rebuilt from the repo source — use it to diff old vs new. |
| `assets/icons/*.svg`, `assets/icon.png` | As above. |
| `support.js`, `ios-frame.jsx` | Runtime for the HTML prototypes (component streaming, iPhone bezel). **Not part of the design** — no need to port anything from these. |

Two directions were explored and rejected before this one: a dark "Night Room" (espresso + amber) and a "Blue Hour" (indigo navy + steel). Both remain in the project's `Proxiland Redesign.dc.html` alongside six wordmark studies, if the reasoning is useful. Warm Ledger + Yeseva One is the chosen system.

## Suggested implementation order

1. Fonts + a shared token module (`lib/theme.ts`) — colors, type styles, spacing, radii. Everything else depends on it.
2. Shared primitives: `Card`, `SectionLabel`, `WhyYouTwo`, `PrimaryButton`, `SecondaryButton`, `Chip`, `SegmentedControl`, `LetteredAvatar`, `RedactedIdentity`, `TabBar`.
3. `AnonCard` + `ProfileCard` + the Nearby header. This is the highest-traffic screen and it proves the system.
4. Event header + segmented control + `EventAttendeeCard` (`match_reason` as the pull-quote). This is the screen the redesign was asked for.
5. Intent screen and its sheet.
6. Requests, Schedule, People, Chat.
7. Profile, splash, scan/join, then the settings screen that absorbs sign-out / blocked users / delete account.
