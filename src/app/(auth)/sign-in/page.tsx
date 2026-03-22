"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signInWithGoogle, signUpWithEmail, signInWithEmail } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";

export default function SignInPage() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/home");
    }
  }, [user, isLoading, router]);

  async function handleGoogleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      router.replace("/home");
    } catch (e: any) {
      setError(e.message || "Sign in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleEmailSignUp() {
    setError(null);
    setSigningIn(true);
    try {
      await signUpWithEmail(email, password, name);
      router.replace("/home");
    } catch (e: any) {
      setError(e.message || "Sign up failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleEmailSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithEmail(email, password);
      router.replace("/home");
    } catch (e: any) {
      setError(e.message || "Sign in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="w-8 h-8 border-4 border-[#3D8B68] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.png"
            alt="i skipped"
            width={180}
            height={72}
            style={{ mixBlendMode: "multiply" }}
            priority
          />
        </div>
        <p className="text-[#111827] text-lg font-semibold">
          Skip a purchase.<br />Save Money.<br />Change Lives.
        </p>

        <p className="text-[#3D8B68] text-sm font-bold mt-5 mb-6 tracking-widest uppercase">
          Join the movement ↓
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-[#E5E7EB] rounded-xl bg-white hover:bg-gray-50 transition font-medium text-[#111827] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {signingIn ? "Signing in…" : "Continue with Google"}
        </button>

        <button
          onClick={() => { setShowEmailForm(!showEmailForm); setError(null); }}
          className="mt-3 w-full px-6 py-3 border border-[#E5E7EB] rounded-xl bg-white hover:bg-gray-50 transition font-medium text-[#6B7280] text-sm"
        >
          Sign up by email
        </button>

        {showEmailForm && (
          <div className="mt-4 text-left space-y-3">
            <input
              type="text"
              placeholder="Your name (for sign up)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
            />
            <div className="flex gap-2">
              <button
                onClick={handleEmailSignUp}
                disabled={signingIn}
                className="flex-1 px-4 py-3 bg-[#3D8B68] text-white rounded-xl font-medium text-sm hover:bg-[#357a5c] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Sign Up
              </button>
              <button
                onClick={handleEmailSignIn}
                disabled={signingIn}
                className="flex-1 px-4 py-3 border border-[#E5E7EB] rounded-xl font-medium text-sm text-[#111827] hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-[#9CA3AF]">
          By continuing, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
