// Read-only audit of canonical user subcollections against cached profile
// totals and the provenance ledger. This script never writes Firestore.
const fs = require("fs");
const path = require("path");
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const keyPathMatch = env.match(/^FIREBASE_SERVICE_ACCOUNT_PATH=(.*)$/m);
if (!keyPathMatch) throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is missing from .env.local");
const keyPath = keyPathMatch[1].trim().replace(/^["']|["']$/g, "");
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, "utf8"))) });
const db = getFirestore();
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const differs = (left, right) => Math.abs(money(left) - money(right)) > 0.001;
const sumRecord = (record) => Object.values(record ?? {}).reduce((sum, value) => sum + Math.max(0, money(value)), 0);

(async () => {
  const users = await db.collection("users").get();
  let affectedUsers = 0;
  let issueCount = 0;

  for (const user of users.docs) {
    const profile = user.data();
    const [skips, donations, purchases] = await Promise.all([
      user.ref.collection("skips").get(),
      user.ref.collection("donations").get(),
      user.ref.collection("spendingHistory").get(),
    ]);
    const actualSaved = money(skips.docs.reduce((sum, doc) => sum + Math.max(0, money(doc.get("amount"))), 0));
    const actualDonated = money(donations.docs.reduce((sum, doc) => sum + Math.max(0, money(doc.get("amount"))), 0));
    const actualDonatedFromSkips = money(donations.docs.reduce((sum, doc) => {
      const amount = Math.max(0, money(doc.get("amount")));
      return sum + Math.max(0, money(doc.get("amountFromSkips") ?? amount));
    }, 0));
    const actualSpent = money(purchases.docs.reduce((sum, doc) => sum + Math.max(0, money(doc.get("amountSaved"))), 0));
    const donatedFromSkips = Math.max(0, money(profile.totalDonatedFromSkips ?? profile.totalDonated));
    const available = Math.max(0, money(actualSaved - actualSpent - actualDonatedFromSkips));
    const jarTotal = money(sumRecord(profile.causeJarBalances) + sumRecord(profile.goalJarBalances));
    const ledgerTotal = profile.skipLots
      ? money(Object.values(profile.skipLots).reduce((sum, lot) => sum + sumRecord(lot?.balances), 0))
      : null;

    const issues = [];
    if (Number(profile.totalSkips ?? 0) !== skips.size) issues.push(`totalSkips ${profile.totalSkips ?? 0} != ${skips.size}`);
    if (differs(profile.totalSaved, actualSaved)) issues.push(`totalSaved ${money(profile.totalSaved)} != ${actualSaved}`);
    if (differs(profile.totalDonated, actualDonated)) issues.push(`totalDonated ${money(profile.totalDonated)} != ${actualDonated}`);
    if (profile.totalDonatedFromSkips !== undefined && differs(profile.totalDonatedFromSkips, actualDonatedFromSkips)) {
      issues.push(`totalDonatedFromSkips ${money(profile.totalDonatedFromSkips)} != ${actualDonatedFromSkips}`);
    }
    if (differs(profile.totalSpent, actualSpent)) issues.push(`totalSpent ${money(profile.totalSpent)} != ${actualSpent}`);
    if (jarTotal > available + 0.001) issues.push(`jars ${jarTotal} exceed unspent skips ${available}`);
    if (ledgerTotal !== null && differs(ledgerTotal, available)) issues.push(`skipLots ${ledgerTotal} != unspent skips ${available}`);

    if (issues.length > 0) {
      affectedUsers += 1;
      issueCount += issues.length;
      console.log(`${user.id}: ${issues.join("; ")}`);
    }
  }

  console.log(`Audited ${users.size} users: ${affectedUsers} affected, ${issueCount} issue(s). Read-only; no data changed.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
