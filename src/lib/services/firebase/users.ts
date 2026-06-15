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
  arrayUnion,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "./config";
import { UserProfile, DonationEvent, SpendingHistoryEvent, SpendingGoal } from "@/lib/types/models";
import { xpForSkip, levelForXp } from "@/lib/utils/xp";

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
  const newGoals = currentGoals.filter((g) => g.id !== goalId);
  const newActiveId =
    currentActiveGoalId === goalId
      ? (newGoals[0]?.id ?? null)
      : currentActiveGoalId;
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "users", uid, "spendingHistory")), {
    goalId,
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
    [`goalJarBalances.${goalId}`]: 0,
  });
  await batch.commit();
}

export async function transferLiveToGive(
  uid: string,
  amount: number,
  goals: SpendingGoal[],
  goalId: string,
  currentActiveGoalId: string | null
): Promise<void> {
  if (amount <= 0) return;
  const newGoals = goals.filter((g) => g.id !== goalId);
  const newActiveId =
    currentActiveGoalId === goalId ? (newGoals[0]?.id ?? null) : currentActiveGoalId;
  await updateDoc(doc(db, "users", uid), {
    totalLiveAllocated: increment(-amount),
    totalGiveAllocated: increment(amount),
    spendingGoals: newGoals,
    activeSpendingGoalId: newActiveId,
  });
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
  const updates: Record<string, unknown> = { activeProjectId: newCauseId, joinedProjectIds: arrayUnion(newCauseId) };
  let balanceTransfer: Record<string, number> | null = null;
  let transferredAmount = 0;
  if (oldCauseId) {
    const snap = await getDoc(doc(db, "users", uid));
    const oldBal: number = Math.max(0, snap.data()?.causeJarBalances?.[oldCauseId] ?? 0);
    updates[`causeJarBalances.${oldCauseId}`] = 0;
    if (oldBal > 0) {
      updates[`causeJarBalances.${newCauseId}`] = increment(oldBal);
      transferredAmount = oldBal;
      balanceTransfer = { [oldCauseId]: 0, [newCauseId]: oldBal };
    } else {
      balanceTransfer = { [oldCauseId]: 0 };
    }
  }
  await updateDoc(doc(db, "users", uid), updates);
  // Keep project.totalRaised in sync: move the pledged amount from old to new project (best-effort)
  if (oldCauseId && transferredAmount > 0) {
    updateDoc(doc(db, "projects", oldCauseId), { totalRaised: increment(-transferredAmount) }).catch(() => {});
    updateDoc(doc(db, "projects", newCauseId), { totalRaised: increment(transferredAmount), memberUids: arrayUnion(uid) }).catch(() => {});
  } else {
    updateDoc(doc(db, "projects", newCauseId), { memberUids: arrayUnion(uid) }).catch(() => {});
  }
  return balanceTransfer;
}

export async function switchGoal(
  uid: string,
  oldGoalId: string | null,
  newGoalId: string,
  moveFunds: boolean,
  goals: SpendingGoal[]
): Promise<Record<string, number> | null> {
  const updates: Record<string, unknown> = {
    activeSpendingGoalId: newGoalId,
    spendingGoals: goals,
  };
  let balanceTransfer: Record<string, number> | null = null;
  if (moveFunds && oldGoalId) {
    const snap = await getDoc(doc(db, "users", uid));
    const oldBal: number = snap.data()?.goalJarBalances?.[oldGoalId] ?? 0;
    if (oldBal > 0) {
      updates[`goalJarBalances.${newGoalId}`] = increment(oldBal);
      updates[`goalJarBalances.${oldGoalId}`] = 0;
      balanceTransfer = { [oldGoalId]: 0, [newGoalId]: oldBal };
    }
  }
  await updateDoc(doc(db, "users", uid), updates);
  return balanceTransfer;
}


export async function transferJarBalance(uid: string, fromProjectId: string, toProjectId: string): Promise<void> {
  const snap = await getDoc(doc(db, "users", uid));
  const bal: number = snap.data()?.causeJarBalances?.[fromProjectId] ?? 0;
  if (bal <= 0) return;
  await updateDoc(doc(db, "users", uid), {
    [`causeJarBalances.${toProjectId}`]: increment(bal),
    [`causeJarBalances.${fromProjectId}`]: 0,
  });
}

export async function recordDonation(uid: string, amount: number, projectId: string, projectTitle: string, date?: string): Promise<void> {
  if (amount <= 0) throw new Error("Donation amount must be greater than zero");
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  // Cap jar decrease at current balance so it never goes negative
  const currentBal: number = userSnap.data()?.causeJarBalances?.[projectId] ?? 0;
  const jarDecrease = Math.min(amount, Math.max(0, currentBal));
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "users", uid, "donations")), {
    causeId: projectId,
    causeTitle: projectTitle,
    amount,
    ...(date ? { date } : {}),
    donatedAt: serverTimestamp(),
  });
  batch.update(userRef, {
    totalDonated: increment(amount),
    savedTowardActiveCause: 0,
    [`causeJarBalances.${projectId}`]: increment(-jarDecrease),
    [`causeJarOverflowCounts.${projectId}`]: 0,
  });
  // NOTE: project.totalRaised is NOT incremented here — it was already counted when the skip was logged.
  // Donating converts the pledged jar amount to an actual donation; no new money enters the cause total.
  await batch.commit();
  // Track total donated on the project doc so organizers can see it (best-effort)
  updateDoc(doc(db, "projects", projectId), { totalDonated: increment(amount) }).catch(() => {});
  // Record last donation date for 30-day nudge logic (best-effort)
  updateDoc(doc(db, "users", uid), { lastDonationDate: new Date().toISOString().slice(0, 10) }).catch(() => {});
}

