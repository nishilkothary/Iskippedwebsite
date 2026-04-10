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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Log a Donation</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="px-6 py-5">
          {done ? (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">✓</p>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Donation logged!</p>
            </div>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                How much did you donate to {projectTitle}?
              </p>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: "var(--text-muted)" }}>Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium" style={{ color: "var(--text-secondary)" }}>$</span>
                    <input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
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
              </div>
              <button
                onClick={handleLog}
                disabled={loading || !amount || parseFloat(amount) < 1}
                className="w-full font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, var(--coral-primary), var(--coral-dark))",
                  color: "#fff",
                }}
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
