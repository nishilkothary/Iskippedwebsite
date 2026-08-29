import type { UserProfile } from "@/lib/types/models";

export type JarBalances = {
  causeJarBalances: Record<string, number>;
  goalJarBalances: Record<string, number>;
};

function cleanMoneyRecord(record: Record<string, number> | undefined | null): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record ?? {})
      .map(([id, value]) => [id, Math.max(0, Math.round((Number(value) || 0) * 100) / 100)] as [string, number])
      .filter(([, value]) => value > 0)
  );
}

function targetKey(target: { type: "goal" | "fundraiser"; id: string }) {
  return `${target.type}:${target.id}`;
}

/**
 * Removes an amount of currently-unspent Skip Bucks from aggregate jars.
 *
 * Skip Bucks are fungible after they are transferred/released, so historical
 * skip ownership cannot be reconstructed from jar balances alone. We use the
 * skip's original target first, then the active target, then other jars in
 * stable key order, and finally the unassigned bank. This keeps the accounting
 * invariant true without pretending moved dollars still belong to their
 * original jar.
 */
export function removeUnspentSkipValue(
  profile: Pick<UserProfile, "totalSaved" | "totalSpent" | "totalDonated" | "causeJarBalances" | "goalJarBalances">,
  amount: number,
  preferredTarget?: { type: "goal" | "fundraiser"; id: string } | null,
  activeTarget?: { type: "goal" | "fundraiser"; id: string } | null,
): JarBalances {
  const requested = Math.round(Math.max(0, amount) * 100) / 100;
  const available = Math.round(
    Math.max(0, (profile.totalSaved ?? 0) - Math.max(0, profile.totalSpent ?? 0) - Math.max(0, profile.totalDonated ?? 0)) * 100
  ) / 100;
  if (requested > available + 0.001) {
    throw new Error("This skip's value has already been spent or donated and cannot be deleted safely.");
  }

  const causeJarBalances = cleanMoneyRecord(profile.causeJarBalances);
  const goalJarBalances = cleanMoneyRecord(profile.goalJarBalances);
  const entries: Array<[{ type: "goal" | "fundraiser"; id: string }, number]> = [
    ...Object.entries(goalJarBalances).map(([id, value]) => [{ type: "goal" as const, id }, value] as [{ type: "goal"; id: string }, number]),
    ...Object.entries(causeJarBalances).map(([id, value]) => [{ type: "fundraiser" as const, id }, value] as [{ type: "fundraiser"; id: string }, number]),
  ];
  entries.sort(([a], [b]) => {
    const priority = (target: { type: "goal" | "fundraiser"; id: string }) => (
      preferredTarget && targetKey(target) === targetKey(preferredTarget) ? 0
        : activeTarget && targetKey(target) === targetKey(activeTarget) ? 1
          : 2
    );
    return priority(a) - priority(b) || targetKey(a).localeCompare(targetKey(b));
  });

  let remaining = requested;
  for (const [target, balance] of entries) {
    if (remaining <= 0) break;
    const removed = Math.min(balance, remaining);
    const next = Math.round((balance - removed) * 100) / 100;
    if (target.type === "goal") {
      if (next > 0) goalJarBalances[target.id] = next;
      else delete goalJarBalances[target.id];
    } else {
      if (next > 0) causeJarBalances[target.id] = next;
      else delete causeJarBalances[target.id];
    }
    remaining = Math.round((remaining - removed) * 100) / 100;
  }

  // Any remainder was unassigned and therefore does not need a stored field.
  return { causeJarBalances, goalJarBalances };
}

function sumMoneyRecord(record: Record<string, number> | undefined | null): number {
  if (!record) return 0;
  return Object.values(record).reduce((sum, value) => (
    typeof value === "number" && Number.isFinite(value) ? sum + Math.max(0, value) : sum
  ), 0);
}

/**
 * Balance invariant:
 * Total unspent savings = lifetime skips - donations - purchases.
 * In Jars = sum of all fundraiser and reward jar balances.
 * Skip Bucks = Total unspent savings - In Jars.
 */
export function getSkipBalanceSummary(profile: Pick<UserProfile,
  "totalSaved" | "totalSpent" | "totalDonated" | "totalDonatedFromSkips" | "causeJarBalances" | "goalJarBalances"
> | null | undefined) {
  const lifetimeSaved = Math.max(0, profile?.totalSaved ?? 0);
  const spentFromSkips = Math.max(0, profile?.totalSpent ?? 0);
  // Before outside contributions existed every donation came from skips, so
  // legacy profiles fall back to totalDonated until their first new donation.
  const donatedFromSkips = Math.max(0, profile?.totalDonatedFromSkips ?? profile?.totalDonated ?? 0);
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
