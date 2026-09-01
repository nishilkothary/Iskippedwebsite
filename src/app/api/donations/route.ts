import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateLoggedAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { parseSubmissionId, replayResult, submissionFingerprint } from "@/lib/services/submissionReceipts";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { UserProfile } from "@/lib/types/models";
import { balancesFromLots, cloneLots, consumeLots, locationKey } from "@/lib/utils/skipLedger";

type DonationSubmissionResult = {
  jarDecrease: number;
  skipBucksDecrease: number;
  outsideContribution: number;
  amountFromSkips: number;
  causeJarBalance: number;
  newTotalDonated: number;
  newTotalDonatedFromSkips: number;
  newCauseDonated: number;
};

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const amount = validateLoggedAmount(body.amount);
    const projectId = validateNonEmptyString(body.projectId, "projectId");
    const projectTitle = validateNonEmptyString(body.projectTitle, "projectTitle");
    const date: string | undefined = typeof body.date === "string" ? body.date : undefined;
    const submissionId = parseSubmissionId(body.submissionId);
    const fingerprint = submissionId
      ? submissionFingerprint("donation", { amount, projectId, projectTitle, date })
      : null;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const donationRef = userRef.collection("donations").doc();
    const receiptRef = submissionId
      ? userRef.collection("submissionReceipts").doc(submissionId)
      : null;

    const result = await db.runTransaction(async (tx) => {
      if (receiptRef && fingerprint) {
        const receiptSnap = await tx.get(receiptRef);
        if (receiptSnap.exists) {
          return {
            replayed: true,
            response: replayResult<DonationSubmissionResult>(receiptSnap.data() as Record<string, unknown>, "donation", fingerprint),
          };
        }
      }
      const userSnap = await tx.get(userRef);
      const profile = userSnap.data() as UserProfile | undefined;
      if (!profile) throw new ApiError(404, "User not found");
      const skipLots = cloneLots(profile);
      const skipBalanceSummary = getSkipBalanceSummary(profile);
      // Never let a stale/corrupt jar field make more Skip Bucks spendable
      // than the account's actual unspent lifetime savings.
      const currentBal = Math.min(
        Math.max(0, profile?.causeJarBalances?.[projectId] ?? 0),
        skipBalanceSummary.availableFromSkips,
      );
      const unassignedSkipBank = skipBalanceSummary.unassignedSkipBank;
      const usableFromSkips = currentBal + unassignedSkipBank;
      const amountFromSkips = Math.min(amount, usableFromSkips);
      const jarDecrease = Math.min(amountFromSkips, currentBal);
      const skipBucksDecrease = Math.max(0, amountFromSkips - jarDecrease);
      const outsideContribution = Math.max(0, amount - amountFromSkips);
      const consumption = consumeLots(skipLots, amountFromSkips, [locationKey({ type: "fundraiser", id: projectId }), "unassigned"]);
      const nextBalances = balancesFromLots(skipLots);
      // The affected personal jar is authoritative from the current profile
      // balance and this transaction's funding breakdown. Rebuilding the
      // whole map from legacy lots can resurrect unrelated stale dollars.
      if (currentBal - jarDecrease > 0) {
        nextBalances.causeJarBalances[projectId] = currentBal - jarDecrease;
      } else {
        delete nextBalances.causeJarBalances[projectId];
      }
      const causeJarBalance = Math.max(0, nextBalances.causeJarBalances[projectId] ?? 0);
      const newTotalDonated = Math.max(0, Number(profile.totalDonated ?? 0)) + amount;
      const newTotalDonatedFromSkips = profile.totalDonatedFromSkips === undefined
        ? Math.max(0, Number(profile.totalDonated ?? 0)) + amountFromSkips
        : Math.max(0, Number(profile.totalDonatedFromSkips)) + amountFromSkips;
      const newCauseDonated = Math.max(0, Number(profile.causeStats?.[projectId]?.donated ?? 0)) + amount;
      const response: DonationSubmissionResult = {
        jarDecrease,
        skipBucksDecrease,
        outsideContribution,
        amountFromSkips,
        causeJarBalance,
        newTotalDonated,
        newTotalDonatedFromSkips,
        newCauseDonated,
      };

      tx.set(donationRef, {
        causeId: projectId,
        causeTitle: projectTitle,
        amount,
        jarDecrease,
        skipBucksDecrease,
        outsideContribution,
        amountFromSkips,
        ledgerConsumption: consumption.consumedByLot,
        ...(date ? { date } : {}),
        donatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        totalDonated: FieldValue.increment(amount),
        totalDonatedFromSkips: profile.totalDonatedFromSkips === undefined
          ? Math.max(0, Number(profile.totalDonated ?? 0)) + amountFromSkips
          : FieldValue.increment(amountFromSkips),
        savedTowardActiveCause: 0,
        causeJarBalances: nextBalances.causeJarBalances,
        goalJarBalances: nextBalances.goalJarBalances,
        skipLots,
        [`causeJarOverflowCounts.${projectId}`]: 0,
        [`causeStats.${projectId}.donated`]: FieldValue.increment(amount),
      });
      tx.set(db.collection("projects").doc(projectId), {
        // A donation moves money out of the fundraiser jars into the
        // completed-donation bucket. Keep the two project totals disjoint.
        totalRaised: FieldValue.increment(-jarDecrease),
        totalDonated: FieldValue.increment(amount),
      }, { merge: true });
      if (receiptRef && fingerprint) {
        tx.set(receiptRef, {
          operation: "donation",
          fingerprint,
          recordId: donationRef.id,
          result: response,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return { replayed: false, response };
    });

    if (!result.replayed) {
      userRef.update({ lastDonationDate: new Date().toISOString().slice(0, 10) }).catch(() => {});
    }

    return NextResponse.json(result.response);
  } catch (e) {
    return handleApiError(e);
  }
}
