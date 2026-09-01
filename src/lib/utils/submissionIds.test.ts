import { describe, expect, it } from "vitest";
import { clearSubmissionId, getOrCreateSubmissionId } from "./submissionIds";

describe("pending submission IDs", () => {
  it("reuses an ID only while identical details are awaiting confirmation", () => {
    const payload = { amount: 25, projectId: "books", allocationTarget: { type: "fundraiser", id: "books" } };
    const first = getOrCreateSubmissionId("skip", payload);
    expect(getOrCreateSubmissionId("skip", { ...payload })).toBe(first);

    const changed = getOrCreateSubmissionId("skip", { ...payload, amount: 26 });
    expect(changed).not.toBe(first);

    clearSubmissionId("skip", changed);
    expect(getOrCreateSubmissionId("skip", { ...payload, amount: 26 })).not.toBe(changed);
  });

  it("keeps skip and donation receipts independent", () => {
    const payload = { amount: 10, projectId: "books" };
    const skipId = getOrCreateSubmissionId("skip", payload);
    const donationId = getOrCreateSubmissionId("donation", payload);
    expect(skipId).not.toBe(donationId);
    clearSubmissionId("skip", skipId);
    clearSubmissionId("donation", donationId);
  });
});
