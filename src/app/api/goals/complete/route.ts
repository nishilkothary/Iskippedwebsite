import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { UserProfile } from "@/lib/types/models";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const goalId = validateNonEmptyString(body.goalId, "goalId");
    const fallbackLabel: string | undefined = typeof body.label === "string" ? body.label : undefined;
    const fallbackTargetAmount: number | undefined = typeof body.targetAmount === "number" ? body.targetAmount : undefined;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const historyRef = userRef.collection("spendingHistory").doc();

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;

      const goals = profile.spendingGoals ?? [];
      const activeId = profile.activeSpendingGoalId ?? null;
      const goal = goals.find((g) => g.id === goalId);
      const label = goal?.label ?? fallbackLabel ?? "";
      const targetAmount = goal?.targetAmount ?? fallbackTargetAmount ?? 0;
      const currentBal = profile.goalJarBalances?.[goalId] ?? 0;
      const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
      const amountSaved = Math.min(Math.max(0, currentBal) + unassignedSkipBank, targetAmount);
      const jarDecrease = Math.min(amountSaved, Math.max(0, currentBal));

      const newGoals = goals.filter((g) => g.id !== goalId);
      const newActiveId = activeId === goalId ? (newGoals[0]?.id ?? null) : activeId;

      tx.set(historyRef, {
        goalId,
        label,
        targetAmount,
        amountSaved,
        jarDecrease,
        purchasedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        totalSpent: FieldValue.increment(amountSaved),
        [`goalJarBalances.${goalId}`]: FieldValue.increment(-jarDecrease),
        spendingGoals: newGoals,
        activeSpendingGoalId: newActiveId,
        spendingGoal: null,
      });
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
