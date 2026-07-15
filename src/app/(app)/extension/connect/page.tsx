"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { apiRequest } from "@/lib/services/firebase/apiClient";

// Handoff protocol with the iSkipped browser extension. The extension's
// content script runs only on this page and communicates via
// window.postMessage (same-origin checked on both sides):
//
//   extension → page  { source: "iskipped-extension", type: "EXT_HELLO" }
//   page → extension  { source: "iskipped-web", type: "WEB_READY" }
//   page → extension  { source: "iskipped-web", type: "WEB_TOKEN", token }
//   extension → page  { source: "iskipped-extension", type: "EXT_CONNECTED" }
//   extension → page  { source: "iskipped-extension", type: "EXT_ERROR", error }
//
// The token is a Firebase custom token (single-use, 1h expiry) minted by
// POST /api/extension/token; the extension exchanges it with
// signInWithCustomToken and manages its own session from there.

type Status = "detecting" | "ready" | "connecting" | "connected" | "error" | "not-found";

export default function ExtensionConnectPage() {
  const { profile } = useAuthStore();
  const [status, setStatus] = useState<Status>("detecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "iskipped-extension") return;
      if (data.type === "EXT_HELLO") {
        setStatus((s) => (s === "detecting" || s === "not-found" ? "ready" : s));
      } else if (data.type === "EXT_CONNECTED") {
        setStatus("connected");
      } else if (data.type === "EXT_ERROR") {
        setErrorMsg(typeof data.error === "string" ? data.error : "Something went wrong.");
        setStatus("error");
      }
    }
    window.addEventListener("message", onMessage);
    // Announce, in case the content script loaded before this listener.
    window.postMessage({ source: "iskipped-web", type: "WEB_READY" }, window.location.origin);
    const timeout = setTimeout(() => {
      setStatus((s) => (s === "detecting" ? "not-found" : s));
    }, 3000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
    };
  }, []);

  async function handleConnect() {
    setStatus("connecting");
    setErrorMsg(null);
    try {
      const { token } = await apiRequest<{ token: string }>("/api/extension/token", "POST");
      window.postMessage({ source: "iskipped-web", type: "WEB_TOKEN", token }, window.location.origin);
      // The extension replies with EXT_CONNECTED or EXT_ERROR.
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't create a connection token.");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24">
      <div className="mb-6">
        <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
          Connect the iSkipped extension
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Link the browser extension to your account so skips at checkout land in your jars.
        </p>
      </div>

      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
      >
        {status === "detecting" && (
          <>
            <p className="text-2xl mb-2">🔎</p>
            <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
              Looking for the extension...
            </p>
          </>
        )}

        {status === "not-found" && (
          <>
            <p className="text-2xl mb-2">🧩</p>
            <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
              Extension not detected
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Install the iSkipped extension from the Chrome Web Store, then reload this page.
            </p>
          </>
        )}

        {(status === "ready" || status === "connecting") && (
          <>
            <p className="text-2xl mb-2">🧩</p>
            <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
              Extension found
            </p>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              Connect it as {profile?.displayName ?? "your account"}?
            </p>
            <button
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--green-primary), #1E9485)", color: "white" }}
            >
              {status === "connecting" ? "Connecting..." : "Connect extension"}
            </button>
          </>
        )}

        {status === "connected" && (
          <>
            <p className="text-2xl mb-2">✓</p>
            <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
              Extension connected!
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              You can close this tab. We&apos;ll see you at checkout.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <p className="text-2xl mb-2">⚠️</p>
            <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
              Connection failed
            </p>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              {errorMsg ?? "Something went wrong."}
            </p>
            <button
              onClick={handleConnect}
              className="w-full py-2.5 rounded-xl text-sm font-bold"
              style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
