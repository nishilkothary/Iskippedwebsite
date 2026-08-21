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
  donationURL?: string;
  donationRecipient?: string;
  onLogged?: () => void | Promise<void>;
}

export function DonationLogModal({ projectId, projectTitle, onClose, initialAmount, donationURL, donationRecipient, onLogged }: Props) {
  const { donate } = useSkips();
  const { profile } = useAuthStore();
  const [amount, setAmount] = useState(initialAmount && initialAmount > 0 ? String(initialAmount) : "");
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"logged" | "emptied" | null>(null);
  const dialogRef = useModalA11y(onClose);
  const parsedAmount = parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const jarBalance = Math.max(0, profile?.causeJarBalances?.[projectId] ?? 0);
  const unassignedSkipBucks = getSkipBalanceSummary(profile).unassignedSkipBank;
  const totalAvailable = jarBalance + unassignedSkipBucks;
  const amountOverAvailable = cleanAmount > totalAvailable;
  const extraFromUnassigned = Math.max(0, cleanAmount - jarBalance);
  const emptiesJar = jarBalance > 0 && cleanAmount >= jarBalance;
  const recipientLabel = donationRecipient?.trim() || projectTitle;

  async function handleLog() {
    const num = cleanAmount;
    if (!num || num < 1 || amountOverAvailable) return;
    setLoading(true);
    try {
      const ok = await donate(num, projectId, projectTitle, date);
      if (ok) {
        if (emptiesJar) {
          setDone("emptied");
        } else {
          setDone("logged");
          setTimeout(async () => {
            await onLogged?.();
            onClose();
          }, 1400);
        }
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
          <h2 id="donation-log-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {done === "emptied" ? "Jar emptied" : "Donate my skips"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="px-6 py-5">
          {done === "logged" ? (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">✓</p>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Donation logged!</p>
            </div>
          ) : done === "emptied" ? (
            <div className="space-y-4">
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.22)" }}>
                <p className="text-2xl mb-2">✓</p>
                <p className="font-black" style={{ color: "var(--text-primary)" }}>Donation logged.</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  You used everything saved in {projectTitle}.
                </p>
              </div>
              <p className="text-sm font-bold leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Keep this as your active jar for future skips?
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onLogged?.();
                    onClose();
                  }}
                  className="w-full rounded-xl py-3 text-sm font-black"
                  style={{ background: "#2ECC71", color: "#071B14" }}
                >
                  Keep this active
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onLogged?.();
                    onClose();
                  }}
                  className="w-full rounded-xl py-3 text-sm font-black"
                  style={{ background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-secondary)" }}
                >
                  Pick a new jar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(46,204,113,0.07)", border: "1px solid rgba(46,204,113,0.18)" }}>
                <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#A7F3D0" }}>Step 1</p>
                <p className="mt-1 text-sm font-black" style={{ color: "var(--text-primary)" }}>Donate to {recipientLabel}</p>
                {donationURL ? (
                  <a
                    href={donationURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl py-3 text-sm font-black"
                    style={{ background: "#2ECC71", color: "#071B14", textDecoration: "none" }}
                  >
                    Open donation page
                  </a>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Donate through the organization, then log it here.
                  </p>
                )}
                <p className="mt-3 text-[10px] font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  iSkipped does not process, verify, or manage outside donations.
                </p>
              </div>
              <div className="mb-4">
                <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Step 2</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  After donating, log the amount here.
                </p>
              </div>
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
                    {formatCurrency(jarBalance)} saved in this jar.
                  </p>
                  {amountOverAvailable && (
                    <p className="mt-2 text-xs font-bold leading-relaxed" style={{ color: "#EF4444" }}>
                      That is more than your saved skips. Lower the amount to {formatCurrency(totalAvailable)} or less.
                    </p>
                  )}
                  {!amountOverAvailable && extraFromUnassigned > 0 && cleanAmount > 0 && (
                    <p className="mt-2 text-xs font-bold leading-relaxed" style={{ color: "#F59E0B" }}>
                      You are donating more than this jar holds. {formatCurrency(extraFromUnassigned)} will come from your saved Skip Bucks.
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
                {loading ? "Logging..." : "Log donation"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
