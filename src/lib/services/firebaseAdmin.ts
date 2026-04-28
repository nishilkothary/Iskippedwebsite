import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not set");
  const serviceAccount = JSON.parse(fs.readFileSync(path, "utf-8"));
  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
