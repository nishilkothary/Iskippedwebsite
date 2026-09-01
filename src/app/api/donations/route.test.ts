import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  verify: vi.fn(),
  docs: new Map<string, Record<string, any>>(),
  txSets: [] as Array<{ path: string; data: Record<string, any>; options?: unknown }>,
  txUpdates: [] as Array<{ path: string; data: Record<string, any> }>,
  directUpdates: [] as Array<{ path: string; data: Record<string, any> }>,
  autoId: 0,
}));

vi.mock("server-only", () => ({}));
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
    update: async (data: Record<string, any>) => {
      state.directUpdates.push({ path, data });
    },
  });
  const db = {
    collection: (name: string) => collectionRef(name),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      get: async (ref: any) => snapshot(ref.path, state.docs.get(ref.path)),
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

const receipt = "22222222-2222-4222-8222-222222222222";

function post(amount = 120) {
  return POST(new NextRequest("https://iskipped.com/api/donations", {
    method: "POST",
    headers: { authorization: "Bearer valid", "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId: receipt,
      amount,
      projectId: "books",
      projectTitle: "Books",
      date: "2026-09-01",
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.docs.clear();
  state.txSets.length = 0;
  state.txUpdates.length = 0;
  state.directUpdates.length = 0;
  state.autoId = 0;
  state.verify.mockResolvedValue({ uid: "alice" });
  state.docs.set("users/alice", {
    uid: "alice",
    totalSaved: 100,
    totalSkips: 2,
    totalDonated: 0,
    totalDonatedFromSkips: 0,
    totalSpent: 0,
    savedTowardActiveCause: 75,
    causeJarBalances: { books: 75 },
    goalJarBalances: {},
    skipLots: {},
    causeStats: { books: { donated: 0 } },
  });
  state.docs.set("projects/books", { totalRaised: 75, totalDonated: 0, totalSkips: 2 });
  // Historical donations remain ordinary records and require no receipt metadata.
  state.docs.set("users/alice/donations/historical-auto-id", {
    causeId: "another-project",
    causeTitle: "Historical",
    amount: 10,
  });
});

describe("donation submission receipts", () => {
  it("accepts the $10,000 per-entry maximum", async () => {
    const response = await post(10_000);

    expect(response.status).toBe(200);
    expect(state.txSets.some((entry) => entry.path === "users/alice/donations/auto-1")).toBe(true);
  });

  it("rejects an amount above $10,000 before making any write", async () => {
    const response = await post(10_000.01);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "amount cannot exceed $10,000" });
    expect(state.txSets).toHaveLength(0);
    expect(state.txUpdates).toHaveLength(0);
    expect(state.directUpdates).toHaveLength(0);
  });

  it("returns the original funding breakdown on retry without changing any balance twice", async () => {
    const firstResponse = await post();
    const first = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    expect(first).toEqual({
      jarDecrease: 75,
      skipBucksDecrease: 25,
      outsideContribution: 20,
      amountFromSkips: 100,
      causeJarBalance: 0,
      newTotalDonated: 120,
      newTotalDonatedFromSkips: 100,
      newCauseDonated: 120,
    });

    const userUpdate = state.txUpdates.find((entry) => entry.path === "users/alice")?.data;
    expect(userUpdate?.totalDonated.operand).toBe(120);
    expect(userUpdate?.totalDonatedFromSkips.operand).toBe(100);
    expect(userUpdate?.["causeStats.books.donated"].operand).toBe(120);
    expect(userUpdate).toMatchObject({
      savedTowardActiveCause: 0,
      causeJarBalances: {},
      goalJarBalances: {},
      "causeJarOverflowCounts.books": 0,
    });

    const donation = state.txSets.find((entry) => entry.path === "users/alice/donations/auto-1")?.data;
    expect(donation).toBeDefined();
    expect(donation).toMatchObject({
      causeId: "books",
      amount: 120,
      jarDecrease: 75,
      skipBucksDecrease: 25,
      outsideContribution: 20,
      amountFromSkips: 100,
    });
    const consumedTotal = Object.values(donation!.ledgerConsumption as Record<string, Record<string, number>>)
      .flatMap((locations) => Object.values(locations))
      .reduce((sum, value) => sum + value, 0);
    expect(consumedTotal).toBe(100);
    const remainingLotTotal = Object.values(userUpdate?.skipLots as Record<string, { balances: Record<string, number> }>)
      .flatMap((lot) => Object.values(lot.balances))
      .reduce((sum, value) => sum + value, 0);
    expect(remainingLotTotal).toBe(0);
    const projectUpdate = state.txSets.find((entry) => entry.path === "projects/books")?.data;
    expect(projectUpdate?.totalRaised.operand).toBe(-75);
    expect(projectUpdate?.totalDonated.operand).toBe(120);
    expect(state.directUpdates.filter((entry) => entry.path === "users/alice")).toHaveLength(1);

    const countsAfterFirst = {
      sets: state.txSets.length,
      updates: state.txUpdates.length,
      directUpdates: state.directUpdates.length,
    };
    const secondResponse = await post();
    const second = await secondResponse.json();
    expect(secondResponse.status).toBe(200);
    expect(second).toEqual(first);
    expect({
      sets: state.txSets.length,
      updates: state.txUpdates.length,
      directUpdates: state.directUpdates.length,
    }).toEqual(countsAfterFirst);
    expect(Array.from(state.docs.keys()).filter((path) => path.startsWith("users/alice/donations/"))).toHaveLength(2);
  });

  it("rejects reuse of a receipt for changed donation details", async () => {
    expect((await post(120)).status).toBe(200);
    const countsAfterFirst = { sets: state.txSets.length, updates: state.txUpdates.length };
    const response = await post(121);
    expect(response.status).toBe(409);
    expect({ sets: state.txSets.length, updates: state.txUpdates.length }).toEqual(countsAfterFirst);
  });

  it("keeps the legacy no-receipt request path working", async () => {
    const response = await POST(new NextRequest("https://iskipped.com/api/donations", {
      method: "POST",
      headers: { authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 5, projectId: "books", projectTitle: "Books" }),
    }));
    expect(response.status).toBe(200);
    expect(state.txSets.some((entry) => entry.path.includes("/submissionReceipts/"))).toBe(false);
  });
});
