import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import { Skip } from "@/lib/types/models";
import { apiRequest } from "./apiClient";

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
  return apiRequest<{ skipId: string; newTotal: number; newXp: number; newLevel: number; newStreak: number; giveJarOverflowCount?: number }>("/api/skips", "POST", params);
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
  liveAllocDelta = 0,
  projectId?: string | null
): Promise<void> {
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  ) as typeof updates;
  await apiRequest(`/api/skips/${skipId}`, "PATCH", { updates: cleanUpdates });
}

export async function deleteSkip(
  uid: string,
  skipId: string,
  amount: number,
  giveAllocAmount = 0,
  liveAllocAmount = 0,
  projectId?: string | null
): Promise<void> {
  await apiRequest(`/api/skips/${skipId}`, "DELETE");
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
