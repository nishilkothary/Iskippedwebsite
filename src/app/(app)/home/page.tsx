"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { Skip } from "@/lib/types/models";

export default function HomePage() {
  const { profile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);

  if (!profile) return null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#111827]">
          Hey, {profile.displayName.split(" ")[0]} 👋
        </h1>
        <p className="text-[#6B7280] mt-1">Skip, save, impact.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide mb-1">Total Saved</p>
          <p className="text-2xl font-bold text-[#3D8B68]">{formatCurrency(profile.totalSaved)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide mb-1">Total Donated</p>
          <p className="text-2xl font-bold text-[#3D8B68]">{formatCurrency(profile.totalDonated)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide mb-1">Total Skips</p>
          <p className="text-2xl font-bold text-[#111827]">{profile.totalSkips}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide mb-1">Streak</p>
          <p className="text-2xl font-bold text-[#F59E0B]">🔥 {profile.streak}</p>
        </div>
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
