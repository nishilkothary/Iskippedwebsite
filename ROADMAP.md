# iSkipped Roadmap — What It Takes to Work & Gain Popularity

A prioritized assessment of the app based on a full codebase review (July 2026). Organized into four tiers: **trust**, **growth**, **retention**, and **engineering health** — in that order, because a giving app lives or dies on trust.

> **How to use this roadmap:** [`PROMPTS.md`](./PROMPTS.md) contains a ready-to-paste prompt for every open item below. Open a Claude Code session (any model — Opus works well) in this repository, copy the prompt for the item you want, and paste it. Each prompt is self-contained and tells the model to read this repo's docs first.
>
> **Status:** ✅ 1.2 (error handling) and the manifest half of 2.4 are done — see those sections.

---

## Top 5 Most Important

1. **Verifiable donations** — Donations are currently self-reported ("I made a donation" after an external link opens). The core promise of the app — *your skipped money changes lives* — can't be verified. This is the single biggest credibility gap.
2. **Server-side money writes + visible errors** — All money-mutating writes happen in the browser, counters can drift or be corrupted, and the core skip-logging flow fails silently. The numbers the whole app is about must be correct and failures must be visible.
3. **Public landing page + onboarding** — The root URL redirects straight to sign-in, and new users land on an empty home screen with no cause assigned. Nobody can discover the app or successfully start today.
4. **Referral / share loop** — The only realistic popularity engine. Challenge invite links (`/join/[id]`) already exist as the seed; there's no referral tracking, no rewards, no platform share intents.
5. **PWA manifest + push notifications** — Retention. The Android install prompt is currently broken (no manifest, so `beforeinstallprompt` never fires), and there is no re-engagement channel besides one weekly email.

---

## What Works Today

The core product is real and functional:

- Skip logging with atomic batch writes, jar splits, XP/streak updates (`src/lib/services/firebase/skips.ts`)
- Jars page: cause/live tabs, spending goals, donation & purchase logging (`src/app/(app)/jars/`)
- Challenges: create, join, manage, invite via public `/join/[id]` landing page (`src/app/(app)/challenges/`)
- Community feed with opt-in identity (`src/lib/services/firebase/social.ts`)
- Streaks, XP, and levels (computed and stored)
- Weekly report email via Resend + Vercel cron, with HMAC-signed unsubscribe (`src/app/api/cron/weekly-report/`)
- Admin console with server-verified token auth (`src/app/(app)/admin/`)
- Responsive mobile UI (sidebar → bottom nav + floating skip button)
- 8 real seeded charities with real donation URLs (`src/lib/services/firebase/projects.ts`)

---

## Tier 1 — Make It Trustworthy (blockers)

### 1.1 Move money writes server-side
All writes (`logSkip`, `recordDonation`, `switchCause`, jar mutations) run client-side directly against Firestore. Consequences:

- `firestore.rules:137-151` lets **any authenticated user** mutate **any** cause's public `totalRaised` (±5000 per write, unbounded across writes).
- Totals are computed in JS from stale profile snapshots and written as absolute values (`skips.ts`) — two tabs/devices racing silently lose increments.
- Project totals are updated in separate best-effort calls after the batch; drift is a known recurring problem (see `scripts/recalc-project-totals.js`, `recalculateTotals()` in `users.ts`).

**Fix:** move skip/donation/jar mutations behind API routes using the existing Admin SDK (`src/lib/services/firebaseAdmin.ts`) with server-computed `increment()`s, then lock down `firestore.rules` so clients can't touch totals directly.

### 1.2 Visible error handling — ✅ DONE (commit `21f54db`)
Implemented: `sonner` toast system mounted in the root layout (styled with app CSS variables); catch blocks + user-facing error toasts in `useSkips.log`, donation logging, purchases, goal completion, jar transfers, and cause/goal switching. Modals only advance to success states when writes actually succeed.

Remaining (minor): `edit`/`delete` flows for skips and donation history still lack toasts — covered by the 1.2 follow-up prompt in `PROMPTS.md`.

### 1.3 Real or verifiable donations
No payment processor exists. Users open a charity's external URL and self-report the amount. Options:

- Integrate a donation API (e.g. Every.org) or embedded checkout so money verifiably flows to charities, **or**
- Short-term: reframe the UI honestly around *pledge tracking* so the promise matches reality.

