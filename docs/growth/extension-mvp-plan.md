# Chrome Extension MVP — Execution Plan

*Status: ready to execute — July 2026. Companion to `viral-growth-plan.md` (Phase 1).*

Goal: when a signed-in user reaches a checkout page on a supported merchant,
show a gentle overlay — cart total, what it equals in their active cause's
units, and a one-tap **Skip it** that logs through the existing
`/api/skips` route and celebrates with the jar + share card.

The backend already does the heavy lifting: `/api/skips` verifies a Firebase
ID token (`src/lib/services/apiAuth.ts`) and computes jar split, streak, XP,
impact message, feed + community entries, and global counters server-side.
The extension is a thin client. Total new backend surface: **two small API
routes and one web page.**

---

## Architecture at a glance

```
┌─ Chrome Extension (Manifest V3) ─────────────────────┐
│  content scripts (per-merchant adapters)             │
│    → detect checkout, read cart total from DOM       │
│  overlay UI (shadow DOM, injected)                   │
│  service worker                                      │
│    → Firebase Auth (firebase/auth/web-extension)     │
│    → fetch /api/skips, /api/extension/bootstrap      │
│  options page → threshold, snooze, per-site disable  │
└──────────────────────────────────────────────────────┘
              │ signInWithCustomToken (one-time handoff)
┌─ iSkipped web app (existing) ────────────────────────┐
│  NEW /extension/connect page (user already signed in)│
│  NEW /api/extension/token   (mints custom token)     │
│  NEW /api/extension/bootstrap (profile + active      │
│       cause summary for the overlay)                 │
│  EXISTING /api/skips        (unchanged)              │
└──────────────────────────────────────────────────────┘
```

Key technical notes discovered up front:

- **Auth:** `requireUid` expects a Firebase **ID token**. The extension gets
  one by running the Firebase JS SDK (v12 supports MV3 via the
  `firebase/auth/web-extension` entry point) and calling
  `signInWithCustomToken` with a custom token minted by the web app. The SDK
  then auto-refreshes ID tokens — no session plumbing to maintain.
- **CORS:** MV3 service workers with `host_permissions` for the app domain
  can fetch the API cross-origin without CORS changes. Add the production
  domain to `host_permissions`; no API middleware needed.
- **Remote selector config:** merchant DOM selectors ship as a JSON file
  served from the web app (`/api/extension/selectors` or a static file), so
  selector breakage is fixed with a deploy, not a Chrome Web Store re-review.

---

## Prerequisites (decisions/assets needed before starting)

- [ ] Chrome Web Store developer account ($5 one-time) under your Google account
- [ ] Confirm production domain for `host_permissions` and the connect flow
- [ ] Extension icon set (16/32/48/128px — can derive from the app logo)
- [ ] Launch merchant list confirmed (proposal below: Amazon, DoorDash, Uber Eats)
- [ ] Decide monorepo location: `extension/` folder in this repo (recommended —
      shares types from `src/lib/types/models.ts` and deploys selectors with the app)

---

## Workstream 1 — Backend additions (in this repo, ~2 days)

### 1a. `POST /api/extension/token` (new)
- `requireUid(req)` as usual, then `getAdminAuth().createCustomToken(uid)`.
- Return `{ token }`. Custom tokens are single-use, 1-hour expiry — safe to
  mint on demand from the connect page.

### 1b. `GET /api/extension/bootstrap` (new)
Returns everything the overlay needs in one call, so content scripts never
touch Firestore directly:
```ts
{
  displayName, photoURL,
  jarSplit: { give, live },
  activeProject: { id, title, location, unitName, unitCost, unitIsGoal } | null,
  totalSaved, streak
}
```
Reads the `UserProfile` + active `Project` doc with the admin SDK. Cached by
the extension for 15 minutes.

### 1c. `/extension/connect` page (new, under `src/app/(app)/`)
- User is already signed in (shared app layout handles redirect if not).
- Calls `/api/extension/token`, then hands the custom token to the extension
  via `window.postMessage` + the extension's content script on this one page
  (simplest; avoids `externally_connectable` config coupling to an extension
  ID before one exists — can upgrade later).
- Shows success state: "Extension connected ✓".

### 1d. Selector config endpoint
- Static JSON in `public/extension/selectors.json`, versioned
  (`{ version, merchants: [...] }`). The extension fetches it daily and
  caches it. **Read the Next.js 16 docs in `node_modules/next/dist/docs/`
  before implementing routes/pages — this version has breaking changes.**

## Workstream 2 — Extension scaffold (~3 days)

Location: `extension/` in this repo. Build with Vite + TypeScript (CRXJS
plugin or plain Vite multi-entry) so `models.ts` types can be imported.

- `manifest.json` (MV3):
  - `permissions`: `storage`, `alarms`
  - `host_permissions`: production app domain + the 3 launch merchants only.
    **No `<all_urls>`** — keeps store review fast and the privacy story clean.
  - content scripts registered per merchant + one for `/extension/connect`.
- Service worker: Firebase app init using `firebase/auth/web-extension`;
  message handlers `GET_STATE`, `LOG_SKIP`, `SNOOZE`, `DISABLE_SITE`.
