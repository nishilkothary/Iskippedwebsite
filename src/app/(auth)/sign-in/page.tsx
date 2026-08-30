"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";
import { safeAuthDestination } from "@/lib/utils/authRedirect";

const previewSkips = [
  { emoji: "☕", label: "Morning Latte", amount: "+$5.50", sub: "Added to Skip Bucks", delay: "0s" },
  { emoji: "🥗", label: "Lunch out", amount: "+$13.00", sub: "Saved toward Weekend Trip", delay: "0.15s" },
  { emoji: "🛍️", label: "Impulse buy", amount: "+$32.00", sub: "Saved for Laptops for Students", delay: "0.3s" },
];

const trustPills = [
  "No bank accounts or credit cards",
  "Money stays in your control",
];

function friendlyAuthError(e: any): string {
  const code = e?.code ?? "";
  const message = typeof e?.message === "string" ? e.message : "";
  const normalized = `${code} ${message}`.toLowerCase();
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
    return "Google sign-in was cancelled. Try again or use email below.";
  if (
    code === "auth/unauthorized-domain" ||
    code === "auth/app-not-authorized" ||
    code === "auth/auth-domain-config-required" ||
    normalized.includes("unauthorized domain")
  )
    return "Google sign-in is not enabled for this website domain yet. Please contact support.";
  if (
    code === "auth/operation-not-allowed" ||
    code === "auth/invalid-oauth-client-id" ||
    code === "auth/configuration-not-found" ||
    normalized.includes("configuration_not_found") ||
    normalized.includes("40504")
  )
    return "Google sign-in needs a Firebase setup update. Please contact support or use email sign-in for now.";
  if (code === "auth/account-exists-with-different-credential")
    return "An account already exists with that email. Try signing in with email and password instead.";
  if (code === "auth/email-already-in-use")
    return "That email is already registered. Try signing in instead.";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential")
    return "That email and password didn't match. If you originally used Google, choose Google above. Otherwise, reset your password.";
  if (code === "auth/user-not-found")
    return "No account found with that email. Try signing up.";
  if (code === "auth/weak-password")
    return "Password should be at least 6 characters.";
  if (code === "auth/invalid-email")
    return "Please enter a valid email address.";
  if (code === "auth/popup-blocked")
    return "Popup was blocked by your browser. Please allow popups and try again.";
  if (code === "auth/network-request-failed")
    return "We couldn't reach the sign-in service. Check your connection and try again.";
  if (code === "auth/user-disabled")
    return "This account has been disabled. Please contact support.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait a moment and try again.";
  return "We couldn't sign you in. Please try again or reset your password.";
}

