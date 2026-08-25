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
import { Skip, SkipAllocationTarget, SkipSourceAllocation } from "@/lib/types/models";
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
  activeGoalId?: string | null;
  displayName?: string;
  photoURL?: string | null;
  causeGoalAmount?: number;
  causeJarBalance?: number;
  causeJarOverflowCount?: number;
  allocationTarget?: SkipAllocationTarget | null;
}

export async function logSkip(params: LogSkipParams): Promise<{ skipId: string; newTotal: number; newXp: number; newLevel: number; newStreak: number; newLongestStreak: number; giveJarOverflowCount?: number }> {
  return apiRequest<{ skipId: string; newTotal: number; newXp: number; newLevel: number; newStreak: number; newLongestStreak: number; giveJarOverflowCount?: number }>("/api/skips", "POST", params);
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
  updates: Partial<Pick<Skip, "category" | "categoryLabel" | "categoryEmoji" | "amount" | "projectId" | "projectTitle" | "whatSkipped" | "notes" | "allocationTarget">>,
  sourceAllocations?: SkipSourceAllocation[],
): Promise<{ causeJarBalances?: Record<string, number>; goalJarBalances?: Record<string, number> }> {
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  ) as typeof updates;
  return apiRequest(`/api/skips/${skipId}`, "PATCH", { updates: cleanUpdates, sourceAllocations });
}

export async function deleteSkip(
  uid: string,
  skipId: string,
  sourceAllocations?: SkipSourceAllocation[],
): Promise<{ causeJarBalances?: Record<string, number>; goalJarBalances?: Record<string, number> }> {
  return apiRequest(`/api/skips/${skipId}`, "DELETE", { sourceAllocations });
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
