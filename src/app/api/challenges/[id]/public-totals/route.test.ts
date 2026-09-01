import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  projectGet: vi.fn(),
  getCachedChallengeTotals: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({ get: state.projectGet }),
    }),
  }),
}));
vi.mock("@/lib/services/cachedChallengeTotals", () => ({
  getCachedChallengeTotals: state.getCachedChallengeTotals,
  PUBLIC_CHALLENGE_TOTALS_CACHE_CONTROL: "public, s-maxage=15, stale-while-revalidate=30",
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  state.projectGet.mockResolvedValue({
    exists: true,
    data: () => ({ title: "Books", previousTitles: ["Old Books"] }),
  });
  state.getCachedChallengeTotals.mockResolvedValue({
    totalPledged: 100,
    totalDonated: 43,
    total: 143,
  });
});

describe("public fundraiser totals", () => {
  it("returns the canonical result with short shared-cache headers", async () => {
    const response = await GET(
      new Request("https://iskipped.com/api/challenges/books/public-totals"),
      { params: Promise.resolve({ id: "books" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalPledged: 100,
      totalDonated: 43,
      total: 143,
    });
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=15, stale-while-revalidate=30",
    );
    expect(state.getCachedChallengeTotals).toHaveBeenCalledWith(
      "books",
      "Books",
      ["Old Books"],
    );
  });
});
