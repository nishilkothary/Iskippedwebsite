"use client";
import { useEffect, useRef, useMemo, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { SkipModal } from "@/components/skip/SkipModal";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { useProjects } from "@/hooks/useProjects";
import { isChallengeProject, isProjectEnded } from "@/lib/services/firebase/projects";
import { setActiveProject } from "@/lib/services/firebase/users";
import { formatCurrency } from "@/lib/utils/currency";
import { Project } from "@/lib/types/models";

const NAV_ITEMS = [
  { href: "/home",        label: "Home",       emoji: "🏠", tab: null },
  { href: "/challenges",  label: "Challenges", emoji: "🎯", tab: null },
  { href: "/jars",        label: "Jars",       emoji: "🫙", tab: null },
  { href: "/about",       label: "About",      emoji: "💡", tab: null },
  { href: "/profile",     label: "Profile",    emoji: "👤", tab: null },
];

function isNavActive(item: (typeof NAV_ITEMS)[number], pathname: string, _searchParams: { get: (name: string) => string | null }) {
  if (item.label === "Challenges") {
    return pathname === "/challenges" || pathname.startsWith("/challenges/");
  }
  if (item.label === "Jars") {
    return pathname === "/jars";
  }
  return pathname === item.href;
}

function SidebarNav({ onLogSkip }: { onLogSkip: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside
      className="w-60 flex-shrink-0 hidden md:flex flex-col"
      style={{
        background: "linear-gradient(180deg, #10241B, #0B1A14)",
        borderRight: "1px solid var(--border-default)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
        <img src="/logo-white.png" alt="iSkipped" style={{ height: 26, width: "auto" }} />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item, pathname, searchParams);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                      color: "var(--bg-base)",
                      fontWeight: 700,
                      boxShadow: "0 2px 10px var(--gold-glow)",
                    }
                  : { color: "var(--text-secondary)" }
              }
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-3)";
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <button
          onClick={onLogSkip}
          className="w-full font-semibold py-3 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          ✨ Log a Skip
        </button>
      </div>
    </aside>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav
      className="flex md:hidden fixed bottom-0 left-0 right-0 z-10"
      style={{
        background: "linear-gradient(180deg, #10241B, #0B1A14)",
        borderTop: "1px solid var(--border-default)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(item, pathname, searchParams);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
            style={{ color: active ? "var(--gold-cta)" : "rgba(237,245,240,0.55)" }}
          >
            <span className="text-lg leading-none">{item.emoji}</span>
            <span className="text-[10px] font-bold leading-tight"
              style={{ color: active ? "var(--gold-cta)" : "rgba(237,245,240,0.7)" }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function ChallengeBanners() {
  const { profile, updateProfile } = useAuthStore();
  const { projects, loading: projectsLoading } = useProjects();
  const endedClearRef = useRef(false);
  const deletedClearRef = useRef(false);
  const [showDeletedBanner, setShowDeletedBanner] = useState(false);

  const endedWithBalance = useMemo((): Project[] => {
    if (!profile || !projects.length) return [];
    return (profile.joinedProjectIds ?? [])
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => !!p && isChallengeProject(p) && isProjectEnded(p))
      .filter((p) => (profile.causeJarBalances?.[p.id] ?? 0) > 0);
  }, [profile?.joinedProjectIds, profile?.causeJarBalances, projects]);

  // Auto-clear activeProjectId when active challenge has ended
  useEffect(() => {
    if (endedClearRef.current || !profile?.activeProjectId || !profile.uid || !projects.length) return;
    const active = projects.find((p) => p.id === profile.activeProjectId);
    if (active && isChallengeProject(active) && isProjectEnded(active)) {
      endedClearRef.current = true;
      setActiveProject(profile.uid, null)
        .then(() => updateProfile({ activeProjectId: null }))
        .catch(() => {});
    }
  }, [profile?.activeProjectId, projects.length]);

  // Detect deleted challenge: activeProjectId set but project not found after load
  useEffect(() => {
    if (deletedClearRef.current || !profile?.activeProjectId || !profile.uid || projectsLoading || !projects.length) return;
    const active = projects.find((p) => p.id === profile.activeProjectId);
    if (!active) {
      deletedClearRef.current = true;
      setShowDeletedBanner(true);
      setActiveProject(profile.uid, null)
        .then(() => updateProfile({ activeProjectId: null }))
        .catch(() => {});
    }
  }, [profile?.activeProjectId, projects, projectsLoading]);

  if (!endedWithBalance.length && !showDeletedBanner) return null;

  return (
    <div>
      {showDeletedBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.18)" }}>
          <p className="text-xs font-semibold leading-relaxed" style={{ color: "#F87171" }}>
            The organizer deleted your active challenge. Your jar balance is unchanged — pick a new cause to keep saving.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/jars?tab=cause" className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "#F87171", color: "#fff", textDecoration: "none" }}>
              Pick Cause
            </Link>
            <button onClick={() => setShowDeletedBanner(false)} className="text-xs" style={{ color: "#F87171" }}>✕</button>
          </div>
        </div>
      )}
      {endedWithBalance.map((p) => {
        const balance = profile!.causeJarBalances?.[p.id] ?? 0;
        return (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.18)" }}>
            <p className="text-xs font-semibold leading-relaxed" style={{ color: "#F59E0B" }}>
              <span className="font-black">{p.groupName || p.title}</span> ended — donate your {formatCurrency(balance)} saved now.
            </p>
            <Link href="/jars?tab=cause" className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "#F59E0B", color: "#0B1A14", textDecoration: "none" }}>
              Manage Jar
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuthStore();
  const { showSkipPicker, setShowSkipPicker } = useUIStore();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  // Don't cover a challenge page a new user landed on via a referral/join link — let them
  // join the specific cause they were invited to instead of steering them into the generic picker.
  const onChallengeDetailPage = pathname.startsWith("/challenges/");
  const showOnboarding = !onboardingDismissed && !onChallengeDetailPage && profile?.onboardingCompletedAt === null;

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/sign-in");
    }
  }, [user, isLoading, router]);

  if (isLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--green-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)" }}>
      <Suspense fallback={
        <aside className="w-60 flex-shrink-0 hidden md:flex flex-col" style={{ background: "linear-gradient(180deg, #10241B, #0B1A14)", borderRight: "1px solid var(--border-default)" }} />
      }>
        <SidebarNav onLogSkip={() => setShowSkipPicker(true)} />
      </Suspense>

      <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
        <EmailVerificationBanner />
        <ChallengeBanners />
        {children}
      </main>

      {showSkipPicker && <SkipModal onClose={() => setShowSkipPicker(false)} />}

      {/* Floating skip button — mobile only */}
      <button
        onClick={() => setShowSkipPicker(true)}
        className="md:hidden fixed bottom-24 right-4 z-20 flex items-center gap-1.5 px-4 py-3 rounded-full font-bold text-sm shadow-lg active:scale-95 transition-transform"
        style={{
          background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
          color: "var(--bg-base)",
          boxShadow: "0 4px 20px var(--gold-glow)",
        }}
      >
        <span className="text-base leading-none">✨</span> Skip
      </button>

      <Suspense fallback={null}>
        <MobileBottomNav />
      </Suspense>

      {showOnboarding && <OnboardingFlow onDone={() => setOnboardingDismissed(true)} />}
    </div>
  );
}
