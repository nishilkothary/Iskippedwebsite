# iSkipped Growth Plan: Personal Donations & Checkout Extension

*Status: proposal — July 2026*

Two ideas evaluated: (1) a personal donation platform (support a specific
family or student, with dialogue), and (2) a Chrome extension that intervenes
at checkout. This document gives the verdict on each, the reasoning, the risks
identified up front, and the execution plan for what we pursue.

Two facts about the current product anchor every decision below:

- **iSkipped never touches money.** Donations are logged, not processed — the
  dollars move through an external `donationURL` or a `donationNote`
  ("Send via Venmo"). This keeps us out of payment compliance, fraud
  liability, and tax-receipt obligations entirely. We protect this property
  until we can delegate it to a partner who owns it professionally.
- **The backend is already extension-ready.** `/api/skips` is a
  token-authenticated server route; share cards (`/api/share-card`) and
  referral attribution (`/api/referrals/attribute`) already exist. The
  extension is mostly a new client, not new infrastructure.

---

## Idea 1 — Personal donations (specific family / student, with dialogue)

### Verdict: pursue the insight, not the implementation as described

The insight is correct: connection to a **specific person** is the strongest
retention lever in giving. DonorsChoose (specific classrooms), Watsi (specific
patients), and GiveDirectly (specific families) all built durable products on
it. "I'm helping Maria finish nursing school" beats any abstract cause for
emotional stickiness, jar allocation, and follow-through.

But the literal version — iSkipped sources beneficiaries, moves money to
them, and hosts open dialogue — stacks three of the hardest problems in
nonprofit tech:

1. **Beneficiary verification.** GoFundMe runs an entire trust & safety org
   to catch fake campaigns. We cannot vet families at our scale, and one
   fake-beneficiary scandal permanently ends a small app's credibility.
2. **Regulatory reclassification.** Person-to-person gifts are not
   tax-deductible donations. Platforms that route money to individuals can
   trigger state-by-state money-transmitter licensing, KYC obligations, and
   1099-K reporting. We would go from "habit app" to "regulated fintech."
3. **Safeguarding.** Open donor–beneficiary dialogue, especially with
   students (often minors), is a moderation and safety minefield: COPPA,
   grooming risk, donor harassment of beneficiaries, power dynamics. Even
   DonorsChoose only permits *moderated thank-you notes* — never live chat.
   That constraint is a hard-won industry design decision; we copy it.

### The version we build: "Faces" — personal causes via partners

Source personal-scale causes from platforms that already solved verification
and disbursement:

| Partner | What they provide | Why |
|---|---|---|
| **Every.org** | Nonprofit donations API; they are a 501(c)(3) that handles processing, receipts, disbursement | Enables real in-app donations later while we still never touch money |
| **DonorsChoose** | Specific classrooms/teachers/students; partner API; field verification | The closest legitimate equivalent of "support a student" |
| **GlobalGiving** | Specific community/family-level projects with field-verified progress updates | "Support a family" equivalent, internationally |

Replace "dialogue" with **moderated beneficiary updates**: a photo + short
note feed on the cause page ("Ms. Rivera's class received the books!").
This delivers ~90% of the emotional payoff at ~2% of the risk, and fits the
existing `Project` model with only an `updates` subcollection
(`{ text, imageURL, postedAt, source }`) rendered on the cause page and
surfaced in the community feed.

### Explicitly out of scope (now, possibly forever)

- Self-sourced beneficiaries (families/students recruited by us)
- P2P money movement of any kind
- Live or unmoderated donor–beneficiary chat

---

## Idea 2 — Chrome extension at checkout

### Verdict: strong yes — sequence this first

The product's core weakness is that logging a skip requires remembering
iSkipped exists at the exact moment of temptation. The extension moves the
product to the moment the decision actually happens: at checkout, show
"This cart is $47 — skip it and fund 12 meals instead?" It is the
Honey/Rakuten wedge inverted — they monetize the purchase moment; we monetize
the *non*-purchase moment.

Secondary benefits:

- **Skip credibility.** An extension-originated skip is a purchase the user
  demonstrably almost made, making the global counter and community feed more
  real than self-reported skips.
- **Closes the viral loop with existing pieces:** extension skip → share card
  → referral link → new user installs extension.
- **Distribution surface.** Chrome Web Store is its own acquisition channel.

### Risks identified up front, and mitigations

| Risk | Mitigation |
|---|---|
| DOM selectors break constantly | Launch with 3–5 high-temptation merchants (Amazon, DoorDash/UberEats, Temu/Shein) + a generic cart-URL heuristic. Selector configs fetched remotely so fixes don't require a store re-review. |
| Annoyance → uninstall | Snooze (24h), per-site disable, and a minimum dollar threshold from day one. Tone is a gentle mirror, never guilt. Cap prompts per day. |
| Privacy perception ("it reads my shopping") | Page parsing happens locally; only a user-confirmed skip is transmitted; nothing sold or profiled. State this in the store listing and a plain-language privacy note. |
| Chrome Web Store review friction | Manifest V3, narrow host permissions (named merchants only — no `<all_urls>` at launch), minimal permission set. |
| Auth complexity | Token handoff from web app to extension (Firebase custom token endpoint or `chrome.identity`), then reuse `/api/skips`. This is the only real backend work. |

### MVP scope (~6 weeks)

1. MV3 extension: content scripts for Amazon + 2 delivery apps, generic
   cart-detection fallback; reads cart total from DOM.
2. Checkout overlay: cart amount → impact framing using the active cause's
   `unitCost`/`unitName` ("= 12 meals"), Skip / Not now / Snooze.
3. Auth handoff endpoint (`/api/extension/token`) issuing a scoped Firebase
   custom token; extension stores it and calls `/api/skips`.
4. Post-skip screen: jar animation + share card + referral link.
5. Controls: threshold, snooze, per-site disable, daily prompt cap.

**Success metrics:** % of total skips originating from the extension; D30
extension retention; uninstall rate < 30% at 30 days; share-card sends per
extension skip.

---

## Sequencing (CEO view)

**Phase 1 — now → +6 weeks: extension MVP.** Highest leverage, moderate
cost, reuses existing APIs. This is the growth bet.

**Phase 2 — parallel, low cost: "Faces" pilot.** Curate 5–10
DonorsChoose/GlobalGiving personal causes as story-rich projects with a
moderated updates feed (manual updates are fine for the pilot — no API
integration needed). Measure: do personal causes get higher give-jar
allocation and donation follow-through than abstract causes?

**Phase 3 — +3–6 months, gated on Phase 2 winning: Every.org API
integration** for one-tap real donations with tax receipts. The gap between
logged donations and actually-completed external donations is the product's
biggest long-term credibility risk; this closes it while a 501(c)(3) partner
owns all money handling.

**Kill criteria:** if extension D30 retention is poor and prompts are mostly
dismissed, fall back to a lighter "log from anywhere" surface (PWA share
target / iOS shortcut) instead of deepening merchant coverage. If personal
causes don't outperform abstract ones in the pilot, skip Phase 3 and keep
the partner causes as ordinary catalog entries.
