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

      if (delta !== 0 && goalId) {
        const currentBal = profile?.goalJarBalances?.[goalId] ?? 0;
        const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
        if (delta > Math.max(0, currentBal) + unassignedSkipBank) {
          throw new ApiError(400, "Purchase exceeds available skipped savings");
        }
        jarDecreaseDelta = delta > 0
          ? Math.min(delta, Math.max(0, currentBal))
          : delta;
      }

      tx.update(eventRef, {
        amountSaved: newAmountSaved,
        jarDecrease: Math.max(0, oldJarDecrease + jarDecreaseDelta),
      });
      if (delta !== 0) {
        const updates: Record<string, unknown> = { totalSpent: FieldValue.increment(delta) };
        if (goalId && jarDecreaseDelta !== 0) updates[`goalJarBalances.${goalId}`] = FieldValue.increment(-jarDecreaseDelta);
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
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) throw new ApiError(404, "Event not found");
      const event = eventSnap.data() as SpendingHistoryEvent;

      tx.delete(eventRef);
      const updates: Record<string, unknown> = { totalSpent: FieldValue.increment(-event.amountSaved) };
      if (event.goalId) updates[`goalJarBalances.${event.goalId}`] = FieldValue.increment(event.amountSaved);
      tx.update(userRef, updates);
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}
