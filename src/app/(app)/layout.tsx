"use client";
import { useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { SkipModal } from "@/components/skip/SkipModal";

const NAV_ITEMS = [
  { href: "/home",            label: "Home",          emoji: "🏠",  tab: null },
  { href: "/jars?tab=cause",  label: "Give a Little", emoji: "🤲",  tab: "cause" },
  { href: "/jars?tab=live",   label: "Save a Little", emoji: "😊",  tab: "live" },
  { href: "/community",       label: "Community",     emoji: "🌍",  tab: null },
  { href: "/profile",         label: "Profile",       emoji: "👤",  tab: null },
];

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
        <p className="text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          i<span style={{ color: "var(--green-primary)" }}>skipped</span>
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.tab !== null
            ? pathname === "/jars" && searchParams.get("tab") === item.tab
            : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
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
              <span className="text-base">{item.emoji}</span>
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
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.tab !== null
          ? pathname === "/jars" && searchParams.get("tab") === item.tab
          : pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors"
            style={{ color: active ? "var(--gold-cta)" : "var(--text-muted)" }}
          >
            <span className="text-xl">{item.emoji}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, profile, isLoading } = useAuthStore();
  const { showSkipPicker, setShowSkipPicker } = useUIStore();

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

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>

      {showSkipPicker && <SkipModal onClose={() => setShowSkipPicker(false)} />}

      <Suspense fallback={null}>
        <MobileBottomNav />
      </Suspense>
    </div>
  );
}
