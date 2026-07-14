"use client";
import { useState } from "react";
import { toast } from "sonner";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { resendVerificationEmail } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";

export function EmailVerificationBanner() {
  const { user, profile, setUser, updateProfile } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  const isPasswordUser = user?.providerData.some((p) => p.providerId === "password") ?? false;
  const isVerified = profile?.emailVerified ?? user?.emailVerified ?? true;

  if (!user || dismissed || isVerified || !isPasswordUser) return null;

  async function handleResend() {
    if (!user || sending) return;
    setSending(true);
    try {
      await resendVerificationEmail(user);
      toast.success("Verification email sent — check your inbox.");
    } catch {
      toast.error("Couldn't send verification email. Try again later.");
    } finally {
      setSending(false);
    }
  }

  async function handleRefresh() {
    if (!user || checking) return;
    setChecking(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        await updateDoc(doc(db, "users", user.uid), { emailVerified: true });
        updateProfile({ emailVerified: true });
        setUser(user);
        toast.success("Email verified!");
      } else {
        toast.error("Still not verified — check your inbox.");
      }
    } catch {
      toast.error("Couldn't refresh status.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{ background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.18)" }}
    >
      <p className="text-xs font-semibold leading-relaxed" style={{ color: "#F59E0B" }}>
        Verify your email ({user.email}) to secure your account.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRefresh}
          disabled={checking}
          className="text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-60"
          style={{ background: "transparent", border: "1px solid #F59E0B", color: "#F59E0B" }}
        >
          {checking ? "Checking…" : "I've verified"}
        </button>
        <button
          onClick={handleResend}
          disabled={sending}
          className="text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-60"
          style={{ background: "#F59E0B", color: "#0B1A14" }}
        >
          {sending ? "Sending…" : "Resend email"}
        </button>
        <button onClick={() => setDismissed(true)} className="text-xs" style={{ color: "#F59E0B" }}>✕</button>
      </div>
    </div>
  );
}
