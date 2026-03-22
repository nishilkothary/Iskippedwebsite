"use client";
import { useAuthStore } from "@/store/authStore";
import { today, yesterday } from "@/lib/utils/dates";

export function useStreak() {
  const { profile } = useAuthStore();
  const streak = profile?.streak ?? 0;
  const lastSkipDate = profile?.lastSkipDate ?? null;
  const skippedToday = lastSkipDate === today();
  const skippedYesterday = lastSkipDate === yesterday();
  const isActive = skippedToday || skippedYesterday;

  return { streak, skippedToday, isActive, longestStreak: profile?.longestStreak ?? 0 };
}
