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
  getDocs,
  arrayUnion,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "./config";
import { UserProfile, DonationEvent, SpendingHistoryEvent, SpendingGoal } from "@/lib/types/models";
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
  // Backward compat: migrate legacy spendingGoal
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
): Promise<void> {
  await apiRequest("/api/goals/complete", "POST", { goalId, label, targetAmount });
}

export async function transferLiveToGive(
  uid: string,
  amount: number,
  goals: SpendingGoal[],
  goalId: string,
  currentActiveGoalId: string | null
): Promise<void> {
  if (amount <= 0) return;
  await apiRequest("/api/goals/transfer-to-give", "POST", { goalId });
}

export function normalizeJarSplit(
  raw: { give?: number; live?: number; giving?: number; spending?: number } | undefined
): { give: number; live: number } {
  if (!raw) return { give: 50, live: 50 };
  if (raw.give !== undefined && raw.live !== undefined) return { give: raw.give, live: raw.live };
  return { give: raw.giving ?? 50, live: raw.spending ?? 50 };
}

export async function createOrUpdateUser(user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
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
      jarSplit: { give: 50, live: 50 },
      spendingGoal: null,
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
  }
}

export async function updateJarSettings(
  uid: string,
  jarSplit: { give: number; live: number },
  spendingGoal: { label: string; targetAmount: number } | null
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { jarSplit, spendingGoal });
}

export async function setActiveProject(uid: string, projectId: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), { activeProjectId: projectId });
}

export async function joinProject(uid: string, projectId: string, makeActive: boolean): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, "users", uid), {
      joinedProjectIds: arrayUnion(projectId),
      ...(makeActive ? { activeProjectId: projectId } : {}),
    }),
    setDoc(doc(db, "projects", projectId), { memberUids: arrayUnion(uid) }, { merge: true }),
  ]);
}

export async function setUserCauseGoal(uid: string, causeId: string, amount: number): Promise<void> {
  await updateDoc(doc(db, "users", uid), { [`causeGoalAmounts.${causeId}`]: amount });
}

export async function switchCause(
  uid: string,
  oldCauseId: string | null,
  newCauseId: string,
): Promise<Record<string, number> | null> {
  const result = await apiRequest<{ balanceTransfer: Record<string, number> | null }>("/api/causes/switch", "POST", { newCauseId });
  return result.balanceTransfer;
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

export async function recordDonation(uid: string, amount: number, projectId: string, projectTitle: string, date?: string): Promise<void> {
  if (amount <= 0) throw new Error("Donation amount must be greater than zero");
  await apiRequest("/api/donations", "POST", { amount, projectId, projectTitle, date });
}

export async function recordPurchase(uid: string, goalId: string, goalLabel: string, targetAmount: number, amount: number): Promise<number> {
  const result = await apiRequest<{ jarDecrease: number }>("/api/spending-history", "POST", { goalId, goalLabel, targetAmount, amount });
  return result.jarDecrease;
}

export function subscribeToDonations(uid: string, callback: (donations: DonationEvent[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "donations"), orderBy("donatedAt", "desc"), limit(50));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DonationEvent))));
}

export async function updateDonation(uid: string, donationId: string, newAmount: number, oldAmount: number, causeId: string, date?: string): Promise<void> {
  const delta = newAmount - oldAmount;
  if (delta === 0 && date === undefined) return;
  await apiRequest(`/api/donations/${donationId}`, "PATCH", { newAmount, date });
}

export async function deleteDonation(uid: string, donationId: string, amount: number, causeId: string): Promise<number> {
  const result = await apiRequest<{ jarDecrease: number }>(`/api/donations/${donationId}`, "DELETE");
  return result.jarDecrease;
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
): Promise<void> {
  await apiRequest(`/api/spending-history/${eventId}`, "PATCH", { newAmountSaved });
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

export async function getAllUsers(): Promise<UserProfile[]> {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function recalculateTotals(
  uid: string,
  defaultSplit: { give: number; live: number }
): Promise<{ totalSaved: number; totalSkips: number; totalGiveAllocated: number; totalLiveAllocated: number; totalDonated: number; totalSpent: number; causeJarBalances: Record<string, number> }> {
  return apiRequest<{ totalSaved: number; totalSkips: number; totalGiveAllocated: number; totalLiveAllocated: number; totalDonated: number; totalSpent: number; causeJarBalances: Record<string, number> }>("/api/users/recalculate", "POST", { defaultSplit });
}
