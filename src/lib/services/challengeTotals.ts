import { Firestore } from "firebase-admin/firestore";

export type ChallengeTotalDonation = {
  refPath: string;
  uid: string | null;
  amount: number;
};

export type ChallengeTotals = {
  totalPledged: number;
  totalDonated: number;
  total: number;
  donations: ChallengeTotalDonation[];
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

  const donations = new Map<string, ChallengeTotalDonation>();
  for (const donation of [...causeDonations.docs, ...titleDonations.docs]) {
    const amount = Number(donation.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    donations.set(donation.ref.path, {
      refPath: donation.ref.path,
      uid: donation.ref.parent.parent?.id ?? null,
      amount,
    });
  }

  const donationList = Array.from(donations.values());
  const totalDonated = donationList.reduce((sum, donation) => sum + donation.amount, 0);
  return { totalPledged, totalDonated, total: totalPledged + totalDonated, donations: donationList };
}
