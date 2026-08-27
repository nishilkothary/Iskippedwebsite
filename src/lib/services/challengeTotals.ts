import type { Firestore } from "firebase-admin/firestore";

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
): Promise<ChallengeTotals> {
  const [jarUsers, causeDonations, titleDonations] = await Promise.all([
    db.collection("users").where(`causeJarBalances.${projectId}`, ">", 0).get(),
    db.collectionGroup("donations").where("causeId", "==", projectId).get(),
    projectTitle
      ? db.collectionGroup("donations").where("causeTitle", "==", projectTitle).get()
      : Promise.resolve({ docs: [] }),
  ]);

  const totalPledged = jarUsers.docs.reduce((sum, user) => {
    const amount = Number(user.data().causeJarBalances?.[projectId] ?? 0);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  const donations = new Map<string, number>();
  for (const donation of [...causeDonations.docs, ...titleDonations.docs]) {
    const amount = Number(donation.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    donations.set(donation.ref.path, amount);
  }

  const totalDonated = Array.from(donations.values()).reduce((sum, amount) => sum + amount, 0);
  return { totalPledged, totalDonated, total: totalPledged + totalDonated };
}
