import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { UserProfile, DonationEvent } from "@/lib/types/models";
import { addSkipLot, balancesFromLots, cloneLots, restoreConsumedLots } from "@/lib/utils/skipLedger";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";

type RouteContext = { params: Promise<{ donationId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return NextResponse.json({ error: "Donations cannot be edited. Delete and log the corrected donation instead." }, { status: 405 });
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
      const amountFromSkips = Math.max(0, donation.amountFromSkips ?? amount);
      const jarDecrease = Math.max(0, donation.jarDecrease ?? amountFromSkips);
      const skipBucksDecrease = Math.max(0, donation.skipBucksDecrease ?? Math.max(0, amountFromSkips - jarDecrease));
      const causeId = donation.causeId;
      const profile = userSnap.data() as UserProfile | undefined;
      // A stale jar field must not be treated as spendable balance during a
      // rollback. The account-wide unspent total is the hard upper bound.
      const currentBal = Math.min(
        Math.max(0, profile?.causeJarBalances?.[causeId] ?? 0),
        getSkipBalanceSummary(profile).availableFromSkips,
      );
      const skipLots = profile?.skipLots ? cloneLots(profile) : null;
      if (skipLots) {
        if (donation.ledgerConsumption) restoreConsumedLots(skipLots, donation.ledgerConsumption);
        else addSkipLot(skipLots, `legacy-donation-reversal:${donationId}`, amountFromSkips, { type: "fundraiser", id: causeId });
      }

      tx.delete(donationRef);
      const nextBalances = skipLots ? balancesFromLots(skipLots) : null;
      if (nextBalances) {
        // Restore this donation's jar portion explicitly. This prevents a
        // stale/legacy lot from recreating an unrelated larger jar balance.
        if (currentBal + jarDecrease > 0) {
          nextBalances.causeJarBalances[causeId] = currentBal + jarDecrease;
        } else {
          delete nextBalances.causeJarBalances[causeId];
        }
      }
      tx.update(userRef, {
        totalDonated: FieldValue.increment(-amount),
        totalDonatedFromSkips: profile?.totalDonatedFromSkips === undefined
          ? Math.max(0, Number(profile?.totalDonated ?? 0) - amountFromSkips)
          : FieldValue.increment(-amountFromSkips),
        ...(nextBalances ? { causeJarBalances: nextBalances.causeJarBalances, goalJarBalances: nextBalances.goalJarBalances, skipLots } : { [`causeJarBalances.${causeId}`]: currentBal + jarDecrease }),
      });
      tx.set(db.collection("projects").doc(causeId), {
        // Restore the amount that was held in the fundraiser jar. Donations
        // made from the unassigned bank never belonged in totalRaised.
        totalRaised: FieldValue.increment(jarDecrease),
        totalDonated: FieldValue.increment(-amount),
      }, { merge: true });

      return { amount, amountFromSkips, jarDecrease, skipBucksDecrease, causeId };
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
