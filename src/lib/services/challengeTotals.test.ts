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
});
