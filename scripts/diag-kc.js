const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
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
  const kcUsers = [];
  let grandTotal = 0;

  for (const d of usersSnap.docs) {
    const p = d.data();
    const kcBal = p.causeJarBalances?.kc ?? 0;
    const giveAlloc = p.totalGiveAllocated ?? 0;
    const donated = p.totalDonated ?? 0;
    const globalGive = Math.max(0, giveAlloc - donated);
    grandTotal += kcBal;
    if (kcBal > 0 || p.activeProjectId === "kc" || (p.joinedProjectIds ?? []).includes("kc")) {
      kcUsers.push({
        uid: d.id,
        name: p.displayName ?? "(no name)",
        activeProjectId: p.activeProjectId,
        kcJarBal: kcBal,
        globalGiveBal: globalGive,
        allCauseJars: Object.entries(p.causeJarBalances ?? {}).filter(([,v]) => v > 0),
      });
    }
  }

  console.log(`\n=== KC users (active, joined, or non-zero jar) ===`);
  for (const u of kcUsers) {
    console.log(`\n${u.name} (${u.uid.slice(0,8)})`);
    console.log(`  activeProjectId : ${u.activeProjectId}`);
    console.log(`  causeJarBal[kc] : $${u.kcJarBal.toFixed(2)}`);
    console.log(`  globalGiveBal   : $${u.globalGiveBal.toFixed(2)}`);
    if (u.allCauseJars.length) {
      console.log(`  all cause jars  : ${u.allCauseJars.map(([k,v]) => `${k}=$${Number(v).toFixed(2)}`).join(", ")}`);
    }
  }

  console.log(`\n=== Total causeJarBalances[kc] across all users: $${grandTotal.toFixed(2)} ===\n`);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
