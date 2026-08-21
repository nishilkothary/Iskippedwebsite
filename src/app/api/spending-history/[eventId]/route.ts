import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { SpendingHistoryEvent, UserProfile } from "@/lib/types/models";

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
      const goalId = event.goalId;
      const oldJarDecrease = event.jarDecrease ?? event.amountSaved;
      let jarDecreaseDelta = 0;
      let nextGoalBalance: number | null = null;

      if (delta !== 0 && goalId) {
        const currentBal = Math.max(0, profile?.goalJarBalances?.[goalId] ?? 0);
        const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
        if (delta > currentBal + unassignedSkipBank) {
          throw new ApiError(400, "Purchase exceeds available skipped savings");
        }
        jarDecreaseDelta = delta > 0
          ? Math.min(delta, currentBal)
          : delta;
        nextGoalBalance = Math.max(0, currentBal - jarDecreaseDelta);
      }

      tx.update(eventRef, {
        amountSaved: newAmountSaved,
        jarDecrease: Math.max(0, oldJarDecrease + jarDecreaseDelta),
      });
      if (delta !== 0) {
        const updates: Record<string, unknown> = { totalSpent: FieldValue.increment(delta) };
        if (goalId && jarDecreaseDelta !== 0 && nextGoalBalance !== null) updates[`goalJarBalances.${goalId}`] = nextGoalBalance;
        tx.update(userRef, updates);
      }
      return { jarDecrease: Math.max(0, oldJarDecrease + jarDecreaseDelta) };
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

      tx.delete(eventRef);
      const updates: Record<string, unknown> = { totalSpent: FieldValue.increment(-amountSaved) };
      if (event.goalId) {
        updates[`goalJarBalances.${event.goalId}`] = Math.max(0, profile?.goalJarBalances?.[event.goalId] ?? 0) + amountSaved;
      }
      tx.update(userRef, updates);
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