### 1.4 Account lifecycle & legal
- **No account deletion** — actively blocked by `firestore.rules:65` (`allow delete: if false`). A GDPR/CCPA "right to erasure" gap given the linked privacy policy.
- **No email verification** — unverified addresses receive the weekly email, risking sender reputation.

---

## Tier 2 — Make It Discoverable & Sticky (growth)

### 2.1 Public landing page + SEO
- Root `/` redirects to sign-in; the sign-in page doubles as the landing page with a **hardcoded** stat ("1,247 skips logged this week").
- **Fix:** a real public landing page (value prop, live stats from Realtime DB `globalStats`, screenshots, CTA), plus `sitemap.xml`, `robots.txt`, and per-page metadata. OG image generation already exists (`src/app/opengraph-image.tsx`).

### 2.2 Onboarding
New users get zeroed stats, no cause, and an empty home screen. The only guidance is a post-skip "pick a cause" nudge.

**Fix:** a 3-step first-run flow — pick a cause → set jar split → log first skip — with celebration at the end.

### 2.3 Referral loop
- Invite links exist but there's no referral tracking, no credit/reward for inviter or invitee, and sharing is generic `navigator.share` / clipboard only.
- **Fix:** referral codes on invite links, track attribution, reward both sides (XP/badge), add WhatsApp/X/Instagram share intents, and auto-generate shareable "I skipped X, saved $Y for [cause]" cards.

### 2.4 Fix the PWA — ✅ manifest DONE (commit `46dee35`) / push notifications OPEN
Done: `src/app/manifest.ts` (standalone display, `/home` start URL, brand colors), 192/512 + maskable PNG icons in `public/icons/`, and `src/app/apple-icon.png` — Android's `beforeinstallprompt` can now fire, unblocking `src/components/InstallPrompt.tsx`.

Still open: service worker + web push for streak reminders and challenge activity (see the 2.4b prompt in `PROMPTS.md`).

---

## Tier 3 — Make It Rewarding (retention)

### 3.1 Surface gamification
- XP is earned on every skip but **never displayed**; levels appear only as a small pill on the profile page.
- No badges/achievements exist; challenge milestones are static UI that never detect completion.
- **Fix:** XP bar with progress-to-next-level on home/profile, achievement system (first skip, 7-day streak, first donation, challenge completed), milestone detection + celebration.

### 3.2 Finish or remove the social layer
- `followingCount`/`followersCount` fields exist with no follow feature; a per-user `feed/{uid}/items` fan-out is written on every skip but never read.
- **Fix:** either implement follow + per-user feeds + feed reactions, or delete the dead fields and fan-out writes.

### 3.3 Cause discovery
- `src/app/(app)/causes/page.tsx` is hardcoded to a single charity and hidden from nav.
- **Fix:** a browsable directory of the 8 seeded charities plus community challenges.

---

## Tier 4 — Make It Maintainable (engineering health)

### 4.1 CI + quality gates
No `.github/` directory, no ESLint, no tests — the only gate is a manual `tsc --noEmit`. Add GitHub Actions (typecheck + lint + smoke tests) and automate Firestore rules deploys.

### 4.2 Performance
- `subscribeToProjects` listens to the **entire** `projects` collection unfiltered and re-seeds official projects from every client (`projects.ts:187-207`).
- Community page runs an aggregate sum over the whole `users` collection on every load (`social.ts:54-59`).
- `jars/page.tsx` is ~1,800 lines; `home/page.tsx` ~1,270 — split into components.
- The weekly-report cron fetches all users in one run (`maxDuration = 300`) — needs cursoring before the user base grows.

### 4.3 Accessibility
52 clickable-`<div>` sites across 8 files, modals without `role="dialog"`/focus traps/Escape handling, icon-only buttons without accessible names, ARIA present in only one file.

### 4.4 Cleanup
Remove the orphan `home-challenge-preview` page, unused `demo.ts` scaffolding, and hardcoded marketing numbers; resolve the deprecated `spendingGoal` field.

---

## Suggested Sequence

| Phase | Focus | Items |
|---|---|---|
| 1 | Trust & correctness | 1.1, 1.2, 1.4 |
| 2 | Acquisition funnel | 2.1, 2.2, 2.4 (manifest) |
| 3 | Growth engine | 2.3, 1.3 |
| 4 | Retention | 3.1, 2.4 (push), 3.3 |
| 5 | Ongoing | Tier 4 items alongside each phase |
