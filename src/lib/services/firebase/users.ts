import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  writeBatch,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
  getDocs,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "./config";
import { UserProfile, DonationEvent, SpendingHistoryEvent, SpendingGoal } from "@/lib/types/models";

export function normalizeSpendingGoals(profile: UserProfile): {
  goals: SpendingGoal[];
  activeId: string | null;
} {
  if (profile.spendingGoals && profile.spendingGoals.length > 0) {
    return {
      goals: profile.spendingGoals,
      activeId: profile.activeSpendingGoalId ?? profile.spendingGoals[0]?.id ?? null,
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
  const newGoals = currentGoals.filter((g) => g.id !== goalId);
  const newActiveId =
    currentActiveGoalId === goalId
      ? (newGoals[0]?.id ?? null)
      : currentActiveGoalId;
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "users", uid, "spendingHistory")), {
    label,
    targetAmount,
    amountSaved,
    purchasedAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", uid), {
    totalSpent: increment(amountSaved),
    spendingGoals: newGoals,
    activeSpendingGoalId: newActiveId,
    spendingGoal: null,
  });
  await batch.commit();
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
      savedTowardActiveCause: 0,
      totalDonated: 0,
      totalSpent: 0,
      followingCount: 0,
      followersCount: 0,
      lastSkipDate: null,
      favoriteCauseIds: [],
      jarSplit: { give: 50, live: 50 },
      spendingGoal: null,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function updateUserStats(
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), updates);
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

export async function followUser(uid: string, targetUid: string): Promise<void> {
  await setDoc(doc(db, "users", uid, "following", targetUid), {
    uid: targetUid,
    followedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", uid), { followingCount: increment(1) });
  await updateDoc(doc(db, "users", targetUid), { followersCount: increment(1) });
}

export async function unfollowUser(uid: string, targetUid: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "users", uid, "following", targetUid));
  await updateDoc(doc(db, "users", uid), { followingCount: increment(-1) });
  await updateDoc(doc(db, "users", targetUid), { followersCount: increment(-1) });
}

export async function recordDonation(uid: string, amount: number, projectId: string, projectTitle: string, date?: string): Promise<void> {
  const batch = writeBatch(db);
  const donationRef = doc(collection(db, "users", uid, "donations"));
  batch.set(donationRef, {
    causeId: projectId,
    causeTitle: projectTitle,
    amount,
    ...(date ? { date } : {}),
    donatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", uid), {
    totalDonated: increment(amount),
    savedTowardActiveCause: 0,
  });
  const projectRef = doc(db, "projects", projectId);
  const projectSnap = await getDoc(projectRef);
  if (projectSnap.exists()) {
    batch.update(projectRef, { totalRaised: increment(amount) });
  }
  await batch.commit();
}

export function subscribeToDonations(uid: string, callback: (donations: DonationEvent[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "donations"), orderBy("donatedAt", "desc"), limit(50));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DonationEvent))));
}

export async function updateDonation(uid: string, donationId: string, newAmount: number, oldAmount: number, date?: string): Promise<void> {
  const delta = newAmount - oldAmount;
  const batch = writeBatch(db);
  const donationUpdates: Record<string, any> = { amount: newAmount };
  if (date !== undefined) donationUpdates.date = date;
  batch.update(doc(db, "users", uid, "donations", donationId), donationUpdates);
  if (delta !== 0) batch.update(doc(db, "users", uid), { totalDonated: increment(delta) });
  await batch.commit();
}

export async function deleteDonation(uid: string, donationId: string, amount: number): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "donations", donationId));
  batch.update(doc(db, "users", uid), { totalDonated: increment(-amount) });
  await batch.commit();
}

export async function completePurchase(
  uid: string,
  label: string,
  targetAmount: number,
  amountSaved: number
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "users", uid, "spendingHistory")), {
    label, targetAmount, amountSaved,
    purchasedAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", uid), {
    totalSpent: increment(amountSaved),
    spendingGoal: null,
  });
  await batch.commit();
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
  const delta = newAmountSaved - oldAmountSaved;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid, "spendingHistory", eventId), { amountSaved: newAmountSaved });
  if (delta !== 0) batch.update(doc(db, "users", uid), { totalSpent: increment(delta) });
  await batch.commit();
}

export async function deleteSpendingHistory(
  uid: string,
  eventId: string,
  amountSaved: number
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "spendingHistory", eventId));
  batch.update(doc(db, "users", uid), { totalSpent: increment(-amountSaved) });
  await batch.commit();
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as UserProfile);
}
