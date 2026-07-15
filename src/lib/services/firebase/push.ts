import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import app from "./config";
import { apiRequest } from "./apiClient";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function isIOSNotInstalled(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  if (!isIOS) return false;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !isStandalone;
}

/** Whether the push toggle should be shown at all — false hides it entirely (e.g. iOS Safari not added to home screen). */
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!VAPID_KEY) return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  if (isIOSNotInstalled()) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

function serviceWorkerUrl(): string {
  const config = app.options;
  const params = new URLSearchParams({
    apiKey: config.apiKey ?? "",
    authDomain: config.authDomain ?? "",
    projectId: config.projectId ?? "",
    storageBucket: config.storageBucket ?? "",
    messagingSenderId: config.messagingSenderId ?? "",
    appId: config.appId ?? "",
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

/** Requests notification permission and registers this device's FCM token. Must be called from a user gesture (e.g. a toggle click) — never on page load. */
export async function registerForPush(): Promise<void> {
  if (!VAPID_KEY) throw new Error("Push notifications are not configured");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const registration = await navigator.serviceWorker.register(serviceWorkerUrl());
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Could not get a push token for this device");

  await apiRequest("/api/push/token", "POST", { token });
}

/** Opts out and clears all registered tokens for this account. */
export async function unregisterPush(): Promise<void> {
  try {
    const messaging = getMessaging(app);
    await deleteToken(messaging);
  } catch {
    // Best-effort — proceed to clear server-side state regardless.
  }
  await apiRequest("/api/push/token", "DELETE");
}
