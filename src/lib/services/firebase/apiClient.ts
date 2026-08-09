import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./config";

function waitForCurrentUser(timeoutMs = 4000): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    const timeout = window.setTimeout(() => {
      unsubscribe?.();
      resolve(auth.currentUser);
    }, timeoutMs);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe?.();
      resolve(user);
    });
  });
}

export async function apiRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const currentUser = await waitForCurrentUser();
  const idToken = await currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in");
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
