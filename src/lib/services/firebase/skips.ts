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
import { today } from "@/lib/utils/dates";

export interface LogSkipParams {
  uid: string;
  category: string;
  categoryLabel: string;
  categoryEmoji: string;
  amount: number;
  projectId: string | null;
  projectTitle: string | null;
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
  displayName?: string;
  photoURL?: string | null;
}

export async function logSkip(params: LogSkipParams): Promise<{ skipId: string; newTotal: number; newXp: number; newLevel: number; newStreak: number }> {
  const {
    uid, category, categoryLabel, categoryEmoji, amount,
    projectId, projectTitle, currentTotalSaved, currentTotalSkips,
    currentXp, currentStreak, currentLongestStreak, lastSkipDate,
    savedTowardActiveCause, shareWithCommunity, whatSkipped, notes,
    displayName, photoURL,
  } = params;

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
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  })();

  if (lastSkipDate === todayStr) {
    // Already skipped today, no streak change
  } else if (lastSkipDate === yesterdayStr) {
    newStreak = currentStreak + 1;
  } else {
    newStreak = 1;
  }

  const newLongestStreak = Math.max(currentLongestStreak, newStreak);

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
    message: `skipped ${categoryLabel} and saved ${formatAmount(amount)}`,
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

  // 5. Community share (opt-in)
  if (shareWithCommunity) {
    try {
      // Write to community feed — use skip ID as doc ID so edits/deletes can find it
      const communityFeedRef = doc(db, "communityFeed", skipRef.id);
      const communityBatch = writeBatch(db);
      communityBatch.set(communityFeedRef, {
        uid,
        displayName: displayName || "Skipper",
        ...(photoURL ? { photoURL } : {}),
        type: "skip",
        skipId: skipRef.id,
        skipAmount: amount,
        skipCategory: category,
        skipEmoji: categoryEmoji,
        projectTitle,
        message: `skipped ${categoryLabel} and saved ${formatAmount(amount)}`,
        createdAt: serverTimestamp(),
      });
      await communityBatch.commit();

      // Update per-cause counter if a cause was selected
      if (projectId) {
        const causeTotalRef = ref(rtdb, `causeTotals/${projectId}`);
        await runTransaction(causeTotalRef, (current) => (current || 0) + amount);
      }
    } catch (e) {
      // Non-critical, continue
    }
  }

  return {
    skipId: skipRef.id,
    newTotal: newTotalSaved,
    newXp,
    newLevel,
    newStreak,
  };
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
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
  updates: Partial<Pick<Skip, "category" | "categoryLabel" | "categoryEmoji" | "amount" | "projectId" | "projectTitle" | "whatSkipped" | "notes">>,
  amountDelta: number
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid, "skips", skipId), updates);
  if (amountDelta !== 0) {
    batch.update(doc(db, "users", uid), { totalSaved: increment(amountDelta) });
  }
  await batch.commit();
}

export async function deleteSkip(uid: string, skipId: string, amount: number): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "skips", skipId));
  batch.update(doc(db, "users", uid), {
    totalSaved: increment(-amount),
    totalSkips: increment(-1),
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
