"use client";
import { useState } from "react";
import { useSkips } from "@/hooks/useSkips";
import { today } from "@/lib/utils/dates";

interface Props {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}

export function DonationLogModal({ projectId, projectTitle, onClose }: Props) {
  const { donate } = useSkips();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleLog() {
    const num = parseFloat(amount);
    if (!num || num < 1) return;
    setLoading(true);
    try {
      await donate(num, projectId, projectTitle, date);
      setDone(true);
      setTimeout(onClose, 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-bold text-[#111827]">Log a Donation</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5">
          {done ? (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">✓</p>
              <p className="font-semibold text-[#111827]">Donation logged!</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#6B7280] mb-4">
                How much did you donate to {projectTitle}?
              </p>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs text-[#6B7280] uppercase tracking-wide mb-1 block">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] font-medium">$</span>
                    <input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
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
              </div>
              <button
                onClick={handleLog}
                disabled={loading || !amount || parseFloat(amount) < 1}
                className="w-full bg-[#3D8B68] hover:bg-[#2D6A4F] text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Logging…" : "Log Donation"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
