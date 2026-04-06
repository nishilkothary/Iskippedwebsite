"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";
import { normalizeJarSplit, normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { Skip } from "@/lib/types/models";

function levelLabel(pct: number): string {
  if (pct >= 100) return "Goal reached! 🎉";
  if (pct >= 75) return "Almost there! 🔥";
  if (pct >= 50) return "Over halfway!";
  if (pct >= 25) return "Getting there";
  return "Just started";
}

interface JarProps {
  fillPct: number;
  color: string;
  glowColor: string;
  label: string;
  emoji: string;
  amount: string;
  subLabel: string;
  emptyNode: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

function JarCard({ fillPct, color, glowColor, label, emoji, amount, subLabel, emptyNode, href, onClick }: JarProps) {
  const [displayFill, setDisplayFill] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDisplayFill(Math.min(100, Math.max(0, fillPct))), 120);
    return () => clearTimeout(t);
  }, [fillPct]);

  const pct = Math.round(Math.min(100, Math.max(0, fillPct)));
  const isNearGoal = pct >= 75;
  const isComplete = pct >= 100;
  const isEmpty = fillPct <= 0;

  const inner = (
    <div
      className={`relative bg-[#161616] rounded-3xl border-2 flex flex-col items-center text-center cursor-pointer transition-all duration-300 p-4`}
      style={{
        borderColor: isNearGoal ? glowColor : "#2A2A2A",
        boxShadow: isComplete
          ? `0 0 40px ${glowColor}55, 0 0 80px ${glowColor}22`
          : isNearGoal
          ? `0 0 24px ${glowColor}44`
          : "none",
      }}
    >
      {/* Label */}
      <p className="text-[10px] sm:text-[11px] font-bold text-[#6B7280] uppercase tracking-widest mb-3">{label}</p>

      {isEmpty ? (
        emptyNode
      ) : (
        <>
          {/* Battery jar */}
          <div className="relative mb-4" style={{ width: 90, height: 130 }}>
            {/* Glow halo */}
            {isNearGoal && (
              <div
                className="absolute inset-0 rounded-2xl blur-2xl animate-pulse"
                style={{ background: glowColor, opacity: 0.5, transform: "scale(1.2)" }}
              />
            )}

            {/* Battery cap (nub at top) */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 rounded-t-md"
              style={{
                width: 32,
                height: 10,
                background: "#2A2A2A",
                zIndex: 4,
              }}
            />

            {/* Battery body */}
            <div
              className="absolute bottom-0 left-0 right-0 rounded-2xl border-2 overflow-hidden"
              style={{
                top: 8,
                background: "#0D0D0D",
                borderColor: "#2A2A2A",
                zIndex: 1,
              }}
            >
              {/* Fill */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: `${displayFill}%`,
                  background: `linear-gradient(180deg, ${color}CC 0%, ${color} 100%)`,
                  transition: "height 1.6s cubic-bezier(0.34,1.25,0.64,1)",
                }}
              >
                {/* Shimmer line at fill top */}
                <div className="absolute top-0 left-0 right-0 h-1 opacity-50 bg-white rounded-full" />
              </div>

              {/* Milestone dashes */}
              {[25, 50, 75].map((m) => (
                <div
                  key={m}
                  className="absolute left-2 right-2"
                  style={{
                    bottom: `${m}%`,
                    borderTop: "1px dashed rgba(255,255,255,0.12)",
                    zIndex: 2,
                  }}
                />
              ))}

              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1" style={{ zIndex: 3 }}>
                {isComplete ? (
                  <span className="text-2xl drop-shadow">🎉</span>
                ) : (
                  <>
                    <span className="text-2xl drop-shadow">{emoji}</span>
                    <span
                      className="text-xs font-black leading-none"
                      style={{ color: pct > 45 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }}
                    >
                      {pct}%
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Amount */}
          <p className="font-black text-lg leading-none mb-1" style={{ color }}>
            {amount}
          </p>

          {/* Sub label */}
          <p className="text-[#6B7280] text-[10px] sm:text-xs leading-tight px-1 mb-2">{subLabel}</p>

          {/* Level badge */}
          <div
            className="px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold"
            style={{ background: `${glowColor}22`, color, border: `1px solid ${glowColor}33` }}
          >
            {levelLabel(pct)}
          </div>
        </>
      )}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return <div onClick={onClick}>{inner}</div>;
}


export default function HomePage() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { projects } = useProjects();
  const { setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);

  if (!profile) return null;

  const split = normalizeJarSplit(profile.jarSplit as any);
  const giveTotal = profile.totalSaved * (split.give / 100);
  const liveTotal = profile.totalSaved * (split.live / 100);

  const givingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const spendingBalance = Math.max(0, liveTotal - (profile.totalSpent ?? 0));

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;
  const goalAmount = activeProject?.goalAmount ?? 0;
  const givingFillPct = goalAmount > 0 ? Math.min(100, (givingBalance / goalAmount) * 100) : 0;

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;
  const spendingFillPct = activeGoal
    ? Math.min(100, (spendingBalance / activeGoal.targetAmount) * 100)
    : 0;

  const firstName = profile.displayName.split(" ")[0];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-8">

      {/* Greeting + streak */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-[#F9FAFB]">Hey, {firstName} 👋</h1>
          <p className="text-[#6B7280] mt-0.5 text-sm">Skip, save, give.</p>
        </div>
        {profile.streak > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-950/50 border border-amber-800/50 rounded-full px-3 py-1.5 mt-1 flex-shrink-0">
            <span className="text-base">🔥</span>
            <span className="text-sm font-black text-amber-400">{profile.streak}</span>
            <span className="text-xs text-amber-600 font-medium">day streak</span>
          </div>
        )}
      </div>

      {/* Total saved hero */}
      {profile.totalSaved > 0 && (
        <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl p-5 mb-4 text-center"
          style={{ boxShadow: "0 0 40px rgba(61,139,104,0.08)" }}
        >
          <p className="text-[#6B7280] text-[10px] font-bold uppercase tracking-widest mb-1">Total Skipped &amp; Saved</p>
          <p className="text-white text-5xl font-black tracking-tight"
            style={{ textShadow: "0 0 40px rgba(61,139,104,0.4)" }}
          >
            {formatCurrency(profile.totalSaved)}
          </p>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => setShowSkipPicker(true)}
        className="w-full bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white font-black py-4 rounded-full text-lg shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.97] transition-all duration-200 mb-0"
      >
        ✨ Log a Skip
      </button>

      {/* Waterfall */}
      <svg viewBox="0 0 300 48" className="w-full" style={{ height: 48 }} preserveAspectRatio="none">
        <defs>
          <path id="p-give" d="M 150,0 Q 75,24 75,48" />
          <path id="p-live" d="M 150,0 Q 225,24 225,48" />
        </defs>
        <use href="#p-give" fill="none" stroke="#3D8B68" strokeWidth="2" strokeOpacity="0.3" />
        <use href="#p-live" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeOpacity="0.3" />
      </svg>

      {/* 2 Jars */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <JarCard
          fillPct={givingFillPct}
          color="#3D8B68"
          glowColor="#3D8B68"
          label="Give a little"
          emoji="💚"
          amount={formatCurrency(givingBalance)}
          subLabel={
            activeProject
              ? `${Math.round(givingFillPct)}% towards ${activeProject.title}`
              : "Pick a cause →"
          }
          emptyNode={
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-16 h-24 rounded-2xl border-2 border-dashed border-[#3D8B68]/30 flex items-center justify-center text-2xl opacity-40">💚</div>
              <p className="text-[#3D8B68] text-[10px] font-bold">Pick a cause →</p>
            </div>
          }
          href="/jars?tab=cause"
        />

        <JarCard
          fillPct={spendingFillPct}
          color="#8B5CF6"
          glowColor="#8B5CF6"
          label="Live a little"
          emoji="✨"
          amount={formatCurrency(spendingBalance)}
          subLabel={
            activeGoal
              ? `${Math.round(spendingFillPct)}% to ${activeGoal.label}`
              : "Pick your goal →"
          }
          emptyNode={
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-16 h-24 rounded-2xl border-2 border-dashed border-[#8B5CF6]/30 flex items-center justify-center text-2xl opacity-40">✨</div>
              <p className="text-[#8B5CF6] text-[10px] font-bold">Pick your goal →</p>
            </div>
          }
          onClick={() => router.push("/jars?tab=splurge")}
        />
      </div>

      {/* Give/Live split bar */}
      {profile.totalSaved > 0 && (
        <div className="mb-2">
          <div className="flex rounded-full overflow-hidden h-2 mb-1.5">
            <div
              className="transition-all duration-700"
              style={{ width: `${split.give}%`, background: "#3D8B68" }}
            />
            <div
              className="transition-all duration-700"
              style={{ width: `${split.live}%`, background: "#8B5CF6" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#6B7280] font-semibold uppercase tracking-wide">
            <span>{split.give}% give</span>
            <span>{split.live}% live</span>
          </div>
        </div>
      )}

      {/* Manage link */}
      <div className="flex justify-center mb-5 mt-3">
        <button
          onClick={() => router.push("/jars")}
          className="text-xs text-[#3D8B68] font-semibold hover:underline"
        >
          Manage jars →
        </button>
      </div>

      {/* Recent skips */}
      <div>
        <h2 className="text-lg font-bold text-[#F9FAFB] mb-3">Recent Skips</h2>
        {recentSkips.length === 0 ? (
          <div className="bg-[#161616] rounded-2xl p-8 text-center border border-[#2A2A2A]">
            <p className="text-4xl mb-3">☕</p>
            <p className="text-[#6B7280]">No skips yet. Log your first skip above!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSkips.slice(0, 10).map((skip) => (
              <div
                key={skip.id}
                className="bg-[#161616] rounded-xl px-4 py-3 border border-[#2A2A2A] flex items-center gap-3 hover:border-[#3D8B68]/40 transition-colors"
              >
                <span className="text-xl flex-shrink-0">{skip.categoryEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#F9FAFB] text-sm truncate">
                    {skip.whatSkipped || skip.categoryLabel}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {skip.createdAt?.toDate ? formatRelativeTime(skip.createdAt.toDate()) : skip.date}
                  </p>
                </div>
                <span className="text-[#4ADE80] font-black text-sm flex-shrink-0">
                  {formatCurrency(skip.amount)}
                </span>
                <button
                  onClick={() => setEditingSkip(skip)}
                  className="text-[#6B7280] hover:text-[#3D8B68] transition-colors flex-shrink-0 p-1"
                >
                  ✏️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingSkip && (
        <EditSkipModal
          skip={editingSkip}
          onClose={() => setEditingSkip(null)}
        />
      )}
    </div>
  );
}
