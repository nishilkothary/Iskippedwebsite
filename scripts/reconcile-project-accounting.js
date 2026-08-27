// Reconciles historical project counters from the canonical user jar and
// donation records. Dry-run by default; add --apply to write Firestore.
const fs = require("fs");
const path = require("path");
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const keyPath = env.match(/^FIREBASE_SERVICE_ACCOUNT_PATH=(.*)$/m)[1].trim();
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, "utf8"))) });
const db = getFirestore();
const apply = process.argv.includes("--apply");
const money = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;

(async () => {
  const [projects, users, donationDocs] = await Promise.all([
    db.collection("projects").get(),
    db.collection("users").get(),
    db.collectionGroup("donations").get(),
  ]);
  const donations = donationDocs.docs.map((doc) => ({ doc, ...doc.data() }));

  for (const projectDoc of projects.docs) {
    const project = projectDoc.data();
    const title = typeof project.title === "string" ? project.title : "";
    const pledged = money(users.docs.reduce((sum, user) => sum + Math.max(0, money(user.data().causeJarBalances?.[projectDoc.id])), 0));
    const donated = money(donations
      .filter(({ causeId, causeTitle }) => causeId === projectDoc.id || (!causeId && title && causeTitle === title))
      .reduce((sum, donation) => sum + Math.max(0, money(donation.amount)), 0));
    const oldRaised = money(project.totalRaised);
    const oldDonated = money(project.totalDonated);
    if (oldRaised === pledged && oldDonated === donated) continue;
    console.log(`${projectDoc.id} ${title || "(untitled)"}: totalRaised ${oldRaised} -> ${pledged}; totalDonated ${oldDonated} -> ${donated}`);
    if (apply) {
      await projectDoc.ref.set({ totalRaised: pledged, totalDonated: donated }, { merge: true });
    }
  }
  console.log(apply ? "Applied." : "Dry run only. Re-run with --apply to write these fields.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
