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
    const goalId = validateNonEmptyString(body.goalId, "goalId");
    const goalLabel = validateNonEmptyString(body.goalLabel, "goalLabel");
    const targetAmount = typeof body.targetAmount === "number" ? body.targetAmount : 0;
    const amount = validateAmount(body.amount);

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const historyRef = userRef.collection("spendingHistory").doc();

    const jarDecrease = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const profile = userSnap.data() as UserProfile | undefined;
      const currentGoalBal = profile?.goalJarBalances?.[goalId] ?? 0;
      const jarDecrease = Math.min(amount, Math.max(0, currentGoalBal));

      tx.set(historyRef, {
        goalId,
        label: goalLabel,
        targetAmount,
        amountSaved: jarDecrease,
        purchasedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        totalSpent: FieldValue.increment(jarDecrease),
        [`goalJarBalances.${goalId}`]: FieldValue.increment(-jarDecrease),
      });

      return jarDecrease;
    });

    return NextResponse.json({ jarDecrease });
  } catch (e) {
    return handleApiError(e);
  }
}
