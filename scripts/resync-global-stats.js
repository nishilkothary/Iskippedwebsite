/**
 * Recomputes RTDB `globalStats` from Firestore.
 *
 * The counter is maintained incrementally by POST /api/skips, but skip edits and
 * deletes never adjusted it, so it drifts upward over time. This recomputes the
 * true totals from every user's `skips` subcollection and writes them back.
 *
 *   node scripts/resync-global-stats.js          # dry run — prints the diff only
 *   node scripts/resync-global-stats.js --write  # actually write globalStats
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
let keyPath = "";
let dbURL = "";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  const key = env.match(/FIREBASE_SERVICE_ACCOUNT_PATH\s*=\s*(.+)/);
  if (key) keyPath = key[1].trim().replace(/^["']|["']$/g, "");
  const url = env.match(/NEXT_PUBLIC_FIREBASE_DATABASE_URL\s*=\s*(.+)/);
  if (url) dbURL = url[1].trim().replace(/^["']|["']$/g, "");
}
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local to a readable service account JSON.");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, "utf-8"))), databaseURL: dbURL });
const db = getFirestore();
const rtdb = getDatabase();

(async () => {
  const users = await db.collection("users").get();

  let totalSaved = 0;
  let totalSkips = 0;
  for (const user of users.docs) {
    const skips = await user.ref.collection("skips").get();
    skips.forEach((s) => {
      totalSaved += s.data().amount || 0;
      totalSkips += 1;
    });
  }
  totalSaved = Math.round(totalSaved * 100) / 100;

  const current = (await rtdb.ref("globalStats").get()).val() || {};
  console.log("current:", JSON.stringify(current));
  console.log("actual: ", JSON.stringify({ totalSaved, totalSkips, totalUsers: users.size }));

  if (!process.argv.includes("--write")) {
    console.log("\nDry run — pass --write to apply.");
    process.exit(0);
  }

  await rtdb.ref("globalStats").update({ totalSaved, totalSkips, totalUsers: users.size });
  console.log("\n✓ globalStats resynced");
  process.exit(0);
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
