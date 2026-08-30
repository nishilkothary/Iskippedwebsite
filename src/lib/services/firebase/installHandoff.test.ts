import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { currentUser: null as any, authStateReady: vi.fn() },
  signIn: vi.fn(), fetch: vi.fn(),
}));
vi.mock("./config", () => ({ auth: state.auth }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: state.signIn }));

let storage: Map<string, string>;
function device(installed: boolean) {
  vi.stubGlobal("window", { location: { protocol: "https:" }, matchMedia: () => ({ matches: installed }) });
  vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: installed, maxTouchPoints: 5 });
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.auth.currentUser = null;
  state.auth.authStateReady.mockResolvedValue(undefined);
  state.signIn.mockResolvedValue({ user: { uid: "user-1" } });
  state.fetch.mockResolvedValue({ ok: true, json: async () => ({ customToken: "test-token" }) });
  storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("fetch", state.fetch);
  device(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("installed-app auth bootstrap", () => {
  it("waits for persisted auth before restoring and shares one bootstrap attempt", async () => {
    const { restoreInstallHandoff } = await import("./installHandoff");
    await Promise.all([restoreInstallHandoff(), restoreInstallHandoff()]);
    expect(state.auth.authStateReady).toHaveBeenCalledTimes(1);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(state.fetch).toHaveBeenCalledWith("/api/auth/install-handoff", expect.objectContaining({ method: "PUT", credentials: "same-origin" }));
    expect(state.signIn).toHaveBeenCalledWith(state.auth, "test-token");
  });
  it("does not replace an existing signed-in account", async () => {
    state.auth.currentUser = { uid: "already-signed-in" };
    await (await import("./installHandoff")).restoreInstallHandoff();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("never restores into the Safari tab", async () => {
    device(false);
    await (await import("./installHandoff")).restoreInstallHandoff();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("falls back to ordinary login on network failure", async () => {
    state.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect((await import("./installHandoff")).restoreInstallHandoff()).resolves.toBeUndefined();
    expect(state.signIn).not.toHaveBeenCalled();
  });
  it("honors a previous explicit logout after a reload", async () => {
    storage.set("iskipped.install.signedOut", "1");
    await (await import("./installHandoff")).restoreInstallHandoff();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("does not sign in from a response arriving after logout", async () => {
    let resolve!: (value: any) => void;
    state.fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const handoff = await import("./installHandoff");
    const restoring = handoff.restoreInstallHandoff();
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
    await handoff.clearInstallHandoff();
    resolve({ ok: true, json: async () => ({ customToken: "stale-token" }) });
    await restoring;
    expect(state.signIn).not.toHaveBeenCalled();
  });
  it("prepares with a bearer token but never puts it in the URL", async () => {
    device(false);
    const user = { uid: "user-1", getIdToken: vi.fn().mockResolvedValue("id-token") };
    state.auth.currentUser = user;
    expect(await (await import("./installHandoff")).prepareInstallHandoff(user as any)).toBe(true);
    expect(state.fetch).toHaveBeenCalledWith("/api/auth/install-handoff", expect.objectContaining({
      method: "POST", headers: { "X-Iskipped-Install": "1", Authorization: "Bearer id-token" },
    }));
  });
  it("prepares the new account separately when an old preparation is in flight", async () => {
    device(false);
    let resolve!: (value: any) => void;
    state.fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const oldUser = { uid: "old-user", getIdToken: vi.fn().mockResolvedValue("old-token") };
    const newUser = { uid: "new-user", getIdToken: vi.fn().mockResolvedValue("new-token") };
    state.auth.currentUser = oldUser;
    const handoff = await import("./installHandoff");
    const oldRequest = handoff.prepareInstallHandoff(oldUser as any);
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
    state.auth.currentUser = newUser;
    const newRequest = handoff.prepareInstallHandoff(newUser as any);
    resolve({ ok: true });
    await Promise.all([oldRequest, newRequest]);
    expect(state.fetch).toHaveBeenLastCalledWith("/api/auth/install-handoff", expect.objectContaining({
      headers: { "X-Iskipped-Install": "1", Authorization: "Bearer new-token" },
    }));
  });
});
