"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { dismissSetupPrompt } from "@/lib/services/firebase/users";
import { isPushSupported, registerForPush } from "@/lib/services/firebase/push";

type InstallPlatform = "ios" | "browser" | null;
type PromptMode = "modal" | "card";

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

export function SkipSetupPrompt({ mode, onClose }: Props) {
  const { user, profile, updateProfile } = useAuthStore();
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    isPushSupported().then((supported) => {
      if (active) setPushSupported(supported);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone()) {
      setReady(true);
      return;
    }

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !(navigator as unknown as { standalone?: boolean }).standalone;
    if (isIOS) {
      setInstallPlatform("ios");
      setReady(true);
      return;
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
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
      window.clearTimeout(timer);
    };
  }, []);

  const dismissed = !!profile?.setupPromptDismissedAt || dismissedLocal;
  const showPushAction = pushSupported && !profile?.pushOptIn;
  const showInstallAction = installPlatform !== null;
  const eligible = !!user && !!profile && !dismissed && (showPushAction || showInstallAction);

  useEffect(() => {
    if (mode === "modal" && ready && !eligible) {
      onClose?.();
    }
  }, [eligible, mode, onClose, ready]);

  async function dismiss() {
    setDismissedLocal(true);
    if (user) {
      try {
        await dismissSetupPrompt(user.uid);
      } catch {
        // Local dismissal still prevents an immediate nag if the network is flaky.
      }
    }
    updateProfile({ setupPromptDismissedAt: new Date() as any });
    onClose?.();
  }

  async function handlePush() {
    setPushBusy(true);
    try {
      await registerForPush();
      updateProfile({ pushOptIn: true });
      toast.success("Weekly reminders are on.");
      if (!showInstallAction) {
        await dismiss();
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
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallPlatform(null);
    toast.success("iSkipped is ready from your home screen.");
    if (!showPushAction) {
      await dismiss();
    }
  }

  if (!ready || !eligible) return null;

  const content = (
    <div
      className={mode === "modal" ? "rounded-2xl w-full max-w-sm shadow-2xl" : "rounded-2xl p-4 mb-4"}
      style={{
        background: mode === "modal" ? "var(--bg-surface-1)" : "linear-gradient(145deg, rgba(46,204,113,0.1), rgba(237,245,240,0.035))",
        border: "1px solid var(--border-emphasis)",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={mode === "modal" ? "px-5 pt-5 pb-4" : ""}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
              {mode === "modal" ? "Keep your weekly skip streak going" : "Make iSkipped easy to remember"}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Add iSkipped to your home screen or get a gentle weekly reminder to skip one small expense.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-xl leading-none"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      </div>

      <div className={mode === "modal" ? "px-5 pb-5 space-y-2" : "mt-4 space-y-2"}>
        {showInstallAction && (
          <button
            type="button"
            onClick={handleInstall}
            className="w-full py-3 rounded-xl text-sm font-black"
            style={{ background: "var(--bg-surface-3)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          >
            Add to Home Screen
          </button>
        )}

        {showIOSSteps && (
          <div className="rounded-xl p-3 text-left" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-xs font-bold mb-2" style={{ color: "var(--text-primary)" }}>On iPhone:</p>
            <ol className="space-y-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)", paddingLeft: 16 }}>
              <li>Tap the Share button in Safari.</li>
              <li>Choose Add to Home Screen.</li>
              <li>Tap Add.</li>
            </ol>
          </div>
        )}

        {showPushAction && (
          <button
            type="button"
            onClick={handlePush}
            disabled={pushBusy}
            className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--green-primary)", color: "#0B1A14", border: "none" }}
          >
            {pushBusy ? "Turning on..." : "Turn on Weekly Reminders"}
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ color: "var(--text-muted)", background: "none", border: "none" }}
        >
          Not now
        </button>
      </div>
    </div>
  );

  if (mode === "card") return content;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={dismiss}>
      {content}
    </div>
  );
}
