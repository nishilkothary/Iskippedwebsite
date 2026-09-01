import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  createOrUpdateUser: vi.fn(),
  apiRequest: vi.fn(),
  consumeReferralCode: vi.fn(),
  clearReferralCode: vi.fn(),
  allowInstallHandoff: vi.fn(),
  prepareInstallHandoff: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: state.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: state.signInWithEmailAndPassword,
  sendPasswordResetEmail: vi.fn(),
  updateProfile: state.updateProfile,
}));

vi.mock("./config", () => ({ auth: {} }));
vi.mock("./users", () => ({ createOrUpdateUser: state.createOrUpdateUser }));
vi.mock("./apiClient", () => ({ apiRequest: state.apiRequest }));
vi.mock("@/lib/utils/referral", () => ({
  consumeReferralCode: state.consumeReferralCode,
  clearReferralCode: state.clearReferralCode,
}));
vi.mock("./installHandoff", () => ({
  allowInstallHandoff: state.allowInstallHandoff,
  clearInstallHandoff: vi.fn(),
  prepareInstallHandoff: state.prepareInstallHandoff,
}));

import {
  continueEmailProfileSetup,
  EMAIL_PROFILE_SETUP_INCOMPLETE,
  signInWithEmail,
  signUpWithEmail,
} from "./auth";

const user = {
  uid: "alice",
  email: "alice@example.com",
  displayName: "Alice",
  emailVerified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.signInWithEmailAndPassword.mockResolvedValue({ user });
  state.createUserWithEmailAndPassword.mockResolvedValue({ user });
  state.createOrUpdateUser.mockResolvedValue(false);
  state.updateProfile.mockResolvedValue(undefined);
  state.apiRequest.mockResolvedValue(undefined);
  state.prepareInstallHandoff.mockResolvedValue(undefined);
  state.consumeReferralCode.mockReturnValue(null);
});

describe("email authentication profile recovery", () => {
  it("checks an existing profile without replacing normal sign-in", async () => {
    const result = await signInWithEmail("alice@example.com", "password");

    expect(result).toBe(user);
    expect(state.signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      "alice@example.com",
      "password",
    );
    expect(state.createOrUpdateUser).toHaveBeenCalledOnce();
    expect(state.createOrUpdateUser).toHaveBeenCalledWith(user);
    expect(state.allowInstallHandoff).toHaveBeenCalledOnce();
    expect(state.prepareInstallHandoff).toHaveBeenCalledWith(user);
    expect(state.consumeReferralCode).not.toHaveBeenCalled();
    expect(state.apiRequest).not.toHaveBeenCalled();
  });

  it("repairs a missing profile and preserves pending referral attribution", async () => {
    state.createOrUpdateUser.mockResolvedValue(true);
    state.consumeReferralCode.mockReturnValue("inviter-uid");

    await signInWithEmail("alice@example.com", "password");

    expect(state.createOrUpdateUser).toHaveBeenCalledWith(user);
    expect(state.apiRequest).toHaveBeenCalledWith(
      "/api/referrals/attribute",
      "POST",
      { code: "inviter-uid" },
    );
    expect(state.clearReferralCode).toHaveBeenCalledOnce();
  });

  it("leaves the existing email signup sequence intact", async () => {
    await signUpWithEmail("alice@example.com", "password", " Alice ");

    expect(state.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      "alice@example.com",
      "password",
    );
    expect(state.updateProfile).toHaveBeenCalledWith(user, { displayName: "Alice" });
    expect(state.createOrUpdateUser).toHaveBeenCalledOnce();
    expect(state.createOrUpdateUser).toHaveBeenCalledWith(user);
    expect(state.updateProfile.mock.invocationCallOrder[0]).toBeLessThan(
      state.createOrUpdateUser.mock.invocationCallOrder[0],
    );
  });

  it("marks only a post-authentication setup failure as recoverable", async () => {
    state.createOrUpdateUser.mockRejectedValueOnce(new Error("offline"));

    await expect(signUpWithEmail("alice@example.com", "password", "Alice")).rejects.toMatchObject({
      code: EMAIL_PROFILE_SETUP_INCOMPLETE,
    });
    expect(state.createUserWithEmailAndPassword).toHaveBeenCalledOnce();

    state.createOrUpdateUser.mockResolvedValueOnce(true);
    await expect(continueEmailProfileSetup(user as any, "Alice")).resolves.toBe(user);
    expect(state.createOrUpdateUser).toHaveBeenCalledTimes(2);
  });

  it("does not label a Firebase account-creation failure as recoverable", async () => {
    const firebaseError = Object.assign(new Error("email already exists"), {
      code: "auth/email-already-in-use",
    });
    state.createUserWithEmailAndPassword.mockRejectedValueOnce(firebaseError);

    await expect(signUpWithEmail("alice@example.com", "password", "Alice")).rejects.toBe(firebaseError);
    expect(state.createOrUpdateUser).not.toHaveBeenCalled();
  });
});
