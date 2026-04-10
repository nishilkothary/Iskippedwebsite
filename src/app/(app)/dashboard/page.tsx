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
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Skip History</h1>

      {recentSkips.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">☕</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No skips logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentSkips.map((skip) => (
            <div
              key={skip.id}
              className="rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors"
              style={{
                background: "var(--bg-surface-1)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: "var(--bg-surface-2)" }}
              >
                {skip.categoryEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {skip.whatSkipped || skip.categoryLabel}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {skip.createdAt?.toDate ? formatRelativeTime(skip.createdAt.toDate()) : skip.date}
                  {" · "}{skip.categoryLabel}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(skip.amount)}</span>
                <button
                  onClick={() => setEditingSkip(skip)}
                  className="text-sm p-1 transition-colors"
                  style={{ color: "var(--text-muted)" }}
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
