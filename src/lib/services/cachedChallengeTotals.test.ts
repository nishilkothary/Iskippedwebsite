import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: { id: "admin-db" },
  getChallengeTotals: vi.fn(),
  cacheKey: [] as string[],
  cacheOptions: {} as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: any[]) => Promise<unknown>,
    key: string[],
    options: Record<string, unknown>,
  ) => {
    state.cacheKey = key;
    state.cacheOptions = options;
    return fn;
  },
}));
vi.mock("@/lib/services/firebaseAdmin", () => ({ getAdminDb: () => state.db }));
vi.mock("@/lib/services/challengeTotals", () => ({
  getChallengeTotals: state.getChallengeTotals,
}));

import {
  CHALLENGE_TOTALS_REVALIDATE_SECONDS,
  getCachedChallengeTotals,
} from "@/lib/services/cachedChallengeTotals";

beforeEach(() => {
  vi.clearAllMocks();
  state.getChallengeTotals.mockResolvedValue({ totalPledged: 100, totalDonated: 43, total: 143 });
});

describe("cached challenge totals", () => {
  it("delegates to the unchanged canonical calculation with a 15-second cache", async () => {
    const result = await getCachedChallengeTotals("books", "Books", ["Old Books"]);

    expect(result).toEqual({ totalPledged: 100, totalDonated: 43, total: 143 });
    expect(state.getChallengeTotals).toHaveBeenCalledWith(
      state.db,
      "books",
      "Books",
      ["Old Books"],
    );
    expect(state.cacheKey).toEqual(["canonical-challenge-totals-v1"]);
    expect(state.cacheOptions).toEqual({ revalidate: CHALLENGE_TOTALS_REVALIDATE_SECONDS });
    expect(CHALLENGE_TOTALS_REVALIDATE_SECONDS).toBe(15);
  });
});
