// Recalculates totalRaised for all official projects from actual user data.
//
// Run with: node --use-system-ca scripts/recalc-project-totals.js
//
// totalRaised = sum over all users of:
//   causeJarBalances[projectId]   (still in jar, not yet donated)
//   + sum of donations to projectId (from users/{uid}/donations subcollection)
//
// This corrects for skips logged before the project doc existed in Firestore
// (updateDoc would silently fail, leaving totalRaised undercount).

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

// --- Load env ---
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

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  console.log("Reading all users...");
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users.\n`);

  // Accumulate per-project totals
  const totals = {}; // projectId -> { jarBalance: number, donated: number }

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const balances = data.causeJarBalances ?? {};

    // Add jar balances
    for (const [projectId, bal] of Object.entries(balances)) {
      if (!totals[projectId]) totals[projectId] = { jarBalance: 0, donated: 0 };
      totals[projectId].jarBalance += Number(bal) || 0;
    }

    // Add donations from subcollection
    const donationsSnap = await db.collection("users").doc(userDoc.id).collection("donations").get();
    for (const d of donationsSnap.docs) {
      const { causeId, amount } = d.data();
      if (!causeId || !amount) continue;
      if (!totals[causeId]) totals[causeId] = { jarBalance: 0, donated: 0 };
      totals[causeId].donated += Number(amount) || 0;
    }
  }

  console.log("Calculated project totals:");
  for (const [id, { jarBalance, donated }] of Object.entries(totals)) {
    const total = jarBalance + donated;
    console.log(`  ${id}: jar=${jarBalance.toFixed(2)}, donated=${donated.toFixed(2)}, totalRaised=${total.toFixed(2)}`);
  }

  console.log("\nUpdating Firestore project docs...");
  for (const [id, { jarBalance, donated }] of Object.entries(totals)) {
    const total = jarBalance + donated;
    try {
      await db.collection("projects").doc(id).set({ totalRaised: total }, { merge: true });
      console.log(`  ✓ ${id} → totalRaised = $${total.toFixed(2)}`);
    } catch (err) {
      console.log(`  ✗ ${id} — ${err.message}`);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
