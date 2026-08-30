import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
  arrayUnion,
  arrayRemove,
  deleteField,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "./config";
import { UserProfile, DonationEvent, SpendingHistoryEvent, SpendingGoal, SkipAllocationTarget } from "@/lib/types/models";
import { apiRequest } from "./apiClient";

export function normalizeSpendingGoals(profile: UserProfile): {
  goals: SpendingGoal[];
  activeId: string | null;
} {
  if (profile.spendingGoals && profile.spendingGoals.length > 0) {
    return {
      goals: profile.spendingGoals,
      activeId: profile.activeSpendingGoalId !== undefined
        ? profile.activeSpendingGoalId
        : profile.spendingGoals[0]?.id ?? null,
    };
  }
  // Backward compatibility: expose the old single reward field through the
  // current rewards shape. "splurge" is a persisted legacy enum value.
  if (profile.spendingGoal) {
    const goal: SpendingGoal = {
      id: "legacy",
      label: profile.spendingGoal.label,
      targetAmount: profile.spendingGoal.targetAmount,
      type: "splurge",
      shoppingLink: profile.spendingGoal.shoppingLink,
    };
    return { goals: [goal], activeId: "legacy" };
  }
  return { goals: [], activeId: null };
}

export async function updateSpendingGoals(
  uid: string,
  goals: SpendingGoal[],
  activeGoalId: string | null
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    spendingGoals: goals,
    activeSpendingGoalId: activeGoalId,
    spendingGoal: null, // clear legacy field
  });
}

export async function completeGoal(
  uid: string,
  goalId: string,
  label: string,
  targetAmount: number,
  amountSaved: number,
  currentGoals: SpendingGoal[],
  currentActiveGoalId: string | null
): Promise<{ amountFromSkips: number; jarDecrease: number; skipBucksDecrease: number }> {
  return apiRequest("/api/goals/complete", "POST", { goalId, label, targetAmount });
}

export async function createOrUpdateUser(user: User): Promise<boolean> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const isNew = !snap.exists();
  if (isNew) {
    const profile: Omit<UserProfile, "createdAt"> & { createdAt: any } = {
      uid: user.uid,
      displayName: user.displayName || "Skipper",
      email: user.email || "",
      photoURL: user.photoURL,
      totalSaved: 0,
      totalSkips: 0,
      streak: 0,
      longestStreak: 0,
      xp: 0,
      level: 1,
      activeProjectId: null,
      joinedProjectIds: [],
      savedTowardActiveCause: 0,
      totalDonated: 0,
      totalSpent: 0,
      followingCount: 0,
      followersCount: 0,
      lastSkipDate: null,
      favoriteCauseIds: [],
      shareSkipsByDefault: true,
      emailVerified: user.emailVerified,
      onboardingCompletedAt: null,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
  }

  // Keep the public/global user metric derived from the canonical users
  // collection. This endpoint is idempotent, so returning users also repair
  // any missed update without risking a double increment.
  await apiRequest("/api/users/sync-count", "POST", {}).catch((error) => {
    console.warn("Could not synchronize global user count", error);
  });
  return isNew;
}

export type SavingMotivation = NonNullable<UserProfile["savingMotivation"]>;

export async function setSavingMotivation(uid: string, savingMotivation: SavingMotivation): Promise<void> {
  await updateDoc(doc(db, "users", uid), { savingMotivation });
}

export async function completeFirstRunOnboarding(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { onboardingCompletedAt: serverTimestamp() });
}

export async function dismissSetupPrompt(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { setupPromptDismissedAt: serverTimestamp() });
}

export async function completeSetupPrompt(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { setupPromptCompletedAt: serverTimestamp() });
}

export async function dismissWeeklyReminderPrompt(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { weeklyReminderPromptDismissedAt: serverTimestamp() });
}

export async function setShareSkipsByDefault(uid: string, shareSkipsByDefault: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { shareSkipsByDefault });
}

export async function setWeeklyEmailOptOut(uid: string, weeklyEmailOptOut: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { weeklyEmailOptOut });
}

