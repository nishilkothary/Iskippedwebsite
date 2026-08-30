import type { Firestore } from "firebase-admin/firestore";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import type { UserProfile } from "@/lib/types/models";
import { getFundraiserTitles } from "@/lib/utils/fundraiserDetails";

export type ChallengeTotals = {
  totalPledged: number;
  totalDonated: number;
  total: number;
};

/** Canonical fundraiser accounting: current jar balances plus cause donations. */
export async function getChallengeTotals(
  db: Firestore,
  projectId: string,
  projectTitle?: string,
  previousTitles?: unknown,
): Promise<ChallengeTotals> {
  const titles = getFundraiserTitles({ title: projectTitle, previousTitles });
  const [jarUsers, allDonations] = await Promise.all([
    db.collection("users").where(`causeJarBalances.${projectId}`, ">", 0).get(),
    // A collection-group query without a filter does not require a Firestore
    // index. Filter below so totals work in every deployed environment.
    db.collectionGroup("donations").get(),
  ]);

  const totalPledged = jarUsers.docs.reduce((sum, user) => {
    const amount = Number(user.data().causeJarBalances?.[projectId] ?? 0);
    const availableFromSkips = getSkipBalanceSummary(user.data() as UserProfile).availableFromSkips;
    return sum + (Number.isFinite(amount) && amount > 0 ? Math.min(amount, availableFromSkips) : 0);
  }, 0);

  const donations = new Map<string, number>();
  for (const donation of allDonations.docs) {
    const causeId = donation.get("causeId");
    const matchesCause = causeId === projectId;
    // Older donation records may not have a causeId. Only use the title as a
    // legacy fallback when causeId is actually missing; never let a matching
    // title override a donation explicitly assigned to another cause.
    const matchesLegacyTitle = !causeId && titles.has(donation.get("causeTitle"));
    if (!matchesCause && !matchesLegacyTitle) continue;
    const amount = Number(donation.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    donations.set(donation.ref.path, amount);
  }

  const totalDonated = Array.from(donations.values()).reduce((sum, amount) => sum + amount, 0);
  return { totalPledged, totalDonated, total: totalPledged + totalDonated };
}
