# iSkipped — 10x Roadmap

## Context

iSkipped (Next.js 16 / React 19 / Firebase) lets users log purchases they skipped and split the saved money between a Giving Jar (cause) and a Reward Jar (personal goal). It has a small early user base. The owner wants a roadmap that makes the product 10x more valuable along three axes — **retention/habit, growth/virality, and real-world impact** — with payments on the table only if safety and trustworthiness come first. Capacity is **solo, part-time**, so every phase is cut into small, independently shippable slices. The owner approved a **harden-first** foundation phase.

**Recommended target user (asked to recommend):** *friend groups & communities skipping together*, with solo habit-builders as the on-ramp. Rationale: the codebase's strongest, most differentiated asset is the challenges system (create/join/share/manage group challenges with invite links and a public `/join/[id]` landing page). Groups natively drive all three goals — retention (social accountability), virality (invites are the join mechanism), impact (pooled cause totals). Solo mindfulness apps are a crowded space; "skip together for a cause" is not.

**Codebase review — key findings driving this roadmap:**

*Ready-to-harvest (half-built features):*
- XP is computed and stored on every skip (`src/lib/utils/xp.ts`, `logSkip` in `src/lib/services/firebase/skips.ts`) but **never displayed** — only `level` shows on Profile.
- Challenge `skipMilestones` render on challenge pages but are **purely decorative** (static checkboxes, no completion logic).
- Follow/social-graph schema exists (`followingCount`/`followersCount` on `UserProfile`, `users/{uid}/following` subcollection in `firestore.rules`) with **zero implementation**.
- A per-user feed (`feed/{uid}/items`) is **written on every skip but never read** — pre-built infra for a friends feed.
- `dashboard/page.tsx` is a misnamed plain history list — **no analytics exist anywhere**.
- InstallPrompt exists but there's **no manifest.json / service worker** — not actually installable as a PWA; no push.

*Debt that blocks trust (and future payments):*
- All balance math is client-side in `useSkips.ts`/pages, mirrored via `increment()`; drift is real (manual "Recalculate totals" button and `jars/resolve` page exist as compensating controls).
- Project counters are updated best-effort/non-atomically after the main batch with `.catch(()=>{})` — errors silently swallowed throughout.
- **No tests, no ESLint, no error monitoring.** Two ~1,800-line page files (`jars`, `challenges`) with copy-pasted modals/SVGs across 4 pages.

---

## Phase 0 — Foundation & Trust (harden first)

Goal: make the money layer provably correct and the codebase safe to build on. This phase is the prerequisite for real payments later and directly serves the "trustworthiness" requirement.

### 0.1 Test harness + CI for money math
Add Vitest + ESLint; extract pure money/gamification logic into testable modules where needed.
**Acceptance criteria:**
- `npm test` and `npm run lint` exist and pass; GitHub Action runs typecheck + lint + tests on every PR.
- Unit tests cover: `normalizeJarSplit`, jar allocation math for `logSkip`/`updateSkip`/`deleteSkip`, `recordDonation` clamping (`jarDecrease` never exceeds balance), `recordPurchase`, `transferLiveToGive`, `switchCause` balance consolidation, `recalculateTotals`, `xpForSkip`/`levelForXp`, streak date logic.
- A property-style invariant test: for any sequence of skip/donate/purchase/edit/delete ops, `totalGiveAllocated − totalDonated == Σ causeJarBalances` (and the live-jar equivalent).

### 0.2 Server-side financial writes
Move the multi-document money mutations (`logSkip`, `recordDonation`, `recordPurchase`, edit/delete of each) behind Next.js API routes using the already-configured Admin SDK (`src/lib/services/firebaseAdmin.ts`), keeping optimistic UI updates client-side.
**Acceptance criteria:**
- Each money mutation is one server endpoint that verifies the Firebase ID token and performs the full write (user doc + skip doc + project counters + feeds + RTDB) atomically or with server-side reconciliation — no more split "one counter per write" client batches.
- Firestore rules tightened: clients can no longer write `totalSaved`/`totalDonated`/jar-balance fields or project counters directly.
- The client-visible drift band-aids become no-ops: after a week of use, "Recalculate totals" produces zero deltas (verifiable via a logged diff).
- Failed writes surface a visible error toast (no remaining `.catch(()=>{})` on money paths).

