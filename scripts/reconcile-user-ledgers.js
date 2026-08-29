// Rebuilds only inconsistent skipLots maps from canonical aggregate balances.
// Dry-run by default; pass --apply to write. A local JSON backup is created
// before any production document changes.
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
const apply = process.argv.includes("--apply");
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const sumRecord = (record) => Object.values(record ?? {}).reduce((sum, value) => sum + Math.max(0, money(value)), 0);
const ledgerTotal = (lots) => money(Object.values(lots ?? {}).reduce((sum, lot) => sum + sumRecord(lot?.balances), 0));

function availableFromSkips(profile) {
  const donated = profile.totalDonatedFromSkips ?? profile.totalDonated ?? 0;
  return Math.max(0, money(money(profile.totalSaved) - money(profile.totalSpent) - money(donated)));
}

function rebuiltLots(profile, available) {
  const lots = {};
  let remaining = available;
  const add = (id, location, requested) => {
    const amount = Math.min(Math.max(0, money(requested)), remaining);
    if (amount <= 0) return;
    lots[id] = { skipId: id, createdAtMs: 0, originalLocation: location, balances: { [location]: amount } };
    remaining = money(remaining - amount);
  };
  for (const [id, amount] of Object.entries(profile.goalJarBalances ?? {})) add(`reconciled:goal:${id}`, `goal:${id}`, amount);
  for (const [id, amount] of Object.entries(profile.causeJarBalances ?? {})) add(`reconciled:fundraiser:${id}`, `fundraiser:${id}`, amount);
  add("reconciled:unassigned", "unassigned", remaining);
  return lots;
}

(async () => {
  const users = await db.collection("users").get();
  const changes = [];
  for (const user of users.docs) {
    const profile = user.data();
    if (!profile.skipLots) continue;
    const available = availableFromSkips(profile);
    const currentTotal = ledgerTotal(profile.skipLots);
    if (Math.abs(currentTotal - available) <= 0.001) continue;
    const jarTotal = money(sumRecord(profile.goalJarBalances) + sumRecord(profile.causeJarBalances));
    if (jarTotal > available + 0.001) {
      console.log(`${user.id}: skipped because jars ${jarTotal} exceed available ${available}`);
      continue;
    }
    const nextLots = rebuiltLots(profile, available);
    changes.push({ uid: user.id, oldSkipLots: profile.skipLots, nextLots, currentTotal, available });
    console.log(`${user.id}: skipLots ${currentTotal} -> ${available}`);
  }

  if (!apply) {
    console.log(`Dry run only: ${changes.length} user ledger(s) would be repaired.`);
    return;
  }

  if (changes.length > 0) {
    const backupDir = path.join(__dirname, "../outputs/accounting-backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `skip-lots-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changes.map(({ uid, oldSkipLots, currentTotal, available }) => ({ uid, currentTotal, available, oldSkipLots })), null, 2));
    console.log(`Backup written to ${backupPath}`);
  }

  for (const change of changes) {
    const ref = db.collection("users").doc(change.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`User ${change.uid} no longer exists`);
      const profile = snap.data();
      const available = availableFromSkips(profile);
      if (Math.abs(ledgerTotal(profile.skipLots) - available) <= 0.001) return;
      const jarTotal = money(sumRecord(profile.goalJarBalances) + sumRecord(profile.causeJarBalances));
      if (jarTotal > available + 0.001) throw new Error(`User ${change.uid} changed during reconciliation`);
      tx.update(ref, { skipLots: rebuiltLots(profile, available) });
    });
  }
  console.log(`Applied ${changes.length} ledger repair(s).`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
