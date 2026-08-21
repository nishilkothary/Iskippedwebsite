"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useSkipStore } from "@/store/skipStore";
import { subscribeToSkips, logSkip, LogSkipParams, updateSkip as firebaseUpdateSkip, deleteSkip as firebaseDeleteSkip } from "@/lib/services/firebase/skips";
import { recordDonation, subscribeToDonations, updateDonation as firebaseUpdateDonation, deleteDonation as firebaseDeleteDonation } from "@/lib/services/firebase/users";
import { today } from "@/lib/utils/dates";
import { getImpactMessage } from "@/lib/constants/impactMessages";
import { xpForSkip, levelForXp } from "@/lib/utils/xp";
import { Skip, DonationEvent, SkipAllocationTarget } from "@/lib/types/models";
import { getActiveSkipTarget } from "@/lib/utils/skipTargets";

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

  async function log(params: Omit<LogSkipParams, "uid" | "currentTotalSaved" | "currentTotalSkips" | "currentXp" | "currentStreak" | "currentLongestStreak" | "lastSkipDate" | "savedTowardActiveCause" | "activeGoalId" | "causeJarBalance" | "causeJarOverflowCount">) {
    if (!user || !profile) return null;
    setLogging(true);
    const allocationTarget = params.allocationTarget
      ?? getActiveSkipTarget(profile)
      ?? (params.projectId ? { type: "fundraiser" as const, id: params.projectId } : null)
      ?? (profile.activeProjectId ? { type: "fundraiser" as const, id: profile.activeProjectId } : null);
    const causeJarId = allocationTarget?.type === "fundraiser" ? allocationTarget.id : params.projectId ?? "";
    const causeJarBalance = Math.max(0, profile.causeJarBalances?.[causeJarId] ?? 0);
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
    const prevJarBal = Math.max(0, profile.causeJarBalances?.[projectId] ?? 0);
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
    updates: Partial<Pick<Skip, "category" | "categoryLabel" | "categoryEmoji" | "amount" | "projectId" | "projectTitle" | "whatSkipped" | "notes" | "allocationTarget">>
  ): Promise<void> {
    if (!user || !profile) return;
    const oldAmount = skip.amount;
    const newAmount = updates.amount ?? oldAmount;
    const amountDelta = newAmount - oldAmount;
    const target = resolveSkipTarget(skip, updates.allocationTarget);

    await firebaseUpdateSkip(user.uid, skip.id, updates);
    storeUpdateSkip(skip.id, updates);
    if (amountDelta !== 0) {
      const targetedBalanceUpdates: Partial<Pick<UserProfilePatch, "goalJarBalances" | "causeJarBalances">> = {};
      if (target?.type === "goal") {
        targetedBalanceUpdates.goalJarBalances = {
          ...(profile.goalJarBalances ?? {}),
          [target.id]: Math.max(0, (profile.goalJarBalances?.[target.id] ?? 0) + amountDelta),
        };
      }
      if (target?.type === "fundraiser") {
        targetedBalanceUpdates.causeJarBalances = {
          ...(profile.causeJarBalances ?? {}),
          [target.id]: Math.max(0, (profile.causeJarBalances?.[target.id] ?? 0) + amountDelta),
        };
      }
      updateProfile({
        totalSaved: profile.totalSaved + amountDelta,
        ...targetedBalanceUpdates,
      });
    }
  }

  async function deleteSkip(skip: Skip): Promise<void> {
    if (!user || !profile) return;
    const target = resolveSkipTarget(skip);
    await firebaseDeleteSkip(user.uid, skip.id);
    removeSkip(skip.id);
    const targetedBalanceUpdates: Partial<Pick<UserProfilePatch, "goalJarBalances" | "causeJarBalances">> = {};
    if (target?.type === "goal") {
      targetedBalanceUpdates.goalJarBalances = {
        ...(profile.goalJarBalances ?? {}),
        [target.id]: Math.max(0, (profile.goalJarBalances?.[target.id] ?? 0) - skip.amount),
      };
    }
    if (target?.type === "fundraiser") {
      targetedBalanceUpdates.causeJarBalances = {
        ...(profile.causeJarBalances ?? {}),
        [target.id]: Math.max(0, (profile.causeJarBalances?.[target.id] ?? 0) - skip.amount),
      };
    }
    updateProfile({
      totalSaved: Math.max(0, profile.totalSaved - skip.amount),
      totalSkips: Math.max(0, profile.totalSkips - 1),
      ...targetedBalanceUpdates,
    });
  }

  async function editDonation(donation: DonationEvent, newAmount: number, date?: string): Promise<void> {
    if (!user || !profile) return;
    const delta = newAmount - donation.amount;
    await firebaseUpdateDonation(user.uid, donation.id, newAmount, donation.amount, donation.causeId, date);
    if (delta !== 0) {
      const currentBal = Math.max(0, profile.causeJarBalances?.[donation.causeId] ?? 0);
      const jarDelta = delta > 0
        ? -Math.min(delta, Math.max(0, currentBal))
        : -delta;
      updateProfile({
        totalDonated: profile.totalDonated + delta,
        causeJarBalances: {
          ...(profile.causeJarBalances ?? {}),
          [donation.causeId]: Math.max(0, currentBal + jarDelta),
        },
      });
    }
  }

  async function deleteDonation(donation: DonationEvent): Promise<void> {
    if (!user || !profile) return;
    await firebaseDeleteDonation(user.uid, donation.id, donation.amount, donation.causeId);
    updateProfile({
      totalDonated: Math.max(0, profile.totalDonated - donation.amount),
      causeJarBalances: {
        ...(profile.causeJarBalances ?? {}),
        [donation.causeId]: Math.max(0, profile.causeJarBalances?.[donation.causeId] ?? 0) + Math.max(0, donation.amount),
      },
    });
  }

  return { recentSkips, isLogging, log, donate, edit, deleteSkip, donations, editDonation, deleteDonation };
}

type UserProfilePatch = Parameters<ReturnType<typeof useAuthStore.getState>["updateProfile"]>[0];

function resolveSkipTarget(skip: Skip, override?: SkipAllocationTarget | null): SkipAllocationTarget | null {
  if (override !== undefined) return override;
  if (skip.allocationTarget) return skip.allocationTarget;
  if (skip.projectId) return { type: "fundraiser", id: skip.projectId };
  return null;
}
