"use client";
import { useState } from "react";
import { useSkips } from "@/hooks/useSkips";
import { useModalA11y } from "@/hooks/useModalA11y";
import { today } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/currency";
import { useAuthStore } from "@/store/authStore";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { formatAggregateImpactUnitsDecimal } from "@/lib/utils/impact";
import { ShareButton } from "@/components/share/ShareButton";
import { getPersonalFundraiserGoalProgress, isValidRaisedFundraiserGoal } from "@/lib/utils/fundraiserGoals";
import { getDonationShareText } from "@/lib/utils/challengeShareCopy";

interface Props {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  mode?: "donate" | "log";
  initialAmount?: number;
  donationURL?: string;
  donationRecipient?: string;
  unassignedSkipBucks?: number;
  onLogged?: () => void | Promise<void>;
  personalGoal?: number;
  donatedTowardGoal?: number;
  impactUnitCost?: number;
  impactUnitName?: string;
  impactUnitDisplay?: string;
  impactUnitIsGoal?: boolean;
  shareUrl?: string;
  onRaiseGoal?: (amount: number) => void | Promise<void>;
  onChooseNewJar?: () => void | Promise<void>;
  /** Short description of the real-world outcome the donation supports. */
  shareCause?: string;
}

function formatGoalCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function DonationLogModal({ projectId, projectTitle, onClose, mode = "donate", initialAmount, donationURL, donationRecipient, unassignedSkipBucks: unassignedSkipBucksProp, onLogged, personalGoal, donatedTowardGoal = 0, impactUnitCost, impactUnitName, impactUnitDisplay, impactUnitIsGoal, shareUrl, onRaiseGoal, onChooseNewJar, shareCause }: Props) {
  const { donate } = useSkips();
  const { profile } = useAuthStore();
  const [amount, setAmount] = useState(initialAmount && initialAmount > 0 ? String(initialAmount) : "");
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"logged" | "emptied" | null>(null);
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [newGoalAmount, setNewGoalAmount] = useState("");
  const [savingNewGoal, setSavingNewGoal] = useState(false);
  const [donatedTowardGoalBeforeLog] = useState(donatedTowardGoal);
  const dialogRef = useModalA11y(onClose);
  const parsedAmount = parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const jarBalance = Math.min(
    Math.max(0, profile?.causeJarBalances?.[projectId] ?? 0),
    getSkipBalanceSummary(profile).availableFromSkips,
  );
  const unassignedSkipBucks = unassignedSkipBucksProp ?? getSkipBalanceSummary(profile).unassignedSkipBank;
  const totalAvailable = jarBalance + unassignedSkipBucks;
  const jarUsed = Math.min(cleanAmount, jarBalance);
  const skipBucksUsed = Math.min(Math.max(0, cleanAmount - jarUsed), unassignedSkipBucks);
  const outsideContribution = Math.max(0, cleanAmount - jarUsed - skipBucksUsed);
  const emptiesJar = jarBalance > 0 && cleanAmount >= jarBalance;
  const recipientLabel = donationRecipient?.trim() || projectTitle;
  const { remainingGoal } = getPersonalFundraiserGoalProgress(
    personalGoal,
    donatedTowardGoalBeforeLog + cleanAmount,
    0,
  );
  const donatedAfterLog = donatedTowardGoalBeforeLog + cleanAmount;
  const parsedNewGoal = parseFloat(newGoalAmount);
  const validRaisedGoal = isValidRaisedFundraiserGoal(parsedNewGoal, personalGoal, donatedAfterLog);
  const raisedGoalRemaining = validRaisedGoal ? Math.max(0, parsedNewGoal - donatedAfterLog) : null;
  const impactText = impactUnitCost && impactUnitCost > 0 && impactUnitName && cleanAmount > 0
    ? formatAggregateImpactUnitsDecimal(cleanAmount, impactUnitCost, impactUnitName, impactUnitDisplay, impactUnitIsGoal)
    : null;
  const shareText = getDonationShareText(cleanAmount, shareCause || projectTitle);

  async function handleLog() {
    const num = cleanAmount;
    if (!num || num < 1) return;
    setLoading(true);
    try {
      const ok = await donate(num, projectId, projectTitle, date);
      if (ok) {
        setDone(emptiesJar ? "emptied" : "logged");
        await onLogged?.();
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
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl shadow-2xl w-full max-w-sm"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <div>
            <h2 id="donation-log-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {done ? (remainingGoal === 0 ? "Goal reached" : "Your donation impact") : mode === "log" ? "Log donation" : "Donate my skips"}
            </h2>
            {done === null && (
              <p className="mt-1 text-xs font-black" style={{ color: "var(--green-primary)" }}>
                In this jar: {formatCurrency(jarBalance)}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="px-6 py-5">
          {done ? (
            <div className="space-y-4">
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.22)" }}>
                <p className="text-3xl mb-2">{remainingGoal === 0 ? "🎉" : "✓"}</p>
                <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
                  You donated {formatCurrency(cleanAmount)}
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>to {recipientLabel}</p>
                {impactText && (
                  <p className="mt-3 text-sm font-black leading-relaxed" style={{ color: "#A7F3D0" }}>
                    That&apos;s about {impactText} of impact.
                  </p>
                )}
              </div>
              {remainingGoal !== null && (
                <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
                    {remainingGoal > 0
                      ? `${formatGoalCurrency(remainingGoal)} left of your ${formatGoalCurrency(personalGoal!)} Donation Goal`
                      : `You reached your ${formatGoalCurrency(personalGoal!)} Donation Goal`}
                  </p>
                  {remainingGoal > 0 && emptiesJar && (
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Your jar is empty and ready for your next skips.
                    </p>
                  )}
                </div>
              )}
              {shareUrl && <ShareButton url={shareUrl} text={shareText} title={`My iSkipped impact for ${projectTitle}`} label="Share my impact" />}

              {remainingGoal === 0 && personalGoal ? (
                showNewGoal ? (
                  <div className="space-y-3 rounded-xl p-4" style={{ background: "rgba(46,204,113,0.07)", border: "1px solid rgba(46,204,113,0.18)" }}>
                    <div>
                      <label className="text-xs font-black uppercase tracking-wide" style={{ color: "#A7F3D0" }}>Raise your goal</label>
                      <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {formatGoalCurrency(donatedAfterLog)} donated so far
                      </p>
                      <p className="mt-3 text-xs font-bold" style={{ color: "var(--text-muted)" }}>New total donation goal</p>
                      <div className="relative mt-2">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>$</span>
                        <input
                          type="number"
                          min={Math.floor(donatedAfterLog * 100 + 1) / 100}
                          step="0.01"
                          value={newGoalAmount}
                          onChange={(event) => setNewGoalAmount(event.target.value)}
                          placeholder={String(Math.ceil((Math.max(personalGoal, donatedAfterLog) + 1) / 50) * 50)}
                          className="w-full rounded-xl py-3 pl-8 pr-4 text-sm focus:outline-none"
                          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                          autoFocus
                        />
                      </div>
                      {newGoalAmount && !validRaisedGoal && (
                        <p className="mt-2 text-xs font-bold" style={{ color: "#FCA5A5" }}>
                          Enter a total greater than {formatGoalCurrency(Math.max(personalGoal, donatedAfterLog))}.
                        </p>
                      )}
                      {raisedGoalRemaining !== null && (
                        <p className="mt-2 text-xs font-bold" style={{ color: "#A7F3D0" }}>
                          You&apos;ll have {formatGoalCurrency(raisedGoalRemaining)} to go.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={savingNewGoal || !validRaisedGoal}
                      onClick={async () => {
                        const nextGoal = parseFloat(newGoalAmount);
                        if (!isValidRaisedFundraiserGoal(nextGoal, personalGoal, donatedAfterLog) || !onRaiseGoal) return;
                        setSavingNewGoal(true);
                        await onRaiseGoal(nextGoal);
                        setSavingNewGoal(false);
                        onClose();
                      }}
                      className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                      style={{ background: "#2ECC71", color: "#071B14" }}
                    >
                      {savingNewGoal ? "Raising goal..." : "Raise goal and keep skipping"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button type="button" onClick={() => setShowNewGoal(true)} className="w-full rounded-xl py-3 text-sm font-black" style={{ background: "#2ECC71", color: "#071B14" }}>
                      Raise your goal
                    </button>
                    <button
                      type="button"
                      onClick={async () => { onClose(); await onChooseNewJar?.(); }}
                      className="w-full rounded-xl py-3 text-sm font-black"
                      style={{ background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-secondary)" }}
                    >
                      Choose a new jar
                    </button>
                  </div>
                )
              ) : (
                <button type="button" onClick={onClose} className="w-full rounded-xl py-3 text-sm font-black" style={{ background: "#2ECC71", color: "#071B14" }}>
                  Done
                </button>
              )}
            </div>
          ) : (
            <>
              {mode === "donate" && (
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
              )}
              <div className="mb-4">
                <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{mode === "log" ? "Donation details" : "Step 2"}</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {mode === "log" ? `How much did you donate to ${recipientLabel}?` : "After donating, log the amount here."}
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
                  {cleanAmount > 0 && (
                    <div className="mt-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed" style={{ background: "rgba(46,204,113,0.07)", border: "1px solid rgba(46,204,113,0.18)", color: "var(--text-secondary)" }}>
                      <p><strong style={{ color: "var(--text-primary)" }}>{formatCurrency(jarUsed)}</strong> will come from this jar.</p>
                      {skipBucksUsed > 0 && (
                        <p><strong style={{ color: "var(--text-primary)" }}>{formatCurrency(skipBucksUsed)}</strong> will come from Skip Bucks.</p>
                      )}
                      {outsideContribution > 0 && (
                        <p className="mt-1 font-bold" style={{ color: "#F59E0B" }}>
                          Note: the remaining {formatCurrency(outsideContribution)} is an outside contribution and will not be covered by your skips.
                        </p>
                      )}
                    </div>
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
                disabled={loading || !amount || cleanAmount < 1}
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
