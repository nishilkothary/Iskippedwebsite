import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, handleApiError } from "@/lib/services/apiAuth";
import { validateAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { UserProfile } from "@/lib/types/models";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const amount = validateAmount(body.amount);
    const projectId = validateNonEmptyString(body.projectId, "projectId");
    const projectTitle = validateNonEmptyString(body.projectTitle, "projectTitle");
    const date: string | undefined = typeof body.date === "string" ? body.date : undefined;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const donationRef = userRef.collection("donations").doc();

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const profile = userSnap.data() as UserProfile | undefined;
      const currentBal = profile?.causeJarBalances?.[projectId] ?? 0;
      const jarDecrease = Math.min(amount, Math.max(0, currentBal));

      tx.set(donationRef, {
        causeId: projectId,
        causeTitle: projectTitle,
        amount,
        jarDecrease,
        ...(date ? { date } : {}),
        donatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        totalDonated: FieldValue.increment(amount),
        savedTowardActiveCause: 0,
        [`causeJarBalances.${projectId}`]: FieldValue.increment(-jarDecrease),
        [`causeJarOverflowCounts.${projectId}`]: 0,
      });
    });

    db.collection("projects").doc(projectId).update({ totalDonated: FieldValue.increment(amount) }).catch(() => {});
    userRef.update({ lastDonationDate: new Date().toISOString().slice(0, 10) }).catch(() => {});

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
