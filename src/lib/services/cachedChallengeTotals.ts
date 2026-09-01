import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { getChallengeTotals } from "@/lib/services/challengeTotals";

export const CHALLENGE_TOTALS_REVALIDATE_SECONDS = 15;
export const PUBLIC_CHALLENGE_TOTALS_CACHE_CONTROL = "public, s-maxage=15, stale-while-revalidate=30";

/** Caches only the result; getChallengeTotals remains the sole accounting formula. */
export const getCachedChallengeTotals = unstable_cache(
  async (projectId: string, projectTitle?: string, previousTitles?: unknown) => (
    getChallengeTotals(getAdminDb(), projectId, projectTitle, previousTitles)
  ),
  ["canonical-challenge-totals-v1"],
  { revalidate: CHALLENGE_TOTALS_REVALIDATE_SECONDS },
);
