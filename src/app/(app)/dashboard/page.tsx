"use client";
import { useAuthStore } from "@/store/authStore";
import { useStreak } from "@/hooks/useStreak";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import { xpProgress } from "@/lib/utils/xp";

export default function DashboardPage() {
  const { profile } = useAuthStore();
  const { streak, isActive, longestStreak } = useStreak();
  const { projects } = useProjects();

  if (!profile) return null;

  const xp = xpProgress(profile.xp);
  const progressPct = Math.round(xp.progress * 100);
  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;
  const goalAmount = activeProject?.goalAmount ?? 0;
  const causeProgress = goalAmount > 0
    ? Math.min((profile.savedTowardActiveCause / goalAmount) * 100, 100)
    : 0;

  const stats = [
    { label: "Total Saved", value: formatCurrency(profile.totalSaved), emoji: "💰" },
    { label: "Total Skips", value: String(profile.totalSkips), emoji: "✅" },
    { label: "Current Streak", value: `${streak} days`, emoji: "🔥" },
    { label: "Longest Streak", value: `${longestStreak} days`, emoji: "🏆" },
    { label: "Total Donated", value: formatCurrency(profile.totalDonated), emoji: "💚" },
    { label: "Cause Progress", value: formatCurrency(profile.savedTowardActiveCause), emoji: "🎯" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-[#111827] mb-8">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB]">
            <p className="text-xl mb-2">{s.emoji}</p>
            <p className="text-xl font-bold text-[#111827]">{s.value}</p>
            <p className="text-xs text-[#6B7280] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Level & XP */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E7EB] mb-6">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="font-semibold text-[#111827]">Level {profile.level}</p>
            <p className="text-sm text-[#6B7280]">{profile.xp} total XP</p>
          </div>
          <span className="bg-[#E4F0E8] text-[#3D8B68] text-sm font-semibold px-3 py-1 rounded-full">
            ⭐ {xp.current}/{xp.needed} XP
          </span>
        </div>
        <div className="h-3 bg-[#E5E7EB] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3D8B68] rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-[#6B7280] mt-2">{100 - progressPct}% to level {profile.level + 1}</p>
      </div>

      {/* Cause progress */}
      {profile.activeProjectId && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E7EB]">
          <p className="font-semibold text-[#111827] mb-1">Active Cause Progress</p>
          <p className="text-sm text-[#6B7280] mb-3">
            {formatCurrency(profile.savedTowardActiveCause)} saved toward goal
          </p>
          <div className="h-3 bg-[#E5E7EB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F59E0B] rounded-full transition-all"
              style={{ width: `${causeProgress}%` }}
            />
          </div>
          <p className="text-xs text-[#6B7280] mt-2">{Math.round(causeProgress)}% of goal reached</p>
        </div>
      )}

      {/* Streak indicator */}
      <div className={`mt-6 rounded-2xl p-5 border ${isActive ? "bg-[#FFF7ED] border-[#F59E0B]" : "bg-white border-[#E5E7EB]"}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div>
            <p className="font-semibold text-[#111827]">
              {isActive ? `${streak}-day streak! Keep it up!` : "Start your streak today"}
            </p>
            <p className="text-sm text-[#6B7280]">
              {isActive ? "You skipped recently — great work!" : "Log a skip to begin your streak"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
