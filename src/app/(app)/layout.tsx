"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { SkipModal } from "@/components/skip/SkipModal";

const NAV_ITEMS = [
  { href: "/home",      label: "Home",      emoji: "🏠" },
  { href: "/jars",      label: "My Jars",   emoji: "🫙" },
  { href: "/community", label: "Community", emoji: "🌍" },
  { href: "/profile",   label: "Profile",   emoji: "👤" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuthStore();
  const { showSkipPicker, setShowSkipPicker } = useUIStore();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/sign-in");
    }
  }, [user, isLoading, router]);

  if (isLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D]">
        <div className="w-8 h-8 border-4 border-[#3D8B68] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-[#0D0D0D]">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-[#111111] border-r border-[#2A2A2A] hidden md:flex flex-col">
        <div className="px-6 py-5 border-b border-[#2A2A2A]">
          <div className="bg-white rounded-xl px-3 py-1.5 inline-block">
            <Image
              src="/logo.png"
              alt="i skipped"
              width={110}
              height={44}
              priority
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#1A2F25] text-[#4ADE80]"
                    : "text-[#9CA3AF] hover:bg-[#1A1A1A] hover:text-white"
                }`}
              >
                <span className="text-base">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => setShowSkipPicker(true)}
            className="w-full bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white font-semibold py-3 rounded-full shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.97] transition-all duration-200"
          >
            ✨ Log a Skip
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>

      {showSkipPicker && <SkipModal onClose={() => setShowSkipPicker(false)} />}

      {/* Mobile bottom nav */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 bg-[#111111] border-t border-[#2A2A2A] z-10">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                active ? "text-[#4ADE80]" : "text-[#6B7280]"
              }`}
            >
              <span className="text-xl">{item.emoji}</span>
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setShowSkipPicker(true)}
          className="flex-1 flex flex-col items-center py-2 text-xs font-medium text-[#4ADE80]"
        >
          <span className="text-xl">✨</span>
          Log Skip
        </button>
      </nav>
    </div>
  );
}
