"use client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime, getChallengeCountdown, getConsecutiveWeeklyStreak, isSameWeek, parkedJarCount } from "@/lib/utils/dates";
import { SkipSetupPrompt } from "@/components/setup/SkipSetupPrompt";
import { normalizeJarSplit, normalizeSpendingGoals, recordPurchase } from "@/lib/services/firebase/users";
import { levelForXp } from "@/lib/utils/xp";
import { isChallengeProject, subscribeToProject } from "@/lib/services/firebase/projects";
import { subscribeToChallengeFeed, subscribeToCommunityFeed, subscribeToGlobalStats } from "@/lib/services/firebase/social";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { FeedItem, GlobalStats, Project, Skip, SpendingGoal } from "@/lib/types/models";
import { appendRefParam, getChallengeSharePath } from "@/lib/utils/share";
import { getDirectChallengeShareText } from "@/lib/utils/challengeShareCopy";
import { ShareButton } from "@/components/share/ShareButton";
import { formatAggregateImpactUnitsDecimal, oneUnitPhrase } from "@/lib/utils/impact";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { useModalA11y } from "@/hooks/useModalA11y";

// ─── SVG Jar ───────────────────────────────────────────────────────────────
interface JarProps {
  fillPercent: number;
  color: string;
  gradEnd: string;
  label: string;
  amount: string;
  emoji: string;
  causeLabel?: string;
  goalAmount?: number;
  emptyLabel?: string;
  href?: string;
  onClick?: () => void;
  actionLabel?: string;
  actionOnClick?: () => void;
  actionColor?: string;
  unitDisplay?: string;  // e.g. "days", "meals" — shown in jar instead of %
  unitCount?: number;    // pre-computed count of units funded
  centerValueOverride?: string;
  centerLabelOverride?: string; // overrides the default "to goal" / "saved" center label
}

interface DonationReminderPrompt {
  kind: "challenge-ended" | "group-goal" | "personal-goal" | "thirty-day";
  eyebrow: string;
  title: string;
  body: string;
  impactLine: string | null;
  readyAmount: number;
  donatedAmount: number;
  donationURL?: string | null;
}

function DonationReminderModal({
  prompt,
  onClose,
  onDonate,
  onAlreadyDonated,
}: {
  prompt: DonationReminderPrompt;
  onClose: () => void;
  onDonate: () => void;
  onAlreadyDonated: () => void;
}) {
  const dialogRef = useModalA11y(onClose);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="donation-reminder-title"
        tabIndex={-1}
        className="iskip-pop-in rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close donation reminder"
          className="absolute top-3 right-4 text-xl leading-none"
          style={{ color: "var(--text-muted)" }}
        >
          x
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: "var(--green-primary)" }}>
          {prompt.eyebrow}
        </p>
        <p id="donation-reminder-title" className="text-2xl font-black leading-tight pr-5" style={{ color: "var(--text-primary)" }}>
          {prompt.title}
        </p>
        <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
          {prompt.body}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{formatCurrency(prompt.readyAmount)}</p>
            <p className="text-[10px] font-black uppercase tracking-wide mt-1" style={{ color: "var(--text-muted)" }}>ready to donate</p>
            {prompt.impactLine && (
              <p className="text-[11px] font-black mt-1 leading-tight" style={{ color: "var(--green-primary)" }}>≈ {prompt.impactLine}</p>
            )}
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{formatCurrency(prompt.donatedAmount)}</p>
            <p className="text-[10px] font-black uppercase tracking-wide mt-1" style={{ color: "var(--text-muted)" }}>donated so far</p>
          </div>
        </div>
        <button
          onClick={onDonate}
          className="mt-5 w-full py-3 rounded-xl text-sm font-black"
          style={{ background: "var(--green-primary)", color: "#0B1A14" }}
        >
          Donate now
        </button>
        <div className="mt-2 flex items-center justify-center gap-5 flex-wrap">
          <button
            onClick={onAlreadyDonated}
            className="py-2 text-xs font-bold"
            style={{ color: "var(--green-primary)" }}
          >
            I already donated
          </button>
          <button
            onClick={onClose}
            className="py-2 text-xs font-bold"
            style={{ color: "var(--text-muted)" }}
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}

