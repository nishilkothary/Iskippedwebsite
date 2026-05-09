import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
  increment,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { ref, runTransaction } from "firebase/database";
import { db, rtdb } from "./config";
import { Skip } from "@/lib/types/models";
import { getImpactMessage } from "@/lib/constants/impactMessages";
import { xpForSkip, levelForXp } from "@/lib/utils/xp";
import { today, yesterday } from "@/lib/utils/dates";
import { formatUnits } from "@/lib/utils/impact";

export interface LogSkipParams {
  uid: string;
  category: string;
  categoryLabel: string;
  categoryEmoji: string;
  amount: number;
  projectId: string | null;
  projectTitle: string | null;
  projectLocation?: string | null;
  projectUnitName?: string | null;
  projectUnitCost?: number | null;
  projectUnitDisplay?: string | null;
  projectUnitIsGoal?: boolean | null;
  currentTotalSaved: number;
  currentTotalSkips: number;
  currentXp: number;
  currentStreak: number;
  currentLongestStreak: number;
  lastSkipDate: string | null;
  savedTowardActiveCause: number;
  shareWithCommunity?: boolean;
  whatSkipped?: string;
  notes?: string;
  jarSplit?: { give: number; live: number };
  defaultJarSplit?: { give: number; live: number };
  activeGoalId?: string | null;
  displayName?: string;
  photoURL?: string | null;
  causeGoalAmount?: number;
  causeJarBalance?: number;
  causeJarOverflowCount?: number;
}

export async function logSkip(params: LogSkipParams): Promise<{ skipId: string; newTotal: number; newXp: number; newLevel: number; newStreak: number; giveJarOverflowCount?: number }> {
  const {
    uid, category, categoryLabel, categoryEmoji, amount,
    projectId, projectTitle, projectLocation,
    projectUnitName, projectUnitCost, projectUnitDisplay, projectUnitIsGoal,
    currentTotalSaved, currentTotalSkips,
    currentXp, currentStreak, currentLongestStreak, lastSkipDate,
    savedTowardActiveCause, shareWithCommunity, whatSkipped, notes,
    jarSplit, defaultJarSplit, displayName, photoURL, activeGoalId,
  } = params;
  // Validate and normalize: clamp give to [0,100], derive live = 100 - give
  const rawGive = jarSplit?.give ?? defaultJarSplit?.give ?? 50;
  const clampedGive = Math.min(100, Math.max(0, rawGive));
  const effectiveSplit = { give: clampedGive, live: 100 - clampedGive };

  const giveAmountForMessage = amount * (effectiveSplit.give / 100);
  let causeSuffix = "";
  if (projectTitle && projectUnitName && projectUnitCost && !projectUnitIsGoal) {
    // Count mode: "to help fund 25 Emergency Meals in Ukraine"
    const unitsStr = formatUnits(giveAmountForMessage, projectUnitCost, projectUnitName);
    causeSuffix = ` to help fund ${unitsStr}${projectLocation ? ` in ${projectLocation}` : ""}`;
  } else if (projectTitle && projectUnitName && projectUnitCost && projectUnitIsGoal) {
    // % mode: "to help fund 8% of A Chromebook for a Student to Learn Coding"
    const pct = Math.max(1, Math.round((giveAmountForMessage / projectUnitCost) * 100));
    causeSuffix = ` to help fund ${pct}% of ${projectTitle}`;
  } else if (projectTitle) {
    causeSuffix = ` to help fund ${projectTitle}`;
  }

  const giveAmount = amount * (effectiveSplit.give / 100);
  const liveAmount = amount * (effectiveSplit.live / 100);

  const todayStr = today();
  const impactMessage = getImpactMessage(amount);
  const xpEarned = xpForSkip(amount);
  const newXp = currentXp + xpEarned;
  const newLevel = levelForXp(newXp);
  const newTotalSaved = currentTotalSaved + amount;
  const newTotalSkips = currentTotalSkips + 1;
  const newSavedToward = (projectId ? savedTowardActiveCause + amount : savedTowardActiveCause);

  // Calculate streak
  let newStreak = currentStreak;
  const yesterdayStr = yesterday();

  if (lastSkipDate === todayStr) {
    // Already skipped today, no streak change
  } else if (lastSkipDate === yesterdayStr) {
    newStreak = currentStreak + 1;
  } else {
    newStreak = 1;
  }

  const newLongestStreak = Math.max(currentLongestStreak, newStreak);

  // Overflow count: tracks skips taken while give jar is at/above goal
  let newOverflowCount: number | undefined;
  if (projectId && (params.causeGoalAmount ?? 0) > 0 && giveAmount > 0) {
    const newJarBal = (params.causeJarBalance ?? 0) + giveAmount;
    if (newJarBal >= params.causeGoalAmount!) {
      newOverflowCount = (params.causeJarOverflowCount ?? 0) + 1;
    }
  }

  // Batch write
  const batch = writeBatch(db);

  // 1. Add skip document
  const skipRef = doc(collection(db, "users", uid, "skips"));
  batch.set(skipRef, {
    uid,
    category,
    categoryLabel,
    categoryEmoji,
    amount,
    date: todayStr,
    projectId,
    projectTitle,
    impactMessage,
    createdAt: serverTimestamp(),
    ...(whatSkipped ? { whatSkipped } : {}),
    ...(notes ? { notes } : {}),
    ...(jarSplit ? { jarSplit } : {}),
  });

  // 2. Update user stats
  batch.update(doc(db, "users", uid), {
    totalSaved: newTotalSaved,
    totalSkips: newTotalSkips,
    xp: newXp,
    level: newLevel,
    streak: newStreak,
    longestStreak: newLongestStreak,
    lastSkipDate: todayStr,
    savedTowardActiveCause: newSavedToward,
    totalGiveAllocated: increment(giveAmount),
    totalLiveAllocated: increment(liveAmount),
    ...(projectId    ? { [`causeJarBalances.${projectId}`]:   increment(giveAmount)  } : {}),
    ...(activeGoalId ? { [`goalJarBalances.${activeGoalId}`]: increment(liveAmount) } : {}),
    ...(newOverflowCount !== undefined && projectId ? { [`causeJarOverflowCounts.${projectId}`]: newOverflowCount } : {}),
  });

  // 3. Fan-out to feed
  const feedRef = doc(collection(db, "feed", uid, "items"));
  batch.set(feedRef, {
    uid,
    displayName: displayName || "Skipper",
    ...(photoURL ? { photoURL } : {}),
    type: "skip",
    skipAmount: amount,
    skipCategory: category,
    skipEmoji: categoryEmoji,
    projectTitle,
    message: `skipped ${whatSkipped || categoryLabel}${causeSuffix}`,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  // 4. Update global counters in Realtime DB
  try {
    const statsRef = ref(rtdb, "globalStats");
    await runTransaction(statsRef, (current) => {
      if (!current) {
        return { totalSaved: amount, totalSkips: 1, totalUsers: 0 };
      }
      return {
        ...current,
        totalSaved: (current.totalSaved || 0) + amount,
        totalSkips: (current.totalSkips || 0) + 1,
      };
    });
  } catch (e) {
    // Non-critical, continue
  }

  // 5. Community share — always visible, identity is opt-in
  try {
    const shareName = shareWithCommunity ?? false;
    // Write to community feed — use skip ID as doc ID so edits/deletes can find it
    const communityFeedRef = doc(db, "communityFeed", skipRef.id);
    const communityBatch = writeBatch(db);
    communityBatch.set(communityFeedRef, {
      uid,
      displayName: shareName ? (displayName || "Skipper") : "Anonymous",
      ...(shareName && photoURL ? { photoURL } : {}),
      type: "skip",
      skipId: skipRef.id,
      skipAmount: amount,
      skipCategory: category,
      skipEmoji: categoryEmoji,
      skipLabel: whatSkipped || categoryLabel,
      projectTitle,
      ...(projectLocation ? { projectLocation } : {}),
      shareName,
      message: `skipped ${whatSkipped || categoryLabel}${causeSuffix}`,
      createdAt: serverTimestamp(),
    });
    await communityBatch.commit();

    // Cause counter only when identity is shared (preserves original behavior)
    if (shareName && projectId) {
      const causeTotalRef = ref(rtdb, `causeTotals/${projectId}`);
      await runTransaction(causeTotalRef, (current) => (current || 0) + amount);
    }
  } catch (e) {
    // Non-critical, continue
  }

  return {
    skipId: skipRef.id,
    newTotal: newTotalSaved,
    newXp,
    newLevel,
    newStreak,
    giveJarOverflowCount: newOverflowCount,
  };
}

export function subscribeToSkips(uid: string, callback: (skips: Skip[]) => void): Unsubscribe {
  const q = query(
    collection(db, "users", uid, "skips"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const skips = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Skip));
    callback(skips);
  });
}

