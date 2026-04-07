"use client";
import { useState } from "react";
import { Skip } from "@/lib/types/models";
import { useSkips } from "@/hooks/useSkips";
import { useAuthStore } from "@/store/authStore";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeJarSplit } from "@/lib/services/firebase/users";

interface Props {
  skip: Skip;
  onClose: () => void;
}

export function EditSkipModal({ skip, onClose }: Props) {
  const { edit, deleteSkip } = useSkips();
  const { profile } = useAuthStore();
  const profileSplit = normalizeJarSplit(profile?.jarSplit as any);

  const initialCat =
    SKIP_CATEGORIES.find((c) => c.id === skip.category) ?? SKIP_CATEGORIES[0];
  const isCustomInit = !SKIP_CATEGORIES.find((c) => c.id === skip.category && c.id !== "custom");
  const initialCustomLabel =
    initialCat.id === "custom" ? (skip.categoryLabel ?? "") : "";

  const [selectedCat, setSelectedCat] = useState(initialCat);
  const [customLabel, setCustomLabel] = useState(initialCustomLabel);
  const [amount, setAmount] = useState(skip.amount.toString());
  const [whatSkipped, setWhatSkipped] = useState(skip.whatSkipped ?? "");
  const [notes, setNotes] = useState(skip.notes ?? "");
  const [givePct, setGivePct] = useState(skip.jarSplit?.give ?? profileSplit.give);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const livePct = 100 - givePct;
  const num = parseFloat(amount) || 0;

  function handleCatSelect(cat: typeof initialCat) {
    setSelectedCat(cat);
    if (cat.id !== "custom") setCustomLabel("");
  }

  async function handleSave() {
    if (!num || num <= 0) return;
    setLoading(true);
    try {
      await edit(skip, {
        amount: num,
        category: selectedCat.id,
        categoryLabel: selectedCat.id === "custom" ? (customLabel || "Custom") : selectedCat.label,
        categoryEmoji: selectedCat.emoji,
        whatSkipped: whatSkipped || undefined,
        notes: notes || undefined,
        jarSplit: { give: givePct, live: livePct },
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
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
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-bold text-[#111827]">Edit Skip</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* What did you skip */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">What did you skip?</label>
            <input
              type="text"
              value={whatSkipped}
              onChange={(e) => setWhatSkipped(e.target.value)}
              placeholder={skip.categoryLabel}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68]"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">Amount skipped</label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-[#3D8B68]">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw);
                }}
                className="w-28 text-2xl font-bold text-[#3D8B68] border-b-2 border-[#3D8B68] focus:outline-none bg-transparent"
              />
            </div>
            {num > 0 && (
              <div className="mt-3 bg-[#F9FAFB] rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6B7280]">💚 Give a little</span>
                  <span className="font-bold text-[#E8637A]">{givePct}% · +{formatCurrency(num * givePct / 100)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6B7280]">✨ Live a little</span>
                  <span className="font-bold text-[#2BBAA4]">{livePct}% · +{formatCurrency(num * livePct / 100)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Split slider */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">This skip&apos;s split</label>
            <div className="flex items-center justify-between text-xs text-[#6B7280] mb-1">
              <span>🤲 Give <span className="font-bold text-[#E8637A]">{givePct}%</span></span>
              <span>😊 Live <span className="font-bold text-[#2BBAA4]">{livePct}%</span></span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={givePct}
              onChange={(e) => setGivePct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #E8637A ${givePct}%, #2BBAA4 ${givePct}%)` }}
            />
            <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-0.5">
              <span>All Give</span>
              <span>All Live</span>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">Category</label>
            <div className="grid grid-cols-4 gap-2">
              {SKIP_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCatSelect(cat)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition-all ${
                    selectedCat.id === cat.id
                      ? "border-[#3D8B68] bg-[#E4F0E8] text-[#3D8B68]"
                      : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#3D8B68]/40"
                  }`}
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-xs font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
            {selectedCat.id === "custom" && (
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Enter category"
                className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68] mt-2"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">Personal notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any thoughts?"
              rows={2}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68] resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleSave}
            disabled={loading || num <= 0}
            className="w-full bg-[#3D8B68] hover:bg-[#2D6A4F] text-white font-bold py-4 rounded-xl text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : "Save changes"}
          </button>

          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-[#E5E7EB] text-[#6B7280] font-semibold py-3 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60"
              >
                {loading ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full border border-red-300 text-red-500 font-semibold py-3 rounded-xl text-sm hover:bg-red-50 transition-colors"
            >
              Delete skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
