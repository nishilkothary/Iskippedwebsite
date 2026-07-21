import type { UserProfile } from "@/lib/types/models";

/** Points awarded per dollar pledged to a cause (yours + your invitees'). */
export const POINTS_PER_DOLLAR = 10;

/** Impact Score in points for a given dollar amount pledged. */
export function pointsForDollars(dollars: number): number {
  return Math.round(dollars * POINTS_PER_DOLLAR);
}

/** Dollars this user has personally pledged to causes (the give portion of their skips). */
export function ownPledgedDollars(profile: Pick<UserProfile, "totalGiveAllocated"> | null | undefined): number {
  return profile?.totalGiveAllocated ?? 0;
}

/** Dollars pledged by this user's direct invitees, credited to them. */
export function referralPledgedDollars(profile: Pick<UserProfile, "referralImpactPoints"> | null | undefined): number {
  return profile?.referralImpactPoints ?? 0;
}

/**
 * Total Impact Score = points for every dollar you pledge + every dollar a direct invitee pledges.
 * Denominated in impact (dollars → causes), not arbitrary XP.
 */
export function impactScore(profile: (Pick<UserProfile, "totalGiveAllocated" | "referralImpactPoints">) | null | undefined): number {
  return pointsForDollars(ownPledgedDollars(profile) + referralPledgedDollars(profile));
}
