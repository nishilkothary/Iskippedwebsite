import { signInWithCustomToken, type User } from "firebase/auth";
import { auth } from "./config";

const ENDPOINT = "/api/auth/install-handoff";
const SIGNED_OUT = "iskipped.install.signedOut";
let restorePromise: Promise<void> | null = null;
let preparePromise: Promise<boolean> | null = null;
let prepareUid: string | null = null;
let explicitSignOut = false;

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function signedOut() {
  if (explicitSignOut) return true;
  try { return localStorage.getItem(SIGNED_OUT) === "1"; } catch { return false; }
}

export function allowInstallHandoff() {
  explicitSignOut = false;
  try { localStorage.removeItem(SIGNED_OUT); } catch { /* Storage may be unavailable. */ }
}

function request(method: string, idToken?: string) {
  return fetch(ENDPOINT, {
    method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { "X-Iskipped-Install": "1", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
  });
}

export function prepareInstallHandoff(user: User): Promise<boolean> {
  if (typeof window === "undefined" || window.location.protocol !== "https:" || standalone() || signedOut()) {
    return Promise.resolve(false);
  }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!ios) return Promise.resolve(false);
  if (preparePromise && prepareUid !== user.uid) {
    return preparePromise.then(() => prepareInstallHandoff(user));
  }
  if (!preparePromise) {
    prepareUid = user.uid;
    preparePromise = (async () => {
      try {
        const token = await user.getIdToken();
        if (signedOut() || auth.currentUser?.uid !== user.uid) return false;
        return (await request("POST", token)).ok;
      } catch { return false; }
    })().finally(() => { preparePromise = null; prepareUid = null; });
  }
  return preparePromise;
}

// Resolve before subscribing to auth/redirecting, so the sign-in page does not
// flash while the installed app restores its session. Strict Mode shares one attempt.
export function restoreInstallHandoff(): Promise<void> {
  if (!restorePromise) {
    restorePromise = (async () => {
      await auth.authStateReady();
      if (typeof window === "undefined" || window.location.protocol !== "https:"
        || !standalone() || auth.currentUser || signedOut()) return;
      try {
        const response = await request("PUT");
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.customToken === "string" && !auth.currentUser && !signedOut()) {
          await signInWithCustomToken(auth, data.customToken);
        }
      } catch { /* Expired, offline, or unsupported: use the ordinary sign-in screen. */ }
    })();
  }
  return restorePromise;
}

export async function clearInstallHandoff() {
  explicitSignOut = true;
  try { localStorage.setItem(SIGNED_OUT, "1"); } catch { /* Also guarded in memory. */ }
  // Do not let a pending preparation recreate the cookie after logout.
  await preparePromise;
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    try { await request("DELETE"); } catch { /* Local logout must still succeed. */ }
  }
}
