// One-time migration for the skip-pot rollout.
// Run without --apply for a dry run. Add --apply only after reviewing the report.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

function readEnvLocal() {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

readEnvLocal();
const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
initializeApp({ credential: cert(serviceAccount) });

const namedOverrides = {
  "shravaninanduri@gmail.com": { type: "goal", id: "1775518411938" },
  "lindsay@kenyaconnect.org": { type: "fundraiser", id: "kc" },
};

function summarize(profile) {
  const sum = (record) => Object.values(record || {}).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
  return {
    rewardBalance: Math.round(sum(profile.goalJarBalances) * 100) / 100,
    causeBalance: Math.round(sum(profile.causeJarBalances) * 100) / 100,
    activeSkipTarget: profile.activeSkipTarget ?? null,
    activeProjectId: profile.activeProjectId ?? null,
    activeSpendingGoalId: profile.activeSpendingGoalId ?? null,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getFirestore();
  const snap = await db.collection("users").get();
  const report = [];

  for (const doc of snap.docs) {
    const profile = doc.data();
    const email = String(profile.email || "").toLowerCase();
    const override = namedOverrides[email] || null;
    const before = summarize(profile);
    const updates = override
      ? {
          activeSkipTarget: override,
          activeProjectId: override.type === "fundraiser" ? override.id : null,
          activeSpendingGoalId: override.type === "goal" ? override.id : null,
          savedTowardActiveCause: override.type === "fundraiser"
            ? Math.max(0, Number(profile.causeJarBalances?.[override.id] ?? 0) || 0)
            : 0,
        }
      : {
          activeSkipTarget: null,
          activeProjectId: null,
          activeSpendingGoalId: null,
          savedTowardActiveCause: 0,
          causeJarBalances: {},
          goalJarBalances: {},
        };
    const after = { ...before, ...summarize({ ...profile, ...updates }) };
    report.push({ uid: doc.id, displayName: profile.displayName || profile.name || "", email, override, before, after });
    if (apply) await doc.ref.update(updates);
  }

  console.log(JSON.stringify({ mode: apply ? "APPLIED" : "DRY_RUN", users: report.length, overrides: namedOverrides, report }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