function DonationReminderController({
  prompt,
  userId,
  projectId,
  blocked,
  onDonate,
  onAlreadyDonated,
}: {
  prompt: DonationReminderPrompt | null;
  userId?: string;
  projectId?: string | null;
  blocked: boolean;
  onDonate: () => void;
  onAlreadyDonated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dismissedPromptKey, setDismissedPromptKey] = useState<string | null>(null);
  const dismissKey = prompt && userId
    ? `iskipped_donation_prompt_dismissed_${userId}_${projectId ?? "none"}_${prompt.kind}`
    : null;
  const dismissedAt = dismissKey && typeof window !== "undefined"
    ? localStorage.getItem(dismissKey)
    : null;
  const dismissedDaysAgo = dismissedAt
    ? Math.floor((Date.now() - parseInt(dismissedAt)) / 86400_000)
    : Infinity;
  const isDismissed = !!dismissKey && (dismissedPromptKey === dismissKey || dismissedDaysAgo < 30);

  useEffect(() => {
    if (!prompt || !dismissKey || blocked || isDismissed) {
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(() => setOpen(true), 750);
    return () => window.clearTimeout(timer);
  }, [blocked, dismissKey, isDismissed, prompt?.kind]);

  function dismiss() {
    if (dismissKey && typeof window !== "undefined") {
      localStorage.setItem(dismissKey, Date.now().toString());
      setDismissedPromptKey(dismissKey);
    }
    setOpen(false);
  }

  if (!prompt || !open) return null;

  return (
    <DonationReminderModal
      prompt={prompt}
      onClose={dismiss}
      onDonate={() => {
        dismiss();
        onDonate();
      }}
      onAlreadyDonated={() => {
        dismiss();
        onAlreadyDonated();
      }}
    />
  );
}

function Jar({ fillPercent, color, gradEnd, label, amount, emoji, causeLabel, goalAmount, emptyLabel, href, onClick, actionLabel, actionOnClick, actionColor, unitDisplay, unitCount, centerValueOverride, centerLabelOverride }: JarProps) {
  const clamp = Math.min(Math.max(fillPercent, 0), 100);
  const w = 160;
  const h = 240;
  const scale = w / 120;
  const fillH = (clamp / 100) * 120 * scale;
  const jarH = 170 * scale;
  const yStart = jarH - fillH;
  const uid = `${label}-${color}-${Math.round(clamp)}`.replace(/\W/g, "");
  const hasAmount = amount !== "$0.00";
  const showCenter = !!causeLabel || hasAmount;
  const centerValue = centerValueOverride ?? (causeLabel ? `${Math.round(clamp)}%` : amount);
  const centerLabel = centerLabelOverride ?? (causeLabel
    ? goalAmount && goalAmount > 0 ? "to goal" : "saved"
    : "ready");
  const centerLabelLines = centerLabel.split("\n");
  const centerMultiLine = centerLabelLines.length > 1;
  const hasGoalDisplay = !!(causeLabel && goalAmount && goalAmount > 0);
  const centerValueFontSize = centerValue.length > 7 ? 11 : centerValue.length > 5 ? 13 : 17;
  const cvY = centerMultiLine ? (hasGoalDisplay ? 76 : 84) : (hasGoalDisplay ? 84 : 92);
  const labelY0 = centerMultiLine ? (hasGoalDisplay ? 93 : 100) : (hasGoalDisplay ? 102 : 112);
  const labelY1 = labelY0 + 10;
  const goalY = centerMultiLine ? 116 : 114;

  // Jar outline path (scaled)
  const jarPath = [
    `M${20*scale},${40*scale}`,
    `Q${20*scale},${40*scale} ${25*scale},${35*scale}`,
    `L${35*scale},${30*scale}`,
    `Q${40*scale},${28*scale} ${42*scale},${25*scale}`,
    `L${42*scale},${15*scale}`,
    `Q${42*scale},${10*scale} ${48*scale},${10*scale}`,
    `L${72*scale},${10*scale}`,
    `Q${78*scale},${10*scale} ${78*scale},${15*scale}`,
    `L${78*scale},${25*scale}`,
    `Q${80*scale},${28*scale} ${85*scale},${30*scale}`,
    `L${95*scale},${35*scale}`,
    `Q${100*scale},${40*scale} ${100*scale},${45*scale}`,
    `L${100*scale},${155*scale}`,
    `Q${100*scale},${170*scale} ${85*scale},${170*scale}`,
    `L${35*scale},${170*scale}`,
    `Q${20*scale},${170*scale} ${20*scale},${155*scale}`,
    `Z`,
  ].join(" ");

  const inner = (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}
      onClick={onClick}
    >
      <div style={{ textAlign: "center", maxWidth: w, padding: "0 4px", height: 76, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 13, fontWeight: causeLabel ? 700 : 600, fontStyle: causeLabel ? "normal" : "italic", color: color, lineHeight: 1.35, letterSpacing: 0.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textAlign: "center" }}>
          {causeLabel ?? emptyLabel ?? "👆 Tap to pick a jar"}
        </div>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={`gf-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={gradEnd} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
          </linearGradient>
          <linearGradient id={`shine-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id={`soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy={3*scale} stdDeviation={4*scale} floodColor={color} floodOpacity="0.25" />
          </filter>
          <clipPath id={`jc-${uid}`}>
            <path d={jarPath} />
          </clipPath>
        </defs>

        <ellipse cx={60*scale} cy={169*scale} rx={38*scale} ry={7*scale} fill="rgba(0,0,0,0.22)" />
        <path d={jarPath} fill={`url(#glass-${uid})`} />

        {/* Fill (clipped to jar shape) */}
        <g clipPath={`url(#jc-${uid})`}>
          <rect
            x={15*scale} y={yStart}
            width={90*scale} height={fillH + 15*scale}
            fill={`url(#gf-${uid})`}
            rx={4*scale}
            filter={`url(#soft-${uid})`}
          >
            <animate
              attributeName="y"
              from={jarH} to={yStart}
              dur="1.4s" fill="freeze"
              calcMode="spline" keySplines="0.25 0.1 0.25 1"
            />
          </rect>

          {/* Bubbles */}
          {clamp > 10 && (
            <>
              <circle cx={40*scale} cy={yStart + fillH*0.3} r={3*scale} fill="rgba(255,255,255,0.25)">
                <animate attributeName="cy"
                  values={`${yStart+fillH*0.7};${yStart+fillH*0.1}`}
                  dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx={72*scale} cy={yStart + fillH*0.5} r={2*scale} fill="rgba(255,255,255,0.2)">
                <animate attributeName="cy"
                  values={`${yStart+fillH*0.8};${yStart+fillH*0.2}`}
                  dur="4s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* Wave at fill surface */}
          {clamp > 5 && (
            <path
              d={`M${15*scale},${yStart} Q${35*scale},${yStart-4*scale} ${60*scale},${yStart} T${105*scale},${yStart}`}
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={2*scale}
              strokeLinecap="round"
            >
              <animate
                attributeName="d"
                values={[
                  `M${15*scale},${yStart} Q${35*scale},${yStart-4*scale} ${60*scale},${yStart} T${105*scale},${yStart}`,
                  `M${15*scale},${yStart} Q${35*scale},${yStart+4*scale} ${60*scale},${yStart} T${105*scale},${yStart}`,
                  `M${15*scale},${yStart} Q${35*scale},${yStart-4*scale} ${60*scale},${yStart} T${105*scale},${yStart}`,
                ].join(";")}
                dur="3s" repeatCount="indefinite"
              />
            </path>
          )}
        </g>

        {/* Jar outline */}
        <path
          d={`M${45*scale},${16*scale} L${45*scale},${28*scale} M${75*scale},${16*scale} L${75*scale},${28*scale}`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1.5*scale}
          strokeLinecap="round"
        />
        <path
          d={jarPath}
          fill="none"
          stroke="rgba(255,255,255,0.38)"
          strokeWidth={2.4*scale}
          strokeLinejoin="round"
        />
        <path
          d={`M${36*scale},${46*scale} Q${28*scale},${82*scale} ${35*scale},${139*scale}`}
          fill="none"
          stroke={`url(#shine-${uid})`}
          strokeWidth={4*scale}
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Center display */}
        {showCenter && (
          <>
            <text
              x={60*scale} y={cvY*scale}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={centerValueFontSize*scale}
              fontWeight="800"
              fill="rgba(255,255,255,0.9)"
              style={{ fontFamily: "inherit" }}
            >
              {centerValue}
            </text>
            <text
              x={60*scale} y={labelY0*scale}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7*scale}
              fontWeight="600"
              fill="rgba(255,255,255,0.55)"
              style={{ fontFamily: "inherit" }}
            >
              {centerLabelLines[0]}
            </text>
            {centerMultiLine && (
              <text
                x={60*scale} y={labelY1*scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={7*scale}
                fontWeight="600"
                fill="rgba(255,255,255,0.55)"
                style={{ fontFamily: "inherit" }}
              >
                {centerLabelLines[1]}
              </text>
            )}
            {hasGoalDisplay && (
              <text
                x={60*scale} y={goalY*scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={7*scale}
                fontWeight="700"
                fill="rgba(255,255,255,0.75)"
                style={{ fontFamily: "inherit" }}
              >
                ${Math.round(goalAmount!).toLocaleString()}
              </text>
            )}
          </>
        )}
      </svg>

      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 12, fontWeight: 600,
          color: "var(--text-secondary)",
          letterSpacing: 1.5, textTransform: "uppercase",
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 800,
          color: "var(--text-primary)",
          marginTop: 2,
        }}>
          {amount}
        </div>
        {actionLabel && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              actionOnClick?.();
            }}
            style={{
              marginTop: 8,
              border: `1px solid ${actionColor ?? color}`,
              background: "rgba(237,245,240,0.04)",
              color: actionColor ?? color,
              borderRadius: 999,
              padding: "7px 12px",
              fontSize: 11,
              fontWeight: 900,
              lineHeight: 1,
              whiteSpace: "nowrap",
              boxShadow: `0 8px 18px ${(actionColor ?? color)}22`,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );

  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}


// ─── Home Page ──────────────────────────────────────────────────────────────
function getCommunityGoal(project: Project): number {
  return project.goalAmount > 0 ? project.goalAmount : 0;
}

function getCommunityRaised(project: Project, savedForProject: number): number {
  return Math.max(0, savedForProject || project.totalRaised || 0);
}

function formatCommunityUnitCount(amount: number, unitCost: number, unitIsGoal?: boolean): string {
  if (!Number.isFinite(amount) || !Number.isFinite(unitCost) || unitCost <= 0) return "0";
  const count = amount / unitCost;
  if (unitIsGoal && count > 0 && count < 1) return `${Math.max(1, Math.round(count * 100))}%`;
  if (unitIsGoal || count < 2) return parseFloat(count.toFixed(1)).toString();
  if (count < 10) return parseFloat(count.toFixed(1)).toString();
  return Math.floor(count).toLocaleString();
}

function formatCurrencyRounded(amount: number): string {
  if (amount > 0 && amount < 1) return `${Math.round(amount * 100)}¢`;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function formatFeedMessage(message: string): string {
  return message
    .replace(/help fund/gi, "help pledge")
    .replace(/funding/gi, "pledging")
    .replace(/funded/gi, "pledged");
}

function formatFeedName(name: string): string {
  return name.trim().toLowerCase() === "anonymous" ? "A friend" : name;
}

function getFeedSkipLabel(item: Pick<FeedItem, "message" | "skipLabel"> & { skipLabel?: string }): string {
  if (item.skipLabel) return item.skipLabel;
  return formatFeedMessage(item.message)
    .replace(/^skipped\s+/i, "")
    .replace(/\s+to help pledge.*$/i, "")
    .trim();
}

function getFeedActionLine(item: Pick<FeedItem, "displayName" | "message" | "skipLabel"> & { skipLabel?: string }): string {
  return `${formatFeedName(item.displayName)} skipped ${getFeedSkipLabel(item)}`;
}

function FundraiserContributionModal({
  project,
  availableFromSkips,
  unitCost,
  unitLabel,
  mode = "contribute",
  onClose,
  onComplete,
}: {
  project: Project;
  availableFromSkips: number;
  unitCost: number | null;
  unitLabel: string;
  mode?: "contribute" | "log";
  onClose: () => void;
  onComplete: (amount: number) => Promise<boolean>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [amount, setAmount] = useState(() => Math.min(25, Math.max(0, availableFromSkips)).toString());
  const [step, setStep] = useState<"amount" | "ready" | "confirm">("amount");
  const [saving, setSaving] = useState(false);
  const parsedAmount = Number.parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const canContinue = cleanAmount > 0 && cleanAmount <= availableFromSkips;
  const quickAmounts = [5, 10, 25, 50].filter((value) => value <= availableFromSkips);
  const impactText = unitCost && unitCost > 0 && cleanAmount > 0
    ? formatAggregateImpactUnitsDecimal(
        cleanAmount,
        unitCost,
        project.unitName ?? unitLabel,
        unitLabel,
        project.unitIsGoal
      )
    : null;

  function handleAmountSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canContinue) return;
    setStep(mode === "log" ? "confirm" : "ready");
  }

  async function handleExternalStep() {
    if (!canContinue) return;
    if (project.donationURL) {
      window.open(project.donationURL, "_blank", "noopener,noreferrer");
    }
    setStep("confirm");
  }

  async function handleCompleted() {
    if (!canContinue) return;
    setSaving(true);
    const ok = await onComplete(cleanAmount);
    setSaving(false);
    if (!ok) return;
    toast.success("Donation logged from your Skip Bank.");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fundraiser-contribution-title"
        tabIndex={-1}
        className="iskip-pop-in rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close contribution modal"
          className="absolute top-3 right-4 text-xl leading-none"
          style={{ color: "var(--text-muted)" }}
        >
          x
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: "var(--green-primary)" }}>
          {mode === "log" ? "Log donation" : "Contribute skips"}
        </p>
        <p id="fundraiser-contribution-title" className="text-2xl font-black leading-tight pr-5" style={{ color: "var(--text-primary)" }}>
          {step === "confirm"
            ? "Did you make the donation?"
            : step === "ready"
              ? "Nice. Your skips can cover this."
              : mode === "log"
                ? `Log a donation to ${project.title}`
                : `Help ${project.title}`}
        </p>
        <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
          {step === "confirm"
            ? "When you come back, confirm the outside donation so your Skip Bank and fundraiser impact stay accurate."
            : step === "ready"
              ? `${formatCurrencyRounded(cleanAmount)} is ready from your Skip Bank${impactText ? `, about ${impactText}` : ""}.`
              : mode === "log"
                ? "How much did you donate outside iSkipped?"
                : "How much do you want to contribute from your Skip Bank?"}
        </p>

        <form className="mt-5 rounded-xl p-4" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }} onSubmit={handleAmountSubmit}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>From Skip Bank</p>
            <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{formatCurrencyRounded(availableFromSkips)} available</p>
          </div>
          <label className="sr-only" htmlFor="fundraiser-contribution-amount">Contribution amount</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--green-primary)", fontSize: 26, fontWeight: 900 }}>$</span>
            <input
              id="fundraiser-contribution-amount"
              type="number"
              min="1"
              max={availableFromSkips}
              step="0.01"
              value={amount}
              disabled={step === "ready"}
              onChange={(event) => setAmount(event.target.value)}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: "2px solid var(--green-primary)", color: "var(--text-primary)", fontSize: 28, fontWeight: 900, outline: "none" }}
            />
          </div>
          {quickAmounts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {quickAmounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={step === "ready"}
                  onClick={() => setAmount(value.toString())}
                  style={{ border: "1px solid rgba(46,204,113,0.28)", background: cleanAmount === value ? "var(--green-primary)" : "rgba(46,204,113,0.08)", color: cleanAmount === value ? "#0B1A14" : "var(--green-primary)", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 900 }}
                >
                  {formatCurrencyRounded(value)}
                </button>
              ))}
            </div>
          )}
          {impactText && (
            <p className="text-xs font-bold mt-3" style={{ color: "var(--green-primary)" }}>
              About {impactText}
            </p>
          )}
          {cleanAmount > availableFromSkips && (
            <p className="text-xs font-bold mt-3" style={{ color: "#EF4444" }}>
              That is more than you have available in your Skip Bank.
            </p>
          )}
          {step === "amount" && (
            <button type="submit" className="sr-only">Continue</button>
          )}
        </form>

        {step === "amount" ? (
          <button
            type="button"
            onClick={() => handleAmountSubmit()}
            disabled={!canContinue}
            className="mt-5 w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
            style={{ background: "var(--green-primary)", color: "#0B1A14" }}
          >
            {mode === "log" ? "Confirm donation amount" : "Enter amount"}
          </button>
        ) : step === "ready" ? (
          <>
            <div className="mt-5 rounded-xl p-3" style={{ background: "rgba(237,245,240,0.04)", border: "1px solid rgba(237,245,240,0.08)" }}>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                iSkipped does not process payments, verify donation use, or control how outside organizations use funds.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExternalStep}
              disabled={!canContinue}
              className="mt-3 w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "var(--green-primary)", color: "#0B1A14" }}
            >
              {project.donationURL ? "Take me to the donation page" : "I will donate outside iSkipped"}
            </button>
          </>
        ) : (
          <div className="mt-5 grid gap-2">
            {project.donationURL && (
              <button
                type="button"
                onClick={() => window.open(project.donationURL!, "_blank", "noopener,noreferrer")}
                className="w-full py-3 rounded-xl text-sm font-black"
                style={{ background: "rgba(237,245,240,0.06)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-primary)" }}
              >
                Open donation link again
              </button>
            )}
            <button
              type="button"
              onClick={handleCompleted}
              disabled={!canContinue || saving}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "var(--green-primary)", color: "#0B1A14" }}
            >
              {saving ? "Logging..." : `I donated ${formatCurrencyRounded(cleanAmount)}`}
            </button>
          </div>
        )}
        {step === "confirm" && (
          <p className="text-[11px] leading-relaxed mt-3" style={{ color: "var(--text-muted)" }}>
            Only mark it donated after you finish with the fundraiser or organization.
          </p>
        )}
      </div>
    </div>
  );
}

