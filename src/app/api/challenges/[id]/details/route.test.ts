import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { DESIGNATED_ADMIN_EMAIL } from "@/lib/constants/admin";
import { getFundraiserDetailOverrides } from "@/lib/utils/fundraiserDetails";
import type { Project } from "@/lib/types/models";

const state = vi.hoisted(() => ({ verify: vi.fn(), update: vi.fn(), project: {} as Record<string, unknown>, exists: true }));
vi.mock("@/lib/services/firebaseAdmin", () => ({
  getAdminAuth: () => ({ verifyIdToken: state.verify }),
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({}) }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => fn({
      get: async () => ({ exists: state.exists, data: () => state.project }),
      update: state.update,
    }),
  }),
}));

import { PATCH } from "./route";
function patch(body: unknown, authorization = "Bearer valid") {
  return PATCH(new NextRequest("https://iskipped.com/api/challenges/books/details", {
    method: "PATCH", headers: { authorization, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "books" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.exists = true;
  state.project = { createdBy: null, goalAmount: 5000, totalRaised: 300, donationURL: "https://old.example/donate" };
  state.verify.mockResolvedValue({ uid: "admin", email: DESIGNATED_ADMIN_EMAIL });
});

describe("fundraiser details editing", () => {
  it.each([1000, 10000])("changes a goal to %s without overwriting progress or membership", async (goalAmount) => {
    state.project = {
      ...state.project, totalDonated: 125, totalSkips: 24, memberUids: ["alice", "bob"],
      status: "active", startDate: "existing-start", endDate: "existing-end",
    };
    expect((await patch({ goalAmount })).status).toBe(200);
    const updates = state.update.mock.calls[0][1];
    expect(Object.keys(updates).sort()).toEqual(["editedDetailFields", "goalAmount"]);
    expect({ ...state.project, ...updates }).toMatchObject({
      goalAmount, totalRaised: 300, totalDonated: 125, totalSkips: 24,
      memberUids: ["alice", "bob"], status: "active", startDate: "existing-start", endDate: "existing-end",
    });
  });
  it.each(["totalRaised", "totalDonated", "totalSkips", "memberUids", "status", "startDate", "endDate", "previousTitles"])("cannot overwrite protected field %s", async (field) => {
    expect((await patch({ [field]: null })).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("retains the old title for legacy donations when renaming", async () => {
    state.project.title = "Original Books Fundraiser";
    expect((await patch({ title: "Renamed Books Fundraiser" })).status).toBe(200);
    expect(state.update.mock.calls[0][1]).toEqual({
      title: "Renamed Books Fundraiser",
      previousTitles: FieldValue.arrayUnion("Original Books Fundraiser"),
      editedDetailFields: FieldValue.arrayUnion("title"),
    });
  });
  it("lets the designated admin change an official fundraiser link without changing goals or accounting", async () => {
    const response = await patch({ donationURL: "https://new.example/donate" });
    expect(response.status).toBe(200);
    const updates = state.update.mock.calls[0][1];
    expect(Object.keys(updates).sort()).toEqual(["donationURL", "editedDetailFields"]);
    expect(updates.donationURL).toBe("https://new.example/donate");
  });
  it("allows the creator to edit their fundraiser", async () => {
    state.project.createdBy = "owner";
    state.verify.mockResolvedValue({ uid: "owner", email: "owner@example.com" });
    expect((await patch({ donationURL: "https://new.example" })).status).toBe(200);
  });
  it("rejects a signed-in non-owner", async () => {
    state.verify.mockResolvedValue({ uid: "someone", email: "someone@example.com" });
    expect((await patch({ donationURL: "https://new.example" })).status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects missing or invalid authentication", async () => {
    expect((await patch({ donationURL: null }, "")).status).toBe(401);
    state.verify.mockRejectedValueOnce(new Error("Invalid token"));
    expect((await patch({ donationURL: null })).status).toBe(401);
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each(["javascript:alert(1)", "ftp://example.com", "example.com"])("rejects an invalid donation link: %s", async (donationURL) => {
    expect((await patch({ donationURL })).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each([{ totalRaised: 0 }, { createdBy: "attacker" }, { goalAmount: -1 }, { unitCost: 0 }, { visibility: "invalid" }])("rejects unsafe or invalid fields %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("allows removal of a donation link", async () => {
    expect((await patch({ donationURL: null })).status).toBe(200);
    expect(state.update.mock.calls[0][1].donationURL).toBeNull();
  });
  it("keeps visibility tags consistent while preserving category tags", async () => {
    state.project.tags = ["education", "visibility-private"];
    expect((await patch({ visibility: "public" })).status).toBe(200);
    expect(state.update.mock.calls[0][1].tags).toEqual(["education", "visibility-public"]);
  });
  it("does not recreate a missing fundraiser", async () => {
    state.exists = false;
    expect((await patch({ donationURL: "https://new.example" })).status).toBe(404);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("applies explicitly saved official details, including a cleared link, without reviving stale defaults", () => {
    const stored = { donationURL: null, title: "Old title", totalRaised: 1, editedDetailFields: ["donationURL", "totalRaised"] } as Project;
    const official = { donationURL: "https://default.example", title: "Current title", totalRaised: 0 };
    expect({ ...official, ...getFundraiserDetailOverrides(stored) }).toEqual({
      donationURL: null, title: "Current title", totalRaised: 0,
    });
  });
});
