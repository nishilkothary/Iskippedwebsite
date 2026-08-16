import { UserProfile } from "@/lib/types/models";

export function sumMoneyRecord(record: Record<string, number> | undefined | null): number {
  if (!record) return 0;
  return Object.values(record).reduce((sum, value) => (
    typeof value === "number" && Number.isFinite(value) ? sum + Math.max(0, value) : sum
  ), 0);
}

/**
 * Lifetime score stays motivational. Available is the money not already spent
 * on goals or turned into actual donations.
 */
export function getSkipBalanceSummary(profile: Pick<UserProfile,
  "totalSaved" | "totalSpent" | "totalDonated" | "causeJarBalances"
> | null | undefined) {
  const lifetimeSaved = Math.max(0, profile?.totalSaved ?? 0);
  const spentFromSkips = Math.max(0, profile?.totalSpent ?? 0);
  const donatedFromSkips = Math.max(0, profile?.totalDonated ?? 0);
  const fundraiserReady = sumMoneyRecord(profile?.causeJarBalances);
  const usedFromSkips = spentFromSkips + donatedFromSkips;
  const availableFromSkips = Math.max(0, lifetimeSaved - usedFromSkips);

  return {
    lifetimeSaved,
    spentFromSkips,
    donatedFromSkips,
    fundraiserReady,
    usedFromSkips,
    availableFromSkips,
  };
}
