import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { UserProfile } from "@/lib/types/models";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const newGoalId = validateNonEmptyString(body.newGoalId, "newGoalId");
    const oldGoalId: string | null = typeof body.oldGoalId === "string" ? body.oldGoalId : null;
    const moveFunds = body.moveFunds === true;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const balanceTransfer = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const goals = profile.spendingGoals ?? [];

      const updates: Record<string, unknown> = {
        activeSpendingGoalId: newGoalId,
        spendingGoals: goals,
      };
      let balanceTransfer: Record<string, number> | null = null;
      if (moveFunds && oldGoalId) {
        const oldBal = profile.goalJarBalances?.[oldGoalId] ?? 0;
        if (oldBal > 0) {
          updates[`goalJarBalances.${newGoalId}`] = FieldValue.increment(oldBal);
          updates[`goalJarBalances.${oldGoalId}`] = 0;
          balanceTransfer = { [oldGoalId]: 0, [newGoalId]: oldBal };
        }
      }
      tx.update(userRef, updates);
      return balanceTransfer;
    });

    return NextResponse.json({ balanceTransfer });
  } catch (e) {
    return handleApiError(e);
  }
}
