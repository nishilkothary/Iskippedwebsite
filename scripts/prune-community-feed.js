/**
 * Removes orphaned `communityFeed` documents.
 *
 * Every feed doc is created by POST /api/skips with its id set to the skip id
 * (`communityFeed/{skipId}`), so a feed doc is valid only while
 * `users/{uid}/skips/{skipId}` still exists. Skips deleted before the delete
 * route cleaned up the feed left rows behind that still render in the activity
 * list and inflate the community totals.
 *
 *   node scripts/prune-community-feed.js          # dry run — reports what would go
 *   node scripts/prune-community-feed.js --write  # actually delete
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

(async () => {
  const feed = await db.collection("communityFeed").get();

  const types = {};
  feed.forEach((d) => { const t = d.data().type || "(unset)"; types[t] = (types[t] || 0) + 1; });
  console.log(`communityFeed: ${feed.size} docs`);
  console.log("  types:", JSON.stringify(types));

  const keep = [];
  const orphans = [];
  for (const d of feed.docs) {
    const { uid } = d.data();
    if (!uid) { orphans.push({ id: d.id, why: "no uid", amount: d.data().skipAmount || 0 }); continue; }
    const skip = await db.collection("users").doc(uid).collection("skips").doc(d.id).get();
    if (skip.exists) keep.push(d.id);
    else orphans.push({ id: d.id, why: "skip deleted", amount: d.data().skipAmount || 0 });
  }

  const orphanAmt = orphans.reduce((s, o) => s + o.amount, 0);
  console.log(`\n  live    : ${keep.length}`);
  console.log(`  orphaned: ${orphans.length} ($${orphanAmt.toFixed(2)})`);
  const byReason = orphans.reduce((a, o) => ({ ...a, [o.why]: (a[o.why] || 0) + 1 }), {});
  console.log("    by reason:", JSON.stringify(byReason));

  if (orphans.length === 0) { console.log("\nNothing to prune."); process.exit(0); }
  if (!process.argv.includes("--write")) {
    console.log("\nDry run — pass --write to delete the orphans.");
    process.exit(0);
  }

  for (let i = 0; i < orphans.length; i += 400) {
    const batch = db.batch();
    orphans.slice(i, i + 400).forEach((o) => batch.delete(db.collection("communityFeed").doc(o.id)));
    await batch.commit();
  }
  console.log(`\n✓ deleted ${orphans.length} orphaned feed docs`);
  process.exit(0);
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
