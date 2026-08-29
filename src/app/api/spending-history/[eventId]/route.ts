import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { SpendingHistoryEvent, UserProfile } from "@/lib/types/models";
import { addSkipLot, balancesFromLots, cloneLots, consumeLots, locationKey, reduceConsumedLots, restoreConsumedLots } from "@/lib/utils/skipLedger";

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { eventId } = await ctx.params;
    const body = await req.json();
    const newAmountSaved = body.newAmountSaved;
    if (typeof newAmountSaved !== "number" || newAmountSaved <= 0 || newAmountSaved > 10000) {
      throw new ApiError(400, "Invalid amount");
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const eventRef = userRef.collection("spendingHistory").doc(eventId);

    const result = await db.runTransaction(async (tx) => {
      const [eventSnap, userSnap] = await Promise.all([tx.get(eventRef), tx.get(userRef)]);
      if (!eventSnap.exists) throw new ApiError(404, "Event not found");
      const event = eventSnap.data() as SpendingHistoryEvent;
      const delta = newAmountSaved - event.amountSaved;
      const profile = userSnap.data() as UserProfile | undefined;
      if (!profile) throw new ApiError(404, "User not found");
      const goalId = event.goalId;
      const ledgerAware = Boolean(profile.skipLots);
      const skipLots = ledgerAware ? cloneLots(profile) : null;
      let nextConsumption = event.ledgerConsumption;
      let nextBalances = null;
      if (skipLots && goalId && delta !== 0) {
        if (delta > 0) {
          const consumed = consumeLots(skipLots, delta, [locationKey({ type: "goal", id: goalId }), "unassigned"]);
          nextConsumption = { ...(nextConsumption ?? {}) };
          for (const [skipId, locations] of Object.entries(consumed.consumedByLot)) {
            nextConsumption[skipId] = { ...(nextConsumption[skipId] ?? {}) };
            for (const [location, value] of Object.entries(locations)) nextConsumption[skipId][location] = (nextConsumption[skipId][location] ?? 0) + value;
          }
        } else if (nextConsumption) {
          nextConsumption = reduceConsumedLots(skipLots, nextConsumption, -delta);
        } else {
          addSkipLot(skipLots, `legacy-purchase-edit:${eventId}:${Date.now()}`, -delta, { type: "goal", id: goalId });
        }
        nextBalances = balancesFromLots(skipLots);
      }
      const oldJarDecrease = event.jarDecrease ?? event.amountSaved;
      let jarDecreaseDelta = 0;
      let nextGoalBalance: number | null = null;

      if (delta !== 0 && goalId) {
        const currentBal = Math.max(0, profile?.goalJarBalances?.[goalId] ?? 0);
        const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
        if (delta > currentBal + unassignedSkipBank) {
          throw new ApiError(400, "Purchase exceeds available skipped savings");
        }
        if (nextBalances) {
          nextGoalBalance = Math.max(0, nextBalances.goalJarBalances[goalId] ?? 0);
          jarDecreaseDelta = currentBal - nextGoalBalance;
        } else {
          jarDecreaseDelta = delta > 0
            ? Math.min(delta, currentBal)
            : Math.max(delta, -oldJarDecrease);
          nextGoalBalance = Math.max(0, currentBal - jarDecreaseDelta);
        }
      }

      const nextJarDecrease = Math.max(0, oldJarDecrease + jarDecreaseDelta);
      const nextSkipBucksDecrease = Math.max(0, newAmountSaved - nextJarDecrease);
      const outsideContribution = Math.max(0, event.outsideContribution ?? 0);
      tx.update(eventRef, {
        amountSaved: newAmountSaved,
        totalAmount: newAmountSaved + outsideContribution,
        jarDecrease: nextJarDecrease,
        skipBucksDecrease: nextSkipBucksDecrease,
        ...(nextConsumption ? { ledgerConsumption: nextConsumption } : {}),
      });
      if (delta !== 0) {
        const updates: Record<string, unknown> = { totalSpent: FieldValue.increment(delta) };
        if (nextBalances && skipLots) {
          updates.goalJarBalances = nextBalances.goalJarBalances;
          updates.causeJarBalances = nextBalances.causeJarBalances;
          updates.skipLots = skipLots;
        } else if (goalId && jarDecreaseDelta !== 0 && nextGoalBalance !== null) updates[`goalJarBalances.${goalId}`] = nextGoalBalance;
        tx.update(userRef, updates);
      }
      return { jarDecrease: nextJarDecrease, goalBalance: nextGoalBalance };
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { eventId } = await ctx.params;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const eventRef = userRef.collection("spendingHistory").doc(eventId);

    await db.runTransaction(async (tx) => {
      const [eventSnap, userSnap] = await Promise.all([tx.get(eventRef), tx.get(userRef)]);
      if (!eventSnap.exists) throw new ApiError(404, "Event not found");
      const event = eventSnap.data() as SpendingHistoryEvent;
      const amountSaved = Math.max(0, event.amountSaved);
      const profile = userSnap.data() as UserProfile | undefined;
      if (!profile) throw new ApiError(404, "User not found");
      const skipLots = profile?.skipLots ? cloneLots(profile) : null;
      if (skipLots) {
        if (event.ledgerConsumption) restoreConsumedLots(skipLots, event.ledgerConsumption);
        else if (event.goalId) addSkipLot(skipLots, `legacy-purchase-reversal:${eventId}`, amountSaved, { type: "goal", id: event.goalId });
      }

      tx.delete(eventRef);
      const updates: Record<string, unknown> = { totalSpent: FieldValue.increment(-amountSaved) };
      if (skipLots) {
        const nextBalances = balancesFromLots(skipLots);
        updates.goalJarBalances = nextBalances.goalJarBalances;
        updates.causeJarBalances = nextBalances.causeJarBalances;
        updates.skipLots = skipLots;
      } else if (event.goalId) {
        updates[`goalJarBalances.${event.goalId}`] = Math.max(0, profile?.goalJarBalances?.[event.goalId] ?? 0) + amountSaved;
      }
      tx.update(userRef, updates);
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