### 0.3 Error visibility
**Acceptance criteria:**
- Sentry (or equivalent) captures client + API-route errors with release tagging.
- A shared `<Toast>` used by all mutation paths; every user-initiated write shows success or a retryable error.

### 0.4 Targeted refactor (only what unblocks later phases)
Not a rewrite. Extract the four copy-pasted units: jar SVG, `ShareChallengeModal`, `PersonalGoalPickerModal`, `challengeFromProject` mapping into `src/components/` / `src/lib/`.
**Acceptance criteria:**
- One canonical implementation of each, imported by `jars`, `challenges`, `challenges/[id]`, `join/[id]`; dead code deleted (`components/JarPreview.tsx`, `home-challenge-preview/` route, legacy `causes/page.tsx` redirected into challenges).
- `jars/page.tsx` and `challenges/page.tsx` each under ~800 lines.

---

## Phase 1 — Retention: make skipping a habit with visible progress

### 1.1 Surface the XP system (cheapest big win — data already exists)
**Acceptance criteria:**
- Home and Profile show current level, XP, and an animated progress bar to next level (`levelForXp` math).
- Logging a skip shows XP earned on the success screen; crossing a level threshold triggers a full-screen level-up celebration with native share.
- Level appears next to names in community/challenge feeds (respecting `shareName` anonymity).

### 1.2 Achievements & badges
New `achievements` map on `UserProfile`, awarded server-side in the (now server-owned) `logSkip`/`recordDonation` paths. Launch set (~12): first skip, 10/50/100 skips, first donation, $100/$500/$1k saved, 7/30-day streak, first challenge joined, first challenge completed, jar filled.
**Acceptance criteria:**
- Badges awarded exactly once, atomically with the triggering write; retroactively granted for existing users via a one-time backfill script.
- Profile shows an achievements grid (earned vs. locked with progress hints); earning one triggers a celebration modal with share.
- Unit tests cover every award condition and idempotency.

### 1.3 Real streaks with protection + the weekly email doubling as streak driver
**Acceptance criteria:**
- Streak state is computed in one place (server) and consistent everywhere (today Home computes its own flame independently of `profile.streak`).
- One "streak shield" earned per 7-day streak, auto-consumed on a missed day; shield count visible on Home.
- Weekly email (existing Resend cron) adds streak status + "at risk" messaging; email CTA deep-links to the skip modal.

### 1.4 Insights dashboard (make `/dashboard` earn its name)
**Acceptance criteria:**
- `/dashboard` shows: savings-over-time chart (weekly/monthly toggle), category breakdown, give-vs-live split over time, and 3 computed insights ("You skip coffee most on Mondays", "Best month ever", projected yearly savings at current pace).
- Renders entirely from existing skip subcollection data; loads under 1s for 500 skips; empty state nudges first skip.
- Skip History (the current page content) remains as a tab.
- Nav includes Dashboard (currently unreachable except by URL).

### 1.5 Installable PWA + push reminders
**Acceptance criteria:**
- `manifest.json` + service worker: Lighthouse "installable" passes; the existing `InstallPrompt` triggers a real install on Android/desktop.
- Opt-in web push (FCM) with three notification types, individually toggleable: streak-at-risk (evening, only if no skip today), weekly summary, challenge milestone reached.
- Zero notifications sent without explicit opt-in; unsubscribe works from notification settings on Profile.

---

## Phase 2 — Growth: make groups and sharing the engine

### 2.1 Challenge leaderboards + real milestones
Make the decorative `skipMilestones` real and add friendly competition.
**Acceptance criteria:**
- Challenge detail shows a leaderboard (skips and $ pledged, respecting anonymity opt-in) with the viewer's rank always visible.
- Milestones track actual progress, check off when reached, notify members (push + feed item), and award a badge.
- Organizer "Send a Nudge" becomes one-tap: pre-written share message includes live progress toward the next milestone.

### 2.2 Shareable impact cards (viral loop #1)
**Acceptance criteria:**
- Every skip success screen, level-up, badge, and milestone offers a generated share image (`next/og` — `opengraph-image.tsx` pattern already in repo) showing the stat + "join me" link to `/join/[id]` or a personal invite URL.
- `/join/[id]` unauthenticated landing page renders rich OG previews when links are pasted into iMessage/WhatsApp/Slack.
- Share events tracked in GA so the viral loop is measurable.

