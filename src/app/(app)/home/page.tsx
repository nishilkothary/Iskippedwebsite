"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { Skip } from "@/lib/types/models";

const CHILD_YEAR_COST = 300;

function givingImpact(amount: number): string {
  if (amount <= 0) return "0 days of education";
  const days = Math.round((amount / CHILD_YEAR_COST) * 365);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} of education`;
  const months = (amount / CHILD_YEAR_COST) * 12;
  if (months < 12) return `${months.toFixed(1)} months of education`;
  const years = amount / CHILD_YEAR_COST;
  return `${years.toFixed(1)} years of education`;
}

interface JarProps {
  fillPct: number; // 0-100
  color: string;
  emptyColor: string;
}

function Jar({ fillPct, color, emptyColor }: JarProps) {
  const clamped = Math.min(100, Math.max(0, fillPct));
  return (
    <div className="relative mx-auto w-16 h-24 flex flex-col justify-end">
      {/* Jar body */}
      <div className={`w-full h-full rounded-b-2xl rounded-t-lg border-2 border-[#E5E7EB] overflow-hidden relative ${emptyColor}`}>
        {/* Fill */}
        <div
          className={`absolute bottom-0 left-0 right-0 ${color} transition-all duration-700`}
          style={{ height: `${clamped}%` }}
        />
      </div>
      {/* Jar lip */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-2 rounded-t-sm border-t-2 border-x-2 border-[#E5E7EB] bg-white" />
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);

  if (!profile) return null;

  const split = profile.jarSplit ?? { giving: 34, spending: 33, savings: 33 };
  const givingTotal = profile.totalSaved * (split.giving / 100);
  const spendingTotal = profile.totalSaved * (split.spending / 100);
  const savingsTotal = profile.totalSaved * (split.savings / 100);

  const givingFillPct = Math.min(100, (givingTotal / CHILD_YEAR_COST) * 100);
  const spendingGoal = profile.spendingGoal;
  const spendingFillPct = spendingGoal
    ? Math.min(100, (spendingTotal / spendingGoal.targetAmount) * 100)
    : 0;
  const savingsFillPct = Math.min(100, (savingsTotal / 500) * 100); // visual ref: $500

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#111827]">
          Hey, {profile.displayName.split(" ")[0]} 👋
        </h1>
        <p className="text-[#6B7280] mt-1">Skip, save, give.</p>
      </div>

      {/* 3 Jars */}
      <div className="grid grid-cols-3 gap-3 mb-8">

        {/* Giving Jar */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5E7EB] shadow-sm flex flex-col items-center text-center">
          <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wide mb-2">🌍 Giving</p>
          <Jar fillPct={givingFillPct} color="bg-[#3D8B68]" emptyColor="bg-[#F9FAFB]" />
          <p className="text-[#3D8B68] font-bold text-sm mt-3">{formatCurrency(givingTotal)}</p>
          <p className="text-[#6B7280] text-xs mt-1 leading-tight">{givingImpact(givingTotal)}<br />funded</p>
        </div>

        {/* Spending Jar */}
        <div
          className="bg-white rounded-2xl p-4 border border-[#E5E7EB] shadow-sm flex flex-col items-center text-center cursor-pointer hover:border-[#3D8B68]/40 transition-colors"
          onClick={() => !spendingGoal && router.push("/profile")}
        >
          <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wide mb-2">🛍️ Spending</p>
          {spendingGoal ? (
            <>
              <Jar fillPct={spendingFillPct} color="bg-[#8B5CF6]" emptyColor="bg-[#F9FAFB]" />
              <p className="text-[#8B5CF6] font-bold text-sm mt-3">{Math.round(spendingFillPct)}%</p>
              <p className="text-[#6B7280] text-xs mt-1 leading-tight">to {spendingGoal.label}</p>
            </>
          ) : (
            <>
              <div className="w-16 h-24 mx-auto flex items-center justify-center">
                <span className="text-3xl opacity-30">🛍️</span>
              </div>
              <p className="text-[#3D8B68] text-xs font-semibold mt-3">Set a goal →</p>
            </>
          )}
        </div>

        {/* Savings Jar */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5E7EB] shadow-sm flex flex-col items-center text-center">
          <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wide mb-2">💰 Savings</p>
          <Jar fillPct={savingsFillPct} color="bg-[#F59E0B]" emptyColor="bg-[#F9FAFB]" />
          <p className="text-[#F59E0B] font-bold text-sm mt-3">{formatCurrency(savingsTotal)}</p>
          <p className="text-[#6B7280] text-xs mt-1 leading-tight">for the<br />future</p>
        </div>
      </div>

      {/* Streak + split info */}
      <div className="flex items-center justify-between mb-8 px-1">
        <span className="text-sm text-[#6B7280]">
          🔥 <span className="font-semibold text-[#F59E0B]">{profile.streak}</span> day streak
        </span>
        <button
          onClick={() => router.push("/profile")}
          className="text-xs text-[#3D8B68] font-medium hover:underline"
        >
          {split.giving}% giving · {split.spending}% spending · {split.savings}% savings
        </button>
      </div>

      {/* CTA */}
      <button
        onClick={() => setShowSkipPicker(true)}
        className="w-full bg-gradient-to-r from-[#3D8B68] to-[#34A87A] text-white font-bold py-4 rounded-full text-lg mb-8 shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.97] transition-all duration-200"
      >
        ✨ Log a Skip
      </button>

      {/* Recent skips */}
      <div>
        <h2 className="text-lg font-semibold text-[#111827] mb-4">Recent Skips</h2>
        {recentSkips.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-[#E5E7EB]">
            <p className="text-4xl mb-3">☕</p>
            <p className="text-[#6B7280]">No skips yet. Log your first skip above!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSkips.slice(0, 10).map((skip) => (
              <div key={skip.id} className="bg-white rounded-xl px-5 py-4 border border-[#E5E7EB] flex items-center gap-3">
                <span className="text-2xl flex-shrink-0">{skip.categoryEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#111827] text-sm">
                    {skip.whatSkipped || skip.categoryLabel}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {skip.createdAt?.toDate ? formatRelativeTime(skip.createdAt.toDate()) : skip.date}
                  </p>
                </div>
                <span className="text-[#3D8B68] font-bold text-sm flex-shrink-0">{formatCurrency(skip.amount)}</span>
                <button
                  onClick={() => setEditingSkip(skip)}
                  className="text-[#9CA3AF] hover:text-[#3D8B68] transition-colors flex-shrink-0 p-1"
                  title="Edit skip"
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