export async function updateSkip(
  uid: string,
  skipId: string,
  updates: Partial<Pick<Skip, "category" | "categoryLabel" | "categoryEmoji" | "amount" | "projectId" | "projectTitle" | "whatSkipped" | "notes" | "jarSplit">>,
  amountDelta: number,
  giveAllocDelta = 0,
  liveAllocDelta = 0
): Promise<void> {
  const batch = writeBatch(db);
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  ) as typeof updates;
  batch.update(doc(db, "users", uid, "skips", skipId), cleanUpdates);
  const userUpdate: Record<string, unknown> = {};
  if (amountDelta !== 0) userUpdate.totalSaved = increment(amountDelta);
  if (giveAllocDelta !== 0) userUpdate.totalGiveAllocated = increment(giveAllocDelta);
  if (liveAllocDelta !== 0) userUpdate.totalLiveAllocated = increment(liveAllocDelta);
  if (Object.keys(userUpdate).length > 0) {
    batch.update(doc(db, "users", uid), userUpdate);
  }
  await batch.commit();
}

export async function deleteSkip(
  uid: string,
  skipId: string,
  amount: number,
  giveAllocAmount = 0,
  liveAllocAmount = 0,
  projectId?: string | null
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "skips", skipId));
  batch.update(doc(db, "users", uid), {
    totalSaved: increment(-amount),
    totalSkips: increment(-1),
    totalGiveAllocated: increment(-giveAllocAmount),
    totalLiveAllocated: increment(-liveAllocAmount),
    ...(projectId ? { [`causeJarBalances.${projectId}`]: increment(-giveAllocAmount) } : {}),
  });
  await batch.commit();
}

export async function getRecentSkips(uid: string, count = 10): Promise<Skip[]> {
  const q = query(
    collection(db, "users", uid, "skips"),
    orderBy("createdAt", "desc"),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Skip));
}

export async function getAllSkips(uid: string): Promise<Skip[]> {
  const snap = await getDocs(collection(db, "users", uid, "skips"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Skip));
}
