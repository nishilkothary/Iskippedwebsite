import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { levelForXp, REFERRAL_BONUS_XP, xpForSkip } from "@/lib/utils/xp";
import { getConsecutiveWeeklyStreak, getLongestWeeklyStreak, today } from "@/lib/utils/dates";

const state = vi.hoisted(() => ({
  verify: vi.fn(),
  adjustGlobalStats: vi.fn(),
  docs: new Map<string, Record<string, any>>(),
  txSets: [] as Array<{ path: string; data: Record<string, any>; options?: unknown }>,
  txUpdates: [] as Array<{ path: string; data: Record<string, any> }>,
  directSets: [] as Array<{ path: string; data: Record<string, any> }>,
  directUpdates: [] as Array<{ path: string; data: Record<string, any> }>,
  autoId: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/globalStats", () => ({
  adjustGlobalStats: state.adjustGlobalStats,
}));
vi.mock("@/lib/services/firebaseAdmin", () => {
  const snapshot = (path: string, data: Record<string, any> | undefined) => ({
    exists: data !== undefined,
    id: path.split("/").at(-1),
    ref: { path },
    data: () => data,
    get: (field: string) => data?.[field],
  });
  const collectionRef = (path: string): any => ({
    kind: "collection",
    path,
    doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++state.autoId}`}`),
  });
  const docRef = (path: string): any => ({
    kind: "document",
    path,
    id: path.split("/").at(-1),
    collection: (name: string) => collectionRef(`${path}/${name}`),
    set: async (data: Record<string, any>) => {
      state.directSets.push({ path, data });
      state.docs.set(path, data);
    },
    update: async (data: Record<string, any>) => {
      state.directUpdates.push({ path, data });
    },
  });
  const db = {
    collection: (name: string) => collectionRef(name),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      get: async (ref: any) => {
        if (ref.kind === "collection") {
          const prefix = `${ref.path}/`;
          const docs = Array.from(state.docs.entries())
            .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
            .map(([path, data]) => snapshot(path, data));
          return { docs };
        }
        return snapshot(ref.path, state.docs.get(ref.path));
      },
      set: (ref: any, data: Record<string, any>, options?: unknown) => {
        state.txSets.push({ path: ref.path, data, options });
        state.docs.set(ref.path, data);
      },
      update: (ref: any, data: Record<string, any>) => {
        state.txUpdates.push({ path: ref.path, data });
      },
    }),
  };
  return {
    getAdminAuth: () => ({ verifyIdToken: state.verify }),
    getAdminDb: () => db,
  };
});

import { POST } from "./route";

const receipt = "11111111-1111-4111-8111-111111111111";

