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
import {
  allocateSkipBankToJar,
  normalizeSpendingGoals,
  pinProjectToHome,
  recordPurchase,
  setActiveSkipTarget,
  setUserCauseGoal,
  updateSpendingGoals,
} from "@/lib/services/firebase/users";
import { levelForXp } from "@/lib/utils/xp";
import { isChallengeProject, isProjectEnded, subscribeToProject } from "@/lib/services/firebase/projects";
import { subscribeToChallengeFeed, subscribeToCommunityFeed, subscribeToGlobalStats } from "@/lib/services/firebase/social";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { DonationLogModal } from "@/components/skip/DonationLogModal";
import { FeedItem, GlobalStats, Project, Skip, SkipAllocationTarget, SpendingGoal } from "@/lib/types/models";
import { appendRefParam, getChallengeSharePath } from "@/lib/utils/share";
import { getChallengeCausePhrase, getDirectChallengeShareText } from "@/lib/utils/challengeShareCopy";
import { ShareButton } from "@/components/share/ShareButton";
import { SkipBucksBill } from "@/components/SkipBucksBill";
import { formatAggregateImpactUnitsDecimal, oneUnitPhrase } from "@/lib/utils/impact";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { useModalA11y } from "@/hooks/useModalA11y";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { apiRequest } from "@/lib/services/firebase/apiClient";
import { getPersonalFundraiserGoalProgress } from "@/lib/utils/fundraiserGoals";
import { isSharedFundraiserSkip } from "@/lib/utils/feedPrivacy";

function normalizeExternalLink(link: string): string {
  const trimmed = link.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

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
  prominentLabel?: boolean;
  topLabel?: string;
  topDetail?: string;
  topLabelColor?: string;
  hideBottomLabel?: boolean;
  paused?: boolean;
}

interface DonationReminderPrompt {
  kind: "challenge-ended" | "group-goal" | "personal-goal";
  eyebrow: string;
  title: string;
  body: string;
  impactLine: string | null;
  readyAmount: number;
  donatedAmount: number;
  donationURL?: string | null;
}

const DONATION_REMINDER_MIN_BALANCE = 5;
const DONATION_REMINDER_COOLDOWN_DAYS = 7;

function rewardDefaultImage(label: string, explicitCategory?: string) {
  const normalized = `${label} ${explicitCategory ?? ""}`.toLowerCase();
  if (/(spa|self-care|self care|massage|recharge)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80";
  }
  if (/(concert|ticket|music|show|experience)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80";
  }
  if (/(flight|abroad|plane|travel|trip|weekend|vacation|getaway)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80";
  }
  if (/(book|course|class|learn)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80";
  }
  if (/(editor|laptop|camera|desk|tool|upgrade)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80";
  }
  if (/(dinner|coffee|meal|date|restaurant|brunch|treat)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80";
  }
  return null;
}

function rewardSkipEquivalentLine(balance: number, target: number) {
  const remaining = Math.max(0, target - balance);
  if (target <= 0) return "Set a target to track progress";
  if (remaining <= 0) return "Ready to claim";
  if (remaining > 200) {
    const takeouts = Math.max(1, Math.ceil(remaining / 25));
    return `~${takeouts.toLocaleString()} takeout skips`;
  }
  const coffees = Math.max(1, Math.ceil(remaining / 5));
  return `~${coffees.toLocaleString()} coffee skips`;
}

function fundraiserGroupGoalLine(project: Project) {
  if (!project.goalAmount || project.goalAmount <= 0) return null;
  if (project.unitCost && project.unitCost > 0 && project.unitName) {
    const units = Math.max(1, Math.round(project.goalAmount / project.unitCost));
    const label = project.unitDisplay ?? `${project.unitName.toLowerCase()}${units === 1 ? "" : "s"}`;
    return `Group goal: ${formatCurrencyRounded(project.goalAmount)} (${units.toLocaleString()} ${label})`;
  }
  return `Group goal: ${formatCurrencyRounded(project.goalAmount)}`;
}

