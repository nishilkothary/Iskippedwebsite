import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Unsubscribe,
  where,
  doc,
  deleteDoc,
  updateDoc,
  Timestamp,
  QuerySnapshot,
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "./config";
import { FeedItem, GlobalStats } from "@/lib/types/models";

export function subscribeToChallengeFeed(projectId: string, callback: (items: FeedItem[]) => void): Unsubscribe {
  const feedCollection = collection(db, "communityFeed");
  const q = query(
    feedCollection,
    where("projectId", "==", projectId),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const publish = (snap: QuerySnapshot) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedItem));
    items.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    callback(items.slice(0, 50));
  };

  let disposed = false;
  let usingFallback = false;
  let unsubscribe: Unsubscribe = () => {};
  const subscribeFallback = () => {
    if (disposed || usingFallback) return;
    usingFallback = true;
    unsubscribe();
    // The ordered query above needs a composite Firestore index. The fallback
    // still scopes the feed to this fundraiser and sorts the small result set locally.
    unsubscribe = onSnapshot(
      query(feedCollection, where("projectId", "==", projectId)),
      publish,
      () => callback([])
    );
  };

  unsubscribe = onSnapshot(q, publish, subscribeFallback);
  return () => {
    disposed = true;
    unsubscribe();
  };
}

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
