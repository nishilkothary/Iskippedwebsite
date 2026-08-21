import { SkipAllocationTarget, UserProfile } from "@/lib/types/models";

/**
 * Resolve the active target for both current profiles and profiles created
 * before activeSkipTarget was introduced.
 */
export function getActiveSkipTarget(
  profile: Pick<
    UserProfile,
    "activeSkipTarget" | "activeProjectId" | "activeSpendingGoalId" | "spendingGoals" | "spendingGoal"
  >,
): SkipAllocationTarget | null {
  if (profile.activeSkipTarget !== undefined) {
    return profile.activeSkipTarget;
  }

  const legacyGoalId = profile.activeSpendingGoalId !== undefined
    ? profile.activeSpendingGoalId
    : profile.spendingGoals?.[0]?.id ?? (profile.spendingGoal ? "legacy" : null);

  if (legacyGoalId) {
    return { type: "goal", id: legacyGoalId };
  }

  return profile.activeProjectId
    ? { type: "fundraiser", id: profile.activeProjectId }
    : null;
}
