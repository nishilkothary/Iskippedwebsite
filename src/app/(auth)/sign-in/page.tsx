"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle, signUpWithEmail, signInWithEmail } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";

const previewSkips = [
  { emoji: "☕", label: "Morning Latte", amount: "+$5.50", sub: "8 life-saving meals in Palestine", delay: "0s" },
  { emoji: "🥗", label: "Lunch out", amount: "+$13.00", sub: "10 days of education in Cambodia", delay: "0.15s" },
  { emoji: "🛍️", label: "Impulse buy", amount: "+$32.00", sub: "23 days of clean water access", delay: "0.3s" },
];

function MiniJar({ fillPct }: { fillPct: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplay(fillPct), 400);
    return () => clearTimeout(t);
  }, [fillPct]);
  return (
    <div className="relative flex-shrink-0" style={{ width: 44, height: 58 }}>
      <div className="absolute inset-0 rounded-b-xl rounded-t-lg border-2 border-white/30 overflow-hidden bg-white/10">
        <div
          className="absolute bottom-0 left-0 right-0 bg-emerald-300"
          style={{ height: `${display}%`, transition: "height 2s cubic-bezier(0.34,1.3,0.64,1)" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-black text-white drop-shadow">{fillPct}%</span>
        </div>
      </div>
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 border-t-2 border-x-2 border-white/30 bg-white/10 rounded-t"
        style={{ width: "75%", height: 8 }}
      />
    </div>
  );
}

function friendlyAuthError(e: any): string {
  const code = e?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
    return "Google sign-in was cancelled. Try again or use email below.";
  if (code === "auth/account-exists-with-different-credential")
    return "An account already exists with that email. Try signing in with email and password instead.";
  if (code === "auth/email-already-in-use")
    return "That email is already registered. Try signing in instead.";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential")
    return "Incorrect email or password. Please try again.";
  if (code === "auth/user-not-found")
    return "No account found with that email. Try signing up.";
  if (code === "auth/weak-password")
    return "Password should be at least 6 characters.";
  if (code === "auth/invalid-email")
    return "Please enter a valid email address.";
  if (code === "auth/popup-blocked")
    return "Popup was blocked by your browser. Please allow popups and try again.";
  return e?.message || "Something went wrong. Please try again.";
}

export default function SignInPage() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [cardsVisible, setCardsVisible] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/home");
  }, [user, isLoading, router]);

  useEffect(() => {
    const t = setTimeout(() => setCardsVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.replace("/home");
    } catch (e: any) {
      setError(friendlyAuthError(e));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit() {
    setError(null);
    setEmailLoading(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      router.replace("/home");
    } catch (e: any) {
      setError(friendlyAuthError(e));
    } finally {
      setEmailLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a5c42] to-[#2d8b6a]">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const authForm = (
    <div className="w-full max-w-sm mx-auto">
      {/* Sign In / Sign Up tabs */}
      <div className="flex bg-[#F3F4F6] rounded-xl p-1 mb-5">
        <button
          onClick={() => { setMode("signup"); setError(null); }}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
            mode === "signup" ? "bg-white text-[#3D8B68] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          Sign Up
        </button>
        <button
          onClick={() => { setMode("signin"); setError(null); }}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
            mode === "signin" ? "bg-white text-[#3D8B68] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"
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
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-[#E5E7EB] rounded-xl bg-white hover:bg-gray-50 transition font-medium text-[#111827] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {googleLoading ? "Signing in…" : mode === "signup" ? "Continue with Google" : "Sign in with Google"}
      </button>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-[#E5E7EB]" />
        <span className="text-xs text-[#9CA3AF]">or</span>
        <div className="flex-1 h-px bg-[#E5E7EB]" />
      </div>

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
          disabled={emailLoading}
          className="w-full px-4 py-3 bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
        >
          {emailLoading ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
      </div>

      <p className="mt-5 text-xs text-[#9CA3AF] text-center">
        By continuing, you agree to our terms of service.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — desktop only ── */}
      <div className="hidden lg:flex w-[52%] flex-col justify-between bg-gradient-to-br from-[#0f3d2a] via-[#1a5c42] to-[#2d8b6a] p-12 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-emerald-300/10 blur-2xl" />

        {/* Brand */}
        <div>
          <p className="text-2xl font-black text-white tracking-tight">
            i<span className="text-[#2ECC71]">skipped</span>
          </p>
        </div>

        {/* Hero copy */}
        <div>
          <h2 className="text-5xl font-black text-white leading-tight mb-4">
            Skip, Save, <span className="text-emerald-300">Give.</span>
          </h2>
          <p className="text-emerald-100 text-lg leading-relaxed max-w-sm">
            Turn everyday skips into savings for yourself and donations that change lives.
          </p>
        </div>

        {/* Skip preview cards */}
        <div className="space-y-3 relative z-10">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-4">
            Recent community skips
          </p>
          {previewSkips.map((skip, i) => (
            <div
              key={i}
              className="bg-white/95 backdrop-blur rounded-2xl px-5 py-4 flex items-center gap-4 shadow-xl"
              style={{
                transform: cardsVisible ? "translateX(0)" : "translateX(-40px)",
                opacity: cardsVisible ? 1 : 0,
                transition: `transform 0.6s cubic-bezier(0.34,1.3,0.64,1) ${skip.delay}, opacity 0.5s ease ${skip.delay}`,
              }}
            >
              <span className="text-2xl flex-shrink-0">{skip.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Skipped: {skip.label}</p>
                <p className="text-xs text-emerald-600 font-medium">{skip.sub}</p>
              </div>
              <span className="font-black text-emerald-600 text-sm flex-shrink-0">{skip.amount}</span>
            </div>
          ))}
        </div>

        {/* Community stat pill */}
        <div className="flex items-center gap-4 bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4">
          <MiniJar fillPct={68} />
          <div>
            <p className="text-white font-bold text-sm">1,247 skips logged this week</p>
            <p className="text-emerald-200 text-xs mt-0.5">Join a community saving with purpose</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — auth form ── */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mobile hero (hidden on desktop) */}
        <div className="lg:hidden bg-gradient-to-br from-[#1a5c42] to-[#2d8b6a] px-6 pt-10 pb-8">
          <div className="flex justify-center mb-5">
            <p className="text-3xl font-black text-white tracking-tight">
              i<span className="text-[#2ECC71]">skipped</span>
            </p>
          </div>
          <h1 className="text-3xl font-black text-white text-center leading-tight mb-2">
            Skip, Save, <span className="text-emerald-300">Give.</span>
          </h1>
          <p className="text-emerald-100 text-sm text-center">
            Turn everyday skips into savings for yourself and donations that change lives.
          </p>
          {/* Mini preview cards */}
          <div className="mt-6 space-y-2">
            {previewSkips.slice(0, 2).map((skip, i) => (
              <div
                key={i}
                className="bg-white/90 rounded-xl px-4 py-3 flex items-center gap-3"
                style={{
                  transform: cardsVisible ? "translateX(0)" : "translateX(-20px)",
                  opacity: cardsVisible ? 1 : 0,
                  transition: `transform 0.5s ease ${skip.delay}, opacity 0.5s ease ${skip.delay}`,
                }}
              >
                <span className="text-xl">{skip.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Skipped: {skip.label}</p>
                  <p className="text-xs text-emerald-600">{skip.sub}</p>
                </div>
                <span className="font-black text-emerald-600 text-sm">{skip.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Auth form area */}
        <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-10">
          {/* Desktop logo + heading */}
          <div className="hidden lg:block text-center mb-8">
            <p className="text-3xl font-black tracking-tight mb-5">
              <span className="text-[#111827]">i</span><span className="text-emerald-500">skipped</span>
            </p>
            <h1 className="text-2xl font-bold text-[#111827]">Welcome — let's get started</h1>
            <p className="text-sm text-[#6B7280] mt-2">Your first skip is waiting.</p>
          </div>

          {/* Mobile heading */}
          <div className="lg:hidden mb-6">
            <h2 className="text-xl font-bold text-[#111827]">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h2>
            <p className="text-sm text-[#6B7280] mt-1">
              {mode === "signup" ? "Start turning skips into impact." : "Sign back in to your jars."}
            </p>
          </div>

          {authForm}
        </div>
      </div>
    </div>
  );
}
