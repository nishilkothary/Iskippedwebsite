import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { UserProfile } from "@/lib/types/models";
import { balancesFromLots, cloneLots, consumeLots, locationKey } from "@/lib/utils/skipLedger";

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

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;

      const goals = profile.spendingGoals ?? [];
      const activeId = profile.activeSpendingGoalId ?? null;
      const goal = goals.find((g) => g.id === goalId);
      const label = goal?.label ?? fallbackLabel ?? "";
      const targetAmount = validateAmount(goal?.targetAmount ?? fallbackTargetAmount, "targetAmount");
      const currentBal = Math.max(0, profile.goalJarBalances?.[goalId] ?? 0);
      const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
      const amountSaved = Math.min(currentBal + unassignedSkipBank, targetAmount);
      const jarDecrease = Math.min(amountSaved, currentBal);
      const skipBucksDecrease = Math.max(0, amountSaved - jarDecrease);
      const skipLots = cloneLots(profile);
      const consumption = consumeLots(skipLots, amountSaved, [locationKey({ type: "goal", id: goalId }), "unassigned"]);
      const nextBalances = balancesFromLots(skipLots);

      const newGoals = goals.filter((g) => g.id !== goalId);
      const newActiveId = activeId === goalId ? (newGoals[0]?.id ?? null) : activeId;

      tx.set(historyRef, {
        goalId,
        label,
        targetAmount,
        amountSaved,
        jarDecrease,
        skipBucksDecrease,
        outsideContribution: 0,
        totalAmount: amountSaved,
        ledgerConsumption: consumption.consumedByLot,
        purchasedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        totalSpent: FieldValue.increment(amountSaved),
        goalJarBalances: nextBalances.goalJarBalances,
        causeJarBalances: nextBalances.causeJarBalances,
        skipLots,
        spendingGoals: newGoals,
        activeSpendingGoalId: newActiveId,
        activeSkipTarget: profile.activeSkipTarget?.type === "goal" && profile.activeSkipTarget.id === goalId
          ? null
          : (profile.activeSkipTarget ?? null),
        spendingGoal: null,
      });
      return { amountFromSkips: amountSaved, jarDecrease, skipBucksDecrease };
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
