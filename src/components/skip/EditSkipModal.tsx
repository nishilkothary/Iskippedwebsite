"use client";
import { useState } from "react";
import { Skip } from "@/lib/types/models";
import { useSkips } from "@/hooks/useSkips";
import { useAuthStore } from "@/store/authStore";
import { normalizeJarSplit } from "@/lib/services/firebase/users";

interface Props {
  skip: Skip;
  onClose: () => void;
}

export function EditSkipModal({ skip, onClose }: Props) {
  const { edit, deleteSkip } = useSkips();
  const { profile } = useAuthStore();
  const profileSplit = normalizeJarSplit(profile?.jarSplit as any);
  const initialGivePct = skip.jarSplit?.give ?? profileSplit.give;

  const [amount, setAmount] = useState(skip.amount.toString());
  const [whatSkipped, setWhatSkipped] = useState(skip.whatSkipped ?? "");
  const [givePct, setGivePct] = useState(initialGivePct);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    setLoading(true);
    try {
      await edit(skip, {
        amount: num,
        whatSkipped: whatSkipped || undefined,
        jarSplit: { give: givePct, live: 100 - givePct },
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this skip?")) return;
    setLoading(true);
    try {
      await deleteSkip(skip);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-bold text-[#111827]">Edit Skip</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-[#6B7280] uppercase tracking-wide mb-1 block">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] font-medium">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-xl pl-8 pr-4 py-3 text-[#111827] text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68]"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#6B7280] uppercase tracking-wide mb-1 block">What did you skip? (optional)</label>
            <input
              type="text"
              value={whatSkipped}
              onChange={(e) => setWhatSkipped(e.target.value)}
              placeholder={skip.categoryLabel}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68]"
            />
          </div>
          <div>
            <label className="text-xs text-[#6B7280] uppercase tracking-wide mb-1 block">Split for this skip</label>
            <div className="flex items-center justify-between text-xs text-[#6B7280] mb-1">
              <span>🤲 Give <span className="font-bold text-[#E8637A]">{givePct}%</span></span>
              <span>😊 Live <span className="font-bold text-[#2BBAA4]">{100 - givePct}%</span></span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={givePct}
              onChange={(e) => setGivePct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #E8637A ${givePct}%, #2BBAA4 ${givePct}%)`,
              }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 border-2 border-red-400 text-red-500 font-semibold py-3 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-60"
            >
              Delete
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="flex-1 bg-[#3D8B68] hover:bg-[#2D6A4F] text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
