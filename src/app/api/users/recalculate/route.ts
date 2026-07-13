import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, handleApiError } from "@/lib/services/apiAuth";
import { normalizeJarSplitServer } from "@/lib/services/serverProfileDefaults";
import { xpForSkip, levelForXp } from "@/lib/utils/xp";
import { Skip } from "@/lib/types/models";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const defaultSplit = normalizeJarSplitServer(body.defaultSplit);

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const skipsSnap = await userRef.collection("skips").get();
    const skips = skipsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Skip));

    const skipTotals = skips.reduce(
      (acc, skip) => {
        const split = skip.jarSplit ?? defaultSplit;
        return {
          totalSaved: acc.totalSaved + skip.amount,
          totalSkips: acc.totalSkips + 1,
          totalGiveAllocated: acc.totalGiveAllocated + skip.amount * (split.give / 100),
          totalLiveAllocated: acc.totalLiveAllocated + skip.amount * (split.live / 100),
          xp: acc.xp + xpForSkip(skip.amount),
        };
      },
      { totalSaved: 0, totalSkips: 0, totalGiveAllocated: 0, totalLiveAllocated: 0, xp: 0 }
    );
    const recalcLevel = levelForXp(skipTotals.xp);

    const donationsSnap = await userRef.collection("donations").get();
    const totalDonated = donationsSnap.docs.reduce((sum, d) => sum + ((d.data().amount as number) ?? 0), 0);

    const spendingSnap = await userRef.collection("spendingHistory").get();
    const totalSpent = spendingSnap.docs.reduce((sum, d) => sum + ((d.data().amountSaved as number) ?? 0), 0);

    const causeJarBalances: Record<string, number> = {};
    skips.forEach((skip) => {
      const split = skip.jarSplit ?? defaultSplit;
      if (skip.projectId) {
        causeJarBalances[skip.projectId] = (causeJarBalances[skip.projectId] ?? 0) + skip.amount * (split.give / 100);
      }
    });
    donationsSnap.docs.forEach((d) => {
      const { causeId, amount: donAmt } = d.data() as { causeId?: string; amount?: number };
      if (causeId) {
        causeJarBalances[causeId] = Math.max(0, (causeJarBalances[causeId] ?? 0) - (donAmt ?? 0));
      }
    });

    const profileSnap = await userRef.get();
    const activeProjectId: string | null = profileSnap.data()?.activeProjectId ?? null;
    const nonActiveIds = Object.keys(causeJarBalances).filter((id) => id !== activeProjectId && causeJarBalances[id] > 0);
    if (nonActiveIds.length > 0) {
      for (const id of nonActiveIds) {
        const projSnap = await db.collection("projects").doc(id).get();
        const projData = projSnap.data();
        const isExpiredChallenge =
          projData?.projectKind === "challenge" &&
          projData?.endDate?.toMillis != null &&
          projData.endDate.toMillis() < Date.now();
        if (!isExpiredChallenge && activeProjectId) {
          causeJarBalances[activeProjectId] = (causeJarBalances[activeProjectId] ?? 0) + causeJarBalances[id];
          causeJarBalances[id] = 0;
        }
      }
    }

    const totals = { ...skipTotals, totalDonated, totalSpent, causeJarBalances, level: recalcLevel };
    await userRef.update(totals);

    return NextResponse.json(totals);
  } catch (e) {
    return handleApiError(e);
  }
}
