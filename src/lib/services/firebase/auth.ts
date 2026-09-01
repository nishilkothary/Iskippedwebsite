import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from "firebase/auth";
import { auth } from "./config";
import { createOrUpdateUser } from "./users";
import { apiRequest } from "./apiClient";
import { consumeReferralCode, clearReferralCode } from "@/lib/utils/referral";
import { allowInstallHandoff, clearInstallHandoff, prepareInstallHandoff } from "./installHandoff";

async function attributeReferralIfNew(isNew: boolean, uid: string): Promise<void> {
  if (!isNew) return;
  const code = consumeReferralCode();
  if (!code || code === uid) return;
  try {
    await apiRequest("/api/referrals/attribute", "POST", { code });
  } catch {
    // Non-critical — referral attribution is best-effort
  } finally {
    clearReferralCode();
  }
}

async function finishGoogleSignIn(user: User): Promise<User> {
  allowInstallHandoff();
  const isNew = await createOrUpdateUser(user);
  void prepareInstallHandoff(user);
  await attributeReferralIfNew(isNew, user.uid);
  return user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  // Always let people choose the Google account they intend to use. Without
  // this, mobile browsers often silently reuse the device's last Google account.
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  // The Firebase credential is now valid. Profile creation, referral
  // attribution, and install handoff must never keep the sign-in screen stuck
  // if Firestore or a non-critical API is temporarily slow.
  void finishGoogleSignIn(result.user).catch((error) => {
    console.warn("Google sign-in follow-up could not finish yet", error);
  });
  return result.user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  allowInstallHandoff();
  if (name?.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  const isNew = await createOrUpdateUser(result.user);
  void prepareInstallHandoff(result.user);
  await attributeReferralIfNew(isNew, result.user.uid);
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  allowInstallHandoff();
  void prepareInstallHandoff(result.user);
  // Firebase Authentication can succeed even when an interrupted signup did
  // not finish creating the matching Firestore profile. This helper is
  // idempotent: existing profiles are left untouched, while a missing profile
  // is created before the app continues past the sign-in screen.
  const isNew = await createOrUpdateUser(result.user);
  await attributeReferralIfNew(isNew, result.user.uid);
  return result.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function signOut(): Promise<void> {
  await clearInstallHandoff();
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
