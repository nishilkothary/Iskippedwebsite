"use client";
import { useAuthStore } from "@/store/authStore";
import { isPreviousWeek, isSameWeek } from "@/lib/utils/dates";

export function useStreak() {
  const { profile } = useAuthStore();
  const streak = profile?.streak ?? 0;
  const lastSkipDate = profile?.lastSkipDate ?? null;
  const skippedThisWeek = isSameWeek(lastSkipDate);
  const skippedLastWeek = isPreviousWeek(lastSkipDate);
  const isActive = skippedThisWeek || skippedLastWeek;

  return { streak, skippedThisWeek, isActive, longestStreak: profile?.longestStreak ?? 0 };
}
