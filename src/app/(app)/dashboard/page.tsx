"use client";
import { useState } from "react";
import { useSkips } from "@/hooks/useSkips";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { Skip } from "@/lib/types/models";

export default function SkipHistoryPage() {
  const { recentSkips } = useSkips();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-6">Skip History</h1>

      {recentSkips.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">☕</p>
          <p className="text-white/50 text-sm">No skips logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentSkips.map((skip) => (
            <div
              key={skip.id}
              className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl flex-shrink-0">
                {skip.categoryEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {skip.whatSkipped || skip.categoryLabel}
                </p>
                <p className="text-xs text-white/40">
                  {skip.createdAt?.toDate ? formatRelativeTime(skip.createdAt.toDate()) : skip.date}
                  {" · "}{skip.categoryLabel}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-white">{formatCurrency(skip.amount)}</span>
                <button
                  onClick={() => setEditingSkip(skip)}
                  className="text-white/30 hover:text-white/70 text-sm p-1 transition-colors"
                >
                  ✏️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingSkip && (
        <EditSkipModal
          skip={editingSkip}
          onClose={() => setEditingSkip(null)}
        />
      )}
    </div>
  );
}
