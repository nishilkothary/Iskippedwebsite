import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Unsubscribe,
  where,
  getAggregateFromServer,
  sum,
  doc,
  deleteDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "./config";
import { FeedItem, GlobalStats } from "@/lib/types/models";

export function subscribeToCommunityFeed(callback: (items: FeedItem[]) => void): Unsubscribe {
  const q = query(
    collection(db, "communityFeed"),
    orderBy("createdAt", "desc"),
    limit(15)
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedItem));
    callback(items);
  });
}

export function subscribeToGlobalStats(callback: (stats: GlobalStats) => void): () => void {
  const statsRef = ref(rtdb, "globalStats");
  return onValue(statsRef, (snap) => {
    if (snap.exists()) {
      callback(snap.val() as GlobalStats);
    }
  });
}

export async function getCommunityTotalSaved(): Promise<number> {
  const snap = await getAggregateFromServer(collection(db, "users"), {
    totalSaved: sum("totalSaved"),
  });
  return snap.data().totalSaved ?? 0;
}

export async function deleteCommunityFeedItem(skipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "communityFeed", skipId));
  } catch {
    // Doc may not exist (old skips or not shared)
  }
}

export async function updateCommunityFeedItem(
  skipId: string,
  updates: Partial<Pick<FeedItem, "skipAmount" | "message">>
): Promise<void> {
  try {
    await updateDoc(doc(db, "communityFeed", skipId), updates);
  } catch {
    // Doc may not exist
  }
}

export async function deleteOldCommunityFeedItems(beforeDate: Date): Promise<number> {
  const q = query(
    collection(db, "communityFeed"),
    where("createdAt", "<", Timestamp.fromDate(beforeDate)),
    limit(200)
  );
  const snap = await getDocs(q);
  const deletes = snap.docs.map((d) => deleteDoc(doc(db, "communityFeed", d.id)).catch(() => {}));
  await Promise.all(deletes);
  return snap.docs.length;
}
