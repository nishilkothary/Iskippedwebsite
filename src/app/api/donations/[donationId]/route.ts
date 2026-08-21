import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { UserProfile, DonationEvent } from "@/lib/types/models";

type RouteContext = { params: Promise<{ donationId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { donationId } = await ctx.params;
    const body = await req.json();
    const newAmount = body.newAmount;
    if (typeof newAmount !== "number" || newAmount <= 0 || newAmount > 10000) {
      throw new ApiError(400, "Invalid amount");
    }
    const date: string | undefined = typeof body.date === "string" ? body.date : undefined;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const donationRef = userRef.collection("donations").doc(donationId);

    await db.runTransaction(async (tx) => {
      const [donationSnap, userSnap] = await Promise.all([tx.get(donationRef), tx.get(userRef)]);
      if (!donationSnap.exists) throw new ApiError(404, "Donation not found");
      const donation = donationSnap.data() as DonationEvent & { jarDecrease?: number };
      const oldAmount = donation.amount;
      const delta = newAmount - oldAmount;
      if (delta === 0 && date === undefined) return;

      if (delta !== 0) {
        const profile = userSnap.data() as UserProfile;
        const causeId = donation.causeId;
        const currentBal = Math.max(0, profile.causeJarBalances?.[causeId] ?? 0);
        const unassignedSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
        if (delta > currentBal + unassignedSkipBank) {
          throw new ApiError(400, "Donation exceeds available skipped savings");
        }
        const oldJarDecrease = donation.jarDecrease ?? oldAmount;
        const jarDecreaseDelta = delta > 0
          ? Math.min(delta, currentBal)
          : delta;
        const jarDelta = -jarDecreaseDelta;
        tx.update(userRef, {
          totalDonated: FieldValue.increment(delta),
          [`causeJarBalances.${causeId}`]: Math.max(0, currentBal + jarDelta),
        });
        const donationUpdates: Record<string, unknown> = {
          amount: newAmount,
          jarDecrease: Math.max(0, oldJarDecrease + jarDecreaseDelta),
        };
        if (date !== undefined) donationUpdates.date = date;
        tx.update(donationRef, donationUpdates);
      } else {
        const donationUpdates: Record<string, unknown> = { amount: newAmount };
        if (date !== undefined) donationUpdates.date = date;
        tx.update(donationRef, donationUpdates);
      }
    });

    return NextResponse.json({});
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { donationId } = await ctx.params;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const donationRef = userRef.collection("donations").doc(donationId);

    const jarDecrease = await db.runTransaction(async (tx) => {
      const [donationSnap, userSnap] = await Promise.all([tx.get(donationRef), tx.get(userRef)]);
      if (!donationSnap.exists) throw new ApiError(404, "Donation not found");
      const donation = donationSnap.data() as DonationEvent & { jarDecrease?: number };
      const amount = Math.max(0, donation.amount);
      const causeId = donation.causeId;
      const profile = userSnap.data() as UserProfile | undefined;
      const currentBal = Math.max(0, profile?.causeJarBalances?.[causeId] ?? 0);

      tx.delete(donationRef);
      tx.update(userRef, {
        totalDonated: FieldValue.increment(-amount),
        [`causeJarBalances.${causeId}`]: currentBal + amount,
      });

      return amount;
    });

    return NextResponse.json({ jarDecrease });
  } catch (e) {
    return handleApiError(e);
  }
}
