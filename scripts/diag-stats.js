const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
let keyPath = "";
let dbURL = "";
const env = fs.readFileSync(envPath, "utf-8");
const k = env.match(/FIREBASE_SERVICE_ACCOUNT_PATH\s*=\s*(.+)/);
if (k) keyPath = k[1].trim().replace(/^["']|["']$/g, "");
const u = env.match(/NEXT_PUBLIC_FIREBASE_DATABASE_URL\s*=\s*(.+)/);
if (u) dbURL = u[1].trim().replace(/^["']|["']$/g, "");

initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, "utf-8"))), databaseURL: dbURL });
const db = getFirestore();

(async () => {
  const stats = (await getDatabase().ref("globalStats").get()).val();
  console.log("RTDB globalStats:", JSON.stringify(stats));

  const users = await db.collection("users").get();
  let docSkips = 0, docSaved = 0, profSkips = 0, profSaved = 0;
  const mismatches = [];
  const rows = [];
  for (const user of users.docs) {
    const d = user.data();
    const skips = await user.ref.collection("skips").get();
    let s = 0;
    skips.forEach((x) => { s += x.data().amount || 0; });
    docSkips += skips.size; docSaved += s;
    profSkips += d.totalSkips || 0; profSaved += d.totalSaved || 0;
    rows.push({ name: d.displayName || d.email || user.id, docs: skips.size, prof: d.totalSkips || 0, saved: +s.toFixed(2), created: d.createdAt?.toDate?.()?.toISOString().slice(0, 10) });
    if (skips.size !== (d.totalSkips || 0)) mismatches.push(`${d.email || user.id}: skipDocs=${skips.size} profile.totalSkips=${d.totalSkips || 0}`);
  }

  console.log(`\nusers=${users.size}`);
  console.log(`skip DOCS      : ${docSkips} skips, $${docSaved.toFixed(2)}`);
  console.log(`profile TOTALS : ${profSkips} skips, $${profSaved.toFixed(2)}`);
  console.log(`profile-vs-docs mismatches: ${mismatches.length}`);
  mismatches.forEach((m) => console.log("  " + m));

  const feed = await db.collection("communityFeed").get();
  let feedAmt = 0; const feedUids = new Set();
  feed.forEach((f) => { feedAmt += f.data().skipAmount || 0; feedUids.add(f.data().uid); });
  console.log(`\ncommunityFeed  : ${feed.size} docs, $${feedAmt.toFixed(2)}, ${feedUids.size} distinct uids`);
  const userIds = new Set(users.docs.map((d) => d.id));
  const orphans = [...feedUids].filter((x) => !userIds.has(x));
  console.log(`  feed uids with NO user doc (deleted accounts): ${orphans.length}`);

  let projSkips = 0, projRaised = 0;
  (await db.collection("projects").get()).forEach((p) => {
    projSkips += p.data().totalSkips || 0; projRaised += p.data().totalRaised || 0;
  });
  console.log(`projects       : totalSkips=${projSkips} totalRaised=$${projRaised.toFixed(2)}`);

  console.log("\nper-user (skipDocs desc):");
  rows.sort((a, b) => b.docs - a.docs).filter((r) => r.docs > 0 || r.prof > 0)
    .forEach((r) => console.log(`  ${String(r.docs).padStart(3)} docs | prof ${String(r.prof).padStart(3)} | $${String(r.saved).padStart(8)} | ${r.created} | ${r.name}`));
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