export async function setActiveProject(uid: string, projectId: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), { activeProjectId: projectId });
}

export async function dismissDeletedFundraiserNotice(uid: string, projectId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    [`deletedFundraiserNotices.${projectId}`]: deleteField(),
  });
}

export async function setActiveSkipTarget(uid: string, target: SkipAllocationTarget | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    activeSkipTarget: target,
    ...(target ? { parkedSkipTargets: arrayRemove(target) } : {}),
  });
}

/**
 * Stops sending future skips to a jar without releasing its balance or losing
 * the user's ability to resume it later.
 */
export async function parkSkipTarget(uid: string, target: SkipAllocationTarget): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    parkedSkipTargets: arrayUnion(target),
    activeSkipTarget: null,
    ...(target.type === "fundraiser"
      ? { activeProjectId: null }
      : { activeSpendingGoalId: null, spendingGoal: null }),
  });
}

/** Stops future skips from going to an empty jar without creating a parked jar. */
export async function deactivateSkipTarget(uid: string, target: SkipAllocationTarget): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    activeSkipTarget: null,
    parkedSkipTargets: arrayRemove(target),
    ...(target.type === "fundraiser"
      ? { activeProjectId: null }
      : { activeSpendingGoalId: null, spendingGoal: null }),
  });
}

export async function allocateSkipBankToJar(
  uid: string,
  target: SkipAllocationTarget,
  amount: number
): Promise<number> {
  const result = await apiRequest<{ appliedAmount: number }>("/api/jars/allocate", "POST", { target, amount });
  return result.appliedAmount;
}

export async function releaseJarToSkipBank(uid: string, target: SkipAllocationTarget): Promise<number> {
  const result = await apiRequest<{ releasedAmount: number }>("/api/jars/release", "POST", { target });
  return result.releasedAmount;
}

export async function deleteJar(uid: string, target: SkipAllocationTarget): Promise<number> {
  const result = await apiRequest<{ deletedAmount: number }>("/api/jars/delete", "POST", { target });
  return result.deletedAmount;
}

export type JarBalanceEndpoint = SkipAllocationTarget | { type: "skip-bucks" };

export async function moveJarBalance(
  uid: string,
  source: JarBalanceEndpoint,
  destination: JarBalanceEndpoint,
  amount: number
): Promise<number> {
  const result = await apiRequest<{ movedAmount: number }>("/api/jars/move", "POST", { source, destination, amount });
  return result.movedAmount;
}

export async function joinProject(uid: string, projectId: string, makeActive: boolean): Promise<void> {
  await apiRequest("/api/causes/switch", "POST", {
    newCauseId: projectId,
    transferBalance: false,
    makeActive,
  });
}

export async function setChallengeEmailConsent(uid: string, projectId: string, shareEmail: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { [`challengeEmailConsents.${projectId}`]: shareEmail });
}

export async function setUserCauseGoal(uid: string, causeId: string, amount: number, donationBaseline?: number): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    [`causeGoalAmounts.${causeId}`]: amount,
    ...(donationBaseline !== undefined
      ? { [`causeGoalDonationBaselines.${causeId}`]: Math.max(0, donationBaseline) }
      : {}),
  });
}

export async function setFavoriteCause(uid: string, causeId: string, favorite: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    favoriteCauseIds: favorite ? arrayUnion(causeId) : arrayRemove(causeId),
  });
}

export async function switchCause(
  uid: string,
  oldCauseId: string | null,
  newCauseId: string,
): Promise<Record<string, number> | null> {
  const result = await apiRequest<{ balanceTransfer: Record<string, number> | null }>("/api/causes/switch", "POST", { newCauseId, transferBalance: false });
  return result.balanceTransfer;
}

export async function pinProjectToHome(uid: string, projectId: string): Promise<void> {
  await apiRequest("/api/causes/switch", "POST", { newCauseId: projectId, transferBalance: false });
  const target: SkipAllocationTarget = { type: "fundraiser", id: projectId };
  await updateDoc(doc(db, "users", uid), {
    activeSkipTarget: target,
    parkedSkipTargets: arrayRemove(target),
  });
}

