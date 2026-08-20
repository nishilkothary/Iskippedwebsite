"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useSkipStore } from "@/store/skipStore";
import { subscribeToSkips, logSkip, LogSkipParams, updateSkip as firebaseUpdateSkip, deleteSkip as firebaseDeleteSkip } from "@/lib/services/firebase/skips";
import { normalizeJarSplit } from "@/lib/services/firebase/users";
import { recordDonation, subscribeToDonations, updateDonation as firebaseUpdateDonation, deleteDonation as firebaseDeleteDonation } from "@/lib/services/firebase/users";
import { today } from "@/lib/utils/dates";
import { getImpactMessage } from "@/lib/constants/impactMessages";
import { xpForSkip, levelForXp } from "@/lib/utils/xp";
import { Skip, DonationEvent } from "@/lib/types/models";

export function useSkips() {
  const { user, profile, updateProfile } = useAuthStore();
  const { recentSkips, isLogging, setRecentSkips, setLogging, addSkip, updateSkip: storeUpdateSkip, removeSkip } = useSkipStore();
  const [donations, setDonations] = useState<DonationEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToSkips(user.uid, setRecentSkips);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToDonations(user.uid, setDonations);
    return unsub;
  }, [user?.uid]);

  async function log(params: Omit<LogSkipParams, "uid" | "currentTotalSaved" | "currentTotalSkips" | "currentXp" | "currentStreak" | "currentLongestStreak" | "lastSkipDate" | "savedTowardActiveCause" | "defaultJarSplit" | "activeGoalId" | "causeJarBalance" | "causeJarOverflowCount">) {
    if (!user || !profile) return null;
    setLogging(true);
    const allocationTarget = params.allocationTarget
      ?? profile.activeSkipTarget
      ?? (params.projectId ? { type: "fundraiser" as const, id: params.projectId } : null)
      ?? (profile.activeProjectId ? { type: "fundraiser" as const, id: profile.activeProjectId } : null);
    const causeJarId = allocationTarget?.type === "fundraiser" ? allocationTarget.id : params.projectId ?? "";
    const causeJarBalance = profile.causeJarBalances?.[causeJarId] ?? 0;
    const causeJarOverflowCount = profile.causeJarOverflowCounts?.[causeJarId] ?? 0;
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
        defaultJarSplit: { give: 0, live: 100 },
        displayName: user.displayName || profile.displayName,
        photoURL: user.photoURL || profile.photoURL || undefined,
        activeGoalId: null,
        causeJarBalance,
        causeJarOverflowCount,
        allocationTarget,
      });
      if (result) {
        const targetedBalanceUpdates: {
          goalJarBalances?: Record<string, number>;
          causeJarBalances?: Record<string, number>;
        } = {};
        if (allocationTarget?.type === "goal") {
          targetedBalanceUpdates.goalJarBalances = {
            ...(profile.goalJarBalances ?? {}),
            [allocationTarget.id]: Math.max(0, profile.goalJarBalances?.[allocationTarget.id] ?? 0) + params.amount,
          };
        }
        if (allocationTarget?.type === "fundraiser") {
          targetedBalanceUpdates.causeJarBalances = {
            ...(profile.causeJarBalances ?? {}),
            [allocationTarget.id]: Math.max(0, profile.causeJarBalances?.[allocationTarget.id] ?? 0) + params.amount,
          };
        }
        updateProfile({
          totalSaved: profile.totalSaved + params.amount,
          totalSkips: profile.totalSkips + 1,
          xp: result.newXp,
          level: result.newLevel,
          streak: result.newStreak,
          longestStreak: result.newLongestStreak,
          lastSkipDate: today(),
          ...targetedBalanceUpdates,
        });
      }
      return result;
    } catch (err) {
      console.error("logSkip failed", err);
      toast.error("Couldn't save your skip — check your connection and try again.");
      return null;
    } finally {
      setLogging(false);
    }
  }

  async function donate(amount: number, projectId: string, projectTitle: string, date?: string): Promise<boolean> {
    if (!user || !profile) return false;
    try {
      await recordDonation(user.uid, amount, projectId, projectTitle, date);
    } catch (err) {
      console.error("recordDonation failed", err);
      toast.error("Couldn't log your donation — check your connection and try again.");
      return false;
    }
    const prevDonated = profile.causeStats?.[projectId]?.donated ?? 0;
    const prevJarBal = profile.causeJarBalances?.[projectId] ?? 0;
    updateProfile({
      totalDonated: profile.totalDonated + amount,
      causeStats: { ...profile.causeStats, [projectId]: { donated: prevDonated + amount } },
      causeJarBalances: { ...profile.causeJarBalances, [projectId]: Math.max(0, prevJarBal - amount) },
      causeJarOverflowCounts: { ...(profile.causeJarOverflowCounts ?? {}), [projectId]: 0 },
    });
    return true;
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
    await firebaseUpdateSkip(user.uid, skip.id, updates, amountDelta, 0, 0, skip.projectId);
    storeUpdateSkip(skip.id, updates);
    if (amountDelta !== 0) {
      updateProfile({
        totalSaved: profile.totalSaved + amountDelta,
      });
    }
  }

  async function deleteSkip(skip: Skip): Promise<void> {
    if (!user || !profile) return;
    const skipSplit = skip.jarSplit ?? normalizeJarSplit(profile.jarSplit as any);
    const giveAllocAmount = skip.amount * (skipSplit.give / 100);
    const liveAllocAmount = skip.amount * (skipSplit.live / 100);
    await firebaseDeleteSkip(user.uid, skip.id, skip.amount, 0, 0, skip.projectId);
    removeSkip(skip.id);
    updateProfile({
      totalSaved: profile.totalSaved - skip.amount,
      totalSkips: profile.totalSkips - 1,
    });
  }

  async function editDonation(donation: DonationEvent, newAmount: number, date?: string): Promise<void> {
    if (!user || !profile) return;
    const delta = newAmount - donation.amount;
    await firebaseUpdateDonation(user.uid, donation.id, newAmount, donation.amount, donation.causeId, date);
    if (delta !== 0) {
      const currentBal = profile.causeJarBalances?.[donation.causeId] ?? 0;
      const jarDelta = delta > 0
        ? -Math.min(delta, Math.max(0, currentBal))
        : -delta;
      updateProfile({
        totalDonated: profile.totalDonated + delta,
        causeJarBalances: {
          ...(profile.causeJarBalances ?? {}),
          [donation.causeId]: currentBal + jarDelta,
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
