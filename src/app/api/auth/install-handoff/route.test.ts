import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  verify: vi.fn(), getUser: vi.fn(), createToken: vi.fn(),
  queue: Promise.resolve() as Promise<any>,
}));

vi.mock("@/lib/services/firebaseAdmin", () => {
  const doc = (path: string) => ({
    path,
    get: async () => ({ exists: state.docs.has(path), data: () => state.docs.get(path) }),
    set: async (data: any) => { state.docs.set(path, data); },
    delete: async () => { state.docs.delete(path); },
  });
  return {
    getAdminAuth: () => ({ verifyIdToken: state.verify, getUser: state.getUser, createCustomToken: state.createToken }),
    getAdminDb: () => ({
      collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
      runTransaction: (fn: any) => {
        const run = state.queue.then(() => fn({ get: (ref: any) => ref.get(), delete: (ref: any) => ref.delete() }));
        state.queue = run.catch(() => {});
        return run;
      },
    }),
  };
});

import { POST, PUT, DELETE } from "./route";
const COOKIE = "__Host-iskipped-install";
function request(method: string, cookie?: string, headers: Record<string, string> = {}) {
  return new NextRequest("https://iskipped.com/api/auth/install-handoff", {
    method, headers: { origin: "https://iskipped.com", "x-iskipped-install": "1",
      authorization: "Bearer valid", ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}), ...headers },
  });
}
async function prepare() {
  const response = await POST(request("POST"));
  expect(response.status).toBe(200);
  return response.cookies.get(COOKIE)!.value;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.docs.clear();
  state.docs.set("users/user-1", { uid: "user-1" });
  state.queue = Promise.resolve();
  state.verify.mockResolvedValue({ uid: "user-1", auth_time: Math.floor(Date.now() / 1000) });
  state.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: new Date(0).toISOString() });
  state.createToken.mockResolvedValue("test-custom-token");
});

describe("install sign-in handoff", () => {
  it("issues a secure HttpOnly cookie and stores only its hash", async () => {
    const response = await POST(request("POST"));
    const cookie = response.cookies.get(COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 1800 });
    expect(cookie.value).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify([...state.docs])).not.toContain(cookie.value);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.verify).toHaveBeenCalledWith("valid", true);
  });
  it.each([POST, PUT, DELETE])("rejects cross-origin and missing-header calls", async (handler) => {
    expect((await handler(request("POST", undefined, { origin: "https://attacker.example" }))).status).toBe(403);
    expect((await handler(request("POST", undefined, { "x-iskipped-install": "" }))).status).toBe(403);
    expect((await handler(new NextRequest("http://iskipped.com/api/auth/install-handoff", { method: "POST" }))).status).toBe(403);
  });
  it("requires a valid login before preparing", async () => {
    expect((await POST(request("POST", undefined, { authorization: "" }))).status).toBe(401);
    state.verify.mockRejectedValueOnce(new Error("revoked"));
    expect((await POST(request("POST"))).status).toBe(401);
  });
  it("preserves an existing unexpired ticket across browser reloads", async () => {
    const secret = await prepare();
    const response = await POST(request("POST", secret));
    expect(response.cookies.get(COOKIE)).toBeUndefined();
    expect((await (await PUT(request("PUT", secret))).json()).customToken).toBe("test-custom-token");
  });
  it("redeems once, clears the cookie, and rejects replay", async () => {
    const secret = await prepare();
    const response = await PUT(request("PUT", secret));
    expect((await response.json()).customToken).toBe("test-custom-token");
    expect(response.cookies.get(COOKIE)?.maxAge).toBe(0);
    expect(await (await PUT(request("PUT", secret))).json()).toEqual({ restored: false });
    expect(state.createToken).toHaveBeenCalledTimes(1);
  });
  it("only one concurrent redemption wins", async () => {
    const secret = await prepare();
    const responses = await Promise.all([PUT(request("PUT", secret)), PUT(request("PUT", secret))]);
    expect((await Promise.all(responses.map((response) => response.json()))).filter((body) => body.customToken)).toHaveLength(1);
  });
  it.each(["expired", "disabled", "revoked", "deleted", "missing-profile"])("rejects %s accounts/tickets", async (reason) => {
    const secret = await prepare();
    if (reason === "expired") {
      for (const [key, value] of state.docs) if (key.startsWith("installHandoffs/")) value.expiresAt = { toMillis: () => 0 };
    }
    if (reason === "disabled") state.getUser.mockResolvedValue({ disabled: true });
    if (reason === "revoked") state.getUser.mockResolvedValue({ tokensValidAfterTime: new Date(Date.now() + 10000).toISOString() });
    if (reason === "deleted") state.getUser.mockRejectedValue(new Error("user-not-found"));
    if (reason === "missing-profile") state.docs.delete("users/user-1");
    expect(await (await PUT(request("PUT", secret))).json()).toEqual({ restored: false });
    expect(state.createToken).not.toHaveBeenCalled();
  });
  it("invalidates copied tickets on logout", async () => {
    const secret = await prepare();
    expect((await DELETE(request("DELETE", secret))).cookies.get(COOKIE)?.maxAge).toBe(0);
    expect(await (await PUT(request("PUT", secret))).json()).toEqual({ restored: false });
  });
  it("falls back without cookies or with malformed cookies", async () => {
    for (const cookie of [undefined, "bad-ticket"]) {
      expect(await (await PUT(request("PUT", cookie))).json()).toEqual({ restored: false });
    }
  });
});