export async function recordPurchase(uid: string, goalId: string, goalLabel: string, targetAmount: number, amount: number): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "users", uid, "spendingHistory")), {
    goalId,
    label: goalLabel,
    targetAmount,
    amountSaved: amount,
    purchasedAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", uid), {
    totalSpent: increment(amount),
    [`goalJarBalances.${goalId}`]: increment(-amount),
  });
  await batch.commit();
}

export function subscribeToDonations(uid: string, callback: (donations: DonationEvent[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "donations"), orderBy("donatedAt", "desc"), limit(50));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DonationEvent))));
}

export async function updateDonation(uid: string, donationId: string, newAmount: number, oldAmount: number, causeId: string, date?: string): Promise<void> {
  const delta = newAmount - oldAmount;
  const batch = writeBatch(db);
  const donationUpdates: Record<string, any> = { amount: newAmount };
  if (date !== undefined) donationUpdates.date = date;
  batch.update(doc(db, "users", uid, "donations", donationId), donationUpdates);
  if (delta !== 0) {
    // If increasing the donation, cap the jar decrease so it doesn't go negative
    const userSnap = await getDoc(doc(db, "users", uid));
    const currentBal: number = userSnap.data()?.causeJarBalances?.[causeId] ?? 0;
    const jarDelta = delta > 0 ? -Math.min(delta, Math.max(0, currentBal)) : -delta;
    batch.update(doc(db, "users", uid), {
      totalDonated: increment(delta),
      [`causeJarBalances.${causeId}`]: increment(jarDelta),
    });
  }
  await batch.commit();
}

export async function deleteDonation(uid: string, donationId: string, amount: number, causeId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "donations", donationId));
  batch.update(doc(db, "users", uid), {
    totalDonated: increment(-amount),
    [`causeJarBalances.${causeId}`]: increment(amount),
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
  amountSaved: number,
  goalId?: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "spendingHistory", eventId));
  const updates: Record<string, any> = { totalSpent: increment(-amountSaved) };
  if (goalId) updates[`goalJarBalances.${goalId}`] = increment(amountSaved);
  batch.update(doc(db, "users", uid), updates);
  await batch.commit();
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
  const { getAllSkips } = await import("./skips");

  // Sum all skips
  const skips = await getAllSkips(uid);
  const skipTotals = skips.reduce(
    (acc, skip) => {
      const split = skip.jarSplit ?? defaultSplit;
      return {
        totalSaved: acc.totalSaved + skip.amount,
        totalSkips: acc.totalSkips + 1,
        totalGiveAllocated: acc.totalGiveAllocated + skip.amount * (split.give / 100),
        totalLiveAllocated: acc.totalLiveAllocated + skip.amount * (split.live / 100),
        xp: acc.xp + xpForSkip(skip.amount),
      };
    },
    { totalSaved: 0, totalSkips: 0, totalGiveAllocated: 0, totalLiveAllocated: 0, xp: 0 }
  );
  const recalcLevel = levelForXp(skipTotals.xp);

  // Sum all donations
  const donationsSnap = await getDocs(collection(db, "users", uid, "donations"));
  const totalDonated = donationsSnap.docs.reduce((sum, d) => sum + ((d.data().amount as number) ?? 0), 0);

  // Sum all spending history
  const spendingSnap = await getDocs(collection(db, "users", uid, "spendingHistory"));
  const totalSpent = spendingSnap.docs.reduce((sum, d) => sum + ((d.data().amountSaved as number) ?? 0), 0);

  // Rebuild per-cause jar balances from skip history minus donations per cause
  const causeJarBalances: Record<string, number> = {};
  skips.forEach((skip) => {
    const split = skip.jarSplit ?? defaultSplit;
    if (skip.projectId) {
      causeJarBalances[skip.projectId] = (causeJarBalances[skip.projectId] ?? 0) + skip.amount * (split.give / 100);
    }
  });
  donationsSnap.docs.forEach((d) => {
    const { causeId, amount: donAmt } = d.data() as { causeId?: string; amount?: number };
    if (causeId) {
      causeJarBalances[causeId] = Math.max(0, (causeJarBalances[causeId] ?? 0) - (donAmt ?? 0));
    }
  });

  // Consolidate: when a user switches causes they always move or donate, so any
  // non-active balance rebuilt from raw skip history is a phantom from that transfer.
  // Exception: expired challenge balances are intentionally parked (awaiting donation).
  const profileSnap = await getDoc(doc(db, "users", uid));
  const activeProjectId: string | null = profileSnap.data()?.activeProjectId ?? null;
  const nonActiveIds = Object.keys(causeJarBalances).filter((id) => id !== activeProjectId && causeJarBalances[id] > 0);
  if (nonActiveIds.length > 0) {
    const { getDoc: getProjectDoc, doc: projectDoc } = await import("firebase/firestore");
    for (const id of nonActiveIds) {
      const projSnap = await getProjectDoc(projectDoc(db, "projects", id));
      const projData = projSnap.data();
      const isExpiredChallenge =
        projData?.projectKind === "challenge" &&
        projData?.endDate?.toMillis != null &&
        projData.endDate.toMillis() < Date.now();
      if (!isExpiredChallenge && activeProjectId) {
        causeJarBalances[activeProjectId] = (causeJarBalances[activeProjectId] ?? 0) + causeJarBalances[id];
        causeJarBalances[id] = 0;
      }
    }
  }

  const totals = { ...skipTotals, totalDonated, totalSpent, causeJarBalances, level: recalcLevel };
  await updateDoc(doc(db, "users", uid), totals);
  return totals;
}