function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const initialMode = searchParams.get("mode") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<"signup" | "signin" | "forgot">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [cardsVisible, setCardsVisible] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [emailSignupInProgress, setEmailSignupInProgress] = useState(false);
  const navigationStarted = useRef(false);

  const redirectParam = searchParams.get("redirect");
  const postAuthDestination = safeAuthDestination(redirectParam);
  const isChallengeRedirect = postAuthDestination.startsWith("/challenges/");

  function finishAuthNavigation() {
    if (navigationStarted.current) return;
    navigationStarted.current = true;
    router.replace(postAuthDestination);
  }

  useEffect(() => {
    // Google popup sign-in updates Firebase auth state before the popup's
    // callback has fully completed on some mobile browsers. Navigating the
    // opener at that moment strands the callback tab on an error screen.
    if (!isLoading && user && !emailSignupInProgress && !googleLoading && !emailLoading) finishAuthNavigation();
  }, [user, isLoading, emailSignupInProgress, googleLoading, emailLoading, router, postAuthDestination]);

  useEffect(() => {
    const t = setTimeout(() => setCardsVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function handlePageShow() {
      setGoogleLoading(false);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  async function handleGoogleSignIn() {
    if (googleLoading) return;
    setError(null);
    setGoogleLoading(true);
    try {
      // Redirect sign-in is blocked by modern mobile browsers when Firebase's
      // helper runs on firebaseapp.com. A user-initiated popup works across
      // desktop and mobile without depending on third-party storage.
      await signInWithGoogle();
      // The shared auth listener owns navigation readiness. It waits until the
      // authenticated user and their profile agree before this effect moves on.
      setGoogleLoading(false);
    } catch (e: any) {
      setError(friendlyAuthError(e));
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit() {
    setError(null);
    if (mode === "signup" && !name.trim()) { setError("Please enter your name."); return; }
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }
    setEmailLoading(true);
    setEmailSignupInProgress(mode === "signup");
    try {
      if (mode === "signup") {
        await signUpWithEmail(email.trim(), password, name.trim());
        toast.success("Account created.");
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (e: any) {
      setError(friendlyAuthError(e));
    } finally {
      setEmailLoading(false);
      setEmailSignupInProgress(false);
    }
  }

  async function handleResetPassword() {
    setError(null);
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setResetLoading(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (e: any) {
      setError(friendlyAuthError(e));
    } finally {
      setResetLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (mode === "forgot") handleResetPassword();
    else handleEmailSubmit();
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
      {/* Sign In / Sign Up tabs - hidden in forgot mode */}
      {mode !== "forgot" && (
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
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
      )}
      {isChallengeRedirect && mode !== "forgot" && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "#ECFDF3", border: "1px solid #BBF7D0", color: "#166534" }}>
          Create an account or sign in to join this skip challenge. You&apos;ll come right back after this.
        </div>
      )}

      {mode === "forgot" ? (
        <div className="space-y-3">
          {resetSent ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 text-center">
              <span className="font-semibold block">Check your inbox for your password reset link.</span>
              <span className="block mt-1">
                We sent it to {email}. If it isn&apos;t there within a few minutes, check Spam or Junk and mark it as not spam.
              </span>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#6B7280] mb-1">Enter your email and we&apos;ll send you a reset link.</p>
              <input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={254}
                className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
              />
              <button
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              >
                {resetLoading ? "Sending…" : "Send Reset Email"}
              </button>
            </>
          )}
          <button
            onClick={() => { setMode("signin"); setError(null); setResetSent(false); }}
            className="w-full text-sm text-[#6B7280] hover:text-[#111827] transition text-center pt-1"
          >
            ← Back to sign in
          </button>
        </div>
      ) : (
        <>
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
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={50}
                className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
              />
            )}
            <input
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={254}
              className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={128}
                className="w-full pl-4 pr-16 py-3 border border-[#E5E7EB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-[#6B7280] hover:text-[#3D8B68]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {mode === "signin" && (
              <div className="text-right">
                <button
                  onClick={() => { setMode("forgot"); setError(null); }}
                  className="text-xs text-[#6B7280] hover:text-[#3D8B68] transition"
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button
              onClick={handleEmailSubmit}
              disabled={emailLoading}
              className="w-full px-4 py-3 bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
            >
              {emailLoading ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
            </button>
          </div>
        </>
      )}

      <p className="mt-5 text-xs text-[#9CA3AF] text-center">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-white transition-colors">
          terms of service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-white transition-colors">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Left panel - desktop only */}
      <div className="hidden lg:flex w-[52%] flex-col justify-between bg-gradient-to-br from-[#0f3d2a] via-[#1a5c42] to-[#2d8b6a] p-12 relative overflow-hidden">
        {/* Brand */}
        <div>
          <p className="text-2xl font-black text-white tracking-tight">
            i<span className="text-[#2ECC71]">skipped</span>
          </p>
        </div>

        {/* Hero copy */}
        <div>
          <h2 className="text-5xl font-black text-white leading-tight mb-4">
            Money saved, <span className="text-emerald-300">with purpose.</span>
          </h2>
          <p className="text-emerald-100 text-lg leading-relaxed max-w-sm">
            Turn everyday skipped spending into savings you can aim at a reward, a goal, or a fundraiser.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 max-w-md">
            {trustPills.map((pill) => (
              <div
                key={pill}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-emerald-50"
              >
                {pill}
              </div>
            ))}
          </div>
        </div>

        {/* Skip preview cards */}
        <div className="space-y-3 relative z-10">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-4">
            Recent purposeful skips
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
          <span className="text-3xl flex-shrink-0" aria-hidden>🫙</span>
          <div>
            <p className="text-white font-bold text-sm">Every skip fills your jar</p>
            <p className="text-emerald-200 text-xs mt-0.5">Build a habit around money you chose not to spend</p>
          </div>
        </div>
      </div>

      {/* Right panel - auth form */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mobile hero (hidden on desktop) */}
        <div className="lg:hidden bg-gradient-to-br from-[#1a5c42] to-[#2d8b6a] px-6 pt-10 pb-8">
          <div className="flex justify-center mb-5">
            <p className="text-3xl font-black text-white tracking-tight">
              i<span className="text-[#2ECC71]">skipped</span>
            </p>
          </div>
          <h1 className="text-2xl font-black text-white text-center leading-tight mb-2">
            Money saved, <span className="text-emerald-300">with purpose.</span>
          </h1>
          <p className="text-emerald-100 text-sm text-center">
            Turn skipped spending into savings for rewards, goals, and fundraisers.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {trustPills.map((pill) => (
              <div
                key={pill}
                className="flex min-h-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-2 py-2 text-center text-[10px] font-bold leading-tight text-emerald-50"
              >
                {pill}
              </div>
            ))}
          </div>
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
            <h1 className="text-2xl font-bold text-[#111827]">
              {mode === "forgot" ? "Reset your password" : "Welcome, let's get started"}
            </h1>
            <p className="text-sm text-[#6B7280] mt-2">
              {mode === "forgot" ? "We'll email you a link to get back in." : "Your first skip is waiting."}
            </p>
          </div>

          {/* Mobile heading */}
          <div className="lg:hidden mb-6">
            <h2 className="text-xl font-bold text-[#111827]">
              {mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your account" : "Welcome back"}
            </h2>
            <p className="text-sm text-[#6B7280] mt-1">
              {mode === "forgot" ? "We'll email you a link to get back in." : mode === "signup" ? "Start saving with purpose." : "Sign back in to your jars."}
            </p>
          </div>

          {authForm}
        </div>
      </div>
    </div>
  );
}

export default function SignInPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a5c42] to-[#2d8b6a]">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SignInPage />
    </Suspense>
  );
}
