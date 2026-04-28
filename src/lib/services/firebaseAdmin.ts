import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];
  let serviceAccount: object;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf-8"));
  } else {
    throw new Error("No Firebase service account configured");
  }
  return initializeApp({ credential: cert(serviceAccount as any) });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
