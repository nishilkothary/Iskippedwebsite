import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { UserProfile, DonationEvent } from "@/lib/types/models";
import { addSkipLot, balancesFromLots, cloneLots, consumeLots, locationKey, reduceConsumedLots, restoreConsumedLots } from "@/lib/utils/skipLedger";

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
      if (delta === 0 && date === undefined) return { causeId: donation.causeId, delta: 0 };

      if (delta !== 0) {
        const profile = userSnap.data() as UserProfile;
        const causeId = donation.causeId;
        const skipLots = profile.skipLots ? cloneLots(profile) : null;
        let nextConsumption = donation.ledgerConsumption;
        let nextBalances = null;
        if (skipLots) {
          if (delta > 0) {
            const consumed = consumeLots(skipLots, delta, [locationKey({ type: "fundraiser", id: causeId }), "unassigned"]);
            nextConsumption = { ...(nextConsumption ?? {}) };
            for (const [skipId, locations] of Object.entries(consumed.consumedByLot)) {
              nextConsumption[skipId] = { ...(nextConsumption[skipId] ?? {}) };
              for (const [location, value] of Object.entries(locations)) nextConsumption[skipId][location] = (nextConsumption[skipId][location] ?? 0) + value;
            }
          } else if (nextConsumption) {
            nextConsumption = reduceConsumedLots(skipLots, nextConsumption, -delta);
          } else {
            addSkipLot(skipLots, `legacy-donation-edit:${donationId}:${Date.now()}`, -delta, { type: "fundraiser", id: causeId });
          }
          nextBalances = balancesFromLots(skipLots);
        }
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
          ...(nextBalances ? { causeJarBalances: nextBalances.causeJarBalances, goalJarBalances: nextBalances.goalJarBalances, skipLots } : { [`causeJarBalances.${causeId}`]: Math.max(0, currentBal + jarDelta) }),
        });
        const donationUpdates: Record<string, unknown> = {
          amount: newAmount,
          jarDecrease: Math.max(0, oldJarDecrease + jarDecreaseDelta),
          ...(nextConsumption ? { ledgerConsumption: nextConsumption } : {}),
        };
        if (date !== undefined) donationUpdates.date = date;
        tx.update(donationRef, donationUpdates);
        tx.set(db.collection("projects").doc(causeId), {
          // Only the portion that came from this fundraiser jar changes the
          // pledged bucket. The rest may have come from the unassigned bank.
          totalRaised: FieldValue.increment(-jarDecreaseDelta),
          totalDonated: FieldValue.increment(delta),
        }, { merge: true });
      } else {
        const donationUpdates: Record<string, unknown> = { amount: newAmount };
        if (date !== undefined) donationUpdates.date = date;
        tx.update(donationRef, donationUpdates);
      }
      return { causeId: donation.causeId, delta };
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

    const result = await db.runTransaction(async (tx) => {
      const [donationSnap, userSnap] = await Promise.all([tx.get(donationRef), tx.get(userRef)]);
      if (!donationSnap.exists) throw new ApiError(404, "Donation not found");
      const donation = donationSnap.data() as DonationEvent & { jarDecrease?: number };
      const amount = Math.max(0, donation.amount);
      const causeId = donation.causeId;
      const profile = userSnap.data() as UserProfile | undefined;
      const currentBal = Math.max(0, profile?.causeJarBalances?.[causeId] ?? 0);
      const skipLots = profile?.skipLots ? cloneLots(profile) : null;
      if (skipLots) {
        if (donation.ledgerConsumption) restoreConsumedLots(skipLots, donation.ledgerConsumption);
        else addSkipLot(skipLots, `legacy-donation-reversal:${donationId}`, amount, { type: "fundraiser", id: causeId });
      }

      tx.delete(donationRef);
      const nextBalances = skipLots ? balancesFromLots(skipLots) : null;
      tx.update(userRef, {
        totalDonated: FieldValue.increment(-amount),
        ...(nextBalances ? { causeJarBalances: nextBalances.causeJarBalances, goalJarBalances: nextBalances.goalJarBalances, skipLots } : { [`causeJarBalances.${causeId}`]: currentBal + amount }),
      });
      tx.set(db.collection("projects").doc(causeId), {
        // Restore the amount that was held in the fundraiser jar. Donations
        // made from the unassigned bank never belonged in totalRaised.
        totalRaised: FieldValue.increment(donation.jarDecrease ?? amount),
        totalDonated: FieldValue.increment(-amount),
      }, { merge: true });

      return { amount, causeId };
    });

    return NextResponse.json({ jarDecrease: result.amount });
  } catch (e) {
    return handleApiError(e);
  }
}
