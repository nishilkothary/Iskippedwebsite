"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime, today, getChallengeCountdown, parkedJarCount } from "@/lib/utils/dates";
import { InstallPrompt } from "@/components/InstallPrompt";
import { normalizeJarSplit, normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { levelForXp } from "@/lib/utils/xp";
import { isChallengeProject, subscribeToProject } from "@/lib/services/firebase/projects";
import { subscribeToCommunityFeed, subscribeToGlobalStats, getCommunityTotalSaved } from "@/lib/services/firebase/social";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { FeedItem, GlobalStats, Project, Skip } from "@/lib/types/models";

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
  centerLabelOverride?: string; // overrides the default "to goal" / "saved" center label
}

function Jar({ fillPercent, color, gradEnd, label, amount, emoji, causeLabel, goalAmount, emptyLabel, href, onClick, actionLabel, actionOnClick, actionColor, unitDisplay, unitCount, centerLabelOverride }: JarProps) {
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
  const centerValue = causeLabel ? `${Math.round(clamp)}%` : amount;
  const centerLabel = centerLabelOverride ?? (causeLabel
    ? goalAmount && goalAmount > 0 ? "to goal" : "saved"
    : "ready");
  const centerLabelLines = centerLabel.split("\n");
  const centerMultiLine = centerLabelLines.length > 1;
  const hasGoalDisplay = !!(causeLabel && goalAmount && goalAmount > 0);
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
              fontSize={(!causeLabel && centerValue.length > 4 ? 13 : 17)*scale}
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
  return project.goalAmount || project.unitCost || 100;
}

function getCommunityRaised(project: Project, savedForProject: number): number {
  return Math.max(0, savedForProject || project.totalRaised || 0);
}

