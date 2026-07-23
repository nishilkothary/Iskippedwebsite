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

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

db.collection("projects").doc("kc").set({
  title: "Chromebooks for Students",
  unitName: "Chromebook",   // singular — renders as "1 Chromebook" / "88% of a Chromebook"
  unitDisplay: "chromebooks", // plural short form for the jar SVG
}, { merge: true })
  .then(() => { console.log("✓ kc updated"); process.exit(0); })
  .catch((e) => { console.error("✗", e.message); process.exit(1); });
