// One-time script: for each user with an active project, move all orphaned
// cause jar balances (from non-active causes) into their active cause jar.
// Also updates project.totalRaised accordingly.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
let keyPath = "C:\\Users\\nishy\\Documents\\Claude + AI\\Resources\\Iskipped Doc\\iskip-54034-firebase-adminsdk-fbsvc-d297bec768.json";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  const match = env.match(/FIREBASE_SERVICE_ACCOUNT_PATH\s*=\s*(.+)/);
  if (match) {
    const candidate = match[1].trim().replace(/^["']|["']$/g, "");
    if (fs.existsSync(candidate)) keyPath = candidate;
  }
}

initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, "utf-8"))) });
const db = getFirestore();

async function run() {
  const usersSnap = await db.collection("users").get();
  let moved = 0;

  for (const d of usersSnap.docs) {
    const p = d.data();
    const activeId = p.activeProjectId;
    if (!activeId) continue;
    const jars = p.causeJarBalances ?? {};
    const orphans = Object.entries(jars).filter(([id, bal]) => id !== activeId && Number(bal) > 0);
    if (!orphans.length) continue;

    const totalOrphaned = orphans.reduce((sum, [, bal]) => sum + Number(bal), 0);
    const updates = { [`causeJarBalances.${activeId}`]: FieldValue.increment(totalOrphaned) };
    for (const [id] of orphans) updates[`causeJarBalances.${id}`] = 0;

    await db.collection("users").doc(d.id).update(updates);
    console.log(`✓ ${p.displayName ?? d.id}: moved $${totalOrphaned.toFixed(2)} from [${orphans.map(([id]) => id).join(", ")}] → ${activeId}`);
    moved += totalOrphaned;

    // Update project totals
    for (const [id, bal] of orphans) {
      await db.collection("projects").doc(id).set({ totalRaised: FieldValue.increment(-Number(bal)) }, { merge: true }).catch(() => {});
    }
    await db.collection("projects").doc(activeId).set({ totalRaised: FieldValue.increment(totalOrphaned) }, { merge: true }).catch(() => {});
  }

  console.log(`\nDone. Total moved: $${moved.toFixed(2)}`);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
