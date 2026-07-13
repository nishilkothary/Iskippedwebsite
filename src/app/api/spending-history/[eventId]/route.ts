import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { SpendingHistoryEvent } from "@/lib/types/models";

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

    await db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) throw new ApiError(404, "Event not found");
      const event = eventSnap.data() as SpendingHistoryEvent;
      const delta = newAmountSaved - event.amountSaved;

      tx.update(eventRef, { amountSaved: newAmountSaved });
      if (delta !== 0) tx.update(userRef, { totalSpent: FieldValue.increment(delta) });
    });

    return NextResponse.json({});
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
