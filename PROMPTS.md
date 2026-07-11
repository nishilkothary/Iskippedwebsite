# PROMPTS.md — Ready-to-Paste Prompts for Each Roadmap Item

Companion to [`ROADMAP.md`](./ROADMAP.md). Each section below is a **complete, self-contained prompt**: open a Claude Code session in this repository (any capable model — Opus recommended), copy the entire block for the item you want, and paste it. No other context is needed — every prompt tells the model to read the repo docs first.

**Effort labels:** 🟢 Small (an hour or two) · 🟡 Medium (half a day) · 🔴 Large (a day or more, may need decisions from you)

**Suggested order:** 1.1 → 1.4 → 2.1 → 2.2 → 2.4b → 2.3 → 1.3 → 3.1 → 3.3 → 3.2 → Tier 4 items anytime.

---

## 1.1 — Server-side money writes 🔴

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 1.1 in this repo before writing any code. Next.js 16 has breaking changes vs your training data — consult node_modules/next/dist/docs/ for anything Next-specific. TypeScript strict mode; match the existing code style.

Task: move all money-mutating writes from the client to server-side API routes.

Problem: logSkip, updateSkip, deleteSkip, recordDonation, recordPurchase, transferLiveToGive, transferJarBalance, and completeGoal in src/lib/services/firebase/skips.ts and src/lib/services/firebase/users.ts run in the browser directly against Firestore. Totals are computed client-side from stale snapshots (race conditions lose increments), and firestore.rules lines ~137-151 let any authenticated user mutate any project's totalRaised. The Admin SDK is already set up in src/lib/services/firebaseAdmin.ts, and there is an existing pattern for token-verified API routes in src/app/api/admin/users/route.ts (verify the Firebase ID token server-side).

