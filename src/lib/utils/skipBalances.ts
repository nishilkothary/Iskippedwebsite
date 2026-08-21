import { UserProfile } from "@/lib/types/models";

export function sumMoneyRecord(record: Record<string, number> | undefined | null): number {
  if (!record) return 0;
  return Object.values(record).reduce((sum, value) => (
    typeof value === "number" && Number.isFinite(value) ? sum + Math.max(0, value) : sum
  ), 0);
}

/**
 * Balance invariant:
 * Total Skip Bucks = lifetime skips - donations - purchases.
 * In Jars = sum of all fundraiser and reward jar balances.
 * Unassigned Skip Bucks = Total Skip Bucks - In Jars.
 */
export function getSkipBalanceSummary(profile: Pick<UserProfile,
  "totalSaved" | "totalSpent" | "totalDonated" | "causeJarBalances" | "goalJarBalances"
> | null | undefined) {
  const lifetimeSaved = Math.max(0, profile?.totalSaved ?? 0);
  const spentFromSkips = Math.max(0, profile?.totalSpent ?? 0);
  const donatedFromSkips = Math.max(0, profile?.totalDonated ?? 0);
  const fundraiserReady = sumMoneyRecord(profile?.causeJarBalances);
  const goalReady = sumMoneyRecord(profile?.goalJarBalances);
  const assignedToJars = fundraiserReady + goalReady;
  const usedFromSkips = spentFromSkips + donatedFromSkips;
  const availableFromSkips = Math.max(0, lifetimeSaved - usedFromSkips);
  const unassignedSkipBank = Math.max(0, availableFromSkips - assignedToJars);

  return {
    lifetimeSaved,
    spentFromSkips,
    donatedFromSkips,
    fundraiserReady,
    goalReady,
    assignedToJars,
    usedFromSkips,
    availableFromSkips,
    unassignedSkipBank,
  };
}
