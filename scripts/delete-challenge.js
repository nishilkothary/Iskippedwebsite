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

const TITLE_QUERY = "Sravani Group";
const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  const snap = await db.collection("projects").get();
  const matches = snap.docs.filter((d) => {
    const data = d.data();
    return data.title?.toLowerCase().includes(TITLE_QUERY.toLowerCase()) && data.isCustom === true;
  });

  if (matches.length === 0) {
    console.log(`No custom projects found matching "${TITLE_QUERY}".`);
    process.exit(0);
  }

  console.log(`Found ${matches.length} match(es):\n`);
  for (const d of matches) {
    const data = d.data();
    console.log(`  ID:      ${d.id}`);
    console.log(`  Title:   ${data.title}`);
    console.log(`  Created: ${data.createdBy}`);
    console.log(`  Kind:    ${data.projectKind ?? "unknown"}`);
    console.log();
  }

  if (DRY_RUN) {
    console.log("Dry run — nothing deleted. Re-run without --dry-run to delete.");
    process.exit(0);
  }

  for (const d of matches) {
    await db.collection("projects").doc(d.id).delete();
    console.log(`Deleted: ${d.id} ("${d.data().title}")`);
  }

  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
