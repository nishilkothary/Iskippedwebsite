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
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "./config";
import { FeedItem, GlobalStats } from "@/lib/types/models";

export function subscribeToCauseTotals(callback: (totals: Record<string, number>) => void): () => void {
  const totalsRef = ref(rtdb, "causeTotals");
  return onValue(totalsRef, (snap) => {
    callback(snap.exists() ? (snap.val() as Record<string, number>) : {});
  });
}

export function subscribeToCommunityFeed(callback: (items: FeedItem[]) => void): Unsubscribe {
  const q = query(
    collection(db, "communityFeed"),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedItem));
    callback(items);
  });
}

export function subscribeToFeed(uid: string, callback: (items: FeedItem[]) => void): Unsubscribe {
  const q = query(
    collection(db, "feed", uid, "items"),
    orderBy("createdAt", "desc"),
    limit(50)
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

export async function getLeaderboard(limitCount = 20): Promise<Array<{ uid: string; displayName: string; photoURL: string | null; totalSaved: number }>> {
  const q = query(
    collection(db, "users"),
    orderBy("totalSaved", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    uid: d.id,
    displayName: d.data().displayName || "Skipper",
    photoURL: d.data().photoURL || null,
    totalSaved: d.data().totalSaved || 0,
  }));
}

export async function searchUsers(displayName: string): Promise<Array<{ uid: string; displayName: string; photoURL: string | null }>> {
  const q = query(
    collection(db, "users"),
    where("displayName", ">=", displayName),
    where("displayName", "<=", displayName + "\uf8ff"),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    uid: d.id,
    displayName: d.data().displayName,
    photoURL: d.data().photoURL || null,
  }));
}
