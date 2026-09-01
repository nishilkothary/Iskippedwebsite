import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmLargeAmount,
  getLargeAmountConfirmationMessage,
  needsLargeAmountConfirmation,
} from "@/lib/utils/largeAmountConfirmation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("large amount confirmation", () => {
  it("starts at exactly $500", () => {
    expect(needsLargeAmountConfirmation(499.99)).toBe(false);
    expect(needsLargeAmountConfirmation(500)).toBe(true);
    expect(needsLargeAmountConfirmation(10_000)).toBe(true);
  });

  it("shows the exact amount and destination in the skip message", () => {
    expect(getLargeAmountConfirmationMessage("skip", 500, "School Books")).toBe(
      "That’s a big skip—nice!\n\nYou’re about to log $500.00 as a skip for School Books. Is that correct?",
    );
  });

  it("shows the exact amount and recipient in the donation message", () => {
    expect(getLargeAmountConfirmationMessage("donation", 750.25, "Food Bank")).toBe(
      "What a generous donation!\n\nYou’re about to log a $750.25 donation to Food Bank. Is that correct?",
    );
  });

  it("does not submit a large amount when the user cancels", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });

    expect(confirmLargeAmount("skip", 500, "School Books")).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("does not interrupt an amount below the threshold", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });

    expect(confirmLargeAmount("donation", 499.99, "Food Bank")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