function GoalSpendModal({
  goal,
  availableFromSkips,
  onClose,
  onComplete,
}: {
  goal: SpendingGoal;
  availableFromSkips: number;
  onClose: () => void;
  onComplete: (amount: number) => Promise<boolean>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [amount, setAmount] = useState(() => Math.min(goal.targetAmount, Math.max(0, availableFromSkips)).toString());
  const [step, setStep] = useState<"amount" | "ready" | "confirm">("amount");
  const [saving, setSaving] = useState(false);
  const parsedAmount = Number.parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const canContinue = cleanAmount > 0 && cleanAmount <= availableFromSkips;
  const quickAmounts = [25, 50, 100, goal.targetAmount]
    .filter((value, index, all) => value > 0 && value <= availableFromSkips && all.indexOf(value) === index);

  function handleAmountSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canContinue) return;
    setStep("ready");
  }

  function handlePurchaseStep() {
    if (!canContinue) return;
    if (goal.shoppingLink) {
      window.open(goal.shoppingLink, "_blank", "noopener,noreferrer");
    }
    setStep("confirm");
  }

  async function handleCompleted() {
    if (!canContinue) return;
    setSaving(true);
    const ok = await onComplete(cleanAmount);
    setSaving(false);
    if (!ok) return;
    toast.success("Goal spend logged from your Skip Bank.");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-spend-title"
        tabIndex={-1}
        className="iskip-pop-in rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close spend modal"
          className="absolute top-3 right-4 text-xl leading-none"
          style={{ color: "var(--text-muted)" }}
        >
          x
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: "#A78BFA" }}>
          Spend skips
        </p>
        <p id="goal-spend-title" className="text-2xl font-black leading-tight pr-5" style={{ color: "var(--text-primary)" }}>
          {step === "confirm"
            ? "Did you buy it?"
            : step === "ready"
              ? "Great. Your skips can do this."
              : `Use skips for ${goal.label}`}
        </p>
        <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
          {step === "confirm"
            ? "When you come back, confirm the purchase so your Skip Bank and goal progress stay accurate."
            : step === "ready"
              ? `${formatCurrencyRounded(cleanAmount)} is ready from your Skip Bank for ${goal.label}.`
              : "How much do you want to spend from your Skip Bank?"}
        </p>

        <form className="mt-5 rounded-xl p-4" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }} onSubmit={handleAmountSubmit}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>From Skip Bank</p>
            <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{formatCurrencyRounded(availableFromSkips)} available</p>
          </div>
          <label className="sr-only" htmlFor="goal-spend-amount">Spend amount</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#A78BFA", fontSize: 26, fontWeight: 900 }}>$</span>
            <input
              id="goal-spend-amount"
              type="number"
              min="1"
              max={availableFromSkips}
              step="0.01"
              value={amount}
              disabled={step !== "amount"}
              onChange={(event) => setAmount(event.target.value)}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: "2px solid #A78BFA", color: "var(--text-primary)", fontSize: 28, fontWeight: 900, outline: "none" }}
            />
          </div>
          {quickAmounts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {quickAmounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={step !== "amount"}
                  onClick={() => setAmount(value.toString())}
                  style={{ border: "1px solid rgba(167,139,250,0.32)", background: cleanAmount === value ? "#A78BFA" : "rgba(139,92,246,0.1)", color: cleanAmount === value ? "#0B1A14" : "#A78BFA", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 900 }}
                >
                  {formatCurrencyRounded(value)}
                </button>
              ))}
            </div>
          )}
          {cleanAmount > availableFromSkips && (
            <p className="text-xs font-bold mt-3" style={{ color: "#EF4444" }}>
              That is more than you have available in your Skip Bank.
            </p>
          )}
          {step === "amount" && (
            <button type="submit" className="sr-only">Continue</button>
          )}
        </form>

        {step === "amount" ? (
          <button
            type="button"
            onClick={() => handleAmountSubmit()}
            disabled={!canContinue}
            className="mt-5 w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
            style={{ background: "#A78BFA", color: "#0B1A14" }}
          >
            Enter amount
          </button>
        ) : step === "ready" ? (
          <>
            <div className="mt-5 rounded-xl p-3" style={{ background: "rgba(237,245,240,0.04)", border: "1px solid rgba(237,245,240,0.08)" }}>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                iSkipped does not sell, ship, guarantee, or support outside products.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePurchaseStep}
              disabled={!canContinue}
              className="mt-3 w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "#A78BFA", color: "#0B1A14" }}
            >
              {goal.shoppingLink ? "Take me to the purchase page" : "I purchased it"}
            </button>
          </>
        ) : (
          <div className="mt-5 grid gap-2">
            {goal.shoppingLink && (
              <button
                type="button"
                onClick={() => window.open(goal.shoppingLink!, "_blank", "noopener,noreferrer")}
                className="w-full py-3 rounded-xl text-sm font-black"
                style={{ background: "rgba(237,245,240,0.06)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-primary)" }}
              >
                Open purchase page again
              </button>
            )}
            <button
              type="button"
              onClick={handleCompleted}
              disabled={!canContinue || saving}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "#A78BFA", color: "#0B1A14" }}
            >
              {saving ? "Logging..." : `I spent ${formatCurrencyRounded(cleanAmount)}`}
            </button>
          </div>
        )}
        {step === "confirm" && (
          <p className="text-[11px] leading-relaxed mt-3" style={{ color: "var(--text-muted)" }}>
            Only mark it spent after you complete the purchase.
          </p>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, updateProfile } = useAuthStore();
  const { recentSkips, donate } = useSkips();
  const { projects } = useProjects();
  const { showSkipPicker, setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);
  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);
  const [activeChallengeFeed, setActiveChallengeFeed] = useState<FeedItem[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [liveFeedIndex, setLiveFeedIndex] = useState(0);
  const [liveChallengeTotalRaised, setLiveChallengeTotalRaised] = useState<number>(0);
  const [liveChallengeTotalSkips, setLiveChallengeTotalSkips] = useState<number>(0);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionMode, setContributionMode] = useState<"contribute" | "log">("contribute");
  const [showSpendModal, setShowSpendModal] = useState(false);
  const handledContributionQuery = useRef<string | null>(null);

  useEffect(() => {
    const requestedMode = searchParams.get("contribute");
    const activeProject = projects.find((project) => project.id === profile?.activeProjectId);
    const requestKey = `${requestedMode ?? ""}:${activeProject?.id ?? ""}`;

    if (!requestedMode || !activeProject || handledContributionQuery.current === requestKey) return;

    handledContributionQuery.current = requestKey;
    setContributionMode(requestedMode === "log" ? "log" : "contribute");
    setShowContributionModal(true);
    router.replace("/home");
  }, [profile?.activeProjectId, projects, router, searchParams]);

  useEffect(() => {
    return subscribeToCommunityFeed(setCommunityFeed);
  }, []);

  useEffect(() => {
    const activeProjectId = profile?.activeProjectId;
    if (!activeProjectId) {
      setActiveChallengeFeed([]);
      return;
    }
    const active = projects.find((project) => project.id === activeProjectId);
    if (!active || !isChallengeProject(active)) {
      setActiveChallengeFeed([]);
      return;
    }
    return subscribeToChallengeFeed(activeProjectId, setActiveChallengeFeed);
  }, [profile?.activeProjectId, projects]);

  useEffect(() => {
    const unsubscribe = subscribeToGlobalStats(setGlobalStats);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const active = projects.find((project) => project.id === profile?.activeProjectId) ?? null;
    const challengeItems = active && isChallengeProject(active)
      ? activeChallengeFeed
      : [];
    const feedCount = challengeItems.length > 0
      ? challengeItems.length
      : communityFeed.length > 0
        ? communityFeed.length
        : recentSkips.length;

    if (feedCount <= 1) {
      setLiveFeedIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLiveFeedIndex((index) => (index + 1) % Math.min(feedCount, 5));
    }, 4500);

    return () => window.clearInterval(timer);
  }, [activeChallengeFeed, communityFeed, profile?.activeProjectId, projects, recentSkips.length]);

  useEffect(() => {
    const activeProjectId = profile?.activeProjectId;
    if (!activeProjectId) { setLiveChallengeTotalRaised(0); setLiveChallengeTotalSkips(0); return; }
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj || !(isChallengeProject(proj) || !proj.isCustom)) { setLiveChallengeTotalRaised(0); setLiveChallengeTotalSkips(0); return; }
    setLiveChallengeTotalRaised(proj.totalRaised ?? 0);
    setLiveChallengeTotalSkips(proj.totalSkips ?? 0);
    return subscribeToProject(activeProjectId, (p) => {
      setLiveChallengeTotalRaised(p?.totalRaised ?? 0);
      setLiveChallengeTotalSkips(p?.totalSkips ?? 0);
    });
  }, [profile?.activeProjectId, projects]);

  if (!profile) return null;

  const split = normalizeJarSplit(profile.jarSplit as any);
  // Use per-skip allocated totals if available, fall back to profile-split calculation
  const giveTotal = profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100);
  const liveTotal = profile.totalLiveAllocated ?? profile.totalSaved * (split.live / 100);
  const globalGivingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const globalSpendingBalance = Math.max(0, liveTotal - (profile.totalSpent ?? 0));

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;
  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;
  const skipBalance = getSkipBalanceSummary(profile);

  const givingBalance = globalGivingBalance;
  const spendingBalance = globalSpendingBalance;


  const isActiveChallenge = activeProject ? (isChallengeProject(activeProject) || !activeProject.isCustom) : false;
  // Per-challenge balance: what the user has pledged specifically to their active challenge
  const userChallengeBalance = isActiveChallenge && activeProject
    ? (profile.causeJarBalances?.[activeProject.id] ?? 0)
    : 0;
  const challengeContribution = userChallengeBalance;
  // Group total: use project's totalRaised, floored by the user's own challenge balance
  const displayedGroupTotal = isActiveChallenge
    ? Math.max(liveChallengeTotalRaised, userChallengeBalance)
    : 0;
  const communityGoal = activeProject && isActiveChallenge ? getCommunityGoal(activeProject) : 0;
  const fundraiserDonatedTotal = activeProject ? Math.max(0, activeProject.totalDonated ?? 0) : 0;
  const fundraiserUnitCost = activeProject?.unitCost && activeProject.unitCost > 0 ? activeProject.unitCost : null;
  const temporaryChallengeGoalUnits = activeProject && isActiveChallenge && fundraiserUnitCost && activeProject.goalAmount <= 0 ? 10 : null;
  const fundraiserGoalAmount = activeProject && activeProject.goalAmount > 0
    ? activeProject.goalAmount
    : temporaryChallengeGoalUnits && fundraiserUnitCost
      ? temporaryChallengeGoalUnits * fundraiserUnitCost
      : communityGoal;
  const fundraiserProgressPct = fundraiserGoalAmount > 0
    ? Math.min(100, (fundraiserDonatedTotal / fundraiserGoalAmount) * 100)
    : 0;
  const fundraiserGoalUnits = fundraiserUnitCost && fundraiserGoalAmount > 0
    ? fundraiserGoalAmount / fundraiserUnitCost
    : null;
  const fundraiserDonatedUnits = fundraiserUnitCost
    ? fundraiserDonatedTotal / fundraiserUnitCost
    : null;
  const fundraiserRemainingUnits = fundraiserGoalUnits !== null && fundraiserDonatedUnits !== null
    ? Math.max(0, fundraiserGoalUnits - fundraiserDonatedUnits)
    : null;
  const fundraiserUnitLabel = activeProject?.unitDisplay ?? activeProject?.unitName ?? "units";
  const fundraiserUnitLabelSingular = activeProject?.unitName ?? (fundraiserUnitLabel.replace(/s$/, "") || "unit");
  const fundraiserUnitsDonated = activeProject?.unitCost
    ? formatCommunityUnitCount(fundraiserDonatedTotal, activeProject.unitCost, activeProject.unitIsGoal)
    : null;
  const fundraiserPersonalUnitPotential = activeProject?.unitCost
    ? formatCommunityUnitCount(skipBalance.availableFromSkips, activeProject.unitCost, activeProject.unitIsGoal)
    : null;
  const personalGoal = profile.causeGoalAmounts?.[activeProject?.id ?? ""]
    ?? (!isActiveChallenge ? activeProject?.goalAmount ?? 0 : 0);
  const hasPersonalGivingGoal = personalGoal > 0;
  const givingStartedFillPct = givingBalance > 0 ? 16 : 0;
  const givingFillPct = hasPersonalGivingGoal ? Math.min(100, (givingBalance / personalGoal) * 100) : givingStartedFillPct;
  const destinationGoalAmount = hasPersonalGivingGoal ? personalGoal : undefined;
  const destinationFillPct = givingFillPct;
  const destinationAmount = givingBalance;
  const givingJarImpactLine = activeProject?.unitCost && activeProject.unitCost > 0 && destinationAmount > 0 && (activeProject.unitName || activeProject.unitDisplay)
    ? formatAggregateImpactUnitsDecimal(destinationAmount, activeProject.unitCost, activeProject.unitName || activeProject.unitDisplay || "impact", activeProject.unitDisplay, activeProject.unitIsGoal)
    : null;
  const destinationHref = activeProject
    ? (isActiveChallenge ? `/challenges/${activeProject.id}` : "/jars?tab=cause")
    : "/challenges";
  const destinationLabel = "Giving Jar";
  const destinationEmptyLabel = "Join a challenge →";
  const challengeSkips = activeProject && isActiveChallenge
    ? recentSkips.filter((skip) => skip.projectId === activeProject.id)
    : [];
  const hasSkippedThisWeek = isSameWeek(profile.lastSkipDate) || recentSkips.some((skip) => isSameWeek(skip.date));
  const hasActiveChallengeSkipThisWeek = challengeSkips.some((skip) => isSameWeek(skip.date));
  const hasCommunityUnit = !!(activeProject?.unitCost && activeProject.unitCost > 0);
  const communityUnitCountDisplay = hasCommunityUnit && activeProject
    ? formatCommunityUnitCount(displayedGroupTotal, activeProject.unitCost ?? 0, activeProject.unitIsGoal)
    : null;
  const communityUnitCount = activeProject?.unitCost ? displayedGroupTotal / activeProject.unitCost : 0;
  const communityUnitLabel = activeProject?.unitIsGoal && communityUnitCount > 0 && communityUnitCount < 1 && activeProject.unitName
    ? `of ${oneUnitPhrase(activeProject.unitName)}`
    : activeProject?.unitDisplay || activeProject?.unitName || "units";
  const communityUnitSuffix = activeProject?.unitIsGoal && communityUnitCount > 0 && communityUnitCount < 1 ? "" : " Funded";
  const challengeDonated = activeProject && isActiveChallenge
    ? profile.causeStats?.[activeProject.id]?.donated ?? 0
    : 0;
  const challengeFeedAllItems = activeProject && isActiveChallenge
    ? activeChallengeFeed
    : [];
  const challengeFeedItems = challengeFeedAllItems.slice(0, 3);
  const featuredChallengeFeedItem = challengeFeedItems[0] ?? null;
  const challengeSkippedAmount = challengeFeedAllItems.reduce((sum, item) => sum + Math.max(0, item.skipAmount ?? 0), 0);
  const challengeSkippedUnitPotential = activeProject?.unitCost
    ? formatCommunityUnitCount(challengeSkippedAmount, activeProject.unitCost, activeProject.unitIsGoal)
    : null;
  const challengeCommunitySkipCount = challengeFeedItems.length > 0 ? challengeFeedItems.length : challengeSkips.length;
  const todaySkipCount = activeProject && isActiveChallenge
    ? activeChallengeFeed.filter((item) => item.createdAt?.toDate?.()?.toDateString() === new Date().toDateString()).length
    : 0;
  const groupSkipsThisWeek = activeProject && isActiveChallenge
    ? challengeFeedAllItems.filter((item) => item.createdAt?.toDate && isSameWeek(item.createdAt.toDate().toISOString().split("T")[0])).length
    : 0;
  const socialFeedItems = activeProject && isActiveChallenge
    ? (activeChallengeFeed.length > 0
        ? activeChallengeFeed
        : communityFeed)
    : communityFeed;
  const liveTotalSkips = globalStats?.totalSkips ?? communityFeed.length;
  const communityTotalSaved = globalStats?.totalSaved ?? null;
  const liveFeedFallbacks = recentSkips.slice(0, 3).map((skip) => ({
    id: skip.id,
    displayName: "You",
    message: `skipped ${skip.whatSkipped || skip.categoryLabel}`,
    skipAmount: skip.amount,
    skipEmoji: skip.categoryEmoji,
    skipLabel: skip.whatSkipped || skip.categoryLabel,
    projectTitle: undefined,
    createdAt: skip.createdAt,
  }));
  const liveFeed = socialFeedItems.length > 0
    ? socialFeedItems.slice(0, 5)
    : liveFeedFallbacks;
  const featuredFeedIndex = liveFeed.length > 0 ? liveFeedIndex % liveFeed.length : 0;
  const featuredFeedItem = liveFeed.length > 0 ? liveFeed[featuredFeedIndex] : null;
  const spendingFillPct = activeGoal
    ? Math.min(100, (skipBalance.availableFromSkips / activeGoal.targetAmount) * 100)
    : 0;
  const goalCoveredAmount = activeGoal ? Math.min(skipBalance.availableFromSkips, activeGoal.targetAmount) : 0;
  const goalRemainingAmount = activeGoal ? Math.max(0, activeGoal.targetAmount - skipBalance.availableFromSkips) : 0;
  const displayedStreak = getConsecutiveWeeklyStreak(recentSkips.map((skip) => skip.date));
  const streakChipValue = hasSkippedThisWeek ? Math.max(displayedStreak, profile.streak ?? 0) : profile.streak ?? 0;
  const activeCountdown = activeProject && isActiveChallenge ? getChallengeCountdown(activeProject) : null;
  const personalGoalAmt = activeProject ? (profile.causeGoalAmounts?.[activeProject.id] ?? 0) : 0;
  const groupGoalReached = communityGoal > 0 && displayedGroupTotal >= communityGoal;
  const personalGoalReached = personalGoalAmt > 0 && userChallengeBalance >= personalGoalAmt;
  const challengeEnded = activeProject?.status === "ended";
  const lastDonationDate = profile.lastDonationDate ?? null;
  const daysSinceLastDonation = lastDonationDate
    ? Math.floor((Date.now() - new Date(lastDonationDate).getTime()) / 86400_000)
    : Infinity;
  const hasGivingBalance = givingBalance > 0;
  const readyToDonateText = activeProject
    ? `You have ${formatCurrency(givingBalance)} in your Giving Jar for ${activeProject.title}.`
    : `You have ${formatCurrency(givingBalance)} in your Giving Jar.`;
  const donationReminderPrompt: DonationReminderPrompt | null = (() => {
    if (!hasGivingBalance) return null;
    if (challengeEnded) {
      return {
        kind: "challenge-ended",
        eyebrow: "Donation reminder",
        title: "This challenge ended. Your Giving Jar is ready.",
        body: `${readyToDonateText} Turning it into a donation helps the cause actually receive it.`,
        impactLine: givingJarImpactLine,
        readyAmount: givingBalance,
        donatedAmount: profile.totalDonated ?? 0,
        donationURL: activeProject?.donationURL ?? null,
      };
    }
    if (groupGoalReached) {
      return {
        kind: "group-goal",
        eyebrow: "Goal reached",
        title: "Your group hit the goal. Time to donate your jar.",
        body: `${readyToDonateText} Sending it now helps convert the group's progress into real-world support.`,
        impactLine: givingJarImpactLine,
        readyAmount: givingBalance,
        donatedAmount: profile.totalDonated ?? 0,
        donationURL: activeProject?.donationURL ?? null,
      };
    }
    if (personalGoalReached) {
      return {
        kind: "personal-goal",
        eyebrow: "Jar goal reached",
        title: "You hit your Giving Jar goal.",
        body: `${readyToDonateText} This is a good moment to donate it and keep the momentum going.`,
        impactLine: givingJarImpactLine,
        readyAmount: givingBalance,
        donatedAmount: profile.totalDonated ?? 0,
        donationURL: activeProject?.donationURL ?? null,
      };
    }
    if (daysSinceLastDonation >= 30) {
      return {
        kind: "thirty-day",
        eyebrow: "Donation reminder",
        title: "Your Giving Jar is ready to make an impact.",
        body: `${readyToDonateText} Consider donating it so that pledged impact can become real.`,
        impactLine: givingJarImpactLine,
        readyAmount: givingBalance,
        donatedAmount: profile.totalDonated ?? 0,
        donationURL: activeProject?.donationURL ?? null,
      };
    }
    return null;
  })();

  const parkedJars = Object.entries(profile.causeJarBalances ?? {})
    .filter(([id, bal]) => {
      if (id === profile.activeProjectId || !(bal > 0)) return false;
      const proj = projects.find((p) => p.id === id);
      if (!proj) return false;
      const endMs = proj.endDate?.toMillis?.();
      return isChallengeProject(proj) && endMs != null && endMs < Date.now();
    })
    .map(([id, bal]) => ({ id, balance: bal as number, project: projects.find((p) => p.id === id) ?? null }));

  const firstName = profile.displayName.split(" ")[0];

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 20,
    padding: 24,
  };
  const showLegacyHomeSocial: boolean = false;

  const rowDivider = "1px solid var(--border-default)";

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-8">

      {/* Mobile logo — hidden on desktop (sidebar has it) */}
      <div className="flex md:hidden justify-center mb-5">
        <p className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          i<span style={{ color: "var(--green-primary)" }}>skipped</span>
        </p>
      </div>

      {/* Greeting + CTA */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Hey {firstName}.</h1>
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--text-muted)" }}>
          Is there an expense you can skip this week?
        </p>
        <button
          onClick={() => setShowSkipPicker(true)}
          className="w-full font-black py-4 rounded-full text-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          I Skipped Something
        </button>

      </div>

      {/* ── Parked Jar Banners ── */}
      {parkedJars.slice(0, 3).map(({ id, balance, project }) => (
        <div
          key={id}
          onClick={() => router.push("/jars/resolve")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-surface-1)",
            border: "1px solid rgba(46,204,113,0.3)",
            borderLeft: "3px solid var(--green-primary)",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 10,
            cursor: "pointer",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              You saved {formatCurrency(balance)} for {project?.title ?? "a cause"}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Time to send it.</p>
          </div>
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (project?.donationURL) window.open(project.donationURL, "_blank", "noopener,noreferrer");
              else router.push("/jars/resolve");
            }}
            style={{ background: "var(--green-primary)", color: "white", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            Donate
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); router.push("/jars/resolve"); }}
            style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 700, flexShrink: 0, padding: "0 4px" }}
          >
            ···
          </button>
        </div>
      ))}

      {/* Scoreboard */}
      <div style={{ ...cardStyle, marginBottom: 32, position: "relative", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 18 }}>
          Your skip scoreboard
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 5 }}>You said iSkip</p>
            <p style={{ fontSize: 50, fontWeight: 900, color: "var(--green-primary)", lineHeight: 1, letterSpacing: -2 }}>
              {profile.totalSkips}<span style={{ fontSize: 18, letterSpacing: 0, marginLeft: 4 }}>times</span>
            </p>
          </div>
          <div style={{ borderLeft: "1px solid rgba(237,245,240,0.1)" }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 5 }}>Lifetime savings</p>
            <p style={{ fontSize: 50, fontWeight: 900, color: "var(--green-primary)", lineHeight: 1, letterSpacing: -2 }}>
              {formatCurrencyRounded(skipBalance.lifetimeSaved)}
            </p>
          </div>
        </div>
      </div>

      {/* What it could become */}
      <div style={{ marginTop: 32, marginBottom: 28 }}>
        <div style={{ margin: "0 2px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 17, fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.1, marginBottom: 5 }}>Put your skips to work</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--green-primary)" }}>{formatCurrencyRounded(skipBalance.availableFromSkips)}</strong> left in my Skip Bank
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
          <div style={{ ...cardStyle, padding: 18, display: "flex", flexDirection: "column", minHeight: 330 }}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: "#A78BFA" }}>Goal</p>
              <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)", marginTop: 4 }}>
                {activeGoal?.label ?? "Choose a goal"}
              </p>
              {activeGoal && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 6 }}>
                  {goalRemainingAmount > 0
                    ? `${formatCurrencyRounded(goalRemainingAmount)} left to unlock.`
                    : "Your skips can cover this now."}
                </p>
              )}
              {!activeGoal && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 6 }}>
                  Pick something worth spending your skipped savings on.
                </p>
              )}
            </div>
            {activeGoal && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "62px minmax(0, 1fr)", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 16, background: "rgba(237,245,240,0.055)", border: "1px solid rgba(237,245,240,0.08)", marginTop: "auto", marginBottom: 14 }}>
                  <div style={{ width: 54, height: 46, borderRadius: 14, display: "grid", placeItems: "center", padding: "0 4px", boxSizing: "border-box", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.32)", color: "#A78BFA", fontSize: "clamp(15px, 1.6vw, 18px)", fontWeight: 900, lineHeight: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", letterSpacing: 0 }}>
                    {formatCurrencyRounded(activeGoal.targetAmount)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: "#A78BFA", marginBottom: 4 }}>
                      {activeGoal.type === "splurge" ? "Reward cost" : "Goal cost"}
                    </p>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
                  <span>{Math.round(spendingFillPct)}% covered</span>
                  <span>{formatCurrencyRounded(goalRemainingAmount)} left</span>
                </div>
                <div style={{ height: 9, borderRadius: 999, background: "rgba(237,245,240,0.07)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${spendingFillPct}%`, borderRadius: 999, background: "linear-gradient(90deg, #7C3AED, #A78BFA)" }} />
                </div>
              </div>
              </>
            )}
            <button
              onClick={() => {
                if (activeGoal) {
                  setShowSpendModal(true);
                  return;
                }
                router.push("/jars?tab=live");
              }}
              style={{ width: "100%", borderRadius: 12, padding: "11px 12px", background: "rgba(237,245,240,0.06)", color: "var(--text-primary)", border: "1px solid rgba(237,245,240,0.08)", fontSize: 13, fontWeight: 900, marginTop: activeGoal ? 0 : "auto" }}
            >
              {activeGoal ? "Spend some skips" : "Choose a goal"}
            </button>
          </div>

          <div style={{ ...cardStyle, padding: 18, display: "flex", flexDirection: "column", minHeight: 330 }}>
            <div style={{ display: "grid", gridTemplateColumns: activeProject?.imageURL ? "minmax(0, 1fr) 72px" : "minmax(0, 1fr)", gap: 12, alignItems: "start", marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--green-primary)" }}>Fundraiser</p>
                <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)", marginTop: 4 }}>
                  {activeProject?.title ?? "Pick a fundraiser"}
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 6 }}>
                  {activeProject
                    ? `${activeProject.memberUids?.length ?? 0} people skipping toward ${fundraiserGoalUnits ? Math.round(fundraiserGoalUnits).toLocaleString("en-US") : "more"} ${fundraiserUnitLabel}.`
                    : "Find a cause where skipped savings can join a shared goal."}
                </p>
              </div>
              {activeProject?.imageURL && (
                <img
                  src={activeProject.imageURL}
                  alt=""
                  style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", objectPosition: activeProject.imagePosition ?? "center", border: "1px solid rgba(237,245,240,0.12)" }}
                />
              )}
            </div>
            {activeProject ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "62px minmax(0, 1fr)", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 16, background: "rgba(237,245,240,0.055)", border: "1px solid rgba(237,245,240,0.08)", marginTop: "auto", marginBottom: 14 }}>
                  <div style={{ width: 54, height: 46, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(46,204,113,0.12)", border: "1px solid rgba(46,204,113,0.32)", color: "var(--green-primary)", fontSize: 18, fontWeight: 900 }}>
                    {fundraiserUnitCost ? formatCurrencyRounded(fundraiserUnitCost) : "?"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--green-primary)", marginBottom: 4 }}>
                      Per {fundraiserUnitLabelSingular}
                    </p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "var(--gold-cta)", lineHeight: 1.3 }}>
                      {fundraiserPersonalUnitPotential && fundraiserUnitCost
                        ? `Your skips could fund up to ${fundraiserPersonalUnitPotential} ${fundraiserUnitLabel}.`
                        : `Your skips could fund up to ${formatCurrencyRounded(skipBalance.availableFromSkips)}.`}
                    </p>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
                  <span>{activeProject.unitCost && fundraiserUnitsDonated ? `${fundraiserUnitsDonated} ${fundraiserUnitLabel} donated` : `${formatCurrencyRounded(fundraiserDonatedTotal)} donated`}</span>
                  <span>{fundraiserRemainingUnits !== null ? `${Math.ceil(fundraiserRemainingUnits).toLocaleString("en-US")} to go` : ""}</span>
                </div>
                <div style={{ height: 9, borderRadius: 999, background: "rgba(237,245,240,0.07)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${fundraiserGoalAmount > 0 ? fundraiserProgressPct : 35}%`, borderRadius: 999, background: "linear-gradient(90deg, #1E9485, #2ECC71)" }} />
                </div>
              </div>
              </>
            ) : null}
            <button
              onClick={() => {
                if (activeProject) {
                  setShowContributionModal(true);
                  return;
                }
                router.push("/challenges");
              }}
              style={{ width: "100%", borderRadius: 12, padding: "11px 12px", background: "rgba(237,245,240,0.06)", color: "var(--text-primary)", border: "1px solid rgba(237,245,240,0.08)", fontSize: 13, fontWeight: 900 }}
            >
              {activeProject ? "Contribute some skips" : "Browse fundraisers"}
            </button>
          </div>
        </div>
      </div>

      {activeProject && isActiveChallenge && activeProject.status !== "ended" && (
        <div style={{ ...cardStyle, marginBottom: 36, padding: 18, background: "linear-gradient(145deg, rgba(20,26,31,0.98), rgba(10,26,22,0.96) 58%, rgba(43,186,164,0.06))", border: "1px solid rgba(237,245,240,0.11)", boxShadow: "0 14px 34px rgba(0,0,0,0.16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.3, textTransform: "uppercase", color: "#2BBAA4", marginBottom: 5 }}>
                Skipping together
              </p>
              <p style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.15, color: "var(--text-primary)" }}>
                {activeProject.groupName ?? activeProject.title}
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", lineHeight: 1.45, marginTop: 12, maxWidth: 430 }}>
                {challengeSkippedAmount > 0
                  ? `Together, the group has skipped ${formatCurrencyRounded(challengeSkippedAmount)} while supporting this fundraiser.`
                  : "No group skips logged for this fundraiser yet."}
                {challengeSkippedAmount > 0 && challengeSkippedUnitPotential && activeProject.unitCost
                  ? ` That could fund up to ${challengeSkippedUnitPotential} ${fundraiserUnitLabel}.`
                  : ""}
              </p>
              {fundraiserDonatedTotal > 0 && (
                <p style={{ fontSize: 12, fontWeight: 800, color: "#2BBAA4", lineHeight: 1.45, marginTop: 6 }}>
                  Donations logged: {formatCurrencyRounded(fundraiserDonatedTotal)}
                </p>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
              <ShareButton
                variant="pill"
                label="Invite"
                title={activeProject.title}
                text={getDirectChallengeShareText(activeProject)}
                url={appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}${getChallengeSharePath(activeProject)}`, user?.uid)}
              />
            </div>
          </div>

          {featuredChallengeFeedItem ? (
            <div style={{ borderTop: "1px solid rgba(237,245,240,0.08)", borderBottom: "1px solid rgba(237,245,240,0.08)" }}>
              {(() => {
                const item = challengeFeedItems[Math.min(featuredFeedIndex, challengeFeedItems.length - 1)] ?? featuredChallengeFeedItem;
                return (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", alignItems: "center", gap: 10, padding: "12px 0" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(43,186,164,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                    {item.skipEmoji ?? "."}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getFeedActionLine(item)}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      Skipped with the group
                      {" · "}
                      {formatRelativeTime(item.createdAt.toDate())}
                    </p>
                  </div>
                  {(item.giveAmount ?? item.skipAmount) !== undefined && (
                    <p style={{ fontSize: 14, fontWeight: 900, color: "#2BBAA4", whiteSpace: "nowrap" }}>
                      +{formatCurrency(item.giveAmount ?? item.skipAmount!)}
                    </p>
                  )}
                </div>
                );
              })()}
              {challengeFeedItems.length > 1 && (
                <div style={{ display: "flex", gap: 5, paddingBottom: 8 }}>
                  {challengeFeedItems.map((item, index) => (
                    <span
                      key={item.id}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 999,
                        background: index === Math.min(featuredFeedIndex, challengeFeedItems.length - 1) ? "#2BBAA4" : "rgba(237,245,240,0.18)",
                        transition: "all 180ms ease",
                      }}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => router.push(`/challenges/${activeProject.id}/activity`)}
                style={{ width: "100%", border: "none", background: "transparent", color: "#2BBAA4", fontSize: 12, fontWeight: 900, textAlign: "left", cursor: "pointer", padding: "10px 0" }}
              >
                View full feed →
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSkipPicker(true)}
              style={{ width: "100%", borderRadius: 16, background: "rgba(237,245,240,0.045)", border: "1px dashed rgba(46,204,113,0.28)", padding: "11px 12px", color: "var(--text-secondary)", fontSize: 13, fontWeight: 800, textAlign: "left", cursor: "pointer" }}
            >
              Be the first skip in this group.
            </button>
          )}
        </div>
      )}

      {showLegacyHomeSocial && (!activeProject || !isActiveChallenge) && (
      <div style={{
        ...cardStyle,
        marginBottom: 20,
        padding: 18,
        background: "linear-gradient(145deg, rgba(46,204,113,0.13), rgba(12,35,26,0.98) 48%, rgba(43,186,164,0.08))",
        border: "1px solid rgba(46,204,113,0.24)",
        boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--green-primary)", marginBottom: 4 }}>
              iSkipped Community
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.05 }}>
              {liveTotalSkips.toLocaleString()} skips
            </p>
            {communityTotalSaved != null && communityTotalSaved > 0 && (
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 3 }}>
                = ${Math.round(communityTotalSaved).toLocaleString("en-US")} skipped
              </p>
            )}
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginTop: 20 }}>
              Recent activity from people building their jars
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/community")}
            style={{
            background: "rgba(46,204,113,0.12)",
            border: "1px solid rgba(46,204,113,0.25)",
            borderRadius: 999,
            color: "var(--green-primary)",
            fontSize: 11,
            fontWeight: 900,
            padding: "6px 10px",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
          >
            See more
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {featuredFeedItem ? (
            <>
              <div
                key={featuredFeedItem.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "38px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 10,
                  background: "linear-gradient(135deg, rgba(46,204,113,0.18), rgba(255,255,255,0.055))",
                  border: "1px solid rgba(46,204,113,0.3)",
                  borderRadius: 16,
                  padding: "10px 12px",
                  boxShadow: "0 10px 26px rgba(46,204,113,0.08)",
                  minWidth: 0,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 14,
                  background: "rgba(237,245,240,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {featuredFeedItem.skipEmoji ?? "."}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 900, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {getFeedActionLine(featuredFeedItem)}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                    {featuredFeedItem.projectTitle ? `Toward ${featuredFeedItem.projectTitle}` : "Community activity"}
                    {" - "}
                    {featuredFeedItem.createdAt?.toDate ? formatRelativeTime(featuredFeedItem.createdAt.toDate()) : "just now"}
                  </p>
                </div>
                {featuredFeedItem.skipAmount !== undefined && (
                  <p style={{ fontSize: 15, fontWeight: 900, color: "var(--green-primary)", flexShrink: 0 }}>
                    +{formatCurrency(featuredFeedItem.skipAmount)}
                  </p>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowSkipPicker(true)}
              style={{
                width: "100%",
                background: "var(--bg-surface-2)",
                border: "1px dashed rgba(46,204,113,0.35)",
                borderRadius: 14,
                padding: "12px 14px",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 800,
                textAlign: "left",
              }}
            >
              Be the first skip in the live feed.
            </button>
          )}
        </div>

        <div style={{ display: "none" }}>
          {liveFeed.length > 0 ? (
            liveFeed.slice(0, 3).map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: index === 0 ? "rgba(46,204,113,0.1)" : "var(--bg-surface-2)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 14,
                  padding: "10px 12px",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 13,
                  background: "rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 17, flexShrink: 0,
                }}>
                  {item.skipEmoji ?? "•"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.displayName} {formatFeedMessage(item.message)}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.projectTitle ? `${item.projectTitle} · ` : ""}
                    {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "just now"}
                  </p>
                </div>
                {item.skipAmount !== undefined && (
                  <p style={{ fontSize: 13, fontWeight: 900, color: "var(--green-primary)", flexShrink: 0 }}>
                    +{formatCurrency(item.skipAmount)}
                  </p>
                )}
              </div>
            ))
          ) : (
            <button
              onClick={() => setShowSkipPicker(true)}
              style={{
                width: "100%",
                background: "var(--bg-surface-2)",
                border: "1px dashed rgba(46,204,113,0.35)",
                borderRadius: 14,
                padding: "12px 14px",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 800,
                textAlign: "left",
              }}
            >
              Be the first skip in the live feed.
            </button>
          )}
        </div>
      </div>
      )}

      {showLegacyHomeSocial && activeProject && isActiveChallenge && activeProject.status !== "ended" && (
        <div style={{
          ...cardStyle,
          marginBottom: 20,
          padding: 18,
          background: "linear-gradient(145deg, rgba(46,204,113,0.13), rgba(12,35,26,0.98) 48%, rgba(43,186,164,0.08))",
          border: "1px solid rgba(46,204,113,0.24)",
          boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ marginBottom: 18 }}>
            {/* Title row with action buttons inline */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>
                What&apos;s Happening In My Group
              </p>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <ShareButton
                  variant="pill"
                  label="Share"
                  title={activeProject.title}
                  text={getDirectChallengeShareText(activeProject)}
                  url={appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}${getChallengeSharePath(activeProject)}`, user?.uid)}
                />
                <button
                  onClick={() => router.push(`/challenges/${activeProject.id}`)}
                  style={{ background: "rgba(46,204,113,0.12)", border: "1px solid rgba(46,204,113,0.25)", borderRadius: 999, color: "var(--green-primary)", fontSize: 11, fontWeight: 900, padding: "6px 10px", whiteSpace: "nowrap" }}
                >
                  View
                </button>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--green-primary)", marginBottom: 0 }}>
                {activeProject.groupName ?? activeProject.title}
              </p>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 12 }}>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary)", lineHeight: 1 }}>
                    {liveChallengeTotalSkips.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-muted)", marginTop: 3 }}>
                    Skips
                  </p>
                </div>
                {displayedGroupTotal > 0 && (
                  <>
                    <div style={{ width: 1, background: "rgba(255,255,255,0.12)", height: 44, marginBottom: 18 }} />
                    <div>
                      <p style={{ fontSize: 28, fontWeight: 900, color: "var(--gold-cta)", lineHeight: 1 }}>
                        ${Math.round(displayedGroupTotal).toLocaleString()}
                      </p>
                      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-muted)", marginTop: 3 }}>
                        Pledged
                      </p>
                    </div>
                  </>
                )}
                {hasCommunityUnit && communityUnitCountDisplay !== null && (
                  <>
                    <div style={{ width: 1, background: "rgba(255,255,255,0.12)", height: 44, marginBottom: 18 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 28, fontWeight: 900, color: "var(--green-primary)", lineHeight: 1 }}>
                        {communityUnitCountDisplay}
                      </p>
                      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-muted)", marginTop: 3 }}>
                        {communityUnitLabel}{communityUnitSuffix}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: hasActiveChallengeSkipThisWeek ? "var(--green-primary)" : "var(--text-muted)",
                  marginTop: 10,
                }}
              >
                {hasActiveChallengeSkipThisWeek ? "✓ " : ""}1 skip this week
              </p>
              {communityGoal > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>${Math.round(displayedGroupTotal).toLocaleString()}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>of ${Math.round(communityGoal).toLocaleString()} goal</span>
                  </div>
                  <div style={{ height: 8, background: "rgba(46,204,113,0.15)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (displayedGroupTotal / communityGoal) * 100)}%`, background: "linear-gradient(90deg, #1E9485, #2ECC71)", borderRadius: 999 }} />
                  </div>
                  {displayedGroupTotal >= communityGoal && (
                    <div style={{ marginTop: 12, marginBottom: 4, padding: "12px 14px", borderRadius: 14, background: "linear-gradient(135deg, rgba(255,183,0,0.15), rgba(46,204,113,0.12))", border: "1px solid rgba(255,183,0,0.3)" }}>
                      <p style={{ fontSize: 14, fontWeight: 900, color: "var(--gold-cta)", marginBottom: 8 }}>🎉 We reached our goal!</p>
                      <button
                        onClick={() => router.push("/jars?tab=cause")}
                        style={{ background: "var(--gold-cta)", color: "#0B1A14", fontSize: 12, fontWeight: 900, padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer" }}
                      >
                        Manage my jar →
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Feed: challenge items first, community fallback until group gets active */}
          <div style={{ display: "grid", gap: 10, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16, marginTop: 16 }}>
            {challengeFeedItems.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-muted)" }}>Live Group Activity</p>
                  <button
                    onClick={() => router.push(`/challenges/${activeProject.id}/activity`)}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "var(--green-primary)", cursor: "pointer" }}
                  >See more →</button>
                </div>
                {challengeFeedItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "38px minmax(0,1fr) auto",
                    alignItems: "center",
                    gap: 10,
                    background: "linear-gradient(135deg, rgba(46,204,113,0.18), rgba(255,255,255,0.055))",
                    border: "1px solid rgba(46,204,113,0.3)",
                    borderRadius: 16,
                    padding: "10px 12px",
                    boxShadow: "0 10px 26px rgba(46,204,113,0.08)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 14, background: "rgba(237,245,240,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {item.skipEmoji ?? "✨"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getFeedActionLine(item)}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "just now"}
                    </p>
                  </div>
                  {(item.giveAmount ?? item.skipAmount) !== undefined && (
                    <p style={{ fontSize: 15, fontWeight: 900, color: "var(--green-primary)", flexShrink: 0 }}>
                      +{formatCurrency(item.giveAmount ?? item.skipAmount!)}
                    </p>
                  )}
                </div>
              ))}
              </>
            ) : communityFeed.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-muted)" }}>
                    Live iSkipped Activity
                  </p>
                  <button
                    onClick={() => router.push("/community")}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "var(--green-primary)", cursor: "pointer" }}
                  >
                    See more →
                  </button>
                </div>
                {communityFeed.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "38px minmax(0,1fr) auto",
                      alignItems: "center",
                      gap: 10,
                      background: "rgba(237,245,240,0.04)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 16,
                      padding: "10px 12px",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 14, background: "rgba(237,245,240,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {item.skipEmoji ?? "✨"}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 900, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {getFeedActionLine(item)}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                        {item.projectTitle ? `Toward ${item.projectTitle}` : "iSkipped community"}
                        {" · "}
                        {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "just now"}
                      </p>
                    </div>
                    {item.skipAmount !== undefined && (
                      <p style={{ fontSize: 15, fontWeight: 900, color: "var(--green-primary)", flexShrink: 0 }}>
                        +{formatCurrency(item.skipAmount)}
                      </p>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <button
                onClick={() => setShowSkipPicker(true)}
                style={{ width: "100%", background: "var(--bg-surface-2)", border: "1px dashed rgba(46,204,113,0.35)", borderRadius: 14, padding: "12px 14px", color: "var(--text-secondary)", fontSize: 13, fontWeight: 800, textAlign: "left" }}
              >
                Be the first skip in the group.
              </button>
            )}
          </div>

          {/* Footer: time left + personal stats */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              {activeCountdown && !activeCountdown.isExpired && activeCountdown.daysLeft !== null ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: activeCountdown.daysLeft < 3 ? "#EF4444" : activeCountdown.daysLeft < 7 ? "var(--gold-cta)" : "var(--text-muted)" }}>
                  {activeCountdown.daysLeft} days left
                </span>
              ) : activeCountdown?.isExpired ? (
                <button
                  onClick={() => router.push("/jars/resolve")}
                  style={{ fontSize: 12, fontWeight: 700, color: "var(--green-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                >
                  Challenge ended — donate your jar →
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {!profile.activeProjectId && givingBalance === 0 && (
        <div style={{
          ...cardStyle,
          marginBottom: 20,
          borderLeft: "4px solid var(--green-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              🙌 Join a challenge
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
              Skip with a group, give together. No asking for money — just spend less and watch your collective savings grow.
            </div>
          </div>
          <button
            onClick={() => router.push("/challenges")}
            style={{
              background: "linear-gradient(135deg, var(--coral-primary), var(--coral-dark))",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              borderRadius: 12,
              padding: "10px 16px",
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            Browse challenges →
          </button>
        </div>
      )}

      {/* Recent Skips */}
      <div style={{ marginTop: 10, padding: "0 4px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
              My Recent Skips
            </span>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                background: "none", border: "none", color: "var(--green-primary)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              View all →
            </button>
          </div>

          {recentSkips.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", borderTop: rowDivider, borderBottom: rowDivider }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>☕</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No skips yet!</p>
            </div>
          ) : (
            recentSkips.slice(0, 3).map((skip, i) => (
              <div
                key={skip.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0",
                  borderTop: i === 0 ? rowDivider : "none",
                  borderBottom: rowDivider,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "var(--bg-surface-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {skip.categoryEmoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {skip.whatSkipped || skip.categoryLabel}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {skip.createdAt?.toDate ? formatRelativeTime(skip.createdAt.toDate()) : skip.date}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {formatCurrency(skip.amount)}
                  </span>
                  <button
                    onClick={() => setEditingSkip(skip)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-muted)", fontSize: 14, padding: 4,
                    }}
                  >
                    ✏️
                  </button>
                </div>
              </div>
            ))
          )}
      </div>

      <SkipSetupPrompt mode="footer" />

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        iSkipped helps you track skipped spending and pledges. Donations are made outside the app, directly through the fundraiser or organization, and iSkipped does not process funds or control how donations are used.
      </p>

      <p className="hidden" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        We are still in beta — have feedback?{" "}
        <a href="mailto:iskippedfor@gmail.com" style={{ color: "var(--green-primary)", textDecoration: "underline" }}>
          iskippedfor@gmail.com
        </a>
      </p>

      <DonationReminderController
        prompt={donationReminderPrompt}
        userId={user?.uid}
        projectId={profile.activeProjectId}
        blocked={showSkipPicker || editingSkip != null}
        onDonate={() => {
          if (donationReminderPrompt?.donationURL) {
            window.open(donationReminderPrompt.donationURL, "_blank", "noopener,noreferrer");
            return;
          }
          router.push("/jars?tab=cause");
        }}
        onAlreadyDonated={() => router.push("/jars?tab=cause&donate=1")}
      />

      {editingSkip && (
        <EditSkipModal
          skip={editingSkip}
          onClose={() => setEditingSkip(null)}
        />
      )}

      {showContributionModal && activeProject && (
        <FundraiserContributionModal
          project={activeProject}
          availableFromSkips={skipBalance.availableFromSkips}
          unitCost={fundraiserUnitCost}
          unitLabel={fundraiserUnitLabel}
          mode={contributionMode}
          onClose={() => setShowContributionModal(false)}
          onComplete={(amount) => donate(amount, activeProject.id, activeProject.title)}
        />
      )}

      {showSpendModal && activeGoal && user && (
        <GoalSpendModal
          goal={activeGoal}
          availableFromSkips={skipBalance.availableFromSkips}
          onClose={() => setShowSpendModal(false)}
          onComplete={async (amount) => {
            try {
              const amountFromSkips = await recordPurchase(user.uid, activeGoal.id, activeGoal.label, activeGoal.targetAmount, amount);
              updateProfile({ totalSpent: (profile.totalSpent ?? 0) + amountFromSkips });
              return true;
            } catch (err) {
              console.error("recordPurchase failed", err);
              toast.error("Couldn't log that spend — check your connection and try again.");
              return false;
            }
          }}
        />
      )}
    </div>
  );
}
