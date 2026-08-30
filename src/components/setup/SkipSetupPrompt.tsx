"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { completeSetupPrompt, dismissSetupPrompt, dismissWeeklyReminderPrompt } from "@/lib/services/firebase/users";
import { isPushSupported, registerForPush } from "@/lib/services/firebase/push";

type InstallPlatform = "ios" | "browser" | null;
type PromptMode = "inline" | "footer" | "modal";
const SETUP_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

interface Props {
  mode: PromptMode;
  onClose?: () => void;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return (
    isIPadOS ||
    /Android|iPhone|iPad|iPod|Mobi/i.test(ua) ||
    window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches
  );
}

function timestampMs(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function SkipSetupPrompt({ mode, onClose }: Props) {
  const { user, profile, updateProfile } = useAuthStore();
  const [isMobile, setIsMobile] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return;
    }

    const mobile = isMobileDevice();
    setIsMobile(mobile);
    if (!mobile) {
      setReady(true);
      return;
    }

    let active = true;
    isPushSupported().then((supported) => {
      if (active) setPushSupported(supported);
    });

    const standalone = isStandalone();
    setInstalled(standalone);
    if (standalone) {
      setReady(true);
      return () => {
        active = false;
      };
    }

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !(navigator as unknown as { standalone?: boolean }).standalone;
    if (isIOS) {
      setInstallPlatform("ios");
      setReady(true);
      return () => {
        active = false;
      };
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallPlatform("browser");
      setReady(true);
    };

    window.addEventListener("beforeinstallprompt", handler as EventListener);
    const timer = window.setTimeout(() => setReady(true), 900);

    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
      window.clearTimeout(timer);
    };
  }, []);

  const snoozedAtMs = timestampMs(profile?.setupPromptDismissedAt);
  const snoozed = dismissedLocal || (snoozedAtMs != null && Date.now() - snoozedAtMs < SETUP_PROMPT_SNOOZE_MS);
  const completed = !!profile?.setupPromptCompletedAt;
  const weeklyReminderDismissed = !!profile?.weeklyReminderPromptDismissedAt;
  const notificationDenied = typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied";
  const showPushAction = isMobile && installed && pushSupported && !notificationDenied && !profile?.pushOptIn;
  const showInstallAction = isMobile && !installed && installPlatform !== null;
  const setupEligible = isMobile && !!user && !!profile && !completed && !snoozed && (showPushAction || showInstallAction);
  const reminderOnly = isMobile && !!user && !!profile && completed && showPushAction && !showInstallAction && !weeklyReminderDismissed;
  const eligible = setupEligible || reminderOnly;
  const notificationPrompt = showPushAction && !showInstallAction;

  useEffect(() => {
    if ((mode === "inline" || mode === "modal") && ready && !eligible) {
      onClose?.();
    }
  }, [eligible, mode, onClose, ready]);

  async function dismiss() {
    setDismissedLocal(true);
    if (user) {
      try {
        if (reminderOnly) {
          await dismissWeeklyReminderPrompt(user.uid);
        } else {
          await dismissSetupPrompt(user.uid);
        }
      } catch {
        // Local dismissal still prevents an immediate repeat if the network is flaky.
      }
    }
    updateProfile(reminderOnly
      ? { weeklyReminderPromptDismissedAt: new Date() as any }
      : { setupPromptDismissedAt: new Date() as any });
    onClose?.();
  }

  async function complete() {
    if (user) {
      try {
        await completeSetupPrompt(user.uid);
      } catch {
        // The immediate UI should still move on if persistence is flaky.
      }
    }
    updateProfile({ setupPromptCompletedAt: new Date() as any });
    onClose?.();
  }

  async function handlePush() {
    setPushBusy(true);
    try {
      await registerForPush();
      updateProfile({ pushOptIn: true });
      toast.success("Weekly reminders are on.");
      if (!showInstallAction) {
        await complete();
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't turn on reminders.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleInstall() {
    if (installPlatform === "ios") {
      setShowIOSSteps(true);
      return;
    }
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallPlatform(null);
    if (choice?.outcome === "accepted") {
      toast.success("iSkipped is ready from your home screen.");
      if (!showPushAction) {
        await complete();
      }
    }
  }

  if (!ready || !eligible) return null;

  const installButton = showInstallAction ? (
    <button
      type="button"
      onClick={handleInstall}
      className={mode === "footer" ? "font-bold underline-offset-4 hover:underline" : "rounded-full px-3 py-2 text-xs font-black"}
      style={mode === "footer"
        ? { color: "var(--green-primary)", background: "none", border: "none" }
        : { background: "var(--bg-surface-3)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
    >
      Add to Home Screen
    </button>
  ) : null;

  const pushButton = showPushAction ? (
    <button
      type="button"
      onClick={handlePush}
      disabled={pushBusy}
      className={mode === "footer"
        ? "font-bold underline-offset-4 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
        : "rounded-full px-3 py-2 text-xs font-black disabled:opacity-60 disabled:cursor-not-allowed"}
      style={mode === "footer"
        ? { color: "var(--green-primary)", background: "none", border: "none" }
        : { background: "var(--green-primary)", color: "#0B1A14", border: "none" }}
    >
      {pushBusy ? "Turning on..." : "Allow weekly reminder"}
    </button>
  ) : null;

  const iosSteps = showIOSSteps ? (
    <div
      className={mode === "footer" ? "mt-2 text-left inline-block" : "mt-2 rounded-xl p-3 text-left"}
      style={mode === "footer"
        ? { color: "var(--text-secondary)" }
        : { background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
    >
      <p className="text-xs font-bold mb-1" style={{ color: "var(--text-primary)" }}>On iPhone:</p>
      <ol className="space-y-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)", paddingLeft: 16 }}>
        <li>Tap Share, or tap ... then Share.</li>
        <li>Choose Add to Home Screen.</li>
        <li>Tap Add.</li>
      </ol>
    </div>
  ) : null;

  if (mode === "modal") {
    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={dismiss}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-setup-title"
          className="rounded-2xl text-center max-w-sm w-full shadow-2xl relative p-5 iskip-pop-in"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close setup prompt"
            className="absolute top-4 right-4 text-xl leading-none"
            style={{ color: "var(--text-muted)" }}
          >
            x
          </button>

          <div
            className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
            style={{ background: "rgba(46,204,113,0.13)", border: "1px solid var(--border-emphasis)" }}
          >
            🔥
          </div>
          <h2 id="skip-setup-title" className="text-2xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>
            {notificationPrompt ? "Get one weekly reminder?" : "Keep the savings going"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {notificationPrompt
              ? "We’ll check in every Sunday so you can log your skips and watch your savings grow."
              : "Add iSkipped to your Home Screen for quick access whenever you skip something."}
          </p>

          <div className="mt-5 space-y-3 text-left">
            {showInstallAction && (
              <button
                type="button"
                onClick={handleInstall}
                className="w-full rounded-xl p-4 flex items-start gap-3"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
              >
                <span className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: "rgba(46,204,113,0.12)" }}>
                  🏠
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>Add to Home Screen</span>
                </span>
              </button>
            )}
            {showPushAction && (
              <button
                type="button"
                onClick={handlePush}
                disabled={pushBusy}
                className="w-full rounded-xl p-4 flex items-start gap-3 disabled:opacity-60"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
              >
                <span className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: "rgba(244,184,74,0.12)" }}>
                  🔔
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>
                    {pushBusy ? "Turning on..." : "Allow one weekly reminder"}
                  </span>
                </span>
              </button>
            )}
          </div>

          {showIOSSteps && (
            <div className="mt-3 rounded-xl p-3 text-left" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-xs font-bold mb-1" style={{ color: "var(--text-primary)" }}>On iPhone:</p>
              <ol className="space-y-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)", paddingLeft: 16 }}>
                <li>Tap Share, or tap ... then Share.</li>
                <li>Choose Add to Home Screen.</li>
                <li>Tap Add.</li>
              </ol>
              <button
                type="button"
                onClick={complete}
                className="mt-3 w-full rounded-xl py-2 text-xs font-black"
                style={{ background: "var(--bg-surface-3)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
              >
                Done, I added it
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="mt-5 px-3 py-2 text-xs font-bold"
            style={{ color: "var(--text-muted)" }}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  if (mode === "footer") {
    return (
      <div className="mt-6 mb-2 text-center text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        <p className="font-bold" style={{ color: "var(--text-secondary)" }}>Make iSkipped easier to remember</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {installButton}
          {installButton && pushButton && <span aria-hidden="true">/</span>}
          {pushButton}
          {(installButton || pushButton) && <span aria-hidden="true">/</span>}
          <button
            type="button"
            onClick={dismiss}
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: "var(--text-muted)", background: "none", border: "none" }}
          >
            Not now
          </button>
        </div>
        {iosSteps}
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl p-3 text-left"
      style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black" style={{ color: "var(--text-primary)" }}>Keep this going next week</p>
          <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {notificationPrompt
              ? "Allow one Sunday reminder to log your skips."
              : "Add iSkipped to your phone for quick access."}
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-lg leading-none"
          style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
        >
          x
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {installButton}
        {pushButton}
      </div>
      {iosSteps}
    </div>
  );
}
