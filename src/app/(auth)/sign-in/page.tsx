"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signInWithGoogle, signUpWithEmail, signInWithEmail } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";

const steps = [
  {
    num: "1",
    icon: "🛍️",
    title: "Skip an Expense",
    desc: "Pass on that coffee, impulse buy, or splurge — and make it count.",
  },
  {
    num: "2",
    icon: "✍️",
    title: "Log Your Skip",
    desc: "Record what you skipped and how much you saved in seconds.",
  },
  {
    num: "3",
    icon: "🌍",
    title: "Make a Difference",
    desc: "Direct your savings toward causes that matter to you.",
  },
];

export default function SignInPage() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
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

  async function handleEmailSubmit() {
    setError(null);
    setSigningIn(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      router.replace("/home");
    } catch (e: any) {
      setError(e.message || (mode === "signup" ? "Sign up failed." : "Sign in failed.") + " Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4F0E8] to-[#F9FAFB]">
        <div className="w-8 h-8 border-4 border-[#3D8B68] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4F0E8] via-[#F0F7F3] to-[#F9FAFB] px-4 py-10">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden">

        {/* Green accent top bar */}
        <div className="h-1.5 bg-gradient-to-r from-[#3D8B68] to-[#34A87A]" />

        <div className="p-8 sm:p-10">

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="i skipped"
              width={160}
              height={64}
              style={{ mixBlendMode: "multiply" }}
              priority
            />
          </div>

          {/* Hero copy */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#111827] leading-snug">
              Skip a purchase.<br />Change a life.
            </h1>
            <p className="mt-3 text-sm text-[#6B7280] leading-relaxed max-w-xs mx-auto">
              Every time you pass on a splurge, your savings can fund real impact around the world.
            </p>
          </div>

          {/* 3 Steps */}
          <div className="bg-[#F9FAFB] rounded-2xl p-5 mb-8 space-y-4">
            <p className="text-xs font-bold text-[#3D8B68] uppercase tracking-widest mb-1">How it works</p>
            {steps.map((step) => (
              <div key={step.num} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#3D8B68] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {step.num}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111827]">
                    <span className="mr-1">{step.icon}</span>{step.title}
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-[#E5E7EB] mb-6" />

          {/* Sign In / Sign Up tabs */}
          <div className="flex bg-[#F3F4F6] rounded-xl p-1 mb-5">
            <button
              onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-[#3D8B68] shadow-sm"
                  : "text-[#6B7280] hover:text-[#111827]"
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => { setMode("signin"); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                mode === "signin"
                  ? "bg-white text-[#3D8B68] shadow-sm"
                  : "text-[#6B7280] hover:text-[#111827]"
              }`}
            >
              Sign In
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
          )}

          {/* Google button */}
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
            {signingIn ? "Signing in…" : mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#E5E7EB]" />
            <span className="text-xs text-[#9CA3AF]">or</span>
            <div className="flex-1 h-px bg-[#E5E7EB]" />
          </div>

          {/* Email form */}
          <div className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
              />
            )}
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
            <button
              onClick={handleEmailSubmit}
              disabled={signingIn}
              className="w-full px-4 py-3 bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {signingIn ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
            </button>
          </div>

          <p className="mt-6 text-xs text-[#9CA3AF] text-center">
            By continuing, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