/**
 * Activates an existing fundraiser from Jars without depending on the
 * server-side cause-switch route. No balance transfer is involved here.
 */
export async function pinProjectToHomeFromJars(uid: string, projectId: string): Promise<void> {
  const target: SkipAllocationTarget = { type: "fundraiser", id: projectId };

  await updateDoc(doc(db, "users", uid), {
    activeProjectId: projectId,
    joinedProjectIds: arrayUnion(projectId),
    activeSkipTarget: target,
    parkedSkipTargets: arrayRemove(target),
  });
}

export async function switchGoal(
  uid: string,
  oldGoalId: string | null,
  newGoalId: string,
  moveFunds: boolean,
  goals: SpendingGoal[]
): Promise<Record<string, number> | null> {
  const result = await apiRequest<{ balanceTransfer: Record<string, number> | null }>("/api/goals/switch", "POST", { oldGoalId, newGoalId, moveFunds });
  return result.balanceTransfer;
}

export async function transferJarBalance(uid: string, fromProjectId: string, toProjectId: string): Promise<void> {
  await apiRequest("/api/causes/transfer-jar", "POST", { fromProjectId, toProjectId });
}

export type DonationFundingBreakdown = {
  jarDecrease: number;
  skipBucksDecrease: number;
  outsideContribution: number;
  amountFromSkips: number;
  /** Authoritative balance of the affected fundraiser jar after the write. */
  causeJarBalance?: number;
};

export async function recordDonation(uid: string, amount: number, projectId: string, projectTitle: string, date?: string): Promise<DonationFundingBreakdown> {
  if (amount <= 0) throw new Error("Donation amount must be greater than zero");
  return apiRequest<DonationFundingBreakdown>("/api/donations", "POST", { amount, projectId, projectTitle, date });
}

export type PurchaseFundingBreakdown = {
  amountFromSkips: number;
  jarDecrease: number;
  skipBucksDecrease: number;
  outsideContribution: number;
};

export async function recordPurchase(
  uid: string,
  goalId: string,
  goalLabel: string,
  targetAmount: number,
  amount: number
): Promise<PurchaseFundingBreakdown> {
  return apiRequest<PurchaseFundingBreakdown>("/api/spending-history", "POST", { goalId, goalLabel, targetAmount, amount });
}

export function subscribeToDonations(uid: string, callback: (donations: DonationEvent[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "donations"), orderBy("donatedAt", "desc"), limit(50));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DonationEvent))));
}

export async function deleteDonation(uid: string, donationId: string, amount: number, causeId: string): Promise<DonationFundingBreakdown> {
  return apiRequest<DonationFundingBreakdown>(`/api/donations/${donationId}`, "DELETE");
}

export function subscribeToSpendingHistory(
  uid: string,
  callback: (events: SpendingHistoryEvent[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "users", uid, "spendingHistory"),
    orderBy("purchasedAt", "desc"),
    limit(20)
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SpendingHistoryEvent)))
  );
}

export async function updateSpendingHistory(
  uid: string,
  eventId: string,
  newAmountSaved: number,
  oldAmountSaved: number
): Promise<{ jarDecrease: number; goalBalance: number | null }> {
  return apiRequest<{ jarDecrease: number; goalBalance: number | null }>(`/api/spending-history/${eventId}`, "PATCH", { newAmountSaved });
}

export async function deleteSpendingHistory(
  uid: string,
  eventId: string,
  amountSaved: number,
  goalId?: string
): Promise<void> {
  await apiRequest(`/api/spending-history/${eventId}`, "DELETE");
}

export async function resetActiveProjectIfRemoved(uid: string, activeProjectId: string): Promise<void> {
  const { OFFICIAL_PROJECTS } = await import("./projects");
  if (OFFICIAL_PROJECTS.some((p) => p.id === activeProjectId)) return;
  const snap = await getDoc(doc(db, "projects", activeProjectId));
  if (snap.exists()) return;
  await updateDoc(doc(db, "users", uid), { activeProjectId: null });
}
