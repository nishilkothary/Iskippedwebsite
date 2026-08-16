import type { UserProfile } from "@/lib/types/models";

/** Points awarded per dollar actually donated by the user. */
export const POINTS_PER_DOLLAR = 1;

/** Impact Score in points for a given dollar amount donated. */
export function pointsForDollars(dollars: number): number {
  return Math.round(dollars * POINTS_PER_DOLLAR);
}

/** Dollars this user has personally donated to fundraisers. */
export function ownDonatedDollars(profile: Pick<UserProfile, "totalDonated"> | null | undefined): number {
  return profile?.totalDonated ?? 0;
}

/** Dollars pledged by this user's direct invitees, credited to them. */
export function referralPledgedDollars(profile: Pick<UserProfile, "referralImpactPoints"> | null | undefined): number {
  return profile?.referralImpactPoints ?? 0;
}

/**
 * Total Impact Score = points for every dollar you pledge + every dollar a direct invitee pledges.
 * Denominated in impact (dollars → causes), not arbitrary XP.
 */
export function impactScore(profile: Pick<UserProfile, "totalDonated"> | null | undefined): number {
  return pointsForDollars(ownDonatedDollars(profile));
}
