import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { UserProfile } from "@/lib/types/models";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const code = validateNonEmptyString(body.code, "code");

    if (code === uid) throw new ApiError(400, "You can't refer yourself");

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const referrerRef = db.collection("users").doc(code);

    const attributed = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;

      // Immutable — once set (or if this uid was itself referred already), never overwrite.
      if (profile.referredBy) return false;

      const referrerSnap = await tx.get(referrerRef);
      if (!referrerSnap.exists) throw new ApiError(400, "Invalid referral code");

      tx.update(userRef, { referredBy: code });
      return true;
    });

    return NextResponse.json({ attributed });
  } catch (e) {
    return handleApiError(e);
  }
}
