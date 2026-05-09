"use client";
import { useEffect, useState } from "react";

type Platform = "ios" | "android" | null;

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !(navigator as any).standalone;
    const isAndroid = /Android/i.test(ua);

    if (isIOS) {
      setPlatform("ios");
    } else if (isAndroid) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setPlatform("android");
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
    }
  }, []);

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setOpen(false);
  }

  if (!platform) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full text-center text-xs"
        style={{ color: "var(--green-primary)", background: "none", border: "none", cursor: "pointer" }}
      >
        📲 Add to your home screen →
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-2xl w-full max-w-sm shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 text-xl leading-none"
                style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
              >
                ×
              </button>
              <p className="text-base font-bold pr-6" style={{ color: "var(--text-primary)" }}>
                Add The iSkipped Web App to Your Home Screen
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Get quick access — no App Store needed.
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {platform === "ios" ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(46,204,113,0.15)", color: "var(--green-primary)" }}
                    >
                      1
                    </span>
                    <p className="text-sm pt-0.5" style={{ color: "var(--text-secondary)" }}>
                      Tap the <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Share</span> button{" "}
                      <span
                        className="inline-flex items-center justify-center rounded px-1 text-xs"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ⎋
                      </span>{" "}
                      at the bottom of Safari
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(46,204,113,0.15)", color: "var(--green-primary)" }}
                    >
                      2
                    </span>
                    <p className="text-sm pt-0.5" style={{ color: "var(--text-secondary)" }}>
                      Scroll down and tap{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Add to Home Screen</span>
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(46,204,113,0.15)", color: "var(--green-primary)" }}
                    >
                      3
                    </span>
                    <p className="text-sm pt-0.5" style={{ color: "var(--text-secondary)" }}>
                      Tap <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Add</span> in the top right
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleAndroidInstall}
                  className="w-full py-3 bg-[#2ECC71] text-[#0B1A14] font-semibold rounded-xl text-sm hover:bg-[#1DB954] transition-colors"
                >
                  Install App
                </button>
              )}

              <button
                onClick={() => setOpen(false)}
                className="w-full py-2.5 text-sm font-semibold rounded-xl"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)", background: "none", cursor: "pointer" }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
