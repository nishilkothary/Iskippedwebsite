"use client";
import { useState } from "react";
import { DonationEvent } from "@/lib/types/models";
import { useSkips } from "@/hooks/useSkips";

interface Props {
  donation: DonationEvent;
  onClose: () => void;
}

export function EditDonationModal({ donation, onClose }: Props) {
  const { editDonation, deleteDonation } = useSkips();
  const [amount, setAmount] = useState(donation.amount.toString());
  const [date, setDate] = useState(donation.date ?? (donation.donatedAt?.toDate ? donation.donatedAt.toDate().toISOString().slice(0, 10) : ""));
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    setLoading(true);
    try {
      await editDonation(donation, num, date || undefined);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this donation record?")) return;
    setLoading(true);
    try {
      await deleteDonation(donation);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-bold text-[#111827]">Edit Donation</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-[#6B7280]">Donated to {donation.causeTitle}</p>
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
            <label className="text-xs text-[#6B7280] uppercase tracking-wide mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68]"
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
