import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { UserProfile } from "@/lib/types/models";
import { balancesFromLots, cloneLots, locationKey, transferLots } from "@/lib/utils/skipLedger";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const fromProjectId = validateNonEmptyString(body.fromProjectId, "fromProjectId");
    const toProjectId = validateNonEmptyString(body.toProjectId, "toProjectId");

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const skipLots = cloneLots(profile);
      const bal = Math.max(0, profile.causeJarBalances?.[fromProjectId] ?? 0);
      const destinationBalance = Math.max(0, profile.causeJarBalances?.[toProjectId] ?? 0);
      if (bal <= 0) return;

      transferLots(skipLots, bal, [locationKey({ type: "fundraiser", id: fromProjectId })], locationKey({ type: "fundraiser", id: toProjectId }));
      const nextBalances = balancesFromLots(skipLots);

      tx.update(userRef, {
        causeJarBalances: nextBalances.causeJarBalances,
        goalJarBalances: nextBalances.goalJarBalances,
        skipLots,
      });
      tx.set(db.collection("projects").doc(fromProjectId), { totalRaised: FieldValue.increment(-bal) }, { merge: true });
      tx.set(db.collection("projects").doc(toProjectId), { totalRaised: FieldValue.increment(bal) }, { merge: true });
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
