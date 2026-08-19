// Run: node --use-system-ca scripts/export-users.js
// Exports all iSkipped user profiles to two CSV files:
//   iskipped-users-YYYY-MM-DD.csv         — one row per user
//   iskipped-cause-balances-YYYY-MM-DD.csv — one row per user × cause
// Open in Excel or Google Sheets.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

// Parse .env.local manually (dotenv may not be installed)
function readEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    raw.split("\n").forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    });
  } catch (_) {}
}
readEnvLocal();

// --- Init Admin SDK ---
const FALLBACK_KEY = "C:\\Users\\nishy\\Documents\\Claude + AI\\Resources\\Iskipped Doc\\iskip-54034-firebase-adminsdk-fbsvc-d297bec768.json";
const keyPath = [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, FALLBACK_KEY]
  .find((p) => p && fs.existsSync(p));

if (!keyPath) {
  console.error("Service account key not found. Check FIREBASE_SERVICE_ACCOUNT_PATH in .env.local");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

// --- Hardcoded fallback names for official project IDs ---
const KNOWN_PROJECT_NAMES = {
  "cfc": "A Student's Education in Cambodia (Caring for Cambodia)",
  "kc": "A Chromebook for A Student In Kenya (Kenya Connect)",
  "kc-library": "A Mobile Library for Schools in Kenya (Kenya Connect)",
  "pop-education": "Educational Opportunities For a Student (Pencils of Promise)",
  "stm-palestine": "Life-Saving Meals in Palestine (Share the Meal)",
  "stm-ukraine": "Emergency Meals in Ukraine (Share the Meal)",
  "stm-syria": "Meals in Syria (Share the Meal)",
  "mc-nets": "Malaria Mosquito Nets (Malaria Consortium)",
};

function escapeCSV(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCSV(fields) {
  return fields.map(escapeCSV).join(",");
}

function formatDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  console.log("Fetching projects...");
  const projectsSnap = await db.collection("projects").get();
  const projectNames = { ...KNOWN_PROJECT_NAMES };
  projectsSnap.forEach((doc) => {
    const d = doc.data();
    const label = d.groupName || d.title || doc.id;
    const sponsor = d.sponsor ? ` (${d.sponsor})` : "";
    projectNames[doc.id] = `${label}${sponsor}`;
  });

  console.log("Fetching users...");
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users.\n`);

  const dateStr = formatDate();

  // --- Sheet 1: User Summary ---
  const summaryHeaders = [
    "UID",
    "Display Name",
    "Email",
    "Active Cause ID",
    "Active Cause Name",
    "Total Saved ($)",
    "Total Give Allocated ($)",
    "Total Donated ($)",
    "Give Jar Balance ($)",
    "Total Live Allocated ($)",
    "Total Spent ($)",
    "Total Skips",
    "Level",
    "Joined Project IDs",
    "Joined Project Names",
  ];

  const summaryRows = [summaryHeaders];
  const balanceRows = [["UID", "Display Name", "Cause ID", "Cause Name", "Balance ($)", "Is Active Cause"]];

  usersSnap.forEach((doc) => {
    const p = doc.data();
    const uid = doc.id;
    const name = p.displayName || p.name || "";
    const email = p.email || "";
    const activeId = p.activeProjectId || "";
    const activeName = activeId ? (projectNames[activeId] || activeId) : "";
    const totalGive = p.totalGiveAllocated ?? 0;
    const totalDonated = p.totalDonated ?? 0;
    const giveBalance = Math.max(0, totalGive - totalDonated);
    const joinedIds = p.joinedProjectIds ?? [];
    const joinedNames = joinedIds.map((id) => projectNames[id] || id).join("; ");

    summaryRows.push([
      uid,
      name,
      email,
      activeId,
      activeName,
      (p.totalSaved ?? 0).toFixed(2),
      totalGive.toFixed(2),
      totalDonated.toFixed(2),
      giveBalance.toFixed(2),
      (p.totalLiveAllocated ?? 0).toFixed(2),
      (p.totalSpent ?? 0).toFixed(2),
      p.totalSkips ?? 0,
      p.level ?? 1,
      joinedIds.join("; "),
      joinedNames,
    ]);

    // Sheet 2: cause balances
    const balances = p.causeJarBalances ?? {};
    for (const [causeId, balance] of Object.entries(balances)) {
      if (!balance && balance !== 0) continue;
      balanceRows.push([
        uid,
        name,
        causeId,
        projectNames[causeId] || causeId,
        Number(balance).toFixed(2),
        causeId === activeId ? "YES" : "no",
      ]);
    }
    // If user has an activeProjectId but no entry in causeJarBalances, still show them
    if (activeId && !(activeId in balances)) {
      balanceRows.push([uid, name, activeId, activeName, "0.00", "YES"]);
    }
  });

  const summaryPath = path.join(process.cwd(), `iskipped-users-${dateStr}.csv`);
  const balancePath = path.join(process.cwd(), `iskipped-cause-balances-${dateStr}.csv`);

  fs.writeFileSync(summaryPath, summaryRows.map(rowToCSV).join("\n"), "utf-8");
  fs.writeFileSync(balancePath, balanceRows.map(rowToCSV).join("\n"), "utf-8");

  console.log(`✓ User summary  → ${summaryPath}  (${summaryRows.length - 1} users)`);
  console.log(`✓ Cause balances → ${balancePath}  (${balanceRows.length - 1} rows)`);
  console.log("\nOpen either file directly in Excel or Google Sheets.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Export failed:", err.message);
  process.exit(1);
});