function formatCommunityUnitCount(amount: number, unitCost: number): string {
  if (!Number.isFinite(amount) || !Number.isFinite(unitCost) || unitCost <= 0) return "0";
  return Math.floor(amount / unitCost).toLocaleString();
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

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getConsecutiveSkipStreak(skips: Skip[]): number {
  const dates = new Set(skips.map((skip) => skip.date).filter(Boolean));
  const todayKey = today();
  if (!dates.has(todayKey)) return 0;

  let streak = 0;
  let cursor = previousDateKey(todayKey);
  while (dates.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }
  return streak;
}

export default function HomePage() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { projects } = useProjects();
  const { setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);
  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [communityTotalSaved, setCommunityTotalSaved] = useState<number | null>(null);
  const [liveFeedIndex, setLiveFeedIndex] = useState(0);
  const [liveChallengeTotalRaised, setLiveChallengeTotalRaised] = useState<number>(0);

  useEffect(() => {
    return subscribeToCommunityFeed(setCommunityFeed);
  }, []);

  useEffect(() => {
    getCommunityTotalSaved().then(setCommunityTotalSaved).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToGlobalStats(setGlobalStats);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const active = projects.find((project) => project.id === profile?.activeProjectId) ?? null;
    const challengeItems = active && isChallengeProject(active)
      ? communityFeed.filter((item) => item.projectTitle === active.title)
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
  }, [communityFeed, profile?.activeProjectId, projects, recentSkips.length]);

  useEffect(() => {
    const activeProjectId = profile?.activeProjectId;
    if (!activeProjectId) { setLiveChallengeTotalRaised(0); return; }
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj || !isChallengeProject(proj)) { setLiveChallengeTotalRaised(0); return; }
    setLiveChallengeTotalRaised(proj.totalRaised ?? 0);
    return subscribeToProject(activeProjectId, (p) => {
      setLiveChallengeTotalRaised(p?.totalRaised ?? 0);
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

  const givingBalance = globalGivingBalance;
  const spendingBalance = globalSpendingBalance;


  const isActiveChallenge = activeProject ? isChallengeProject(activeProject) : false;
  const challengeContribution = isActiveChallenge ? givingBalance : 0;
  // Show at least the user's own giving balance as floor — all of it can be donated to the challenge
  const displayedGroupTotal = isActiveChallenge
    ? Math.max(liveChallengeTotalRaised, givingBalance)
    : 0;
  const communityGoal = activeProject && isActiveChallenge ? getCommunityGoal(activeProject) : 0;
  const personalGoal = !isActiveChallenge
    ? profile.causeGoalAmounts?.[activeProject?.id ?? ""] ?? activeProject?.goalAmount ?? 0
    : 0;
  const givingFillPct = personalGoal > 0 ? Math.min(100, (givingBalance / personalGoal) * 100) : 0;
  const destinationFillPct = isActiveChallenge && communityGoal > 0
    ? Math.min(100, (givingBalance / communityGoal) * 100)
    : givingFillPct;
  const destinationGoalAmount = isActiveChallenge
    ? communityGoal
    : personalGoal > 0
      ? personalGoal
      : undefined;
  const destinationAmount = givingBalance;
  const destinationHref = isActiveChallenge && activeProject ? `/challenges/${activeProject.id}` : "/jars?tab=cause";
  const destinationLabel = "Giving Jar";
  const destinationEmptyLabel = "Choose a cause →";
  const challengeSkips = activeProject && isActiveChallenge
    ? recentSkips.filter((skip) => skip.projectId === activeProject.id)
    : [];
  const hasCommunityUnit = !!(activeProject?.unitCost && activeProject.unitCost > 0);
  const communityImpactLabel = hasCommunityUnit ? "Units Funded" : "Community $";
  const communityImpactValue = hasCommunityUnit && activeProject
    ? `${formatCommunityUnitCount(displayedGroupTotal, activeProject.unitCost ?? 0)} ${activeProject.unitDisplay || activeProject.unitName || "units"}`
    : formatCurrency(displayedGroupTotal);
  const challengeDonated = activeProject && isActiveChallenge
    ? profile.causeStats?.[activeProject.id]?.donated ?? 0
    : 0;
  const challengeFeedItems = activeProject && isActiveChallenge
    ? communityFeed.filter((item) => item.projectTitle === activeProject.title).slice(0, 3)
    : [];
  const challengeCommunitySkipCount = challengeFeedItems.length > 0 ? challengeFeedItems.length : challengeSkips.length;
  const todaySkipCount = activeProject && isActiveChallenge
    ? communityFeed.filter((item) =>
        (item.projectTitle === activeProject.title || item.projectId === activeProject.id)
        && item.createdAt?.toDate?.()?.toDateString() === new Date().toDateString()
      ).length
    : 0;
  const socialFeedItems = activeProject && isActiveChallenge
    ? (communityFeed.filter((item) => item.projectTitle === activeProject.title).length > 0
        ? communityFeed.filter((item) => item.projectTitle === activeProject.title)
        : communityFeed)
    : communityFeed;
  const liveTotalSkips = globalStats?.totalSkips ?? communityFeed.length;
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
  const displayedStreak = getConsecutiveSkipStreak(recentSkips);
  const activeCountdown = activeProject && isActiveChallenge ? getChallengeCountdown(activeProject) : null;

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
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--text-muted)" }}>What expense did you skip today?</p>

        <button
          onClick={() => setShowSkipPicker(true)}
          className="w-full font-black py-4 rounded-full text-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          Log a Skip
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

      {/* ── Jars card (full width) ── */}
      <div style={{ ...cardStyle, marginBottom: 20, position: "relative" }}>
        {displayedStreak > 0 && (
          <div
            className="flex items-center gap-1"
            style={{
              position: "absolute", top: 14, right: 16,
              background: "linear-gradient(135deg, rgba(232,146,74,0.15), rgba(229,92,92,0.1))",
              border: "1px solid rgba(232,146,74,0.2)",
              borderRadius: 10,
              padding: "3px 8px",
            }}
          >
            <span style={{ fontSize: 12 }}>🔥</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#E8924A" }}>{displayedStreak}</span>
          </div>
        )}
        {/* Total */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{
            fontSize: 11, color: "var(--text-muted)",
            fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            Total Skipped &amp; Saved
          </div>
          <div style={{
            fontSize: 44, fontWeight: 800, margin: "4px 0",
            background: "linear-gradient(135deg, var(--text-primary) 40%, var(--green-primary))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            {formatCurrency(profile.totalSaved)}
          </div>
        </div>

        {/* Jars */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, margin: "20px 0", flexWrap: "nowrap" }}>
          <Jar
            fillPercent={destinationFillPct}
            color="#2BBAA4"
            gradEnd="#1E9485"
            label={destinationLabel}
            amount={formatCurrency(destinationAmount)}
            emoji="🤲"
            causeLabel={activeProject?.title}
            goalAmount={destinationGoalAmount}
            emptyLabel={destinationEmptyLabel}
            centerLabelOverride={isActiveChallenge && destinationGoalAmount ? "contributed\nto group goal" : undefined}
            onClick={() => router.push(destinationHref)}
            actionLabel="Donate my Jar"
            actionOnClick={() => {
              if (activeProject?.donationURL) {
                window.open(activeProject.donationURL, "_blank", "noopener,noreferrer");
                return;
              }
              router.push("/jars?tab=cause");
            }}
          />
          <Jar
            fillPercent={spendingFillPct}
            color="#8B5CF6"
            gradEnd="#6D28D9"
            label="Reward Jar"
            amount={formatCurrency(spendingBalance)}
            emoji="😊"
            causeLabel={activeGoal?.label}
            goalAmount={activeGoal?.targetAmount}
            emptyLabel={activeGoal ? "Choose what future you gets" : "Select your reward →"}
            onClick={() => router.push("/jars?tab=live")}
            actionLabel="Manage Reward"
            actionOnClick={() => router.push("/jars?tab=live")}
            actionColor="#A78BFA"
          />
        </div>

      </div>

      {(!activeProject || !isActiveChallenge) && (
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

      {activeProject && isActiveChallenge && (
        <div style={{
          ...cardStyle,
          marginBottom: 20,
          padding: 18,
          background: "linear-gradient(145deg, rgba(46,204,113,0.13), rgba(12,35,26,0.98) 48%, rgba(43,186,164,0.08))",
          border: "1px solid rgba(46,204,113,0.24)",
          boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}>
          {/* Header: mirrors community scoreboard format */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--green-primary)", marginBottom: 4 }}>
                {activeProject.groupName ?? activeProject.title} · Group
              </p>
              <p style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.05 }}>
                {challengeCommunitySkipCount.toLocaleString()} skips
              </p>
              {communityGoal > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{formatCurrency(displayedGroupTotal)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>of {formatCurrency(communityGoal)} goal</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(46,204,113,0.15)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (displayedGroupTotal / communityGoal) * 100)}%`, background: "linear-gradient(90deg, #1E9485, #2ECC71)", borderRadius: 999 }} />
                  </div>
                </div>
              ) : displayedGroupTotal > 0 ? (
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--green-primary)", marginTop: 3 }}>
                  = {formatCurrency(displayedGroupTotal)} pledged
                </p>
              ) : null}
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginTop: 20 }}>
                Live activity from your group
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={async () => {
                  const url = `${window.location.origin}/challenges/${activeProject.id}`;
                  if (typeof navigator.share === "function") {
                    try { await navigator.share({ title: activeProject.title, text: `Join my iSkipped challenge: ${activeProject.title}`, url }); return; } catch { /* dismissed */ }
                  }
                  try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                }}
                style={{ background: "rgba(46,204,113,0.12)", border: "1px solid rgba(46,204,113,0.25)", borderRadius: 999, color: "var(--green-primary)", fontSize: 11, fontWeight: 900, padding: "6px 10px", whiteSpace: "nowrap" }}
              >
                ↗ Invite
              </button>
              <button
                onClick={() => router.push(`/challenges/${activeProject.id}`)}
                style={{ background: "rgba(46,204,113,0.12)", border: "1px solid rgba(46,204,113,0.25)", borderRadius: 999, color: "var(--green-primary)", fontSize: 11, fontWeight: 900, padding: "6px 10px", whiteSpace: "nowrap" }}
              >
                View
              </button>
            </div>
          </div>

          {/* Feed: same card style as community scoreboard */}
          <div style={{ display: "grid", gap: 10 }}>
            {challengeFeedItems.length > 0 ? (
              challengeFeedItems.map((item) => (
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
              ))
            ) : (
              <button
                onClick={() => setShowSkipPicker(true)}
                style={{ width: "100%", background: "var(--bg-surface-2)", border: "1px dashed rgba(46,204,113,0.35)", borderRadius: 14, padding: "12px 14px", color: "var(--text-secondary)", fontSize: 13, fontWeight: 800, textAlign: "left" }}
              >
                Be the first skip in the group.
              </button>
            )}
          </div>

          {/* Footer: personal stats + time left */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green-primary)" }}>
                {formatCurrency(challengeContribution)} pledged so far
              </span>
              {activeCountdown && !activeCountdown.isExpired && activeCountdown.daysLeft !== null && (
                <span style={{ fontSize: 12, fontWeight: 700, color: activeCountdown.daysLeft < 3 ? "#EF4444" : activeCountdown.daysLeft < 7 ? "var(--gold-cta)" : "var(--text-muted)" }}>
                  {activeCountdown.daysLeft} days left to keep skipping
                </span>
              )}
              {activeCountdown?.isExpired && (
                <button
                  onClick={() => router.push("/jars/resolve")}
                  style={{ fontSize: 12, fontWeight: 700, color: "var(--green-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                >
                  Challenge ended — donate your jar →
                </button>
              )}
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
              🤲 Pick a cause you care about
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
              Your skips can make a real difference in people&apos;s lives. Pick a cause to start seeing the impact — you can always change it anytime!
            </div>
          </div>
          <button
            onClick={() => router.push("/jars?tab=cause")}
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
            Explore causes →
          </button>
        </div>
      )}

      {/* Recent Skips */}
      <div>
        <div style={cardStyle}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 16,
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
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>☕</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No skips yet!</p>
            </div>
          ) : (
            recentSkips.slice(0, 4).map((skip, i) => (
              <div
                key={skip.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0",
                  borderBottom: i < Math.min(recentSkips.length, 4) - 1 ? rowDivider : "none",
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
      </div>

      <InstallPrompt />

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        iSkipped helps you track skipped spending and pledges. Donations are made outside the app, directly through the fundraiser or organization, and iSkipped does not process funds or control how donations are used.
      </p>

      <p className="hidden" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        We are still in beta — have feedback?{" "}
        <a href="mailto:iskippedfor@gmail.com" style={{ color: "var(--green-primary)", textDecoration: "underline" }}>
          iskippedfor@gmail.com
        </a>
      </p>

      {editingSkip && (
        <EditSkipModal
          skip={editingSkip}
          onClose={() => setEditingSkip(null)}
        />
      )}
    </div>
  );
}
