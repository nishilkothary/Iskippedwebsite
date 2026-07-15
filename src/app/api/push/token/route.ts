import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";

// Registers an FCM device token for the signed-in user and marks them opted in.
export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const token = validateNonEmptyString(body.token, "token");

    await getAdminDb().collection("users").doc(uid).set(
      { fcmTokens: FieldValue.arrayUnion(token), pushOptIn: true },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}

// Opts the user out and clears all registered tokens (v1: single toggle, not per-device).
export async function DELETE(req: NextRequest) {
  try {
    const uid = await requireUid(req);

    await getAdminDb().collection("users").doc(uid).set(
      { fcmTokens: [], pushOptIn: false },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
