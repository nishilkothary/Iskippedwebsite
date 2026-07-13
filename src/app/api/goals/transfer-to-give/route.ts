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
    const goalId = validateNonEmptyString(body.goalId, "goalId");

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;

      const amount = Math.max(0, (profile.totalLiveAllocated ?? 0) - (profile.totalSpent ?? 0));
      if (amount <= 0) return;

      const goals = profile.spendingGoals ?? [];
      const activeGoalId = profile.activeSpendingGoalId ?? null;
      const newGoals = goals.filter((g) => g.id !== goalId);
      const newActiveId = activeGoalId === goalId ? (newGoals[0]?.id ?? null) : activeGoalId;

      tx.update(userRef, {
        totalLiveAllocated: FieldValue.increment(-amount),
        totalGiveAllocated: FieldValue.increment(amount),
        spendingGoals: newGoals,
        activeSpendingGoalId: newActiveId,
      });
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
