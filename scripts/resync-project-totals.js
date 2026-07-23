/**
 * Recomputes `totalSkips` / `totalRaised` on every project document from the
 * skips that actually reference it.
 *
 * Same drift as globalStats had: POST /api/skips incremented both counters, but
 * DELETE only ever decremented totalRaised, so totalSkips ratcheted upward.
 *
 *   node scripts/resync-project-totals.js          # dry run — prints the diff only
 *   node scripts/resync-project-totals.js --write  # actually write the projects
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
let keyPath = "";
if (fs.existsSync(envPath)) {
  const match = fs.readFileSync(envPath, "utf-8").match(/FIREBASE_SERVICE_ACCOUNT_PATH\s*=\s*(.+)/);
  if (match) keyPath = match[1].trim().replace(/^["']|["']$/g, "");
}
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local to a readable service account JSON.");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, "utf-8"))) });
const db = getFirestore();

/** Mirrors normalizeJarSplitServer — old profiles stored the split as {giving, spending}. */
function normalizeSplit(raw) {
  if (!raw) return { give: 50, live: 50 };
  if (raw.give !== undefined && raw.live !== undefined) return { give: raw.give, live: raw.live };
  return { give: raw.giving ?? 50, live: raw.spending ?? 50 };
}

(async () => {
  // Tally every live skip against the project it credits.
  const actual = {};
  const users = await db.collection("users").get();
  for (const user of users.docs) {
    // Skips log their split at the time; older ones fall back to the profile's
    // current split — the same approximation the delete route makes.
    const profileSplit = normalizeSplit(user.data().jarSplit);
    const skips = await user.ref.collection("skips").get();
    skips.forEach((s) => {
      const skip = s.data();
      if (!skip.projectId) return;
      const split = skip.jarSplit ? normalizeSplit(skip.jarSplit) : profileSplit;
      const give = (skip.amount || 0) * (split.give / 100);
      const row = actual[skip.projectId] || (actual[skip.projectId] = { totalSkips: 0, totalRaised: 0 });
      row.totalSkips += 1;
      row.totalRaised += give;
    });
  }

  const projects = await db.collection("projects").get();
  const changes = [];
  for (const p of projects.docs) {
    const cur = { totalSkips: p.data().totalSkips || 0, totalRaised: p.data().totalRaised || 0 };
    const next = actual[p.id] || { totalSkips: 0, totalRaised: 0 };
    next.totalRaised = Math.round(next.totalRaised * 100) / 100;
    if (cur.totalSkips !== next.totalSkips || Math.abs(cur.totalRaised - next.totalRaised) > 0.005) {
      changes.push({ id: p.id, title: p.data().title || p.id, cur, next });
    }
  }

  if (changes.length === 0) { console.log("All project totals already match."); process.exit(0); }

  console.log(`${changes.length} project(s) drifted:\n`);
  for (const c of changes) {
    console.log(`  ${c.title} (${c.id})`);
    console.log(`    totalSkips  ${c.cur.totalSkips} → ${c.next.totalSkips}`);
    console.log(`    totalRaised $${c.cur.totalRaised.toFixed(2)} → $${c.next.totalRaised.toFixed(2)}`);
  }

  if (!process.argv.includes("--write")) {
    console.log("\nDry run — pass --write to apply.");
    process.exit(0);
  }

  const batch = db.batch();
  changes.forEach((c) => batch.update(db.collection("projects").doc(c.id), c.next));
  await batch.commit();
  console.log(`\n✓ resynced ${changes.length} project(s)`);
  process.exit(0);
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
