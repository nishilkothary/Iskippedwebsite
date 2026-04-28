# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm start        # Start production server
```

No lint or test scripts are configured.

## Architecture Overview

**iSkipped** is a Next.js 16 / React 19 app that lets users log purchases they skipped and allocate the saved money between a charitable cause ("Give a Little") and a personal spending goal ("Live a Little").

### Stack
- **Framework:** Next.js 16 App Router, TypeScript strict mode
- **Backend:** Firebase (Firestore for documents, Realtime Database for global counters, Firebase Auth)
- **State:** Zustand — three stores: `authStore` (user + profile), `skipStore` (recent skips), `uiStore` (modal open/close flags)
- **Styling:** Tailwind CSS 4 + inline `style=` props using CSS variables defined globally

### Routing
All authenticated pages live under `src/app/(app)/` and share a layout (`layout.tsx`) that renders a sidebar nav on desktop and a bottom nav on mobile. Unauthenticated pages are under `src/app/(auth)/`. The root `src/app/page.tsx` redirects based on auth state.

Pages: `home`, `jars` (tab-based: cause / live), `community`, `profile`, `dashboard`, `causes`, `admin`.

### Data Flow

1. **Auth** — `src/hooks/useAuth.ts` listens to Firebase auth state, fetches the Firestore `UserProfile`, and seeds it into `authStore`. On first login it auto-assigns a default cause.
2. **Skip logging** — `src/lib/services/firebase/skips.ts → logSkip()` does a single Firestore batch write: skip document + user stats update + feed item + community feed entry + Realtime DB global counter increment. All atomic.
3. **Real-time data** — Recent skips, donations, and spending history use `onSnapshot` listeners (subscribed inside hooks/components, cleaned up on unmount).
4. **Jar balances** — Each skip carries a `jarSplit` (give % / live %) recorded at log time. Per-cause (`causeJarBalances`) and per-goal (`goalJarBalances`) balance maps on `UserProfile` are updated by Firebase service functions.

### Key Service Functions (`src/lib/services/firebase/`)

| File | Key exports |
|---|---|
| `users.ts` | `recalculateTotals`, `switchCause`, `switchGoal`, `recordDonation`, `recordPurchase`, `normalizeJarSplit`, `normalizeSpendingGoals` |
| `skips.ts` | `logSkip`, `updateSkip`, `deleteSkip`, `subscribeToSkips` |
| `projects.ts` | `addCustomProject`, `updateCustomProject`, `deleteCustomProject` |
| `social.ts` | Follow/unfollow, community feed reads |

### Data Models (`src/lib/types/models.ts`)

- **UserProfile** — Central document. Holds totals (totalSaved, totalDonated, totalSpent, totalGiveAllocated, totalLiveAllocated), active cause/goal IDs, jar balances maps, XP/level/streak, and social counts.
- **Skip** — One logged skip: amount, category, jarSplit, projectId, date.
- **SpendingGoal** — Stored as an array on UserProfile (`spendingGoals[]`). Type is `"splurge"` or `"donation"`.
- **Project** — A cause/charity. `isCustom: true` for user-created ones.
- **DonationEvent / SpendingHistoryEvent** — Sub-collections under the user document for history.

### Utilities

- `src/lib/utils/xp.ts` — XP/level math (`xpForSkip`, `levelForXp`)
- `src/lib/utils/dates.ts` — `today()`, `yesterday()`, `formatRelativeTime()`
- `src/lib/constants/skipCategories.ts` — 8 predefined skip categories with emoji, default amount, color

### CSS Variables

Theme colors are CSS variables (`--green-primary`, `--coral-primary`, `--gold-cta`, `--bg-surface-1`, `--text-primary`, etc.). Always use these rather than hard-coding colors, except for the jar-specific purple (`#8B5CF6`) and green (`#2ECC71`) which appear inline throughout the jars page.
