"use client";
import { useState } from "react";
import { useSkips } from "@/hooks/useSkips";
import { useModalA11y } from "@/hooks/useModalA11y";
import { today } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/currency";
import { useAuthStore } from "@/store/authStore";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";

interface Props {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  initialAmount?: number;
  onLogged?: () => void | Promise<void>;
}

export function DonationLogModal({ projectId, projectTitle, onClose, initialAmount, onLogged }: Props) {
  const { donate } = useSkips();
  const { profile } = useAuthStore();
  const [amount, setAmount] = useState(initialAmount && initialAmount > 0 ? String(initialAmount) : "");
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const dialogRef = useModalA11y(onClose);
  const parsedAmount = parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const jarBalance = Math.max(0, profile?.causeJarBalances?.[projectId] ?? 0);
  const unassignedSkipBucks = getSkipBalanceSummary(profile).unassignedSkipBank;
  const totalAvailable = jarBalance + unassignedSkipBucks;
  const amountOverAvailable = cleanAmount > totalAvailable;
  const extraFromUnassigned = Math.max(0, cleanAmount - jarBalance);

  async function handleLog() {
    const num = cleanAmount;
    if (!num || num < 1 || amountOverAvailable) return;
    setLoading(true);
    try {
      const ok = await donate(num, projectId, projectTitle, date);
      if (ok) {
        setDone(true);
        setTimeout(async () => {
          await onLogged?.();
          onClose();
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="donation-log-title"
        tabIndex={-1}
        className="rounded-2xl shadow-2xl w-full max-w-sm"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 id="donation-log-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Log a Donation</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
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
                      max={totalAvailable || undefined}
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
                  <p className="mt-2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                    {formatCurrency(totalAvailable)} available from this jar and Unassigned Skip Bucks.
                  </p>
                  {amountOverAvailable && (
                    <p className="mt-2 text-xs font-bold leading-relaxed" style={{ color: "#EF4444" }}>
                      This is more than your available Skip Bucks. Lower the amount to {formatCurrency(totalAvailable)} or less.
                    </p>
                  )}
                  {!amountOverAvailable && extraFromUnassigned > 0 && cleanAmount > 0 && (
                    <p className="mt-2 text-xs font-bold leading-relaxed" style={{ color: "var(--green-primary)" }}>
                      {formatCurrency(Math.min(cleanAmount, jarBalance))} will come from this jar and {formatCurrency(extraFromUnassigned)} from Unassigned Skip Bucks.
                    </p>
                  )}
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
                disabled={loading || !amount || cleanAmount < 1 || amountOverAvailable}
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
