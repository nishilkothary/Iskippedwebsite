import { describe, expect, it } from "vitest";
import { safeAuthDestination, signInHrefFor } from "./authRedirect";

describe("safeAuthDestination", () => {
  it("keeps internal destinations, including fundraiser invites", () => {
    expect(safeAuthDestination("/challenges/books?invite=1")).toBe("/challenges/books?invite=1");
  });

  it.each([
    null,
    "",
    "https://example.com",
    "//example.com/path",
    "/\\example.com/path",
    "/home\njavascript:alert(1)",
  ])("falls back for an unsafe destination: %s", (destination) => {
    expect(safeAuthDestination(destination)).toBe("/home");
  });
});

describe("signInHrefFor", () => {
  it("round-trips an invite destination through the sign-in query", () => {
    const href = signInHrefFor("/challenges/books?invite=1");
    const params = new URL(href, "https://iskipped.com").searchParams;
    expect(params.get("mode")).toBe("signin");
    expect(params.get("redirect")).toBe("/challenges/books?invite=1");
  });
});
