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
  const result = await signInWithPopup(auth, provider);
  return finishGoogleSignIn(result.user);
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
