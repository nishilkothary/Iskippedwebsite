import { describe, expect, it } from "vitest";
import { formatCurrencyUpToCents } from "@/lib/utils/currency";

describe("formatCurrencyUpToCents", () => {
  it("omits cents for whole-dollar fundraiser totals", () => {
    expect(formatCurrencyUpToCents(143)).toBe("$143");
    expect(formatCurrencyUpToCents(5_000)).toBe("$5,000");
  });

  it("preserves cents when they are present", () => {
    expect(formatCurrencyUpToCents(143.25)).toBe("$143.25");
  });
});
