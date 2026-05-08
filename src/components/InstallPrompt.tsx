"use client";
import { useEffect, useState } from "react";

type Platform = "ios" | "android" | null;

const DISMISSED_KEY = "iskipped_install_dismissed";

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [dismissed, setDismissed] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !(navigator as any).standalone;
    const isAndroid = /Android/i.test(ua);

    if (isIOS) {
      setPlatform("ios");
      setDismissed(false);
    } else if (isAndroid) {
      // Android: wait for the browser's install prompt event
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setPlatform("android");
        setDismissed(false);
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredPrompt(null);
  }

  if (dismissed || !platform) return null;

  return (
    <div
      className="rounded-2xl p-4 mb-5 relative"
      style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(46,204,113,0.25)" }}
    >
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-lg leading-none"
        style={{ color: "var(--text-muted)" }}
        aria-label="Dismiss"
      >
        ×
      </button>

      <div className="flex items-center gap-2 mb-1 pr-6">
        <span className="text-lg">📲</span>
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Add The iSkipped Web App to Your Home Screen
        </p>
      </div>

      {platform === "ios" ? (
        <>
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
            Get the full app experience — no App Store needed.
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: "rgba(46,204,113,0.15)", color: "var(--green-primary)" }}
              >
                1
              </span>
              Tap the <span className="font-semibold mx-0.5" style={{ color: "var(--text-primary)" }}>Share</span> button
              <span
                className="inline-flex items-center justify-center rounded px-1"
                style={{ background: "rgba(255,255,255,0.08)", fontSize: 11 }}
              >
                ⎋
              </span>
              at the bottom of Safari
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: "rgba(46,204,113,0.15)", color: "var(--green-primary)" }}
              >
                2
              </span>
              Scroll down and tap <span className="font-semibold ml-0.5" style={{ color: "var(--text-primary)" }}>Add to Home Screen</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
            Install iSkipped for quick access — no App Store needed.
          </p>
          <button
            onClick={handleAndroidInstall}
            className="w-full py-2 bg-[#2ECC71] text-[#0B1A14] font-semibold rounded-xl text-sm hover:bg-[#1DB954] transition-colors"
          >
            Install App
          </button>
        </>
      )}
    </div>
  );
}
