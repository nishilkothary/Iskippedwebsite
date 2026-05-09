"use client";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSkipStore } from "@/store/skipStore";
import { subscribeToSkips, logSkip, LogSkipParams, updateSkip as firebaseUpdateSkip, deleteSkip as firebaseDeleteSkip } from "@/lib/services/firebase/skips";
import { normalizeJarSplit, normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { recordDonation, subscribeToDonations, updateDonation as firebaseUpdateDonation, deleteDonation as firebaseDeleteDonation } from "@/lib/services/firebase/users";
import { deleteCommunityFeedItem, updateCommunityFeedItem } from "@/lib/services/firebase/social";
import { DEMO_MODE } from "@/lib/constants/demo";
import { today } from "@/lib/utils/dates";
import { getImpactMessage } from "@/lib/constants/impactMessages";
import { xpForSkip, levelForXp } from "@/lib/utils/xp";
import { Skip, DonationEvent } from "@/lib/types/models";

export function useSkips() {
  const { user, profile, updateProfile } = useAuthStore();
  const { recentSkips, isLogging, setRecentSkips, setLogging, addSkip, updateSkip: storeUpdateSkip, removeSkip } = useSkipStore();
  const [donations, setDonations] = useState<DonationEvent[]>([]);

  useEffect(() => {
    if (DEMO_MODE || !user) return;
    const unsub = subscribeToSkips(user.uid, setRecentSkips);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (DEMO_MODE || !user) return;
    const unsub = subscribeToDonations(user.uid, setDonations);
    return unsub;
  }, [user?.uid]);

  async function log(params: Omit<LogSkipParams, "uid" | "currentTotalSaved" | "currentTotalSkips" | "currentXp" | "currentStreak" | "currentLongestStreak" | "lastSkipDate" | "savedTowardActiveCause" | "defaultJarSplit" | "activeGoalId" | "causeJarBalance" | "causeJarOverflowCount">) {
    if (!user || !profile) return null;
    setLogging(true);
    const defaultJarSplit = normalizeJarSplit(profile.jarSplit as any);
    const effectiveSplit = params.jarSplit ?? defaultJarSplit;
    const activeGoalId = normalizeSpendingGoals(profile).activeId;
    const giveAmount = params.amount * (effectiveSplit.give / 100);
    const liveAmount = params.amount * (effectiveSplit.live / 100);
    const causeJarBalance = profile.causeJarBalances?.[params.projectId ?? ""] ?? 0;
    const causeJarOverflowCount = profile.causeJarOverflowCounts?.[params.projectId ?? ""] ?? 0;
    try {
      const result = await logSkip({
        ...params,
        uid: user.uid,
        currentTotalSaved: profile.totalSaved,
        currentTotalSkips: profile.totalSkips,
        currentXp: profile.xp,
        currentStreak: profile.streak,
        currentLongestStreak: profile.longestStreak,
        lastSkipDate: profile.lastSkipDate,
        savedTowardActiveCause: profile.savedTowardActiveCause,
        defaultJarSplit,
        displayName: user.displayName || profile.displayName,
        photoURL: user.photoURL || profile.photoURL || undefined,
        activeGoalId,
        causeJarBalance,
        causeJarOverflowCount,
      });
      if (result) {
        updateProfile({
          totalSaved: profile.totalSaved + params.amount,
          totalSkips: profile.totalSkips + 1,
          totalGiveAllocated: (profile.totalGiveAllocated ?? 0) + giveAmount,
          totalLiveAllocated: (profile.totalLiveAllocated ?? 0) + liveAmount,
          causeJarBalances: params.projectId
            ? { ...profile.causeJarBalances, [params.projectId]: (profile.causeJarBalances?.[params.projectId] ?? 0) + giveAmount }
            : profile.causeJarBalances,
          goalJarBalances: activeGoalId
            ? { ...profile.goalJarBalances, [activeGoalId]: (profile.goalJarBalances?.[activeGoalId] ?? 0) + liveAmount }
            : profile.goalJarBalances,
          ...(result.giveJarOverflowCount !== undefined && params.projectId
            ? { causeJarOverflowCounts: { ...(profile.causeJarOverflowCounts ?? {}), [params.projectId]: result.giveJarOverflowCount } }
            : {}),
        });
      }
      return result;
    } finally {
      setLogging(false);
    }
  }

  async function donate(amount: number, projectId: string, projectTitle: string, date?: string): Promise<void> {
    if (!user || !profile) return;
    await recordDonation(user.uid, amount, projectId, projectTitle, date);
    const prevDonated = profile.causeStats?.[projectId]?.donated ?? 0;
    const prevJarBal = profile.causeJarBalances?.[projectId] ?? 0;
    updateProfile({
      totalDonated: profile.totalDonated + amount,
      causeStats: { ...profile.causeStats, [projectId]: { donated: prevDonated + amount } },
      causeJarBalances: { ...profile.causeJarBalances, [projectId]: Math.max(0, prevJarBal - amount) },
      causeJarOverflowCounts: { ...(profile.causeJarOverflowCounts ?? {}), [projectId]: 0 },
    });
  }

  async function edit(
    skip: Skip,
    updates: Partial<Pick<Skip, "category" | "categoryLabel" | "categoryEmoji" | "amount" | "projectId" | "projectTitle" | "whatSkipped" | "notes" | "jarSplit">>
  ): Promise<void> {
    if (!user || !profile) return;
    const oldAmount = skip.amount;
    const newAmount = updates.amount ?? oldAmount;
    const amountDelta = newAmount - oldAmount;
    const oldSplit = skip.jarSplit ?? normalizeJarSplit(profile.jarSplit as any);
    const newSplit = updates.jarSplit ?? oldSplit;
    // Full reallocation: compare old (amount × old split) vs new (amount × new split)
    const oldGiveAlloc = oldAmount * (oldSplit.give / 100);
    const newGiveAlloc = newAmount * (newSplit.give / 100);
    const oldLiveAlloc = oldAmount * (oldSplit.live / 100);
    const newLiveAlloc = newAmount * (newSplit.live / 100);
    const giveAllocDelta = newGiveAlloc - oldGiveAlloc;
    const liveAllocDelta = newLiveAlloc - oldLiveAlloc;
    await firebaseUpdateSkip(user.uid, skip.id, updates, amountDelta, giveAllocDelta, liveAllocDelta);
    storeUpdateSkip(skip.id, updates);
    if (amountDelta !== 0 || giveAllocDelta !== 0 || liveAllocDelta !== 0) {
      updateProfile({
        totalSaved: profile.totalSaved + amountDelta,
        totalGiveAllocated: Math.max(0, (profile.totalGiveAllocated ?? 0) + giveAllocDelta),
        totalLiveAllocated: Math.max(0, (profile.totalLiveAllocated ?? 0) + liveAllocDelta),
      });
      // Sync community feed only if amount changed (fire-and-forget)
      if (amountDelta !== 0) updateCommunityFeedItem(skip.id, {
        skipAmount: updates.amount,
        message: `skipped ${updates.categoryLabel ?? skip.categoryLabel} and saved $${(updates.amount ?? skip.amount).toFixed(2)}`,
      });
    }
  }

  async function deleteSkip(skip: Skip): Promise<void> {
    if (!user || !profile) return;
    const skipSplit = skip.jarSplit ?? normalizeJarSplit(profile.jarSplit as any);
    const giveAllocAmount = skip.amount * (skipSplit.give / 100);
    const liveAllocAmount = skip.amount * (skipSplit.live / 100);
    await firebaseDeleteSkip(user.uid, skip.id, skip.amount, giveAllocAmount, liveAllocAmount, skip.projectId);
    removeSkip(skip.id);
    updateProfile({
      totalSaved: profile.totalSaved - skip.amount,
      totalSkips: profile.totalSkips - 1,
      totalGiveAllocated: Math.max(0, (profile.totalGiveAllocated ?? 0) - giveAllocAmount),
      totalLiveAllocated: Math.max(0, (profile.totalLiveAllocated ?? 0) - liveAllocAmount),
      causeJarBalances: skip.projectId
        ? { ...profile.causeJarBalances, [skip.projectId]: Math.max(0, (profile.causeJarBalances?.[skip.projectId] ?? 0) - giveAllocAmount) }
        : profile.causeJarBalances,
    });
    // Sync community feed (fire-and-forget; may not exist for old/unshared skips)
    deleteCommunityFeedItem(skip.id);
  }

  async function editDonation(donation: DonationEvent, newAmount: number, date?: string): Promise<void> {
    if (!user || !profile) return;
    const delta = newAmount - donation.amount;
    await firebaseUpdateDonation(user.uid, donation.id, newAmount, donation.amount, donation.causeId, date);
    if (delta !== 0) {
      updateProfile({
        totalDonated: profile.totalDonated + delta,
        causeJarBalances: {
          ...(profile.causeJarBalances ?? {}),
          [donation.causeId]: (profile.causeJarBalances?.[donation.causeId] ?? 0) - delta,
        },
      });
    }
  }

  async function deleteDonation(donation: DonationEvent): Promise<void> {
    if (!user || !profile) return;
    await firebaseDeleteDonation(user.uid, donation.id, donation.amount, donation.causeId);
    updateProfile({
      totalDonated: profile.totalDonated - donation.amount,
      causeJarBalances: {
        ...(profile.causeJarBalances ?? {}),
        [donation.causeId]: (profile.causeJarBalances?.[donation.causeId] ?? 0) + donation.amount,
      },
    });
  }

  return { recentSkips, isLogging, log, donate, edit, deleteSkip, donations, editDonation, deleteDonation };
}
