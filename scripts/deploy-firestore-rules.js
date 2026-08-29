#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");

const env = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const readEnv = (name) => {
  const match = env.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1].trim().replace(/^["']|["']$/g, "");
};
const projectId = readEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
const credentialsPath = readEnv("FIREBASE_SERVICE_ACCOUNT_PATH");
const shouldApply = process.argv.includes("--apply");

if (!projectId || !credentialsPath) {
  throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH are required");
}

async function main() {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const baseUrl = "https://firebaserules.googleapis.com/v1";
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");

  const currentRelease = await auth.request({
    url: `${baseUrl}/${releaseName}`,
    method: "GET",
  });

  console.log(`Current ruleset: ${currentRelease.data.rulesetName}`);
  if (!shouldApply) {
    console.log("Dry run only. Pass --apply to compile and release firestore.rules.");
    return;
  }

  const created = await auth.request({
    url: `${baseUrl}/projects/${projectId}/rulesets`,
    method: "POST",
    data: {
      source: {
        files: [{ name: "firestore.rules", content: rules }],
      },
    },
  });

  const newRulesetName = created.data.name;
  console.log(`Compiled ruleset: ${newRulesetName}`);

  const updated = await auth.request({
    url: `${baseUrl}/${releaseName}`,
    method: "PATCH",
    data: {
      release: {
        name: releaseName,
        rulesetName: newRulesetName,
      },
      updateMask: "rulesetName",
    },
  });

  if (updated.data.rulesetName !== newRulesetName) {
    throw new Error("Rules release verification failed");
  }
  console.log(`Released Firestore rules: ${updated.data.rulesetName}`);
}

main().catch((error) => {
  const detail = error.response?.data || error.message || error;
  console.error(detail);
  process.exitCode = 1;
});
