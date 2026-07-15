import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminMessaging } from "@/lib/services/firebaseAdmin";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

const STALE_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

/** Best-effort push send: no-ops silently if the user hasn't opted in or has no tokens. Prunes stale tokens on send failure. */
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  const db = getAdminDb();
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) return;

  const profile = snap.data()!;
  if (!profile.pushOptIn) return;
  const tokens: string[] = profile.fcmTokens ?? [];
  if (tokens.length === 0) return;

  const url = payload.url ?? "/home";
  const response = await getAdminMessaging().sendEachForMulticast({
    tokens,
    data: { title: payload.title, body: payload.body, url },
    webpush: { fcmOptions: { link: url } },
  });

  const staleTokens = response.responses
    .map((r, i) => (!r.success && STALE_TOKEN_ERROR_CODES.has(r.error?.code ?? "") ? tokens[i] : null))
    .filter((t): t is string => t !== null);

  if (staleTokens.length > 0) {
    await userRef.update({ fcmTokens: FieldValue.arrayRemove(...staleTokens) });
  }
}
