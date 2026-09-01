import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { getChallengeTotals } from "./challengeTotals";

describe("fundraiser totals after editing details", () => {
  it("preserves legacy donations across repeated renames without counting donations assigned elsewhere", async () => {
    const records = [
      { causeId: "books", causeTitle: "Original title", amount: 50 },
      { causeTitle: "Original title", amount: 20 },
      { causeTitle: "Second title", amount: 30 },
      { causeId: "another-fundraiser", causeTitle: "Original title", amount: 999 },
      { causeTitle: "Unrelated title", amount: 999 },
    ];
    const db = {
      collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
      collectionGroup: () => ({ get: async () => ({ docs: records.map((data, index) => ({
        get: (key: string) => data[key as keyof typeof data], ref: { path: `donations/${index}` },
      })) }) }),
    } as unknown as Firestore;
    const before = await getChallengeTotals(db, "books", "Second title", ["Original title"]);
    const after = await getChallengeTotals(db, "books", "Third title", ["Original title", "Second title"]);
    expect(before).toEqual({ totalPledged: 0, totalDonated: 100, total: 100 });
    expect(after).toEqual(before);
  });

  it("keeps historical and new totals unchanged when receipts live in a separate subcollection", async () => {
    const donationRecords = [
      { causeId: "books", causeTitle: "Books", amount: 10 },
      { causeId: "books", causeTitle: "Books", amount: 20 },
    ];
    const jarProfile = {
      totalSaved: 50,
      totalSpent: 0,
      totalDonated: 0,
      totalDonatedFromSkips: 0,
      causeJarBalances: { books: 50 },
      goalJarBalances: {},
    };
    const db = {
      collection: () => ({ where: () => ({ get: async () => ({ docs: [{ data: () => jarProfile }] }) }) }),
      collectionGroup: (name: string) => {
        expect(name).toBe("donations");
        return { get: async () => ({ docs: donationRecords.map((data, index) => ({
          get: (key: string) => data[key as keyof typeof data],
          ref: { path: `users/alice/donations/${index}` },
        })) }) };
      },
    } as unknown as Firestore;

    expect(await getChallengeTotals(db, "books", "Books")).toEqual({
      totalPledged: 50,
      totalDonated: 30,
      total: 80,
    });
  });
});