Requirements:
1. Create API routes (e.g. src/app/api/skips/, src/app/api/donations/) that verify the caller's Firebase ID token, validate inputs (amount bounds, ownership), and perform writes with the Admin SDK using server-computed FieldValue.increment() — never absolute totals from the client.
2. Update the client service functions to call these routes (keep their signatures so hooks/components don't change; they should still return the same shapes).
3. Keep the Realtime DB globalStats/causeTotals updates working (move them server-side too, in the same request).
4. Tighten firestore.rules: clients may read as before, but direct client writes to user totals, project totalRaised/totalSkips, and communityFeed should be denied (or restricted to fields the server doesn't own). Do not break reads or onSnapshot listeners.
5. Preserve existing error handling: the client functions should throw on failure so the existing sonner toasts (see src/hooks/useSkips.ts) keep working.
6. Do NOT change the UI, the data models, or unrelated code. Keep the diff as small as this scope allows.

Verify: npm run typecheck passes; npm run build compiles (a pre-existing page-data failure in /api/cron/weekly-report due to a missing RESEND_API_KEY is acceptable). List every rules change you made and why it doesn't break a legitimate client operation.
```

---

## 1.3 — Verifiable donations 🔴 (decision needed first)

**Decide before prompting:** integrate a real donation API (Every.org's donate-link/API is the lowest-lift option for US 501(c)(3)s) **or** reframe the UI as honest pledge tracking. Prompt below is for the short-term reframe (🟢); swap in your chosen provider for the full version.

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 1.3 in this repo before writing any code.

Task: make the donation flow honest about being self-reported, without redesigning it.

Context: donations don't flow through the app — users open a charity's external donationURL and self-report via "I made a donation" (see src/app/(app)/jars/resolve/page.tsx, the DonationLogModal component, and the causes/jars pages). Some copy implies more than that.

Requirements:
1. Audit all user-facing copy in the donation flows (jars page, jars/resolve, home banners, about page FAQ, join page) and adjust wording so it consistently frames amounts as "pledged/tracked" and the confirmation as self-reported ("Log the donation you made").
2. Add a small consistent note near each donate button: donations go directly to the charity via their own site; iSkipped never handles money.
3. Do not change any data flow, models, or Firebase code. Copy and small UI text only.

Verify: npm run typecheck passes. List every string you changed with before/after.
```

---

## 1.4 — Account deletion + email verification 🟡

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 1.4 in this repo before writing any code. Next.js 16 — consult node_modules/next/dist/docs/ for Next-specific APIs. TypeScript strict.

Task: add account deletion and email verification.

Context: Firebase Auth with Google popup + email/password (src/lib/services/firebase/auth.ts, UI in src/app/(auth)/sign-in/page.tsx). There is no sendEmailVerification anywhere, no delete-account flow, and firestore.rules line ~65 has `allow delete: if false` on /users/{uid}. Admin SDK exists in src/lib/services/firebaseAdmin.ts with a token-verified API route pattern in src/app/api/admin/users/route.ts. The weekly email cron (src/app/api/cron/weekly-report/route.ts) currently emails unverified addresses.

Requirements:
1. Email verification: send verification email on email/password signup; show a dismissible "verify your email" banner in the app for unverified email/password users (Google users are already verified). Do not hard-block usage.
2. Account deletion: a "Delete account" action in src/app/(app)/profile/page.tsx behind a type-to-confirm dialog. Implement as a token-verified API route using the Admin SDK that deletes the user's Firestore document tree (skips, donations, spendingHistory, feed subcollections), their custom projects, their auth record, and decrements/cleans global counters where feasible. Handle the requires-recent-login case for the client-side signOut path gracefully.
3. Skip unverified email/password users in the weekly-report cron.
4. Use the existing sonner toasts for success/failure feedback. Match existing modal styling (see src/components/skip/SkipModal.tsx for the pattern).

Verify: npm run typecheck; npm run build (pre-existing /api/cron/weekly-report RESEND_API_KEY page-data failure is acceptable). Describe how you tested or reasoned through the deletion path — it must not be able to delete anyone but the authenticated caller.
```

---

## 2.1 — Public landing page + SEO 🟡

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 2.1 in this repo before writing any code. Next.js 16 App Router — consult node_modules/next/dist/docs/ for metadata/sitemap/robots conventions, which may differ from your training data.

Task: give the app a real public landing page and baseline SEO.

Context: src/app/page.tsx is a one-line redirect("/home"); unauthenticated users end up on the sign-in page, which doubles as the landing page with a HARDCODED stat ("1,247 skips logged this week") in src/app/(auth)/sign-in/page.tsx. Good raw material exists: the sign-in hero copy, the about page (src/app/(app)/about/page.tsx) with how-it-works + FAQ, an OG image generator (src/app/opengraph-image.tsx), and live global stats in Realtime DB under globalStats (see how src/lib/services/firebase/skips.ts writes them and how the community page reads aggregates).

Requirements:
1. Replace the root redirect with a public landing page: hero (reuse/adapt the sign-in hero copy and MiniJar/preview-card components where possible), how-it-works (3 steps), live community stats pulled from Realtime DB globalStats (server-rendered or client with a skeleton — no fake numbers), cause logos strip, CTA buttons to /sign-in. Signed-in visitors hitting / should still be redirected to /home.
2. Replace the hardcoded numbers on the sign-in page with the same live stats (or remove them).
3. Add sitemap and robots via the Next.js App Router file conventions, covering /, /sign-in, /about, /privacy, /terms.
4. Per-page metadata (title/description) for the public pages.
5. Match the existing visual language: CSS variables (--green-primary, --gold-cta, --bg-surface-1 etc. in src/app/globals.css), rounded friendly cards, mobile-first.

Verify: npm run typecheck; npm run build (pre-existing /api/cron/weekly-report failure acceptable) and confirm sitemap/robots routes are emitted in the build output.
```

---

## 2.2 — Onboarding flow 🟡

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 2.2 in this repo before writing any code. Next.js 16; TypeScript strict; match existing style (CSS variables, rounded cards).

Task: add a first-run onboarding flow so new users don't land on an empty home screen.

Context: on signup, createOrUpdateUser (src/lib/services/firebase/users.ts) creates a zeroed profile with activeProjectId: null; users land on /home with empty states. The only nudge today is a post-skip "pick a cause" prompt inside src/components/skip/SkipModal.tsx. Useful building blocks: cause list + subscribeToProjects in src/lib/services/firebase/projects.ts, switchCause in users.ts, jar split logic (normalizeJarSplit), and the SkipModal itself for logging the first skip. Auth state lives in the Zustand authStore seeded by src/hooks/useAuth.ts.

Requirements:
1. A 3-step onboarding shown once for new users (persist completion on the UserProfile, e.g. onboardingCompletedAt — not just localStorage): step 1 pick a cause (grid of the official causes with images from public/causes/), step 2 set the give/live jar split (default 50/50, reuse existing split UI patterns from the jars page if extractable without refactoring), step 3 log your first skip (open the existing SkipModal).
2. Route new users to it after signup; existing users must never see it. Skippable ("I'll do this later") at every step.
3. Celebrate completion (the app has a celebration pattern in SkipModal — reuse the feel, keep it light).
4. Use sonner toasts for any write failures (already mounted in the root layout).
5. Keep the diff contained: a new route or overlay component + small profile field addition; do not refactor the jars page or SkipModal.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable). Walk through: brand-new user → onboarding → skip logged → home shows the cause and skip.
```

---

## 2.3 — Referral loop 🔴

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 2.3 in this repo before writing any code. Next.js 16; TypeScript strict.

Task: add referral tracking + rewards on top of the existing invite links, and richer share options.

Context: challenge invite links to /join/[id] already exist (generated in src/components/skip/SkipModal.tsx ~line 151, src/app/(app)/challenges/page.tsx ~line 388, challenge detail/manage pages, home page). Sharing is generic navigator.share with clipboard fallback. There is no referral attribution, no rewards, no per-platform share intents. XP utilities live in src/lib/utils/xp.ts; profile fields in src/lib/types/models.ts.

Requirements:
1. Referral attribution: append a ref code (the inviter's uid or a short code stored on UserProfile) to invite/share URLs; on signup, persist referredBy on the new profile and increment a referralCount on the inviter (server-side or rules-safe).
2. Rewards: award XP (use xp.ts helpers) to both sides on the referee's FIRST logged skip, not on signup (prevents empty-account farming). A toast/celebration for the inviter can be deferred — a profile stat ("Friends joined: N") is enough for v1.
3. Share intents: alongside navigator.share, add explicit WhatsApp and X share links (standard wa.me / x.com intent URLs) on the challenge share surfaces.
4. Shareable card: generate an "I skipped X and saved $Y for [cause]" image via a Next.js opengraph-image-style route (pattern already exists in src/app/opengraph-image.tsx) that the post-skip share flow links to.
5. Keep rules tight: a user must not be able to set referredBy to themselves or change it later.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable). Trace the attribution path end-to-end in your summary: link → signup → first skip → both profiles updated.
```

---

## 2.4b — Service worker + push notifications 🔴

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 2.4 in this repo before writing any code. Next.js 16 — check node_modules/next/dist/docs/ for current service-worker/PWA guidance.

Task: add web push notifications (streak reminders + challenge activity). The manifest/icons already exist (src/app/manifest.ts, public/icons/) — do not redo them.

Context: no service worker exists. Firebase is already a dependency, so Firebase Cloud Messaging (FCM) is the natural choice; the Admin SDK is configured in src/lib/services/firebaseAdmin.ts, and there's a Vercel cron pattern in vercel.json + src/app/api/cron/weekly-report/route.ts (Bearer CRON_SECRET auth). Streak data lives on UserProfile (streak, lastSkipDate — check src/lib/types/models.ts); notification preferences should follow the weeklyEmailOptOut pattern.

Requirements:
1. FCM web push: service worker, token registration on an explicit user opt-in (a settings toggle on src/app/(app)/profile/page.tsx — never auto-prompt on load), tokens stored per-user in Firestore, opt-out honored.
2. A daily cron API route (add to vercel.json, CRON_SECRET-authed) that sends a streak-reminder push to opted-in users whose streak is at risk (skipped yesterday but not today; send in the late afternoon UTC as a v1 simplification).
3. A challenge-activity push (someone joins your challenge) triggered from the join path — server-side.
4. Graceful degradation everywhere: unsupported browsers (iOS Safari not installed to home screen) just don't show the toggle.
5. Keep the weekly email untouched.

Verify: npm run typecheck; npm run build (pre-existing weekly-report RESEND_API_KEY failure acceptable). Document required new env vars (FCM VAPID key etc.) in the summary and .env.example if present.
```

---

## 3.1 — Surface gamification 🟡

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 3.1 in this repo before writing any code. TypeScript strict; match existing visual style (CSS variables in src/app/globals.css).

Task: make the existing XP/level/streak system visible and add achievements.

Context: XP is earned on every skip (xpForSkip in src/lib/utils/xp.ts, applied in src/lib/services/firebase/skips.ts) and levels are computed (levelForXp) but the ONLY display is a "Level {n}" pill on src/app/(app)/profile/page.tsx ~line 84. No XP bar, no badges/achievements anywhere. Challenge milestones (skipMilestones on projects) render as static cards on the join page but never detect completion. Streaks display on home + profile already.

Requirements:
1. XP progress bar: current level, XP into level, XP to next level — on the profile page and a compact version on home near the streak badge. Use xp.ts math; add a helper there if needed (e.g. xpProgressForLevel).
2. Achievements: a small client-computable set derived from existing profile fields — first skip, 10/50/100 skips, 7-day and 30-day streak, first donation logged, first challenge joined, first custom challenge created. Store unlocked achievement ids + timestamps on UserProfile; check/award after skip logging and donation logging; celebrate new unlocks with the existing celebration pattern (see SkipModal) or a sonner toast.
3. Trophy case: an achievements grid on the profile page (locked ones greyed with hints).
4. Challenge milestones: compute completion from the challenge's current totals where the data already allows it and render milestone cards as reached/unreached; skip award logic if it would require new server infrastructure — visual state only is fine for v1.
5. No new dependencies; keep the diff contained to xp.ts, models.ts, the skip/donation award points, profile page, and a small home addition.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable). Confirm awards are idempotent (logging two skips can't double-award "first skip").
```

---

## 3.2 — Finish or remove the social layer 🟢 (remove) / 🔴 (build)

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 3.2 in this repo before writing any code.

Task (REMOVE variant — recommended until there's user demand): delete the dead social-graph scaffolding.

Context: followingCount/followersCount exist on UserProfile (src/lib/types/models.ts ~line 27) but no follow feature exists anywhere. logSkip in src/lib/services/firebase/skips.ts writes a per-user feed fan-out (feed/{uid}/items) that no page ever reads — wasted writes on every skip.

Requirements:
1. Remove the feed/{uid}/items fan-out write from logSkip (keep the communityFeed write — that IS read by the community page).
2. Remove followingCount/followersCount from the model and from profile creation in src/lib/services/firebase/users.ts. Leave existing Firestore documents alone (extra fields are harmless); just stop writing/reading them. Keep rules changes minimal.
3. Check firestore.rules for now-unused rules covering the feed subcollection and tighten/remove them.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable); grep to confirm no remaining references.
```

---

## 3.3 — Cause discovery page 🟡

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 3.3 in this repo before writing any code. Match existing style (CSS variables, card patterns).

Task: replace the hardcoded single-cause page with a browsable cause directory.

Context: src/app/(app)/causes/page.tsx is hardcoded to one charity (projects.find(p => p.id === "cfc")) with hardcoded caringforcambodia.org links, and it's not in the nav. 8 real seeded charities live in OFFICIAL_PROJECTS in src/lib/services/firebase/projects.ts (images in public/causes/), plus user-created community challenges in Firestore. The cause-selection UI inside SkipModal/jars flows and switchCause in src/lib/services/firebase/users.ts already handle activating a cause.

Requirements:
1. Rebuild /causes as a directory: official causes grid (image, name, blurb, totalRaised, donate link, "Make active" button using switchCause) and a community-challenges section (reuse the challenge card pattern from src/app/(app)/challenges/page.tsx if extractable cheaply — otherwise a simpler card is fine).
2. Add Causes to the nav in src/app/(app)/layout.tsx (both sidebar and bottom nav — check what fits; if the bottom nav is full, sidebar-only is acceptable, state your choice).
3. Active cause clearly marked; switching shows the existing toast/feedback patterns.
4. Remove all hardcoded cfc-specific fallbacks.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable).
```

---

## 4.1 — CI + lint 🟢

```text
Read CLAUDE.md and AGENTS.md in this repo first.

Task: add ESLint and a GitHub Actions CI workflow.

Context: no .github/ directory, no ESLint config, no lint script; the only gate is a manual `npm run typecheck` (tsc --noEmit). Next.js 16 — use its current recommended ESLint setup (check node_modules/next/dist/docs/, the config format may have changed vs your training data).

Requirements:
1. Add ESLint with the Next.js recommended config + a `lint` script. Fix or explicitly disable (with a comment) any rules the existing code violates en masse — the goal is a PASSING baseline, not a 500-error wall; prefer targeted config over mass code edits.
2. .github/workflows/ci.yml: on push/PR — install (npm ci), typecheck, lint, build. For the build step, set a dummy RESEND_API_KEY env var if that's sufficient to get past the known /api/cron/weekly-report page-data failure; if not, document the failure and make the build step tolerate exactly that error.
3. Do not add tests in this pass (separate task), do not reformat the codebase.

Verify: npm run lint and npm run typecheck pass locally; the workflow YAML is valid.
```

---

## 4.2 — Performance fixes 🟡

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 4.2 in this repo before writing any code.

Task: fix the known data-layer hot spots. Do NOT attempt the large-component splits in this pass.

Context and targets:
1. subscribeToProjects in src/lib/services/firebase/projects.ts (~lines 187-207) listens to the ENTIRE projects collection unfiltered AND re-seeds missing official projects from inside the snapshot callback on every client. Fix: bound the query (e.g. official + non-archived public + the user's own custom projects — check how callers use the data before choosing), and move seeding out of the hot path (a guarded one-time check, or an idempotent server route).
2. getCommunityTotalSaved in src/lib/services/firebase/social.ts (~lines 54-59) runs an aggregate sum over the whole users collection on every community-page load. Fix: read the existing Realtime DB globalStats counter instead (written by logSkip in skips.ts) — verify it tracks the same number; if it drifts, prefer it anyway and note the discrepancy.
3. The weekly-report cron (src/app/api/cron/weekly-report/route.ts) fetches ALL users in one invocation (maxDuration 300). Fix: process in pages with a cursor so a single invocation is bounded; keep it a single cron for now (resumable cursor in Firestore).

Requirements: no behavior changes visible to users; keep function signatures stable where callers depend on them.

Verify: npm run typecheck; npm run build (pre-existing weekly-report RESEND_API_KEY failure acceptable — but your cursor change must not introduce NEW failures).
```

---

## 4.3 — Accessibility pass 🟡

```text
Read CLAUDE.md and AGENTS.md in this repo first. Match existing styling exactly — this task must produce zero visual changes.

Task: an accessibility pass over interactive elements and modals.

Context: ~52 clickable <div>/<span> handlers across 8 files (worst: src/app/(app)/jars/page.tsx ~19, src/components/skip/SkipModal.tsx ~9, src/app/(app)/challenges/page.tsx ~9). Modals (SkipModal overlay ~line 163, DonationLogModal, others) lack role="dialog", aria-modal, focus trapping, and Escape handling. Icon-only buttons (e.g. the × close at SkipModal.tsx ~line 169) lack accessible names. ARIA appears in only one file.

Requirements:
1. Convert clickable divs to <button type="button"> with reset styling (appearance/background/border none, inherit font) so nothing shifts visually — a small shared className or component is fine.
2. Modals: role="dialog", aria-modal, aria-labelledby, close on Escape, focus moves in on open and returns to the trigger on close. A tiny shared hook (e.g. src/hooks/useModalA11y.ts) is preferred over a dependency.
3. aria-label on all icon-only buttons; alt text on meaningful <img>s (empty alt for decorative).
4. Do not restructure components or change layout/behavior otherwise.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable). Spot-check by describing keyboard-only flows: open skip modal, log a skip, close with Escape.
```

---

## 4.4 — Cleanup 🟢

```text
Read CLAUDE.md, AGENTS.md, and ROADMAP.md section 4.4 in this repo first.

Task: remove dead weight.

Targets:
1. Delete src/app/(app)/home-challenge-preview/ (orphan dev-preview page, not linked anywhere — verify with a grep before deleting).
2. Delete the unused demo scaffolding in src/lib/constants/demo.ts and any imports of it (DEMO_MODE is false and unused).
3. Remove the hardcoded marketing stats on src/app/(auth)/sign-in/page.tsx ("1,247 skips logged this week", the fixed 68% MiniJar fill) — replace with either live globalStats from Realtime DB or neutral copy without numbers (state which you chose). [Skip this item if roadmap 2.1 was already completed — check whether sign-in still has hardcoded numbers.]
4. Deprecated spendingGoal field (src/lib/types/models.ts ~line 36): confirm normalizeSpendingGoals migration coverage, then stop writing the deprecated field for new data if it still is written; keep read-side back-compat. If removal is riskier than it's worth, document why and leave it.

Verify: npm run typecheck; npm run build (pre-existing cron route failure acceptable); grep to confirm no dangling references to deleted files.
```

---

## Follow-up: 1.2 error-handling leftovers 🟢

```text
Read CLAUDE.md and AGENTS.md in this repo first.

Task: finish the error-handling pass from roadmap 1.2 (main flows already done — sonner is mounted in src/app/layout.tsx).

Add try/catch + sonner toast.error (matching the friendly copy style of the existing toasts, e.g. in src/hooks/useSkips.ts) to the remaining mutation flows: skip edit/delete (useSkips edit/remove and their call sites in src/app/(app)/dashboard/page.tsx), donation/spending history edit/delete on the jars page (onEditHistory/onDeleteHistory and editDonation/deleteDonation call sites), and custom challenge create/update/delete (addCustomProject/updateCustomProject/deleteCustomProject call sites in the challenges pages). Only advance UI success states when the write succeeds. Keep the diff tight.

Verify: npm run typecheck; npm run build (pre-existing /api/cron/weekly-report RESEND_API_KEY failure acceptable).
```