function post(amount = 25) {
  return POST(new NextRequest("https://iskipped.com/api/skips", {
    method: "POST",
    headers: { authorization: "Bearer valid", "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId: receipt,
      category: "coffee",
      categoryLabel: "Coffee",
      categoryEmoji: "☕",
      amount,
      projectId: "books",
      projectTitle: "Books",
      projectLocation: "Kenya",
      shareWithCommunity: true,
      whatSkipped: "morning coffee",
      allocationTarget: { type: "fundraiser", id: "books" },
      displayName: "Alice",
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.docs.clear();
  state.txSets.length = 0;
  state.txUpdates.length = 0;
  state.directSets.length = 0;
  state.directUpdates.length = 0;
  state.autoId = 0;
  state.verify.mockResolvedValue({ uid: "alice" });
  state.docs.set("users/alice", {
    uid: "alice",
    totalSaved: 100,
    totalSkips: 0,
    totalDonated: 0,
    totalDonatedFromSkips: 0,
    totalSpent: 0,
    xp: 10,
    level: 1,
    streak: 0,
    longestStreak: 0,
    lastSkipDate: null,
    savedTowardActiveCause: 30,
    activeProjectId: "books",
    activeSkipTarget: { type: "fundraiser", id: "books" },
    causeJarBalances: { books: 30 },
    goalJarBalances: {},
    skipLots: {},
    referredBy: "inviter",
  });
  state.docs.set("users/inviter", {
    uid: "inviter",
    xp: 40,
    level: 1,
    referralCount: 2,
  });
  state.docs.set("projects/books", { totalRaised: 30, totalDonated: 0, totalSkips: 0 });
  // A historical skip has no receipt metadata. It remains readable by streak/accounting logic.
  state.docs.set("users/alice/skips/historical-auto-id", { amount: 100, date: "2026-08-20" });
});

describe("skip submission receipts", () => {
  it("accepts the $10,000 per-entry maximum", async () => {
    const response = await post(10_000);

    expect(response.status).toBe(200);
    expect(state.txSets.some((entry) => entry.path === "users/alice/skips/auto-1")).toBe(true);
  });

  it("rejects an amount above $10,000 before making any write", async () => {
    const response = await post(10_000.01);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "amount cannot exceed $10,000" });
    expect(state.txSets).toHaveLength(0);
    expect(state.txUpdates).toHaveLength(0);
    expect(state.directSets).toHaveLength(0);
    expect(state.directUpdates).toHaveLength(0);
    expect(state.adjustGlobalStats).not.toHaveBeenCalled();
  });

  it("returns the original result on retry without changing any number or side effect twice", async () => {
    const firstResponse = await post();
    const first = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    const expectedXp = 10 + xpForSkip(25) + REFERRAL_BONUS_XP;
    const expectedStreak = getConsecutiveWeeklyStreak(["2026-08-20", today()], today());
    const expectedLongestStreak = getLongestWeeklyStreak(["2026-08-20", today()]);
    expect(first).toMatchObject({
      skipId: "auto-1",
      newTotal: 125,
      newTotalSkips: 1,
      newXp: expectedXp,
      newLevel: levelForXp(expectedXp),
      newStreak: expectedStreak,
      newLongestStreak: expectedLongestStreak,
      previousTargetBalance: 30,
      targetBalance: 55,
    });

    const userUpdate = state.txUpdates.find((entry) => entry.path === "users/alice")?.data;
    expect(userUpdate).toMatchObject({
      totalSaved: 125,
      xp: first.newXp,
      level: first.newLevel,
      streak: first.newStreak,
      longestStreak: first.newLongestStreak,
      lastSkipDate: expect.any(String),
      "causeJarBalances.books": 55,
    });
    expect(userUpdate?.totalSkips.operand).toBe(1);
    expect(userUpdate?.savedTowardActiveCause.operand).toBe(25);
    expect(userUpdate?.skipLots[first.skipId]).toMatchObject({
      skipId: first.skipId,
      originalLocation: "fundraiser:books",
      balances: { "fundraiser:books": 25 },
    });

    const projectUpdate = state.txSets.find((entry) => entry.path === "projects/books")?.data;
    expect(projectUpdate?.totalRaised.operand).toBe(25);
    expect(projectUpdate?.totalSkips.operand).toBe(1);
    expect(projectUpdate?.memberUids.elements).toEqual(["alice"]);
    const inviterUpdates = state.txUpdates.filter((entry) => entry.path === "users/inviter");
    expect(inviterUpdates).toHaveLength(1);
    expect(inviterUpdates[0].data).toMatchObject({
      xp: 40 + REFERRAL_BONUS_XP,
      level: levelForXp(40 + REFERRAL_BONUS_XP),
    });
    expect(inviterUpdates[0].data.referralCount.operand).toBe(1);
    expect(state.adjustGlobalStats).toHaveBeenCalledTimes(1);
    expect(state.adjustGlobalStats).toHaveBeenCalledWith(25, 1);
    expect(state.directSets.filter((entry) => entry.path.startsWith("communityFeed/"))).toHaveLength(1);

    const countsAfterFirst = {
      sets: state.txSets.length,
      updates: state.txUpdates.length,
      directSets: state.directSets.length,
    };
    const secondResponse = await post();
    const second = await secondResponse.json();
    expect(secondResponse.status).toBe(200);
    expect(second).toEqual(first);
    expect({
      sets: state.txSets.length,
      updates: state.txUpdates.length,
      directSets: state.directSets.length,
    }).toEqual(countsAfterFirst);
    expect(state.adjustGlobalStats).toHaveBeenCalledTimes(1);
    expect(Array.from(state.docs.keys()).filter((path) => path.startsWith("users/alice/skips/"))).toHaveLength(2);
  });

  it("rejects reuse of a receipt for a different amount without writing anything", async () => {
    expect((await post(25)).status).toBe(200);
    const countsAfterFirst = { sets: state.txSets.length, updates: state.txUpdates.length };
    const response = await post(50);
    expect(response.status).toBe(409);
    expect({ sets: state.txSets.length, updates: state.txUpdates.length }).toEqual(countsAfterFirst);
    expect(state.adjustGlobalStats).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy no-receipt request path working", async () => {
    const response = await POST(new NextRequest("https://iskipped.com/api/skips", {
      method: "POST",
      headers: { authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "coffee",
        categoryLabel: "Coffee",
        amount: 5,
        projectId: "books",
        projectTitle: "Books",
        allocationTarget: { type: "fundraiser", id: "books" },
      }),
    }));
    expect(response.status).toBe(200);
    expect(state.txSets.some((entry) => entry.path.includes("/submissionReceipts/"))).toBe(false);
  });
});
