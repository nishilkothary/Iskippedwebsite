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
    const goalLabel = validateNonEmptyString(body.goalLabel, "goalLabel");
    const targetAmount = typeof body.targetAmount === "number" ? body.targetAmount : 0;
    const amount = validateAmount(body.amount);

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const historyRef = userRef.collection("spendingHistory").doc();

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const profile = userSnap.data() as UserProfile | undefined;
      if (!profile) throw new ApiError(404, "User not found");
      const skipLots = cloneLots(profile);
      const currentBal = Math.max(0, profile?.goalJarBalances?.[goalId] ?? 0);
      const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
      const usableFromSkips = currentBal + unassignedSkipBank;
      if (amount > usableFromSkips) {
        throw new ApiError(400, "Purchase exceeds available skipped savings");
      }
      const amountFromSkips = Math.min(amount, usableFromSkips);
      const jarDecrease = Math.min(amountFromSkips, currentBal);
      const consumption = consumeLots(skipLots, amountFromSkips, [locationKey({ type: "goal", id: goalId }), "unassigned"]);
      const nextBalances = balancesFromLots(skipLots);

      tx.set(historyRef, {
        goalId,
        label: goalLabel,
        targetAmount,
        amountSaved: amountFromSkips,
        jarDecrease,
        ledgerConsumption: consumption.consumedByLot,
        purchasedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        totalSpent: FieldValue.increment(amountFromSkips),
        goalJarBalances: nextBalances.goalJarBalances,
        causeJarBalances: nextBalances.causeJarBalances,
        skipLots,
      });

      return { amountFromSkips, jarDecrease };
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