### 2.3 Public profiles + follows (viral loop #2 — schema already exists)
**Acceptance criteria:**
- Opt-in public profile at `/u/[handle]`: level, badges, streak, total saved, active challenge (amounts hideable). Private by default.
- Follow/unfollow implemented against the existing `following` subcollection; `followingCount`/`followersCount` finally maintained; Firestore rules updated to allow the required cross-user reads narrowly.
- Following feed on Home reads the already-written `feed/{uid}/items` fan-out: "Sarah skipped takeout — $18 to Clean Water."

### 2.4 Referral tracking
**Acceptance criteria:**
- Every user has an invite link; sign-ups via it record `referredBy`; inviter gets a badge + XP at referee's first skip.
- Admin page shows referral counts and weekly viral coefficient (invites sent → signups → activated).

---

## Phase 3 — Impact: money becomes real, safely

Staged so trust is never outrun. Recommendation: **Every.org integration** — donations flow donor → Every.org (a 501(c)(3) with 1M+ verified nonprofits); iSkipped never touches funds, which resolves the safety concern without building a payments/compliance stack.

### 3.1 Verified nonprofit directory
**Acceptance criteria:**
- Challenge creation lets organizers pick a verified nonprofit via Every.org search API; verified causes show a "Verified Nonprofit" badge (distinct from honor-system custom links, which are labeled accordingly).
- Existing hardcoded official causes mapped to their verified entries where possible.

### 3.2 One-tap real donations
**Acceptance criteria:**
- "Donate my Giving Jar" opens an Every.org donate flow pre-filled with the jar balance; on webhook confirmation, the donation is recorded server-side (Phase 0.2 endpoints) and marked **verified** — distinct in history and feeds from self-reported donations.
- Webhook handles retries/duplicates idempotently; failure leaves jar balance untouched.
- Challenge and profile totals distinguish verified vs. self-reported giving; community feed can celebrate "verified donation" events.

### 3.3 Impact receipts & annual story
**Acceptance criteria:**
- Profile "Impact" tab lists verified donations with receipts (from Every.org email/record) and unit impact ("≈ 120 meals").
- A shareable "Your Year of Skipping" summary (Spotify-Wrapped style) generates for any user with ≥10 skips.

*(Deliberately excluded: Plaid/bank linking — high sensitivity, low fit for solo part-time; direct Stripe custody of donations — needless compliance burden vs. Every.org.)*

---

## Sequencing & sizing (solo, part-time — each slice ships independently)

| Order | Slice | Rough size |
|---|---|---|
| 1 | 0.1 tests+CI → 0.3 error visibility → 0.4 refactor | 3–4 weekends |
| 2 | 0.2 server-side money writes (one endpoint at a time, `logSkip` first) | 3–4 weekends |
| 3 | 1.1 XP surfacing → 1.4 dashboard → 1.2 badges → 1.3 streaks | 4–6 weekends |
| 4 | 1.5 PWA+push | 2 weekends |
| 5 | 2.2 impact cards → 2.1 leaderboards/milestones → 2.3 profiles/follows → 2.4 referrals | 5–7 weekends |
| 6 | 3.1 → 3.2 → 3.3 Every.org | 4–5 weekends |

Order rationale: Phase 0 is load-bearing for everything (badges and donations both need trustworthy server-side writes). Within Phase 1, XP surfacing is days of work for the biggest perceived change. Impact cards (2.2) lead Phase 2 because they're pure client + OG work with no schema risk. Every.org lands last because it inherits all prior trust work.

## Success metrics (instrument in GA from Phase 1)
- Retention: D7/D30 return rate; % of users with ≥3 skips/week; streak-length distribution.
- Growth: invites sent per user, invite→signup conversion, viral coefficient (target > 0.3 by end of Phase 2).
- Impact: verified $ donated per month; % of Giving Jar balances resolved within 30 days.

## Verification approach per phase
- Phase 0: invariant test suite green; one week of production use with zero-delta `recalculateTotals`; forced-failure test shows toast instead of silence.
- Phase 1: Lighthouse PWA installable pass; manual walkthrough of level-up/badge/streak flows on mobile; email preview via existing `?preview=` mode.
- Phase 2: share a challenge link into iMessage/WhatsApp and verify OG card; two-account test of follow → feed → leaderboard.
- Phase 3: Every.org sandbox donation end-to-end → webhook → verified record; duplicate-webhook replay test.