function ScoreboardValue({
  value,
  format = "number",
  suffix,
  paused = false,
}: {
  value: number;
  format?: "number" | "currency";
  suffix?: string;
  paused?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const visibleValue = useRef(value);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    const from = visibleValue.current;
    if (from === value) return;

    const startedAt = performance.now();
    const duration = 650;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from + (value - from) * eased);
      if (progress < 1) {
        animationFrame.current = window.requestAnimationFrame(tick);
      } else {
        visibleValue.current = value;
      }
    };

    if (animationFrame.current != null) window.cancelAnimationFrame(animationFrame.current);
    animationFrame.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current != null) window.cancelAnimationFrame(animationFrame.current);
    };
  }, [paused, value]);

  const rendered = format === "currency"
    ? formatCurrencyRounded(displayValue)
    : Math.round(displayValue).toLocaleString();

  return <>{rendered}{suffix && <span className="scoreboard-suffix">{suffix}</span>}</>;
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
        className="iskip-pop-in max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl p-6 shadow-2xl relative"
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
  personalGoalReached,
  blocked,
  onDonate,
  onAlreadyDonated,
}: {
  prompt: DonationReminderPrompt | null;
  userId?: string;
  projectId?: string | null;
  personalGoalReached: boolean;
  blocked: boolean;
  onDonate: () => void;
  onAlreadyDonated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [, refreshDismissal] = useState(0);
  const dismissKey = prompt && userId
    ? `iskipped_donation_prompt_dismissed_${userId}_${projectId ?? "none"}_${prompt.kind}`
    : null;
  const dismissedAt = dismissKey && typeof window !== "undefined"
    ? localStorage.getItem(dismissKey)
    : null;
  const dismissedAtMs = dismissedAt ? Number.parseInt(dismissedAt, 10) : 0;
  const cooldownRemainingMs = dismissedAtMs > 0
    ? Math.max(0, dismissedAtMs + DONATION_REMINDER_COOLDOWN_DAYS * 86400_000 - Date.now())
    : 0;
  const isDismissed = !!dismissKey && cooldownRemainingMs > 0;

  useEffect(() => {
    if (!userId || !projectId || personalGoalReached || typeof window === "undefined") return;
    const personalGoalDismissKey = `iskipped_donation_prompt_dismissed_${userId}_${projectId}_personal-goal`;
    window.localStorage.removeItem(personalGoalDismissKey);
    refreshDismissal((revision) => revision + 1);
  }, [personalGoalReached, projectId, userId]);

  useEffect(() => {
    if (!isDismissed || cooldownRemainingMs <= 0) return;
    const timer = window.setTimeout(
      () => refreshDismissal((revision) => revision + 1),
      cooldownRemainingMs + 50,
    );
    return () => window.clearTimeout(timer);
  }, [cooldownRemainingMs, isDismissed]);

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
      refreshDismissal((revision) => revision + 1);
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

function Jar({ fillPercent, color, gradEnd, label, amount, emoji, causeLabel, goalAmount, emptyLabel, href, onClick, actionLabel, actionOnClick, actionColor, unitDisplay, unitCount, centerValueOverride, centerLabelOverride, prominentLabel, topLabel, topDetail, topLabelColor, hideBottomLabel, paused = false }: JarProps) {
  const [visibleFillPercent, setVisibleFillPercent] = useState(fillPercent);

  useEffect(() => {
    if (!paused) setVisibleFillPercent(fillPercent);
  }, [fillPercent, paused]);

  const clamp = Math.min(Math.max(visibleFillPercent, 0), 100);
  const w = 160;
  const h = 240;
  const scale = w / 120;
  const fillH = (clamp / 100) * 120 * scale;
  const jarH = 170 * scale;
  const yStart = jarH - fillH;
  const uid = `${label}-${color}-${Math.round(clamp)}`.replace(/\W/g, "");
  const hasAmount = amount !== "$0.00";
  const topDisplayLabel = topLabel ?? causeLabel ?? emptyLabel;
  const hasGoalContext = !!causeLabel || !!topLabel;
  const showCenter = hasGoalContext || hasAmount;
  const centerValue = centerValueOverride ?? (hasGoalContext ? `${Math.round(clamp)}%` : amount);
  const centerLabel = centerLabelOverride ?? (hasGoalContext
    ? goalAmount && goalAmount > 0 ? "to goal" : "saved"
    : "ready");
  const centerLabelLines = centerLabel.split("\n");
  const centerMultiLine = centerLabelLines.length > 1;
  const hasGoalDisplay = !!(hasGoalContext && goalAmount && goalAmount > 0);
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
        <div style={{ fontSize: topLabel ? 12 : prominentLabel ? 22 : 13, fontWeight: topLabel ? 800 : prominentLabel ? 900 : causeLabel ? 700 : 600, fontStyle: topDisplayLabel ? "normal" : "italic", color: topLabelColor ?? (topLabel ? "var(--text-secondary)" : prominentLabel ? "var(--text-primary)" : color), lineHeight: prominentLabel && !topLabel ? 1.1 : 1.35, letterSpacing: topLabel ? 1.5 : 0.2, textTransform: topLabel ? "uppercase" : "none", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textAlign: "center" }}>
          {topDisplayLabel ?? "Tap to pick a jar"}
        </div>
        {topDetail && (
          <div style={{ marginTop: 5, fontSize: 10, fontWeight: 800, lineHeight: 1.25, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            {topDetail}
          </div>
        )}
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
              dur="0.9s" fill="freeze"
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
        {!hideBottomLabel && (
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            {label}
          </div>
        )}
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

function getRecentWinLine(item: Pick<FeedItem, "displayName" | "message" | "skipLabel"> & { skipLabel?: string }): string {
  const name = formatFeedName(item.displayName);
  const shortName = name === "A friend" ? name : name.split(/\s+/)[0];
  return `${shortName} skipped ${getFeedSkipLabel(item)}`;
}

function FundraiserContributionModal({
  project,
  availableFromSkips,
  jarBalance,
  unitCost,
  unitLabel,
  mode = "contribute",
  onClose,
  onComplete,
}: {
  project: Project;
  availableFromSkips: number;
  jarBalance: number;
  unitCost: number | null;
  unitLabel: string;
  mode?: "contribute" | "log";
  onClose: () => void;
  onComplete: (amount: number) => Promise<boolean>;
}) {
  const dialogRef = useModalA11y(onClose);
  const safeJarBalance = Math.max(0, jarBalance);
  const [amount, setAmount] = useState(() => {
    const defaultAmount = Math.round(safeJarBalance * 100) / 100;
    return defaultAmount > 0 ? defaultAmount.toString() : "0";
  });
  const [step, setStep] = useState<"amount" | "coverage" | "ready" | "confirm">("amount");
  const [saving, setSaving] = useState(false);
  const parsedAmount = Number.parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const canContinue = cleanAmount > 0;
  const coveredAmount = Math.min(cleanAmount, Math.max(0, availableFromSkips));
  const uncoveredAmount = Math.max(0, cleanAmount - Math.max(0, availableFromSkips));
  const extraFromUnassigned = Math.max(0, cleanAmount - safeJarBalance);
  const coveredFromUnassigned = Math.min(extraFromUnassigned, Math.max(0, availableFromSkips - safeJarBalance));
  const impactText = unitCost && unitCost > 0 && coveredAmount > 0
    ? formatAggregateImpactUnitsDecimal(
        coveredAmount,
        unitCost,
        project.unitName ?? unitLabel,
        unitLabel,
        project.unitIsGoal
      )
    : null;

  function handleAmountSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canContinue) return;
    if (cleanAmount > safeJarBalance) {
      setStep("coverage");
      return;
    }
    if (mode === "log") {
      setStep("confirm");
      return;
    }
    handleExternalStep();
  }

  function handleCoverageConfirm() {
    if (!canContinue) return;
    if (mode === "log") {
      setStep("confirm");
      return;
    }
    handleExternalStep();
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
    toast.success("Donation logged from your skipped savings.");
    onClose();
  }

  function handleCloseWithoutLogging() {
    toast.info("No donation logged. Your jar balance remains the same.");
    onClose();
  }

  const handleModalClose = step === "confirm" ? handleCloseWithoutLogging : onClose;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
      onClick={handleModalClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fundraiser-contribution-title"
        tabIndex={-1}
        className="iskip-pop-in max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl p-6 shadow-2xl relative"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={handleModalClose}
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
            ? project.donationURL
              ? "When you come back, confirm the outside donation so your skipped savings and fundraiser impact stay accurate."
              : "No donation link is attached to this fundraiser yet. Please donate directly through the organization, then log it here once complete."
            : step === "coverage"
              ? uncoveredAmount > 0
                ? `You are planning to donate ${formatCurrencyRounded(cleanAmount)}, which is more than you have saved for this cause. ${formatCurrencyRounded(coveredFromUnassigned)} will be covered by Skip Bucks. The remaining ${formatCurrencyRounded(uncoveredAmount)} will not come from skipped savings.`
                : `You are planning to donate ${formatCurrencyRounded(cleanAmount)}, which is more than you have saved for this cause. Your Skip Bucks can cover the extra ${formatCurrencyRounded(coveredFromUnassigned)}.`
            : step === "ready"
              ? project.donationURL
                ? `${formatCurrencyRounded(coveredAmount)} is ready from your skipped savings${impactText ? `, about ${impactText}` : ""}.`
                : `${formatCurrencyRounded(coveredAmount)} is ready from your skipped savings. No donation link is attached to this fundraiser yet. Please donate directly through the organization, then log it here so your fundraiser jar stays accurate.`
              : mode === "log"
                ? "How much did you donate outside iSkipped?"
                : "Enter the donation amount. It is prefilled with this jar's saved balance."}
        </p>

        {step === "amount" && (
          <form className="mt-5 rounded-xl p-4" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }} onSubmit={handleAmountSubmit}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Jar amount</p>
              <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{formatCurrencyRounded(safeJarBalance)} in jar</p>
            </div>
            <label className="sr-only" htmlFor="fundraiser-contribution-amount">Contribution amount</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--green-primary)", fontSize: 26, fontWeight: 900 }}>$</span>
              <input
                id="fundraiser-contribution-amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: "2px solid var(--green-primary)", color: "var(--text-primary)", fontSize: 28, fontWeight: 900, outline: "none" }}
              />
            </div>
            {impactText && (
              <p className="text-xs font-bold mt-3" style={{ color: "var(--green-primary)" }}>
                About {impactText}
              </p>
            )}
            <button type="submit" className="sr-only">Continue</button>
          </form>
        )}

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
        ) : step === "coverage" ? (
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl p-3" style={{ background: uncoveredAmount > 0 ? "rgba(239,68,68,0.08)" : "rgba(46,204,113,0.08)", border: uncoveredAmount > 0 ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(46,204,113,0.18)" }}>
              <p className="text-xs font-bold leading-relaxed" style={{ color: uncoveredAmount > 0 ? "#FCA5A5" : "var(--green-primary)" }}>
                {formatCurrencyRounded(Math.min(cleanAmount, safeJarBalance))} from this jar · {formatCurrencyRounded(coveredFromUnassigned)} from Skip Bucks{uncoveredAmount > 0 ? ` · ${formatCurrencyRounded(uncoveredAmount)} not from skipped savings` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCoverageConfirm}
              disabled={!canContinue}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "var(--green-primary)", color: "#0B1A14" }}
            >
              {project.donationURL && mode !== "log" ? "Continue to donation page" : "Continue"}
            </button>
          </div>
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
              {project.donationURL ? "Take me to the donation page" : "Continue to log donation"}
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
              disabled={!canContinue || coveredAmount <= 0 || saving}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "var(--green-primary)", color: "#0B1A14" }}
            >
              {saving ? "Logging..." : `Log ${formatCurrencyRounded(coveredAmount)} from skips`}
            </button>
            <button
              type="button"
              onClick={() => setStep("amount")}
              className="w-full py-2 text-sm font-black"
              style={{ color: "var(--green-primary)" }}
            >
              Change amount
            </button>
            <button
              type="button"
              onClick={handleCloseWithoutLogging}
              className="w-full py-1 text-sm font-black"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel, don&apos;t log
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
  jarBalance,
  onClose,
  onComplete,
}: {
  goal: SpendingGoal;
  availableFromSkips: number;
  jarBalance: number;
  onClose: () => void;
  onComplete: (amount: number) => Promise<boolean>;
}) {
  const dialogRef = useModalA11y(onClose);
  const safeJarBalance = Math.max(0, jarBalance);
  const [amount, setAmount] = useState(() => {
    const defaultAmount = Math.round(safeJarBalance * 100) / 100;
    return defaultAmount > 0 ? defaultAmount.toString() : "0";
  });
  const [step, setStep] = useState<"amount" | "coverage" | "ready" | "confirm">("amount");
  const [saving, setSaving] = useState(false);
  const parsedAmount = Number.parseFloat(amount);
  const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const canContinue = cleanAmount > 0;
  const totalAvailable = Math.max(0, availableFromSkips);
  const amountOverAvailable = cleanAmount > totalAvailable;
  const coveredAmount = Math.min(cleanAmount, Math.max(0, availableFromSkips));
  const uncoveredAmount = Math.max(0, cleanAmount - Math.max(0, availableFromSkips));
  const extraFromUnassigned = Math.max(0, cleanAmount - safeJarBalance);
  const coveredFromUnassigned = Math.min(extraFromUnassigned, Math.max(0, availableFromSkips - safeJarBalance));
  function handleAmountSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canContinue) return;
    if (cleanAmount > safeJarBalance) {
      setStep("coverage");
      return;
    }
    handlePurchaseStep();
  }

  function handleCoverageConfirm() {
    if (!canContinue) return;
    handlePurchaseStep();
  }

  function handlePurchaseStep() {
    if (!canContinue) return;
    if (goal.shoppingLink) {
      window.open(goal.shoppingLink, "_blank", "noopener,noreferrer");
    }
    setStep("confirm");
  }

  async function handleCompleted() {
    if (!canContinue || coveredAmount <= 0) return;
    setSaving(true);
    const ok = await onComplete(coveredAmount);
    setSaving(false);
    if (!ok) return;
    toast.success("Goal spend logged from your skipped savings.");
    onClose();
  }

  function handleCloseWithoutLogging() {
    toast.info("No purchase logged. Your jar balance remains the same.");
    onClose();
  }

  const handleModalClose = step === "confirm" ? handleCloseWithoutLogging : onClose;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
      onClick={handleModalClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-spend-title"
        tabIndex={-1}
        className="iskip-pop-in max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl p-6 shadow-2xl relative"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={handleModalClose}
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
              : `Buy ${goal.label}`}
        </p>
        {step !== "amount" && <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
          {step === "confirm"
            ? goal.shoppingLink
              ? "When you come back, confirm the purchase so your skipped savings and goal progress stay accurate."
              : "No purchase link is attached to this reward yet. Please make the purchase wherever you planned to, then log it here once complete."
            : step === "coverage"
              ? uncoveredAmount > 0
                ? `You are planning to spend ${formatCurrencyRounded(cleanAmount)}, which is more than you saved for this reward. ${formatCurrencyRounded(coveredFromUnassigned)} will be covered by Skip Bucks. The remaining ${formatCurrencyRounded(uncoveredAmount)} will not come from skipped savings.`
                : `You are planning to spend ${formatCurrencyRounded(cleanAmount)}, which is more than you saved for this reward. Your Skip Bucks can cover the extra ${formatCurrencyRounded(coveredFromUnassigned)}.`
            : step === "ready"
              ? goal.shoppingLink
                ? `${formatCurrencyRounded(coveredAmount)} is ready from your skipped savings for ${goal.label}.`
                : `${formatCurrencyRounded(coveredAmount)} is ready from your skipped savings. No purchase link is attached to this reward yet. Please buy it wherever you planned to, then log it here so your saved balance stays accurate.`
              : "Enter the purchase amount. It is prefilled with this jar's saved balance."}
        </p>}

        {step === "amount" && (
          <>
          <div className="mt-5 rounded-xl p-4" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)" }}>
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Step 1</p>
            <p className="mt-1 text-sm font-black" style={{ color: "var(--text-primary)" }}>Buy {goal.label}</p>
            {goal.shoppingLink ? (
              <a href={goal.shoppingLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl py-3 text-sm font-black" style={{ background: "#8B5CF6", color: "white", textDecoration: "none" }}>
                Open purchase page
              </a>
            ) : (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Buy where intended, then log it here.</p>
            )}
            <p className="mt-3 text-[10px] font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
              iSkipped does not process, verify, or manage outside purchases.
            </p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Step 2</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>After buying, log the amount here.</p>
          </div>
          <form className="mt-3 rounded-xl p-4" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }} onSubmit={(event) => { event.preventDefault(); void handleCompleted(); }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Jar amount</p>
              <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{formatCurrencyRounded(safeJarBalance)} in jar</p>
            </div>
            <label className="sr-only" htmlFor="goal-spend-amount">Spend amount</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#A78BFA", fontSize: 26, fontWeight: 900 }}>$</span>
              <input
                id="goal-spend-amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: "2px solid #A78BFA", color: "var(--text-primary)", fontSize: 28, fontWeight: 900, outline: "none" }}
              />
            </div>
            <button type="submit" className="sr-only">Continue</button>
          </form>
          {cleanAmount > 0 && (
            <div className="mt-3 rounded-xl p-3 text-xs font-bold leading-relaxed" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)", color: "var(--text-secondary)" }}>
              <p>{formatCurrencyRounded(Math.min(cleanAmount, safeJarBalance))} will come from this jar.</p>
              {coveredFromUnassigned > 0 && <p>{formatCurrencyRounded(coveredFromUnassigned)} will come from Skip Bucks.</p>}
              {uncoveredAmount > 0 && <p className="mt-1" style={{ color: "#F59E0B" }}>The remaining {formatCurrencyRounded(uncoveredAmount)} is outside iSkipped and will not be covered by saved skips.</p>}
            </div>
          )}
          </>
        )}

        {step === "amount" ? (
          <button
            type="button"
            onClick={handleCompleted}
            disabled={!canContinue || saving}
            className="mt-5 w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
            style={{ background: "#A78BFA", color: "#0B1A14" }}
          >
            {saving ? "Logging..." : "Log purchase"}
          </button>
        ) : step === "coverage" ? (
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl p-3" style={{ background: uncoveredAmount > 0 ? "rgba(239,68,68,0.08)" : "rgba(139,92,246,0.1)", border: uncoveredAmount > 0 ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(167,139,250,0.2)" }}>
              <p className="text-xs font-bold leading-relaxed" style={{ color: uncoveredAmount > 0 ? "#FCA5A5" : "#C4B5FD" }}>
                {formatCurrencyRounded(Math.min(cleanAmount, safeJarBalance))} from this jar · {formatCurrencyRounded(coveredFromUnassigned)} from Skip Bucks{uncoveredAmount > 0 ? ` · ${formatCurrencyRounded(uncoveredAmount)} not from skipped savings` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCoverageConfirm}
              disabled={!canContinue}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "#A78BFA", color: "#0B1A14" }}
            >
              {goal.shoppingLink ? "Continue to purchase page" : "Continue"}
            </button>
          </div>
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
              {goal.shoppingLink ? "Take me to the purchase page" : "Continue to log purchase"}
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
              disabled={!canContinue || coveredAmount <= 0 || saving}
              className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: "#A78BFA", color: "#0B1A14" }}
            >
              {saving ? "Logging..." : `Log ${formatCurrencyRounded(coveredAmount)} from skips`}
            </button>
            <button
              type="button"
              onClick={() => setStep("amount")}
              className="w-full py-2 text-sm font-black"
              style={{ color: "#C4B5FD" }}
            >
              Change amount
            </button>
            <button
              type="button"
              onClick={handleCloseWithoutLogging}
              className="w-full py-1 text-sm font-black"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel, don&apos;t log
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
  const { recentSkips, donate, donations: donationHistory } = useSkips();
  const { projects, loading: projectsLoading } = useProjects();
  const { showSkipPicker, setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);
  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);
  const [activeChallengeFeed, setActiveChallengeFeed] = useState<FeedItem[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [liveFeedIndex, setLiveFeedIndex] = useState(0);
  const [liveChallengeTotalRaised, setLiveChallengeTotalRaised] = useState<number>(0);
  const [liveChallengeTotalDonated, setLiveChallengeTotalDonated] = useState<number>(0);
  const [liveChallengeTotalsLoading, setLiveChallengeTotalsLoading] = useState(false);
  const [liveChallengeContributorCount, setLiveChallengeContributorCount] = useState<number>(0);
  const [liveChallengeTotalSkips, setLiveChallengeTotalSkips] = useState<number>(0);
  const [challengeTotalsRefreshKey, setChallengeTotalsRefreshKey] = useState(0);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionMode, setContributionMode] = useState<"contribute" | "log">("contribute");
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showRewardEditor, setShowRewardEditor] = useState(false);
  const [rewardEditLabel, setRewardEditLabel] = useState("");
  const [rewardEditGoal, setRewardEditGoal] = useState("");
  const [rewardEditCategory, setRewardEditCategory] = useState("");
  const [rewardEditLink, setRewardEditLink] = useState("");
  const [rewardEditMerchant, setRewardEditMerchant] = useState("");
  const [rewardEditImageURL, setRewardEditImageURL] = useState("");
  const [rewardEditWorking, setRewardEditWorking] = useState(false);
  const [jarCarouselIndex, setJarCarouselIndex] = useState(0);
  const jarCarouselSwipe = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const suppressCarouselClick = useRef(false);
  const [homeFundingTarget, setHomeFundingTarget] = useState<SkipAllocationTarget | null>(null);
  const [homeFundingAmountStr, setHomeFundingAmountStr] = useState("");
  const [homeFundingWorking, setHomeFundingWorking] = useState(false);
  const [homeFundraiserSetup, setHomeFundraiserSetup] = useState<Project | null>(null);
  const [homeFundraiserGoalStr, setHomeFundraiserGoalStr] = useState("");
  const [homeFundraiserWorking, setHomeFundraiserWorking] = useState(false);
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
    if (!active) {
      setActiveChallengeFeed([]);
      return;
    }
    return subscribeToChallengeFeed(activeProjectId, setActiveChallengeFeed);
  }, [profile?.activeProjectId, projects, challengeTotalsRefreshKey]);

  useEffect(() => {
    const unsubscribe = subscribeToGlobalStats(setGlobalStats);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const active = projects.find((project) => project.id === profile?.activeProjectId) ?? null;
    const challengeItems = active
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
    if (!activeProjectId) { setLiveChallengeTotalsLoading(false); setLiveChallengeTotalRaised(0); setLiveChallengeTotalDonated(0); setLiveChallengeContributorCount(0); setLiveChallengeTotalSkips(0); return; }
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) { setLiveChallengeTotalsLoading(false); setLiveChallengeTotalRaised(0); setLiveChallengeTotalDonated(0); setLiveChallengeContributorCount(0); setLiveChallengeTotalSkips(0); return; }
    // Wait for the live group total before evaluating the donation reminder.
    // This prevents the initial $0 placeholder from briefly opening a prompt
    // that disappears when the real total arrives.
    setLiveChallengeTotalsLoading(true);
    setLiveChallengeTotalRaised(0);
    setLiveChallengeTotalDonated(0);
    const syncProjectTotals = (project: Project | null) => {
      setLiveChallengeContributorCount(project?.memberUids?.length ?? 0);
      setLiveChallengeTotalSkips(project?.totalSkips ?? 0);
    };
    syncProjectTotals(proj);
    let cancelled = false;
    void apiRequest<{ total: number; totalPledged: number; totalDonated: number }>(`/api/challenges/${activeProjectId}/totals`, "GET")
      .then((totals) => {
        if (!cancelled) {
          setLiveChallengeTotalRaised(Math.max(0, totals.total));
          setLiveChallengeTotalDonated(Math.max(0, totals.totalDonated));
          setLiveChallengeTotalsLoading(false);
        }
      })
      .catch(() => {
        // The live project snapshot remains a useful fallback if reconciliation
        // is temporarily unavailable.
        if (!cancelled) setLiveChallengeTotalsLoading(false);
      });
    const unsubscribe = subscribeToProject(activeProjectId, (p) => {
      syncProjectTotals(p);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile?.activeProjectId, projects]);

  if (!profile) return null;
  const profileData = profile;

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeSkipTarget = profile.activeSkipTarget === undefined
    ? (activeSpendingGoalId ? { type: "goal" as const, id: activeSpendingGoalId } : null)
      ?? (profile.activeProjectId ? { type: "fundraiser" as const, id: profile.activeProjectId } : null)
    : profile.activeSkipTarget;
  const activeGoal = activeSkipTarget?.type === "goal"
    ? spendingGoals.find((g) => g.id === activeSkipTarget.id) ?? null
    : null;
  const activeGoalImageURL = activeGoal
    ? activeGoal.imageURL || rewardDefaultImage(activeGoal.label, activeGoal.category)
    : null;
  const activeProject = activeSkipTarget?.type === "fundraiser"
    ? projects.find((p) => p.id === activeSkipTarget.id) ?? null
    : null;
  const skipBalance = getSkipBalanceSummary(profile);

  // A jar is a view of this account's unspent Skip Bucks. Older/stale jar
  // fields must never make a personal jar exceed the account-wide balance.
  const givingBalance = activeProject
    ? Math.min(
        Math.max(0, profile.causeJarBalances?.[activeProject.id] ?? 0),
        skipBalance.availableFromSkips,
      )
    : 0;
  const spendingBalance = activeGoal ? Math.max(0, profile.goalJarBalances?.[activeGoal.id] ?? 0) : 0;


  const isActiveChallenge = activeProject ? (isChallengeProject(activeProject) || !activeProject.isCustom) : false;
  // Every fundraiser is a shared group target, including custom fundraisers
  // created from /jars. Challenge type only controls challenge-specific UI.
  const isActiveGroupFundraiser = Boolean(activeProject);
  // Per-challenge balance: what the user has pledged specifically to their active challenge
  const userChallengeBalance = isActiveGroupFundraiser && activeProject
    ? Math.max(0, profile.causeJarBalances?.[activeProject.id] ?? 0)
    : 0;
  const challengeContribution = userChallengeBalance;
  const fundraiserDonatedTotal = isActiveGroupFundraiser ? liveChallengeTotalDonated : 0;
  // Group total is the sum of every member's fundraiser jar plus every
  // donation already logged for the fundraiser. `totalRaised` is maintained
  // on the project from all member jar transactions; it is not this user's
  // personal balance.
  const displayedGroupTotal = isActiveGroupFundraiser
    ? Math.max(0, liveChallengeTotalRaised)
    : 0;
  const groupContributorCount = isActiveGroupFundraiser ? liveChallengeContributorCount : 0;
  const fundraiserParticipantCopy = groupContributorCount > 1
    ? `${groupContributorCount} people are skipping.`
    : "You're the first one skipping.";
  const communityGoal = activeProject && isActiveGroupFundraiser ? getCommunityGoal(activeProject) : 0;
  const fundraiserUnitCost = activeProject?.unitCost && activeProject.unitCost > 0 ? activeProject.unitCost : null;
  const temporaryChallengeGoalUnits = activeProject && isActiveChallenge && fundraiserUnitCost && activeProject.goalAmount <= 0 ? 10 : null;
  const fundraiserGoalAmount = activeProject && activeProject.goalAmount > 0
    ? activeProject.goalAmount
    : temporaryChallengeGoalUnits && fundraiserUnitCost
      ? temporaryChallengeGoalUnits * fundraiserUnitCost
      : communityGoal;
  const groupGoalReached = fundraiserGoalAmount > 0 && displayedGroupTotal >= fundraiserGoalAmount;
  const groupGoalRemainingAmount = Math.max(0, fundraiserGoalAmount - displayedGroupTotal);
  const skipEstimateCategories = [
    { key: "coffee", label: "coffees", icon: "☕", amount: SKIP_CATEGORIES.find((category) => category.id === "coffee")?.defaultAmount ?? 5.5 },
    { key: "food", label: "takeouts", icon: "🍔", amount: SKIP_CATEGORIES.find((category) => category.id === "food")?.defaultAmount ?? 15 },
    { key: "night-out", label: "nights out", icon: "🎟️", amount: SKIP_CATEGORIES.find((category) => category.id === "streaming")?.defaultAmount ?? 50 },
  ];
  const groupGoalSkipEstimates = skipEstimateCategories.map((category) => {
    // Fundraiser estimates use their own prices; reward estimates stay unchanged.
    const amount = category.key === "coffee" ? 6 : category.key === "food" ? 20 : 50;
    return { ...category, amount, count: Math.max(1, Math.ceil(groupGoalRemainingAmount / amount)) };
  });
  const fundraiserGoalUnits = fundraiserUnitCost && fundraiserGoalAmount > 0
    ? fundraiserGoalAmount / fundraiserUnitCost
    : null;
  const fundraiserUnitLabel = activeProject?.unitDisplay ?? activeProject?.unitName ?? "units";
  const fundraiserUnitLabelSingular = activeProject?.unitName ?? (fundraiserUnitLabel.replace(/s$/, "") || "unit");
  const fundraiserPersonalUnitPotential = activeProject?.unitCost
    ? formatCommunityUnitCount(givingBalance + skipBalance.unassignedSkipBank, activeProject.unitCost, activeProject.unitIsGoal)
    : null;
  const personalGoal = profile.causeGoalAmounts?.[activeProject?.id ?? ""]
    ?? (!isActiveChallenge ? activeProject?.goalAmount ?? 0 : 0);
  const hasPersonalGivingGoal = personalGoal > 0;
  const challengeDonationHistoryTotal = activeProject && isActiveGroupFundraiser
    ? donationHistory
        .filter((donation) => donation.causeId === activeProject.id)
        .reduce((sum, donation) => sum + Math.max(0, donation.amount), 0)
    : 0;
  const challengeDonated = activeProject && isActiveGroupFundraiser
    ? Math.max(challengeDonationHistoryTotal, profile.causeStats?.[activeProject.id]?.donated ?? 0)
    : 0;
  const personalGoalProgress = getPersonalFundraiserGoalProgress(personalGoal, challengeDonated);
  const challengeDonatedTowardGoal = personalGoalProgress.donatedTowardGoal;
  const personalGoalRemaining = personalGoalProgress.remainingGoal ?? 0;
  const personalFundraiserPercent = personalGoalRemaining > 0
    ? Math.min(100, Math.round((givingBalance / personalGoalRemaining) * 100))
    : 0;
  const groupFundraiserPercent = fundraiserGoalAmount > 0
    ? Math.min(100, Math.round((displayedGroupTotal / fundraiserGoalAmount) * 100))
    : 0;
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
    : "/jars?tab=cause";
  const destinationLabel = "Fundraiser Jar";
  const destinationEmptyLabel = "Join a challenge →";
  const challengeSkips = activeProject && isActiveGroupFundraiser
    ? recentSkips.filter((skip) => skip.projectId === activeProject.id)
    : [];
  const ownChallengeFeedItems: FeedItem[] = challengeSkips.filter(isSharedFundraiserSkip).map((skip) => ({
    id: `local-${skip.id}`,
    uid: skip.uid,
    displayName: profile.displayName || "You",
    photoURL: profile.photoURL,
    type: "skip",
    skipId: skip.id,
    skipAmount: skip.amount,
    skipCategory: skip.categoryLabel,
    skipEmoji: skip.categoryEmoji,
    projectId: skip.projectId,
    projectTitle: skip.projectTitle ?? activeProject?.title,
    projectLocation: activeProject?.location ?? null,
    skipLabel: skip.whatSkipped || skip.categoryLabel,
    message: `skipped ${skip.whatSkipped || skip.categoryLabel}`,
    createdAt: skip.createdAt,
  }));
  const hasSkippedThisWeek = isSameWeek(profile.lastSkipDate) || recentSkips.some((skip) => isSameWeek(skip.date));
  const hasActiveChallengeSkipThisWeek = challengeSkips.some((skip) => isSameWeek(skip.date));
  const hasCommunityUnit = !!(activeProject?.unitCost && activeProject.unitCost > 0);
  const personalUnitCountDisplay = hasCommunityUnit && activeProject
    ? formatCommunityUnitCount(givingBalance, activeProject.unitCost ?? 0, activeProject.unitIsGoal)
    : null;
  const communityUnitCountDisplay = hasCommunityUnit && activeProject
    ? formatCommunityUnitCount(displayedGroupTotal, activeProject.unitCost ?? 0, activeProject.unitIsGoal)
    : null;
  const communityUnitCount = activeProject?.unitCost ? displayedGroupTotal / activeProject.unitCost : 0;
  const communityUnitLabel = activeProject?.unitIsGoal && communityUnitCount > 0 && communityUnitCount < 1 && activeProject.unitName
    ? `of ${oneUnitPhrase(activeProject.unitName)}`
    : activeProject?.unitDisplay || activeProject?.unitName || "units";
  const communityUnitSuffix = activeProject?.unitIsGoal && communityUnitCount > 0 && communityUnitCount < 1 ? "" : " Funded";
  const challengeFeedAllItems = activeProject && isActiveGroupFundraiser
    ? [...ownChallengeFeedItems, ...activeChallengeFeed.filter((item) => !challengeSkips.some((skip) => skip.id === item.skipId))]
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    : [];
  const challengeFeedItems = challengeFeedAllItems.slice(0, 3);
  const featuredChallengeFeedItem = challengeFeedItems[0] ?? null;
  const challengeSkippedAmount = challengeFeedAllItems.reduce((sum, item) => sum + Math.max(0, item.skipAmount ?? 0), 0);
  const challengeSkippedUnitPotential = activeProject?.unitCost
    ? formatCommunityUnitCount(challengeSkippedAmount, activeProject.unitCost, activeProject.unitIsGoal)
    : null;
  const challengeCommunitySkipCount = challengeFeedItems.length > 0 ? challengeFeedItems.length : challengeSkips.length;
  const liveFundraiserSkipCount = Math.max(liveChallengeTotalSkips, challengeCommunitySkipCount);
  const todaySkipCount = activeProject && isActiveGroupFundraiser
    ? activeChallengeFeed.filter((item) => item.createdAt?.toDate?.()?.toDateString() === new Date().toDateString()).length
    : 0;
  const groupSkipsThisWeek = activeProject && isActiveGroupFundraiser
    ? challengeFeedAllItems.filter((item) => item.createdAt?.toDate && isSameWeek(item.createdAt.toDate().toISOString().split("T")[0])).length
    : 0;
  const socialFeedItems = activeProject && isActiveGroupFundraiser
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
    ? Math.min(100, (spendingBalance / activeGoal.targetAmount) * 100)
    : 0;
  const goalCoveredAmount = activeGoal ? Math.min(spendingBalance, activeGoal.targetAmount) : 0;
  const goalRemainingAmount = activeGoal ? Math.max(0, activeGoal.targetAmount - spendingBalance) : 0;
  const rewardGoalReached = Boolean(activeGoal) && goalRemainingAmount <= 0;
  const rewardGoalSkipEstimates = skipEstimateCategories.map((category) => ({
    ...category,
    count: Math.max(1, Math.ceil(goalRemainingAmount / category.amount)),
  }));
  const displayedStreak = getConsecutiveWeeklyStreak(recentSkips.map((skip) => skip.date));
  const streakChipValue = hasSkippedThisWeek ? Math.max(displayedStreak, profile.streak ?? 0) : profile.streak ?? 0;
  const activeCountdown = activeProject && isActiveChallenge ? getChallengeCountdown(activeProject) : null;
  const personalGoalReached = hasPersonalGivingGoal
    && personalGoalRemaining > 0
    && userChallengeBalance >= personalGoalRemaining;
  const challengeEnded = activeProject?.status === "ended";
  const hasReminderReadyBalance = Boolean(activeProject) && givingBalance >= DONATION_REMINDER_MIN_BALANCE;
  const readyToDonateText = activeProject
    ? `You have ${formatCurrency(givingBalance)} saved for ${activeProject.groupName ?? activeProject.title}.`
    : "";
  const donationReminderPrompt: DonationReminderPrompt | null = (() => {
    if (!activeProject || !hasReminderReadyBalance || liveChallengeTotalsLoading) return null;
    if (challengeEnded) {
      return {
        kind: "challenge-ended",
        eyebrow: "Donation reminder",
        title: "This fundraiser ended. Your saved skips are ready.",
        body: `${readyToDonateText} Donating outside iSkipped helps the fundraiser actually receive the money.`,
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
        title: "Your group hit the goal.",
        body: `${readyToDonateText} This is a good moment to donate outside iSkipped and turn the group's progress into real support.`,
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
        title: "You hit your fundraiser jar goal.",
        body: `${readyToDonateText} This is a good moment to donate outside iSkipped or keep the balance parked for later.`,
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
      if (id === profile.activeProjectId || !(Math.max(0, bal) > 0)) return false;
      const proj = projects.find((p) => p.id === id);
      if (!proj) return false;
      const endMs = proj.endDate?.toMillis?.();
      return isChallengeProject(proj) && endMs != null && endMs < Date.now();
    })
    .map(([id, bal]) => ({ id, balance: Math.max(0, bal as number), project: projects.find((p) => p.id === id) ?? null }));

  const firstName = profile.displayName.split(" ")[0];
  const starterJarRewards = [
    { id: "concert-tickets", label: "Concert Tickets", amount: 180, category: "Experience" },
    { id: "flight-abroad", label: "Flight Abroad", amount: 900, category: "Travel" },
    { id: "spa-day", label: "Spa Day", amount: 150, category: "Self-care" },
  ];
  const starterJarRewardKey = (label: string, amount: number) => `${label.trim().toLowerCase()}-${amount}`;
  const starterJarRewardKeys = new Set(starterJarRewards.map((reward) => starterJarRewardKey(reward.label, reward.amount)));
  const jarCarouselFundraisers = projects
    .filter((project) => !isProjectEnded(project));
  const savedJarRewards = spendingGoals.map((goal) => ({
    id: goal.id,
    label: goal.label,
    amount: goal.targetAmount,
    category: goal.category ?? "Reward",
    imageURL: goal.imageURL || rewardDefaultImage(goal.label, goal.category),
    imagePosition: goal.imagePosition ?? "center",
    isSaved: true,
  }));
  const savedJarRewardKeys = new Set(savedJarRewards.map((reward) => starterJarRewardKey(reward.label, reward.amount)));
  const starterJarRewardSuggestions = starterJarRewards
    .filter((reward) => !savedJarRewardKeys.has(starterJarRewardKey(reward.label, reward.amount)))
    .map((reward) => ({
      ...reward,
      imageURL: rewardDefaultImage(reward.label, reward.category),
      imagePosition: "center",
      isSaved: false,
    }));
  const jarCarouselRewards = [...savedJarRewards, ...starterJarRewardSuggestions];
  type JarCarouselItem =
    | { kind: "reward"; reward: (typeof jarCarouselRewards)[number] }
    | { kind: "cause"; project: Project }
    | { kind: "createReward" };
  const jarCarouselItems: JarCarouselItem[] = Array.from({ length: Math.max(jarCarouselRewards.length, jarCarouselFundraisers.length) }).flatMap((_, index) => {
    const items: JarCarouselItem[] = [];
    const reward = jarCarouselRewards[index];
    const project = jarCarouselFundraisers[index];
    if (reward) items.push({ kind: "reward" as const, reward });
    if (project) items.push({ kind: "cause" as const, project });
    return items;
  });
  jarCarouselItems.push({ kind: "createReward" });
  const activeJarCarouselIndex = jarCarouselItems.length > 0
    ? jarCarouselIndex % jarCarouselItems.length
    : 0;
  const activeJarCarouselItem = jarCarouselItems[activeJarCarouselIndex] ?? null;

  function moveJarCarousel(direction: 1 | -1) {
    if (jarCarouselItems.length < 2) return;
    setJarCarouselIndex((current) => (current + direction + jarCarouselItems.length) % jarCarouselItems.length);
  }

  function handleJarCarouselPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (jarCarouselItems.length < 2 || event.pointerType === "mouse") return;
    jarCarouselSwipe.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    suppressCarouselClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleJarCarouselPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = jarCarouselSwipe.current;
    if (!start || start.pointerId !== event.pointerId) return;
    jarCarouselSwipe.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 46 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;

    suppressCarouselClick.current = true;
    moveJarCarousel(deltaX < 0 ? 1 : -1);
    window.setTimeout(() => {
      suppressCarouselClick.current = false;
    }, 0);
  }

  function handleJarCarouselClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!suppressCarouselClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  useEffect(() => {
    if (projectsLoading || activeGoal || activeProject || jarCarouselItems.length < 2) return;
    const id = window.setInterval(() => {
      setJarCarouselIndex((current) => (current + 1) % jarCarouselItems.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [activeGoal, activeProject, jarCarouselItems.length, projectsLoading]);

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 20,
    padding: 24,
  };
  const showLegacyHomeSocial: boolean = false;

  const rowDivider = "1px solid var(--border-default)";

  const availableHomeSkipBankBalance = skipBalance.unassignedSkipBank;
  const homeFundraiserGoalAmountPreview = parseFloat(homeFundraiserGoalStr) || 0;
  const homeFundraiserGoalUnitPreview = homeFundraiserSetup?.unitCost && homeFundraiserGoalAmountPreview > 0
    ? formatAggregateImpactUnitsDecimal(
        homeFundraiserGoalAmountPreview,
        homeFundraiserSetup.unitCost,
        homeFundraiserSetup.unitName ?? homeFundraiserSetup.unitDisplay ?? "unit",
        homeFundraiserSetup.unitDisplay,
        homeFundraiserSetup.unitIsGoal,
      )
    : null;

  function homeFundingPromptLabel(target: SkipAllocationTarget | null) {
    if (target?.type === "goal") {
      return spendingGoals.find((goal) => goal.id === target.id)?.label ?? "this reward";
    }
    if (target?.type === "fundraiser") {
      return projects.find((project) => project.id === target.id)?.groupName
        ?? projects.find((project) => project.id === target.id)?.title
        ?? "this fundraiser";
    }
    return "this jar";
  }

  function homeFundingGoalAmount(target: SkipAllocationTarget | null) {
    if (target?.type === "goal") {
      return spendingGoals.find((goal) => goal.id === target.id)?.targetAmount ?? null;
    }
    if (target?.type === "fundraiser") {
      return profileData.causeGoalAmounts?.[target.id]
        ?? projects.find((project) => project.id === target.id)?.goalAmount
        ?? null;
    }
    return null;
  }

  function homeFundingPreview(target: SkipAllocationTarget | null, amountStr: string) {
    const amount = parseFloat(amountStr);
    if (!target || !amount || amount <= 0) return null;
    const appliedAmount = Math.min(amount, availableHomeSkipBankBalance);
    if (target.type === "goal") {
      const goal = spendingGoals.find((candidate) => candidate.id === target.id);
      if (!goal?.targetAmount) return null;
      const currentBalance = Math.max(0, profileData.goalJarBalances?.[goal.id] ?? 0);
      const nextBalance = currentBalance + appliedAmount;
      const percent = Math.min(100, Math.round((nextBalance / goal.targetAmount) * 100));
      return `${formatCurrency(nextBalance)} in this jar - about ${percent}% of your ${formatCurrency(goal.targetAmount)} goal.`;
    }
    const project = projects.find((candidate) => candidate.id === target.id);
    const goalAmount = homeFundingGoalAmount(target);
    if (goalAmount && goalAmount > 0) {
      const currentBalance = Math.max(0, profileData.causeJarBalances?.[target.id] ?? 0);
      const nextBalance = currentBalance + appliedAmount;
      const percent = Math.min(100, Math.round((nextBalance / goalAmount) * 100));
      return `${formatCurrency(nextBalance)} in this jar - about ${percent}% of your ${formatCurrency(goalAmount)} goal.`;
    }
    if (project?.unitCost && project.unitCost > 0) {
      return `That is about ${formatAggregateImpactUnitsDecimal(
        appliedAmount,
        project.unitCost,
        project.unitName ?? project.unitDisplay ?? "unit",
        project.unitDisplay,
        project.unitIsGoal,
      )}.`;
    }
    return null;
  }

  async function handleHomeCarouselSkipFor(item: JarCarouselItem) {
    if (!user) return;

    if (item.kind === "createReward") {
      router.push("/jars?tab=live&add=reward");
      return;
    }

    if (item.kind === "cause") {
      setHomeFundraiserSetup(item.project);
      setHomeFundraiserGoalStr("");
      return;
    }

    if (!item.reward.isSaved) {
      const params = new URLSearchParams({
        tab: "live",
        add: "reward",
        skip: "1",
        label: item.reward.label,
        amount: String(item.reward.amount),
        category: item.reward.category,
      });
      router.push(`/jars?${params.toString()}`);
      return;
    }

    let targetGoalId = item.reward.id;
    const existingGoal = spendingGoals.find(
      (goal) => goal.id === item.reward.id || goal.label.trim().toLowerCase() === item.reward.label.trim().toLowerCase()
    );
    let nextGoals = spendingGoals;

    if (existingGoal) {
      targetGoalId = existingGoal.id;
    } else {
      const newGoal: SpendingGoal = {
        id: Date.now().toString(),
        label: item.reward.label,
        targetAmount: item.reward.amount,
        type: "splurge",
        category: item.reward.category,
        ...(item.reward.imageURL ? { imageURL: item.reward.imageURL } : {}),
        ...(item.reward.imagePosition ? { imagePosition: item.reward.imagePosition } : {}),
      };
      targetGoalId = newGoal.id;
      nextGoals = [...spendingGoals, newGoal];
      await updateSpendingGoals(user.uid, nextGoals, activeSpendingGoalId);
      updateProfile({ spendingGoals: nextGoals, spendingGoal: null });
    }

    setHomeFundingTarget({ type: "goal", id: targetGoalId });
    setHomeFundingAmountStr("");
  }

  async function confirmHomeFundraiserSetup() {
    if (!user || !homeFundraiserSetup) return;
    const target: SkipAllocationTarget = { type: "fundraiser", id: homeFundraiserSetup.id };
    const goalAmount = parseFloat(homeFundraiserGoalStr);
    if (!goalAmount || goalAmount <= 0) return;

    setHomeFundraiserWorking(true);
    try {
      await setUserCauseGoal(user.uid, homeFundraiserSetup.id, goalAmount);
      await pinProjectToHome(user.uid, homeFundraiserSetup.id);
      updateProfile({
        activeProjectId: homeFundraiserSetup.id,
        activeSkipTarget: target,
        joinedProjectIds: Array.from(new Set([...(profileData.joinedProjectIds ?? []), homeFundraiserSetup.id])),
        causeGoalAmounts: { ...(profileData.causeGoalAmounts ?? {}), [homeFundraiserSetup.id]: goalAmount },
      });
      setHomeFundraiserSetup(null);
      setHomeFundraiserGoalStr("");
      // A balance transfer is always an explicit choice; never carry a prior amount into this prompt.
      setHomeFundingAmountStr("");
      if (availableHomeSkipBankBalance > 0) {
        setHomeFundingTarget(target);
      }
    } catch (err) {
      console.error("home fundraiser setup failed", err);
      toast.error("Couldn't set that jar yet. Check your connection and try again.");
    } finally {
      setHomeFundraiserWorking(false);
    }
  }

  async function activateHomeFundingTarget(bankAmount = 0) {
    if (!user || !homeFundingTarget) return;
    if (bankAmount > availableHomeSkipBankBalance) {
      toast.error(`You only have ${formatCurrency(availableHomeSkipBankBalance)} in Skip Bucks.`);
      return;
    }

    setHomeFundingWorking(true);
    try {
      if (homeFundingTarget.type === "goal") {
        await Promise.all([
          updateSpendingGoals(user.uid, spendingGoals, homeFundingTarget.id),
          setActiveSkipTarget(user.uid, homeFundingTarget),
        ]);
        updateProfile({
          activeSkipTarget: homeFundingTarget,
          activeSpendingGoalId: homeFundingTarget.id,
          spendingGoals,
          spendingGoal: null,
        });
      } else {
        await pinProjectToHome(user.uid, homeFundingTarget.id);
        updateProfile({
          activeSkipTarget: homeFundingTarget,
          activeProjectId: homeFundingTarget.id,
          joinedProjectIds: Array.from(new Set([...(profileData.joinedProjectIds ?? []), homeFundingTarget.id])),
        });
      }

      const appliedAmount = bankAmount > 0
        ? await allocateSkipBankToJar(user.uid, homeFundingTarget, bankAmount)
        : 0;
      if (appliedAmount > 0) {
        if (homeFundingTarget.type === "goal") {
          updateProfile({
            activeSkipTarget: homeFundingTarget,
            activeSpendingGoalId: homeFundingTarget.id,
            goalJarBalances: {
              ...(profileData.goalJarBalances ?? {}),
              [homeFundingTarget.id]: Math.max(0, profileData.goalJarBalances?.[homeFundingTarget.id] ?? 0) + appliedAmount,
            },
          });
        } else {
          updateProfile({
            activeSkipTarget: homeFundingTarget,
            causeJarBalances: {
              ...(profileData.causeJarBalances ?? {}),
              [homeFundingTarget.id]: Math.max(0, profileData.causeJarBalances?.[homeFundingTarget.id] ?? 0) + appliedAmount,
            },
          });
        }
      toast.success(`${formatCurrency(appliedAmount)} moved from Skip Bucks into the jar.`);
      }
      setHomeFundingTarget(null);
      setHomeFundingAmountStr("");
    } catch (err) {
      console.error("home funding activation failed", err);
      toast.error("Couldn't activate this jar yet. Check your connection and try again.");
    } finally {
      setHomeFundingWorking(false);
    }
  }

  async function confirmHomeSkipBankFunding() {
    const amount = parseFloat(homeFundingAmountStr);
    if (!amount || amount <= 0) return;
    await activateHomeFundingTarget(amount);
  }

  function openRewardEditor() {
    if (!activeGoal) return;
    setRewardEditLabel(activeGoal.label);
    setRewardEditGoal(String(activeGoal.targetAmount));
    setRewardEditCategory(activeGoal.category ?? "");
    setRewardEditLink(activeGoal.shoppingLink ?? "");
    setRewardEditMerchant(activeGoal.merchant ?? "");
    setRewardEditImageURL(activeGoal.imageURL ?? "");
    setShowRewardEditor(true);
  }

  function handleRewardEditorImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const objectURL = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectURL);
      const maxWidth = 900;
      const scale = image.width > maxWidth ? maxWidth / image.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      setRewardEditImageURL(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => URL.revokeObjectURL(objectURL);
    image.src = objectURL;
  }

  async function saveRewardEditor() {
    if (!user || !activeGoal) return;

    const label = rewardEditLabel.trim();
    const targetAmount = Number(rewardEditGoal);
    if (!label) {
      toast.error("Give this reward a name.");
      return;
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      toast.error("Enter a goal greater than $0.");
      return;
    }

    const category = rewardEditCategory.trim();
    const shoppingLink = rewardEditLink.trim() ? normalizeExternalLink(rewardEditLink) : undefined;
    const merchant = rewardEditMerchant.trim() || undefined;
    const imageURL = rewardEditImageURL.trim() || undefined;
    const nextGoals = spendingGoals.map((goal) => {
      if (goal.id !== activeGoal.id) return goal;
      const nextGoal = {
        ...goal,
        label,
        targetAmount,
        category: category || undefined,
        shoppingLink,
        merchant,
        imageURL,
        imagePosition: imageURL ? goal.imagePosition : undefined,
      };
      return Object.fromEntries(
        Object.entries(nextGoal).filter(([, value]) => value !== undefined),
      ) as unknown as SpendingGoal;
    });

    setRewardEditWorking(true);
    try {
      await updateSpendingGoals(user.uid, nextGoals, activeSpendingGoalId);
      updateProfile({ spendingGoals: nextGoals, spendingGoal: null });
      setShowRewardEditor(false);
      toast.success("Reward updated.");
    } catch (err) {
      console.error("reward update failed", err);
      toast.error("Couldn't update this reward. Check your connection and try again.");
    } finally {
      setRewardEditWorking(false);
    }
  }

  function renderJarCarouselCard(item: JarCarouselItem) {
    if (item.kind === "createReward") {
      return (
        <button
          key="jar-carousel-create-reward"
          type="button"
          onClick={() => router.push("/jars?tab=live&add=reward")}
          className="home-jar-carousel-card"
          style={{ borderRadius: 18, padding: 0, textAlign: "left", background: "linear-gradient(180deg, rgba(139,92,246,0.18), rgba(13,19,23,0.92))", border: "1px solid rgba(139,92,246,0.34)", color: "var(--text-primary)", overflow: "hidden" }}
        >
          <div className="home-jar-carousel-media" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, rgba(76,29,149,0.85), rgba(46,204,113,0.22))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 82, height: 82, borderRadius: 24, background: "rgba(237,245,240,0.1)", border: "1px solid rgba(237,245,240,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#DDD6FE", fontSize: 48, fontWeight: 900, lineHeight: 1 }}>
              +
            </div>
            <span className="home-jar-carousel-badge" style={{ position: "absolute", left: 12, bottom: 12, borderRadius: 999, padding: "5px 10px", background: "rgba(139,92,246,0.92)", color: "white", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Custom reward
            </span>
          </div>
          <div className="home-jar-carousel-copy" style={{ padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
            <div>
              <p className="home-jar-carousel-title" style={{ fontSize: 24, fontWeight: 950, lineHeight: 1.05 }}>
                Create My Own Reward
              </p>
              <p className="home-jar-carousel-meta" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.35, marginTop: 7 }}>
                Add a goal, link, and inspo pic.
              </p>
            </div>
            <span className="home-jar-carousel-cta" style={{ fontSize: 12, fontWeight: 950, color: "#C4B5FD", textTransform: "uppercase", letterSpacing: 0.8 }}>+ Create</span>
          </div>
        </button>
      );
    }

    if (item.kind === "reward") {
      const rewardBalance = item.reward.isSaved ? Math.max(0, profileData.goalJarBalances?.[item.reward.id] ?? 0) : 0;
      const isStarterRewardIdea = starterJarRewardKeys.has(starterJarRewardKey(item.reward.label, item.reward.amount));
      return (
        <div
          key={`jar-carousel-reward-${item.reward.id}`}
          className="home-jar-carousel-card"
          style={{ borderRadius: 18, padding: 0, textAlign: "left", background: "linear-gradient(180deg, rgba(139,92,246,0.16), rgba(13,19,23,0.92))", border: "1px solid rgba(139,92,246,0.34)", color: "var(--text-primary)", overflow: "hidden" }}
        >
          <div className="home-jar-carousel-media" style={{ position: "relative", overflow: "hidden", background: "rgba(139,92,246,0.14)" }}>
            <img
              src={item.reward.imageURL ?? "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80"}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: item.reward.imagePosition }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, rgba(7,13,16,0.76))" }} />
            <span className="home-jar-carousel-badge" style={{ position: "absolute", left: 12, bottom: 12, borderRadius: 999, padding: "5px 10px", background: "rgba(139,92,246,0.92)", color: "white", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.7 }}>
              {isStarterRewardIdea ? "Reward idea" : "Your reward"}
            </span>
          </div>
          <div className="home-jar-carousel-copy" style={{ padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
            <div>
              <p className="home-jar-carousel-title" style={{ fontSize: 24, fontWeight: 950, lineHeight: 1.05 }}>
                {item.reward.label}
              </p>
              <p className="home-jar-carousel-meta" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.35, marginTop: 7 }}>
                Goal: {formatCurrencyRounded(item.reward.amount)} in jar
              </p>
              <p className="home-jar-carousel-detail" style={{ fontSize: 12, color: "#C4B5FD", lineHeight: 1.35, marginTop: 5, fontWeight: 850 }}>
                {rewardSkipEquivalentLine(rewardBalance, item.reward.amount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleHomeCarouselSkipFor(item)}
              className="home-jar-carousel-cta"
              style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: 950, color: "#C4B5FD", textTransform: "uppercase", letterSpacing: 0.8 }}
            >
              Skip for this
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`jar-carousel-cause-${item.project.id}`}
        className="home-jar-carousel-card"
        style={{ borderRadius: 18, padding: 0, textAlign: "left", background: "linear-gradient(180deg, rgba(46,204,113,0.15), rgba(13,19,23,0.92))", border: "1px solid rgba(46,204,113,0.3)", color: "var(--text-primary)", overflow: "hidden" }}
      >
        <button
          type="button"
          aria-label={`View details for ${item.project.groupName ?? item.project.title}`}
          onClick={() => router.push(`/challenges/${item.project.id}`)}
          className="home-jar-carousel-media"
          style={{ position: "relative", overflow: "hidden", background: "rgba(46,204,113,0.12)", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
        >
          {item.project.imageURL ? (
            <img
              src={item.project.imageURL}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: item.project.imagePosition ?? "center" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #064E3B, #2ECC71)" }} />
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, rgba(7,13,16,0.78))" }} />
          <span className="home-jar-carousel-badge" style={{ position: "absolute", left: 12, bottom: 12, borderRadius: 999, padding: "5px 10px", background: "rgba(46,204,113,0.92)", color: "#071B14", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.7 }}>
            Group Fundraiser
          </span>
        </button>
        <div className="home-jar-carousel-copy" style={{ padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
          <button
            type="button"
            onClick={() => router.push(`/challenges/${item.project.id}`)}
            style={{ border: "none", background: "transparent", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer" }}
          >
            <p className="home-jar-carousel-title" style={{ fontSize: 24, fontWeight: 950, lineHeight: 1.05, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {item.project.groupName ?? item.project.title}
            </p>
            <p className="home-jar-carousel-meta" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.35, marginTop: 7 }}>
              Goal: {formatCurrencyRounded(item.project.goalAmount ?? 0)} in jar
            </p>
            {item.project.unitCost && item.project.unitName && (
              <p className="home-jar-carousel-detail" style={{ fontSize: 12, color: "#A7F3D0", lineHeight: 1.35, marginTop: 5, fontWeight: 850 }}>
                {formatCurrency(item.project.unitCost)} = 1 {item.project.unitName}
              </p>
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleHomeCarouselSkipFor(item)}
            className="home-jar-carousel-cta"
            style={{ justifySelf: "start", border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontSize: 12, fontWeight: 950, color: "#A7F3D0", textTransform: "uppercase", letterSpacing: 0.8 }}
          >
            Skip for cause
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-8">
      {/* CTA */}
      <div style={{ textAlign: "left", marginBottom: 24 }}>
        <button
          onClick={() => setShowSkipPicker(true)}
          className="home-skip-cta w-full rounded-full py-4 text-lg font-black hover:scale-[1.02] active:scale-[0.97] transition-all duration-200"
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
      <div className="iskip-scoreboard" style={{ marginBottom: 32 }}>
        <div className="iskip-scoreboard-header" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span className="iskip-scoreboard-title">SKIP SCOREBOARD</span>
          <div className="home-scoreboard-skip-bucks hidden md:block" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>
            <SkipBucksBill
              amount={skipBalance.unassignedSkipBank}
              compact
              paused={showSkipPicker}
            />
          </div>
        </div>
        <div className="iskip-scoreboard-grid">
          <div className="iskip-scoreboard-stat">
            <p>You said iSkip</p>
            <strong><ScoreboardValue value={profile.totalSkips} suffix="times" paused={showSkipPicker} /></strong>
          </div>
          <div className="iskip-scoreboard-stat">
            <p>Lifetime savings</p>
            <strong><ScoreboardValue value={skipBalance.lifetimeSaved} format="currency" paused={showSkipPicker} /></strong>
          </div>
        </div>
      </div>

      {/* What it could become */}
      <div style={{ marginTop: 32, marginBottom: 28 }}>
        {!projectsLoading && !activeGoal && !activeProject && activeJarCarouselItem && (
          <div className="home-suggestion-card" style={{ ...cardStyle, padding: 18, overflow: "hidden", background: "linear-gradient(180deg, rgba(237,245,240,0.055), var(--bg-surface-1))", border: "1px solid rgba(237,245,240,0.11)", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <p className="home-suggestion-title" style={{ fontWeight: 950, color: "var(--text-primary)", lineHeight: 1.05 }}>
                  Need Motivation to Skip?
                </p>
                <p style={{ marginTop: 7, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  Pick a skipping jar and start saving for a purpose
                </p>
              </div>
            </div>

            <div
              className="home-jar-carousel-frame"
              onPointerDown={handleJarCarouselPointerDown}
              onPointerUp={handleJarCarouselPointerUp}
              onPointerCancel={() => { jarCarouselSwipe.current = null; }}
              onClickCapture={handleJarCarouselClickCapture}
              style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) 40px", alignItems: "center", gap: 10, marginTop: 22, touchAction: "pan-y" }}
            >
              <button
                type="button"
                aria-label="Previous jar suggestion"
                onClick={() => moveJarCarousel(-1)}
                className="home-jar-carousel-arrow"
                style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(237,245,240,0.06)", border: "1px solid rgba(237,245,240,0.11)", color: "var(--text-primary)", fontSize: 22, fontWeight: 900 }}
              >
                ‹
              </button>

              {renderJarCarouselCard(activeJarCarouselItem)}

              <button
                type="button"
                aria-label="Next jar suggestion"
                onClick={() => moveJarCarousel(1)}
                className="home-jar-carousel-arrow"
                style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(237,245,240,0.06)", border: "1px solid rgba(237,245,240,0.11)", color: "var(--text-primary)", fontSize: 22, fontWeight: 900 }}
              >
                ›
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginTop: 14 }}>
              <div />
              <div style={{ display: "flex", justifyContent: "center", gap: 7 }}>
                {jarCarouselItems.map((_, dot) => {
                  const itemIndex = dot;
                  return (
                    <button
                      key={`jar-carousel-dot-${dot}`}
                      type="button"
                      aria-label={`Show jar suggestion ${dot + 1}`}
                      onClick={() => setJarCarouselIndex(itemIndex)}
                      style={{ width: dot === activeJarCarouselIndex ? 22 : 7, height: 7, borderRadius: 999, background: dot === activeJarCarouselIndex ? "var(--gold-cta)" : "rgba(237,245,240,0.25)", border: "none", transition: "width 180ms ease" }}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => router.push(activeJarCarouselItem.kind === "cause" ? "/jars?tab=cause" : "/jars?tab=live")}
                style={{ justifySelf: "end", border: "none", background: "transparent", color: "var(--green-primary)", fontSize: 12, fontWeight: 950, padding: 0, cursor: "pointer" }}
              >
                See more →
              </button>
            </div>
          </div>
        )}
        {(activeGoal || activeProject) && (
        <div style={{ display: "grid", gridTemplateColumns: activeGoal || activeProject ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
          {!activeProject && (
          <div style={{ ...cardStyle, padding: 18, display: "flex", flexDirection: "column", minHeight: activeGoal ? 0 : 330, position: "relative" }}>
            {activeGoal ? (
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ minWidth: 0, display: "grid", gridTemplateColumns: activeGoalImageURL ? "72px minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
                  {activeGoalImageURL && (
                    <img
                      src={activeGoalImageURL}
                      alt={activeGoal.label}
                      style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", objectPosition: activeGoal.imagePosition ?? "center", border: "1px solid rgba(139,92,246,0.35)" }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: "#A78BFA" }}>{firstName}'s Reward Jar</p>
                    <p className="home-reward-title" style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.1, marginTop: 4 }}>
                      {activeGoal.label}
                    </p>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.3, marginTop: 4 }}>
                      {formatCurrencyRounded(activeGoal.targetAmount)} goal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openRewardEditor}
                  title="Edit reward"
                  aria-label={`Edit ${activeGoal.label}`}
                  style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(139,92,246,0.13)", border: "1px solid rgba(139,92,246,0.46)", color: "#C4B5FD", fontSize: 17, fontWeight: 900, lineHeight: 1, cursor: "pointer" }}
                >
                  &#9998;
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: "#A78BFA" }}>{firstName}'s Reward Jar</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 6 }}>
                  Pick something worth spending your skipped savings on.
                </p>
              </div>
            )}
            {activeGoal && (
              <>
              <div style={{ display: "flex", justifyContent: "center", marginTop: activeGoal ? -10 : 2, marginBottom: 8 }}>
                <Jar
                  fillPercent={spendingFillPct}
                  paused={showSkipPicker}
                  color="#8B5CF6"
                  gradEnd="#6D28D9"
                  label="Saved for this reward"
                  amount={formatCurrency(spendingBalance)}
                  emoji=""
                  goalAmount={undefined}
                  centerValueOverride={`${Math.round(spendingFillPct)}%`}
                  centerLabelOverride="to goal"
                  topLabel="Reward jar"
                  topLabelColor="#C4B5FD"
                  hideBottomLabel
                  href="/jar-activity"
                />
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
              style={{ width: activeGoal ? "auto" : "100%", alignSelf: activeGoal ? "center" : "stretch", minWidth: activeGoal ? 210 : undefined, borderRadius: activeGoal ? 999 : 12, padding: activeGoal ? "11px 28px" : "11px 12px", background: activeGoal ? "rgba(139,92,246,0.16)" : "rgba(237,245,240,0.06)", color: activeGoal ? "#C4B5FD" : "var(--text-primary)", border: activeGoal ? "1px solid rgba(139,92,246,0.42)" : "1px solid rgba(237,245,240,0.08)", fontSize: 13, fontWeight: 900, marginTop: activeGoal ? 0 : "auto" }}
            >
              {activeGoal ? "I'm Ready to Buy This" : "Choose a goal"}
            </button>
            {activeGoal && (
              <div className="home-reward-progress-panel">
                <div className="home-group-impact" style={{ borderRadius: 0, padding: "4px 0 0", background: "transparent", border: "none" }}>
                  <p style={{ fontSize: 16, fontWeight: 950, color: rewardGoalReached ? "#C4B5FD" : "var(--text-primary)" }}>
                    {rewardGoalReached ? "🎉 Goal reached!" : `Only ${formatCurrencyRounded(goalRemainingAmount)} to go`}
                  </p>
                  {rewardGoalReached ? (
                    <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: "var(--text-secondary)" }}>
                      Your skipped savings are ready to use.
                    </p>
                  ) : (
                    <>
                      <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: "var(--text-secondary)" }}>That&apos;s about:</p>
                      <div className="home-group-impact-items" style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                        {rewardGoalSkipEstimates.map((category) => (
                          <span key={category.key} className="home-group-impact-counter" style={{ color: "var(--text-primary)", fontWeight: 850 }}>
                            <span className="home-group-impact-counter-heading">
                              <span className="home-group-impact-counter-icon" aria-hidden="true">{category.icon}</span>
                              <span className="home-group-impact-counter-label">{category.label}</span>
                            </span>
                            <strong className="home-group-impact-counter-value" style={{ color: "#C4B5FD" }}>~{category.count}</strong>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {!activeGoal && (
          <div className="home-active-fundraiser" style={{ ...cardStyle, padding: 18, display: "flex", flexDirection: "column", minHeight: 330, overflow: "visible" }}>
              <div style={{ marginBottom: 6 }}>
                <div className="home-fundraiser-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div className={`home-fundraiser-identity${activeProject?.imageURL ? "" : " home-fundraiser-identity-no-image"}`} style={{ minWidth: 0, display: "grid", gridTemplateColumns: activeProject?.imageURL ? "72px minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
                    {activeProject?.imageURL && (
                      <div className="home-fundraiser-avatar">
                        <img
                          className="home-fundraiser-image"
                          src={activeProject.imageURL}
                          alt=""
                          style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", objectPosition: activeProject.imagePosition ?? "center", border: "1px solid rgba(237,245,240,0.12)" }}
                        />
                      </div>
                    )}
                    <div className="home-fundraiser-copy" style={{ minWidth: 0 }}>
                      <div className="home-fundraiser-meta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--green-primary)" }}>Group Fundraiser</p>
                        <span className="home-fundraiser-live" aria-label="Live fundraiser"><i />Live</span>
                      </div>
                      <p className="home-fundraiser-title" style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)", marginTop: 4 }}>
                        {activeProject?.title ?? "Pick a fundraiser"}
                      </p>
                      {activeProject && (
                        <p className="home-fundraiser-participants" style={{ marginTop: 5, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.35 }}>
                          {fundraiserParticipantCopy}
                        </p>
                      )}
                      {!activeProject && (
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 6 }}>
                          Find a cause where skipped savings can join a shared goal.
                        </p>
                      )}
                    </div>
                  </div>
                  {activeProject && (
                    <div className="home-fundraiser-share">
                      <span className="home-fundraiser-share-desktop"><ShareButton variant="pill" label="Share" title={activeProject.title} text={getDirectChallengeShareText(activeProject)} url={appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}${getChallengeSharePath(activeProject)}`, user?.uid)} /></span>
                      <span className="home-fundraiser-share-mobile"><ShareButton variant="pill" label="Share fundraiser" iconOnly title={activeProject.title} text={getDirectChallengeShareText(activeProject)} url={appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}${getChallengeSharePath(activeProject)}`, user?.uid)} /></span>
                    </div>
                  )}
                </div>
            </div>
            {activeProject ? (
              <>
              <div className="home-fundraiser-jars" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 4, alignItems: "end", width: "min(100%, 430px)", margin: "0 auto 14px" }}>
              <div>
                  <Jar
                    fillPercent={personalGoalRemaining > 0 ? Math.min(100, (givingBalance / personalGoalRemaining) * 100) : 0}
                    paused={showSkipPicker}
                    color="#2ECC71"
                    gradEnd="#1E9485"
                    label="Your goal"
                    amount={formatCurrency(givingBalance)}
                    emoji=""
                    causeLabel={activeProject.title}
                    centerValueOverride={hasPersonalGivingGoal && personalGoalRemaining <= 0 ? "✓" : `${personalFundraiserPercent}%`}
                    centerLabelOverride={hasPersonalGivingGoal
                      ? personalGoalRemaining > 0
                        ? "ready\nto donate"
                        : "goal reached"
                      : "to goal"}
                    topLabel={hasPersonalGivingGoal ? `Your ${formatCurrencyRounded(personalGoal)} goal` : "Your goal"}
                    topDetail={hasPersonalGivingGoal
                      ? `${formatCurrencyRounded(challengeDonatedTowardGoal)} donated · ${formatCurrencyRounded(personalGoalRemaining)} left`
                      : undefined}
                    topLabelColor="#A7F3D0"
                    hideBottomLabel
                    href="/jar-activity"
                  />
                  {hasCommunityUnit && personalUnitCountDisplay !== null && (
                    <p style={{ marginTop: 6, textAlign: "center", fontSize: 12, fontWeight: 900, color: "#A7F3D0", lineHeight: 1.25 }}>
                      ~ {personalUnitCountDisplay} {communityUnitLabel}
                    </p>
                  )}
                </div>
                <div>
                  <Jar
                    fillPercent={fundraiserGoalAmount > 0 ? Math.min(100, (displayedGroupTotal / fundraiserGoalAmount) * 100) : (displayedGroupTotal > 0 ? 18 : 0)}
                    paused={showSkipPicker}
                    color="#00F0D0"
                    gradEnd="#009C8B"
                    label="Fundraiser goal"
                    amount={formatCurrency(displayedGroupTotal)}
                    emoji=""
                    causeLabel={activeProject.title}
                    centerValueOverride={`${groupFundraiserPercent}%`}
                    centerLabelOverride="to goal"
                    topLabel={fundraiserGoalAmount > 0 ? `Fundraiser goal ${formatCurrencyRounded(fundraiserGoalAmount)}` : "Fundraiser goal"}
                    topLabelColor="#A7FFF0"
                    hideBottomLabel
                    href="/jar-activity"
                  />
                  {hasCommunityUnit && communityUnitCountDisplay !== null && (
                    <p style={{ marginTop: 6, textAlign: "center", fontSize: 12, fontWeight: 900, color: "#A7FFF0", lineHeight: 1.25 }}>
                      ~ {communityUnitCountDisplay} {communityUnitLabel}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 6, marginBottom: 14 }}>
                <button
                  onClick={() => {
                    if (activeProject) {
                      setContributionMode("contribute");
                      setShowContributionModal(true);
                      return;
                    }
                    router.push("/jars?tab=cause");
                  }}
                  style={{ borderRadius: 999, padding: "11px 28px", minWidth: 210, background: activeProject ? "#2ECC71" : "rgba(237,245,240,0.06)", color: activeProject ? "#071B14" : "var(--text-primary)", border: activeProject ? "1px solid #2ECC71" : "1px solid rgba(237,245,240,0.08)", fontSize: 13, fontWeight: 900 }}
                >
                  {activeProject ? "Donate Your Savings" : "Browse fundraisers"}
                </button>
              </div>
              {activeProject && (
                <div className="home-live-progress-panel">
                  <div className="home-group-impact" style={{ borderRadius: 0, padding: "4px 0 0", marginBottom: 10, background: "transparent", border: "none" }}>
                    <p style={{ fontSize: 16, fontWeight: 950, color: groupGoalReached ? "#A7FFF0" : "var(--text-primary)" }}>
                      {groupGoalReached ? "🎉 Group goal reached!" : `${formatCurrencyRounded(groupGoalRemainingAmount)} Until We Hit Our Group Goal`}
                    </p>
                    {groupGoalReached && (
                      <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: "var(--text-secondary)" }}>
                        Every skip helped the group get there.
                      </p>
                    )}
                    {!groupGoalReached && (
                      <div className="home-group-impact-items" style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                        {groupGoalSkipEstimates.map((category) => (
                          <span key={category.key} className="home-group-impact-counter" style={{ color: "var(--text-primary)", fontWeight: 850 }}>
                            <span className="home-group-impact-counter-heading">
                              <span className="home-group-impact-counter-icon" aria-hidden="true">{category.icon}</span>
                              <span className="home-group-impact-counter-label">{category.label}</span>
                            </span>
                            <strong className="home-group-impact-counter-value">~{category.count}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, marginBottom: 8, paddingTop: 12, borderTop: "1px solid rgba(237,245,240,0.08)" }}>
                    <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-muted)" }}>Recent wins</p>
                    <button
                      type="button"
                      onClick={() => router.push(`/challenges/${activeProject.id}/activity`)}
                      style={{ border: "none", background: "transparent", color: "var(--green-primary)", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
                    >
                      Full feed
                    </button>
                  </div>
                  {featuredChallengeFeedItem ? (() => {
                  const item = challengeFeedItems[Math.min(featuredFeedIndex, challengeFeedItems.length - 1)] ?? featuredChallengeFeedItem;
                  return (
                    <div key={item.id} className="home-recent-wins-item" style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", alignItems: "center", gap: 10, borderRadius: 14, background: "rgba(237,245,240,0.045)", padding: "10px 12px" }}>
                      <div style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(43,186,164,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                        {item.skipEmoji ?? "."}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 900, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {getRecentWinLine(item)}
                        </p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                          {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "just now"}
                        </p>
                      </div>
                      {(item.giveAmount ?? item.skipAmount) !== undefined && (
                        <p style={{ fontSize: 14, fontWeight: 900, color: "#2BBAA4", whiteSpace: "nowrap" }}>
                          +{formatCurrency(item.giveAmount ?? item.skipAmount!)}
                        </p>
                      )}
                    </div>
                  );
                  })() : (
                    <p style={{ borderRadius: 14, background: "rgba(237,245,240,0.045)", padding: "12px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4 }}>
                      Be the first to add a skip to the group’s live activity.
                    </p>
                  )}
                </div>
              )}
              </>
            ) : null}
          </div>
          )}
        </div>
        )}
      </div>

      {showLegacyHomeSocial && activeProject && isActiveChallenge && activeProject.status !== "ended" && (
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

          {featuredChallengeFeedItem && (
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
        personalGoalReached={personalGoalReached}
        blocked={showSkipPicker || editingSkip != null || homeFundraiserSetup != null || homeFundingTarget != null || showContributionModal || showSpendModal}
        onDonate={() => {
          if (donationReminderPrompt?.donationURL) {
            window.open(donationReminderPrompt.donationURL, "_blank", "noopener,noreferrer");
            return;
          }
          router.push("/jars?tab=cause");
        }}
        onAlreadyDonated={() => {
          setContributionMode("log");
          setShowContributionModal(true);
        }}
      />

      {homeFundraiserSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setHomeFundraiserSetup(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(event) => event.stopPropagation()}>
            <div className="relative px-5 pt-5 pb-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Set a Personal Donation Goal for {homeFundraiserSetup.groupName ?? homeFundraiserSetup.title}
              </p>
              {fundraiserGroupGoalLine(homeFundraiserSetup) && (
                <p className="mt-1 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                  {fundraiserGroupGoalLine(homeFundraiserSetup)}
                </p>
              )}
              <button
                type="button"
                onClick={() => setHomeFundraiserSetup(null)}
                className="absolute right-4 top-4 text-xl font-black leading-none"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close fundraiser setup"
              >
                x
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#A7F3D0" }}>
                  Personal donation goal
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    min="1"
                    value={homeFundraiserGoalStr}
                    onChange={(event) => setHomeFundraiserGoalStr(event.target.value)}
                    placeholder="100"
                    className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    autoFocus
                  />
                </div>
                {homeFundraiserSetup.unitCost && homeFundraiserGoalUnitPreview && (
                  <p className="mt-2 text-xs font-bold" style={{ color: "#A7F3D0" }}>
                    About {homeFundraiserGoalUnitPreview}.
                  </p>
                )}
              </div>

              <button
                onClick={() => void confirmHomeFundraiserSetup()}
                disabled={homeFundraiserWorking || !homeFundraiserGoalStr || parseFloat(homeFundraiserGoalStr) <= 0}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                {homeFundraiserWorking ? "Setting up..." : "Set goal and skip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {homeFundingTarget && (() => {
        const homeFundingGoal = homeFundingTarget.type === "goal"
          ? spendingGoals.find((goal) => goal.id === homeFundingTarget.id) ?? null
          : null;
        const hasHomeSkipBank = availableHomeSkipBankBalance > 0;
        const homeFundingGoalAmountValue = homeFundingGoalAmount(homeFundingTarget);
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setHomeFundingTarget(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(event) => event.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setHomeFundingTarget(null)} aria-label="Close" className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
              <p className="text-lg font-black leading-tight pr-6" style={{ color: "var(--text-primary)" }}>
                {hasHomeSkipBank ? "Use existing Skip Bucks?" : `Start skipping for ${homeFundingPromptLabel(homeFundingTarget)}?`}
              </p>
              {hasHomeSkipBank && (
                <p className="mt-1 text-xs font-bold leading-snug" style={{ color: "var(--text-muted)" }}>
                  You have {formatCurrency(availableHomeSkipBankBalance)} in Skip Bucks. Do you want to use any to help fill {homeFundingGoalAmountValue ? `this goal of ${formatCurrency(homeFundingGoalAmountValue)}` : homeFundingPromptLabel(homeFundingTarget)}?
                </p>
              )}
            </div>
            <div className="space-y-3 p-5">
              {homeFundingGoal && !hasHomeSkipBank && (
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)" }}>
                  <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Reward goal</p>
                  <p className="mt-1 text-sm font-black" style={{ color: "var(--text-primary)" }}>
                    {formatCurrency(homeFundingGoal.targetAmount)} in jar
                  </p>
                </div>
              )}
              {hasHomeSkipBank && (
                <div className="rounded-xl p-4" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }}>
                  <p className="mb-3 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                    Enter an amount to use.
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                    <input
                      type="number"
                      min="0"
                      max={availableHomeSkipBankBalance}
                      value={homeFundingAmountStr}
                      onChange={(event) => setHomeFundingAmountStr(event.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none"
                      style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      autoFocus
                    />
                  </div>
                  {homeFundingPreview(homeFundingTarget, homeFundingAmountStr) && (
                    <p className="text-xs font-bold leading-relaxed mt-3" style={{ color: "#C4B5FD" }}>
                      {homeFundingPreview(homeFundingTarget, homeFundingAmountStr)}
                    </p>
                  )}
                  {parseFloat(homeFundingAmountStr) > availableHomeSkipBankBalance && (
                    <p className="text-xs font-bold leading-relaxed mt-3" style={{ color: "#EF4444" }}>
                      That is more than your Skip Bucks. Lower the amount to {formatCurrency(availableHomeSkipBankBalance)} or less.
                    </p>
                  )}
                  <button
                    onClick={() => void confirmHomeSkipBankFunding()}
                    disabled={homeFundingWorking || !homeFundingAmountStr || parseFloat(homeFundingAmountStr) <= 0 || parseFloat(homeFundingAmountStr) > availableHomeSkipBankBalance}
                    className="mt-3 w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                    style={{ background: "rgba(139,92,246,0.2)", color: "#DDD6FE" }}
                  >
                    {homeFundingWorking ? "Moving..." : "Use"}
                  </button>
                </div>
              )}
              <button
                onClick={() => void activateHomeFundingTarget(0)}
                disabled={homeFundingWorking}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={hasHomeSkipBank
                  ? { background: "var(--bg-surface-3)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
                  : { background: homeFundingTarget.type === "goal" ? "#8B5CF6" : "#2ECC71", color: homeFundingTarget.type === "goal" ? "white" : "#071B14" }}
              >
                {homeFundingWorking ? "Activating..." : hasHomeSkipBank ? "Don't use old skips" : homeFundingGoal ? "Skip for this reward" : "Start skipping for this"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showRewardEditor && activeGoal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setShowRewardEditor(false)}>
          <form
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(139,92,246,0.32)" }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveRewardEditor();
            }}
          >
            <div className="relative border-b px-5 pb-4 pt-5 pr-12" style={{ borderColor: "var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>Edit reward</p>
              <button
                type="button"
                onClick={() => setShowRewardEditor(false)}
                aria-label="Close reward editor"
                className="absolute right-4 top-4 text-xl font-black leading-none"
                style={{ color: "var(--text-muted)" }}
              >
                x
              </button>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <label className="order-2 block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Reward name</span>
                <input
                  value={rewardEditLabel}
                  onChange={(event) => setRewardEditLabel(event.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  autoFocus
                />
              </label>
              <label className="order-1 block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Shopping link (optional)</span>
                <input
                  type="url"
                  value={rewardEditLink}
                  onChange={(event) => setRewardEditLink(event.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
              </label>
              <label className="order-5 block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Merchant (optional)</span>
                <input
                  value={rewardEditMerchant}
                  onChange={(event) => setRewardEditMerchant(event.target.value)}
                  placeholder="Target, Amazon, local shop…"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
              </label>
              <div className="order-6">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Inspo pic (optional)</span>
                <div
                  className="relative flex aspect-[1.35] w-full select-none items-center justify-center overflow-hidden rounded-xl"
                  style={{ background: "var(--bg-surface-2)", border: "1px dashed rgba(139,92,246,0.52)" }}
                >
                  {rewardEditImageURL ? (
                    <>
                      <img
                        src={rewardEditImageURL}
                        alt="Reward preview"
                        className="h-full w-full object-cover"
                        style={{ objectPosition: activeGoal.imagePosition ?? "center" }}
                      />
                      <button
                        type="button"
                        onClick={() => setRewardEditImageURL("")}
                        className="absolute right-2 top-2 rounded-full px-2 py-1 text-xs font-bold"
                        style={{ background: "rgba(7,27,20,0.82)", color: "white" }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Add an inspo pic</span>
                  )}
                </div>
                <input
                  type="url"
                  value={rewardEditImageURL}
                  onChange={(event) => setRewardEditImageURL(event.target.value)}
                  placeholder="Paste an image URL"
                  className="mt-2 w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
                <label className="mt-2 inline-flex cursor-pointer items-center rounded-full px-4 py-2 text-sm font-bold" style={{ background: "rgba(139,92,246,0.16)", color: "#C4B5FD" }}>
                  Upload photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleRewardEditorImage(event.target.files?.[0])}
                  />
                </label>
              </div>
              <label className="order-4 block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Goal amount</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={rewardEditGoal}
                    onChange={(event) => setRewardEditGoal(event.target.value)}
                    className="w-full rounded-xl py-3 pl-8 pr-4 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </div>
              </label>
              <label className="order-3 block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Category (optional)</span>
                <input
                  value={rewardEditCategory}
                  onChange={(event) => setRewardEditCategory(event.target.value)}
                  placeholder="Travel, self-care, books..."
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
              </label>
              <button
                className="order-7 w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                type="submit"
                disabled={rewardEditWorking}
                style={{ background: "#8B5CF6", color: "white" }}
              >
                {rewardEditWorking ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingSkip && (
        <EditSkipModal
          skip={editingSkip}
          onClose={() => setEditingSkip(null)}
        />
      )}

      {showContributionModal && activeProject && (
        <DonationLogModal
          projectId={activeProject.id}
          projectTitle={activeProject.title}
          mode={contributionMode === "log" ? "log" : "donate"}
          initialAmount={contributionMode === "log" ? undefined : givingBalance}
          donationURL={activeProject.donationURL ?? undefined}
          donationRecipient={activeProject.sponsor || activeProject.groupName || activeProject.title}
          personalGoal={hasPersonalGivingGoal ? personalGoal : undefined}
          donatedTowardGoal={challengeDonatedTowardGoal}
          impactUnitCost={activeProject.unitCost ?? undefined}
          impactUnitName={activeProject.unitName || activeProject.unitDisplay || undefined}
          impactUnitDisplay={activeProject.unitDisplay ?? undefined}
          impactUnitIsGoal={activeProject.unitIsGoal}
          shareCause={getChallengeCausePhrase(activeProject)}
          shareUrl={appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}${getChallengeSharePath(activeProject)}`, user?.uid)}
          onLogged={() => setChallengeTotalsRefreshKey((key) => key + 1)}
          onRaiseGoal={async (amount) => {
            if (!user) return;
            await setUserCauseGoal(user.uid, activeProject.id, amount);
            updateProfile({
              causeGoalAmounts: { ...(profile.causeGoalAmounts ?? {}), [activeProject.id]: amount },
            });
          }}
          onChooseNewJar={() => router.push("/jars")}
          onClose={() => {
            setShowContributionModal(false);
            setContributionMode("contribute");
          }}
        />
      )}

      {showSpendModal && activeGoal && user && (
        <GoalSpendModal
          goal={activeGoal}
          availableFromSkips={spendingBalance + skipBalance.unassignedSkipBank}
          jarBalance={spendingBalance}
          onClose={() => setShowSpendModal(false)}
          onComplete={async (amount) => {
            try {
              const result = await recordPurchase(user.uid, activeGoal.id, activeGoal.label, activeGoal.targetAmount, amount);
              updateProfile({
                totalSpent: (profile.totalSpent ?? 0) + result.amountFromSkips,
                goalJarBalances: {
                  ...(profile.goalJarBalances ?? {}),
                  [activeGoal.id]: Math.max(0, (profile.goalJarBalances?.[activeGoal.id] ?? 0) - result.jarDecrease),
                },
              });
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
