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
  const skipCounts = new Map();
  await Promise.all(users.docs.map(async (user) => {
    const skips = await user.ref.collection("skips").get();
    for (const skipDoc of skips.docs) {
      const skip = skipDoc.data();
      const projectId = skip.allocationTarget?.type === "fundraiser"
        ? skip.allocationTarget.id
        : (typeof skip.projectId === "string" ? skip.projectId : "");
      if (projectId) skipCounts.set(projectId, (skipCounts.get(projectId) ?? 0) + 1);
    }
  }));

  for (const projectDoc of projects.docs) {
    const project = projectDoc.data();
    const title = typeof project.title === "string" ? project.title : "";
    const pledged = money(users.docs.reduce((sum, user) => {
      const profile = user.data();
      const lifetimeSaved = Math.max(0, money(profile.totalSaved));
      const spentFromSkips = Math.max(0, money(profile.totalSpent));
      const donatedFromSkips = Math.max(0, money(profile.totalDonatedFromSkips ?? profile.totalDonated));
      const availableFromSkips = Math.max(0, money(lifetimeSaved - spentFromSkips - donatedFromSkips));
      const jarAmount = Math.max(0, money(profile.causeJarBalances?.[projectDoc.id]));
      return sum + Math.min(jarAmount, availableFromSkips);
    }, 0));
    const donated = money(donations
      .filter(({ causeId, causeTitle }) => causeId === projectDoc.id || (!causeId && title && causeTitle === title))
      .reduce((sum, donation) => sum + Math.max(0, money(donation.amount)), 0));
    const oldRaised = money(project.totalRaised);
    const oldDonated = money(project.totalDonated);
    const oldSkips = Math.max(0, Number(project.totalSkips) || 0);
    const totalSkips = skipCounts.get(projectDoc.id) ?? 0;
    if (oldRaised === pledged && oldDonated === donated && oldSkips === totalSkips) continue;
    console.log(`${projectDoc.id} ${title || "(untitled)"}: totalRaised ${oldRaised} -> ${pledged}; totalDonated ${oldDonated} -> ${donated}; totalSkips ${oldSkips} -> ${totalSkips}`);
    if (apply) {
      await projectDoc.ref.set({ totalRaised: pledged, totalDonated: donated, totalSkips }, { merge: true });
    }
  }
  console.log(apply ? "Applied." : "Dry run only. Re-run with --apply to write these fields.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
