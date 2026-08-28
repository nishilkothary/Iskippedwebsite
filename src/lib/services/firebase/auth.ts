import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  User,
} from "firebase/auth";
import { auth } from "./config";
import { createOrUpdateUser } from "./users";
import { apiRequest } from "./apiClient";
import { consumeReferralCode, clearReferralCode } from "@/lib/utils/referral";

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
  const isNew = await createOrUpdateUser(user);
  await attributeReferralIfNew(isNew, user.uid);
  return user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return finishGoogleSignIn(result.user);
}

/** Starts the mobile-safe Google flow. The browser returns to the current URL. */
export async function signInWithGoogleRedirect(): Promise<void> {
  await signInWithRedirect(auth, new GoogleAuthProvider());
}

/** Completes a redirect-based Google sign-in after the page loads again. */
export async function completeGoogleRedirectSignIn(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result ? finishGoogleSignIn(result.user) : null;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<{ user: User; verificationEmailSent: boolean }> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (name?.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  const isNew = await createOrUpdateUser(result.user);
  await attributeReferralIfNew(isNew, result.user.uid);
  let verificationEmailSent = false;
  try {
    await sendEmailVerification(result.user);
    verificationEmailSent = true;
  } catch {
    // Non-critical — the user can request another verification email from the app banner
  }
  return { user: result.user, verificationEmailSent };
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
