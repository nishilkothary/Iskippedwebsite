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
  bgColor: string;
  glowColor: string;
  label: string;
  amount: string;
  subLabel: string;
  emptyNode: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

function JarCard({ fillPct, color, bgColor, glowColor, label, amount, subLabel, emptyNode, href, onClick }: JarProps) {
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
      className={`relative bg-white rounded-3xl border-2 flex flex-col items-center text-center cursor-pointer transition-all duration-300 p-3 sm:p-4 ${
        isComplete
          ? "border-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.35)]"
          : isNearGoal
          ? "border-current shadow-lg"
          : "border-[#E5E7EB] shadow-sm hover:shadow-md"
      }`}
      style={isNearGoal && !isComplete ? { borderColor: glowColor, boxShadow: `0 0 20px ${glowColor}33` } : {}}
    >
      {/* Label */}
      <p className="text-[10px] sm:text-xs font-bold text-[#6B7280] uppercase tracking-wide mb-2">{label}</p>

      {isEmpty ? (
        emptyNode
      ) : (
        <>
          {/* Jar */}
          <div className="relative mb-3" style={{ width: 60, height: 90 }}>
            {/* Glow halo */}
            {isNearGoal && (
              <div
                className="absolute inset-0 rounded-3xl blur-xl animate-pulse"
                style={{ background: glowColor, opacity: 0.35, transform: "scale(1.15)" }}
              />
            )}

            {/* Body */}
            <div
              className="relative w-full h-full rounded-b-3xl rounded-t-xl border-2 border-[#E5E7EB] overflow-hidden"
              style={{ background: bgColor, zIndex: 1 }}
            >
              {/* Fill */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: `${displayFill}%`,
                  background: color,
                  transition: "height 1.6s cubic-bezier(0.34,1.25,0.64,1)",
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-1 opacity-40 bg-white rounded-full" />
              </div>

              {/* Milestone dashes */}
              {[25, 50, 75].map((m) => (
                <div
                  key={m}
                  className="absolute left-1 right-1"
                  style={{
                    bottom: `${m}%`,
                    borderTop: "1px dashed rgba(255,255,255,0.5)",
                    zIndex: 2,
                  }}
                />
              ))}

              {/* % or celebration */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
                {isComplete ? (
                  <span className="text-xl drop-shadow">🎉</span>
                ) : (
                  <span
                    className="text-sm font-black drop-shadow-sm leading-none"
                    style={{ color: pct > 50 ? "white" : "#374151" }}
                  >
                    {pct}%
                  </span>
                )}
              </div>
            </div>

            {/* Jar neck */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 rounded-t-lg bg-white border-t-2 border-x-2 border-[#E5E7EB]"
              style={{ width: "68%", height: 9, zIndex: 4 }}
            />
          </div>

          {/* Amount */}
          <p className="font-black text-sm leading-none" style={{ color }}>
            {amount}
          </p>

          {/* Sub label */}
          <p className="text-[#6B7280] text-[10px] sm:text-xs mt-1 leading-tight px-1">{subLabel}</p>

          {/* Level badge */}
          <div
            className="mt-2 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold"
            style={{ background: `${color}18`, color }}
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
          <h1 className="text-2xl font-black text-[#111827]">Hey, {firstName} 👋</h1>
          <p className="text-[#6B7280] mt-0.5 text-sm">Skip, save, give.</p>
        </div>
        {profile.streak > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 mt-1 flex-shrink-0">
            <span className="text-base">🔥</span>
            <span className="text-sm font-black text-amber-600">{profile.streak}</span>
            <span className="text-xs text-amber-500 font-medium">day streak</span>
          </div>
        )}
      </div>

      {/* Total saved hero */}
      {profile.totalSaved > 0 && (
        <div className="bg-gradient-to-r from-[#3D8B68] to-[#34A87A] rounded-2xl p-4 mb-4 text-center shadow-md">
          <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mb-1">Total saved</p>
          <p className="text-white text-4xl font-black">{formatCurrency(profile.totalSaved)}</p>
          <p className="text-emerald-200 text-xs mt-1">{split.give}% give · {split.live}% live</p>
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
        <use href="#p-give" fill="none" stroke="#3D8B68" strokeWidth="2" strokeOpacity="0.2" />
        <use href="#p-live" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeOpacity="0.2" />
      </svg>

      {/* 2 Jars */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <JarCard
          fillPct={givingFillPct}
          color="#3D8B68"
          bgColor="#F0FAF5"
          glowColor="#3D8B68"
          label="💚 Give a little"
          amount={formatCurrency(givingBalance)}
          subLabel={
            activeProject
              ? `${Math.round(givingFillPct)}% towards ${activeProject.title}`
              : "Pick a cause →"
          }
          emptyNode={
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-14 h-20 flex items-center justify-center opacity-20 text-3xl">💚</div>
              <p className="text-[#3D8B68] text-[10px] font-bold">Pick a cause →</p>
            </div>
          }
          href="/jars?tab=cause"
        />

        <JarCard
          fillPct={spendingFillPct}
          color="#8B5CF6"
          bgColor="#F5F3FF"
          glowColor="#8B5CF6"
          label="✨ Live a little"
          amount={formatCurrency(spendingBalance)}
          subLabel={
            activeGoal
              ? `${Math.round(spendingFillPct)}% to ${activeGoal.label}`
              : "Pick your goal →"
          }
          emptyNode={
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-14 h-20 flex items-center justify-center opacity-20 text-3xl">✨</div>
              <p className="text-[#8B5CF6] text-[10px] font-bold">Pick your goal →</p>
            </div>
          }
          onClick={() => router.push("/jars?tab=splurge")}
        />
      </div>

      {/* Manage link */}
      <div className="flex justify-center mb-5">
        <button
          onClick={() => router.push("/jars")}
          className="text-xs text-[#3D8B68] font-semibold hover:underline"
        >
          Manage jars →
        </button>
      </div>

      {/* Recent skips */}
      <div>
        <h2 className="text-lg font-bold text-[#111827] mb-3">Recent Skips</h2>
        {recentSkips.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-[#E5E7EB]">
            <p className="text-4xl mb-3">☕</p>
            <p className="text-[#6B7280]">No skips yet. Log your first skip above!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSkips.slice(0, 10).map((skip) => (
              <div
                key={skip.id}
                className="bg-white rounded-xl px-4 py-3 border border-[#E5E7EB] flex items-center gap-3 hover:border-[#3D8B68]/30 transition-colors"
              >
                <span className="text-xl flex-shrink-0">{skip.categoryEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#111827] text-sm truncate">
                    {skip.whatSkipped || skip.categoryLabel}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {skip.createdAt?.toDate ? formatRelativeTime(skip.createdAt.toDate()) : skip.date}
                  </p>
                </div>
                <span className="text-[#3D8B68] font-black text-sm flex-shrink-0">
                  {formatCurrency(skip.amount)}
                </span>
                <button
                  onClick={() => setEditingSkip(skip)}
                  className="text-[#9CA3AF] hover:text-[#3D8B68] transition-colors flex-shrink-0 p-1"
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
