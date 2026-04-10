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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Edit Donation</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Donated to {donation.causeTitle}</p>
          <div>
            <label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: "var(--text-muted)" }}>Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium" style={{ color: "var(--text-secondary)" }}>$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl pl-8 pr-4 py-3 text-lg font-semibold focus:outline-none"
                style={{
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: "var(--text-muted)" }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 focus:outline-none"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 font-semibold py-3 rounded-xl hover:bg-red-500/10 transition-colors disabled:opacity-60"
              style={{ border: "2px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
            >
              Delete
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="flex-1 font-bold py-3 rounded-xl transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, var(--green-primary), var(--green-cta))",
                color: "var(--bg-base)",
              }}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