- `chrome.storage.local`: auth state (SDK persistence), bootstrap cache,
  settings, per-site disables, snooze-until timestamp, daily prompt count.
- Options page: minimum-cart threshold (default $15), snooze duration,
  per-site toggles, disconnect button.

## Workstream 3 — Merchant adapters (~4 days, the fiddly part)

An adapter = `{ merchant, checkoutUrlPatterns, cartTotalSelectors[],
currencyParser }` driven by the remote selector config. Launch set:

| Merchant | Checkout detection | Notes |
|---|---|---|
| Amazon | `/gp/cart`, `/checkout` URL patterns | Highest volume; subtotal selector is fairly stable |
| DoorDash | order-cart route + pay button presence | SPA — needs MutationObserver, not just URL match |
| Uber Eats | checkout route | SPA, same approach |

- Generic fallback (behind a setting, default off for launch): match
  `/cart|/checkout` URLs on any site *the user has enabled* — deferred if
  it threatens store review.
- Each adapter emits one event per checkout session
  (debounced; keyed by cart total + URL) → overlay.
- **Fail silent**: if selectors don't match, do nothing. Never break a
  merchant page. Wrap everything; no console spam.

## Workstream 4 — Overlay UX (~3 days)

Injected into a **shadow DOM** root (no style collisions), bottom-right card:

1. **Prompt state**: "Cart total: $47 · Skipping = **12 meals** for
   {cause title}" (reuse the `unitCost`/`unitName` math — mirror
   `formatUnits` from `src/lib/utils/impact.ts`). Buttons: **Skip it** /
   *Not now* / snooze menu (24h / this site / settings).
2. **Confirm state**: editable amount (pre-filled from cart), category
   auto-guessed from merchant (DoorDash → takeout), optional
   "what did you skip?" text, share-with-community toggle. Submits
   `LOG_SKIP` → service worker → `POST /api/skips` with the same body shape
   the web app sends (category, amount, projectId/title/unit fields from
   bootstrap cache, `shareWithCommunity`, `displayName`, `photoURL`).
3. **Celebration state**: response gives `newTotal`, `newStreak`, `newXp` —
   show jar-drop animation, streak, and impact line, plus share buttons
   (reuse the share-card URL format from `/api/share-card` and the referral
   link format used by `ShareLinksRow`).

Anti-annoyance rules (hard requirements, not settings):
- Never show below the threshold; never twice for the same cart; max 3
  prompts/day; "Not now" suppresses that cart entirely; snooze respected
  across all sites.
- Tone: mirror, not guilt. "Not now" is a first-class, equally-sized button.

## Workstream 5 — Privacy, listing, and submission (~2 days + review wait)

- Privacy note (plain language, linked from listing + options page): page
  parsing is local; nothing leaves the browser except a skip the user
  explicitly confirms; no browsing history collected or sold. Chrome Web
  Store requires a privacy policy URL — add `/privacy` section covering the
  extension.
- Store listing: name ("iSkipped — Skip it at checkout"), screenshots of the
  three states, 440×280 promo tile.
- Submit for review. Narrow host permissions typically review in days;
  budget up to 2 weeks. Ship the web-app-side code (Workstream 1) to
  production **before** submission so reviewers can exercise the flow.

## Workstream 6 — Verification & metrics (~2 days, overlaps)

- Manual E2E on all three merchants: connect → prompt → skip → celebration →
  web app shows the skip in feed/jars.
- Edge cases: signed-out state (overlay offers "Connect iSkipped"), expired
  token refresh, selector-miss (silence), threshold, snooze persistence
  across browser restart.
- Metrics: add `source: "extension"` to the skip body (one optional field on
  `/api/skips` + `Skip` model) so the dashboard can report % of skips from
  the extension — the plan's primary success metric. Log prompt-shown /
  dismissed / skipped counts locally and batch to a tiny
  `/api/extension/telemetry` endpoint (counts only, no URLs).

---

## Sequence & effort

| Order | Workstream | Est. effort |
|---|---|---|
| 1 | Backend additions (1) | 2 days |
| 2 | Extension scaffold + auth handoff (2) | 3 days |
| 3 | Amazon adapter + overlay prompt/confirm (3+4) | 4 days |
| 4 | Celebration + share + DoorDash/Uber Eats adapters | 3 days |
| 5 | Options page, anti-annoyance hardening, privacy note | 2 days |
| 6 | E2E verification, listing assets, store submission | 2 days |
| — | **Total** | **~16 working days** + review wait |

Milestone check after step 3: a real skip logged from a real Amazon cart,
end to end. If auth or DOM reading proves flaky there, fix before widening.

## Success criteria (30 days post-launch)

- ≥ 20% of new skips carry `source: "extension"`
- Extension D30 retention ≥ 40% of installers with a connected account
- Prompt → skip conversion ≥ 8%; uninstall rate < 30%
- Kill/pivot signal: conversion < 2% with high dismissals → fall back to a
  lighter "log from anywhere" surface (PWA share target) instead of adding
  merchants.
