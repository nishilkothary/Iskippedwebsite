import { getAdminRtdb } from "@/lib/services/firebaseAdmin";

/**
 * Adjusts the sitewide counters in Realtime DB. Server-only — `globalStats` is
 * world-readable but not world-writable (see database.rules.json).
 *
 * Every write path that changes a skip must call this (log / edit / delete),
 * otherwise the counters drift upward and stop matching the real totals.
 * Best-effort: a failure here never fails the caller's request.
 */
export async function adjustGlobalStats(savedDelta: number, skipsDelta: number): Promise<void> {
  if (savedDelta === 0 && skipsDelta === 0) return;
  try {
    await getAdminRtdb().ref("globalStats").transaction((current) => {
      if (!current) {
        return { totalSaved: Math.max(0, savedDelta), totalSkips: Math.max(0, skipsDelta), totalUsers: 0 };
      }
      return {
        ...current,
        totalSaved: Math.max(0, (current.totalSaved || 0) + savedDelta),
        totalSkips: Math.max(0, (current.totalSkips || 0) + skipsDelta),
      };
    });
  } catch {
    // Non-critical — a resync can be run with scripts/resync-global-stats.js
  }
}
