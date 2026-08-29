import { describe, expect, it } from "vitest";
import { isSharedFundraiserSkip, isVisibleGroupFeedItem } from "./feedPrivacy";

describe("fundraiser feed privacy", () => {
  it("hides feed records explicitly marked private", () => {
    expect(isVisibleGroupFeedItem({ shareName: false })).toBe(false);
    expect(isVisibleGroupFeedItem({ shareName: true })).toBe(true);
    expect(isVisibleGroupFeedItem({})).toBe(true);
  });

  it("only reconstructs a local feed item after an explicit opt-in", () => {
    expect(isSharedFundraiserSkip({ shareWithCommunity: true })).toBe(true);
    expect(isSharedFundraiserSkip({ shareWithCommunity: false })).toBe(false);
    expect(isSharedFundraiserSkip({})).toBe(false);
  });
});
