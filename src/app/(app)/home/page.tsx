"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";
import { normalizeJarSplit, normalizeSpendingGoals, recalculateTotals } from "@/lib/services/firebase/users";
import { EditSkipModal } from "@/components/skip/EditSkipModal";
import { Skip } from "@/lib/types/models";

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
  href?: string;
  onClick?: () => void;
}

function Jar({ fillPercent, color, gradEnd, label, amount, emoji, causeLabel, goalAmount, href, onClick }: JarProps) {
  const clamp = Math.min(Math.max(fillPercent, 0), 100);
  const w = 160;
  const h = 240;
  const scale = w / 120;
  const fillH = (clamp / 100) * 120 * scale;
  const jarH = 170 * scale;
  const yStart = jarH - fillH;
  const uid = label.replace(/\s/g, "");

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
      <div style={{ textAlign: "center", maxWidth: w, padding: "0 4px", minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={{ fontSize: causeLabel ? 14 : 13, fontWeight: causeLabel ? 700 : 600, color: causeLabel ? color : "rgba(255,255,255,0.75)", lineHeight: 1.35, letterSpacing: 0.2 }}>
          {causeLabel ?? "👆 Tap to pick a jar"}
        </div>
        {causeLabel && goalAmount && goalAmount > 0 && (
          <div style={{ fontSize: 11, fontWeight: 500, color: color, opacity: 0.75, marginTop: 2, fontStyle: "italic" }}>
            Goal: ${Math.round(goalAmount)}
          </div>
        )}
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={`gf-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={gradEnd} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <clipPath id={`jc-${uid}`}>
            <path d={jarPath} />
          </clipPath>
        </defs>

        {/* Fill (clipped to jar shape) */}
        <g clipPath={`url(#jc-${uid})`}>
          <rect
            x={15*scale} y={yStart}
            width={90*scale} height={fillH + 15*scale}
            fill={`url(#gf-${uid})`}
            rx={4*scale}
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
              fill="rgba(255,255,255,0.12)"
              stroke="none"
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
          d={jarPath}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={2.5*scale}
          strokeLinejoin="round"
        />

        {/* Percentage centered in jar body */}
        <text
          x={60*scale} y={92*scale}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={17*scale}
          fontWeight="800"
          fill="rgba(255,255,255,0.9)"
          style={{ fontFamily: "inherit" }}
        >
          {Math.round(clamp)}%
        </text>
        <text
          x={60*scale} y={112*scale}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={7*scale}
          fontWeight="600"
          fill="rgba(255,255,255,0.55)"
          style={{ fontFamily: "inherit" }}
        >
          to goal
        </text>
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
      </div>
    </div>
  );

  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}


// ─── Home Page ──────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { projects } = useProjects();
  const { setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);
  const [recalcWorking, setRecalcWorking] = useState(false);
  const [recalcDone, setRecalcDone] = useState(false);

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

  const goalAmount = activeProject?.goalAmount ?? 0;
  const givingFillPct = goalAmount > 0 ? Math.min(100, (givingBalance / goalAmount) * 100) : 0;
  const spendingFillPct = activeGoal
    ? Math.min(100, (spendingBalance / activeGoal.targetAmount) * 100)
    : 0;

  // This week stats
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekSkips = recentSkips.filter((s) => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.date);
    return d >= weekStart;
  });
  const weekTotal = weekSkips.reduce((sum, s) => sum + s.amount, 0);
  const weekLive = weekTotal * (split.live / 100);
  const weekGive = weekTotal * (split.give / 100);
  const topCat = weekSkips.length > 0
    ? (() => {
        const freq: Record<string, { count: number; emoji: string; label: string }> = {};
        for (const s of weekSkips) {
          const key = s.categoryLabel ?? "Other";
          if (!freq[key]) freq[key] = { count: 0, emoji: s.categoryEmoji ?? "", label: key };
          freq[key].count++;
        }
        return Object.values(freq).sort((a, b) => b.count - a.count)[0];
      })()
    : null;

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

      {/* Greeting + streak */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Hey, {firstName} 👋</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>Skip, Live, Give.</p>
        </div>
        {profile.streak > 0 && (
          <div style={{
            background: "linear-gradient(135deg, rgba(232,146,74,0.15), rgba(229,92,92,0.1))",
            border: "1px solid rgba(232,146,74,0.2)",
            borderRadius: 14,
            padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 8,
            flexShrink: 0, marginTop: 4,
          }}>
            <span style={{ fontSize: 20 }}>🔥</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#E8924A" }}>{profile.streak}-day streak</span>
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={() => setShowSkipPicker(true)}
        className="w-full font-black py-4 rounded-full text-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-200 mb-5"
        style={{
          background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
          color: "var(--bg-base)",
          boxShadow: "0 4px 18px var(--gold-glow)",
        }}
      >
        ✨ Log a Skip
      </button>

      {/* ── Jars card (full width) ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
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
            fillPercent={spendingFillPct}
            color="#8B5CF6"
            gradEnd="#6D28D9"
            label="Live a Little"
            amount={formatCurrency(spendingBalance)}
            emoji="😊"
            causeLabel={activeGoal?.label}
            goalAmount={activeGoal?.targetAmount}
            onClick={() => router.push("/jars?tab=live")}
          />
          <Jar
            fillPercent={givingFillPct}
            color="#2BBAA4"
            gradEnd="#1E9485"
            label="Give a Little"
            amount={formatCurrency(givingBalance)}
            emoji="🤲"
            causeLabel={activeProject?.title}
            goalAmount={activeProject?.goalAmount}
            href="/jars?tab=cause"
          />
        </div>

      </div>

      {/* ── Jar prompt ── */}
      {givingBalance > 0 && (
        <div style={{
          ...cardStyle,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Ready to use what&apos;s in your jar?
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              Your jar doesn&apos;t need to be full to make a difference.
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
            Donate from jar →
          </button>
        </div>
      )}

      {/* ── Two-column grid: This Week + Recent Skips ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* This Week */}
        <div style={cardStyle}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 20, letterSpacing: 0.5,
          }}>
            This Week
          </div>
          {[
            { label: "Skips logged", value: String(weekSkips.length), color: "var(--green-primary)" },
            { label: "Live jar", value: formatCurrency(weekLive), color: "#2BBAA4" },
            { label: "Give jar", value: formatCurrency(weekGive), color: "var(--coral-primary)" },
            { label: "Top category", value: topCat ? `${topCat.emoji} ${topCat.label}` : "—", color: "#E8924A" },
          ].map((row, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0",
              borderBottom: i < 3 ? rowDivider : "none",
            }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{row.label}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Recent Skips */}
        <div style={cardStyle}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
              Recent Skips
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

      {/* Recalculate card */}
      <div className="mt-4" style={cardStyle}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>🔄 Recalculate totals</p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          If your jar balances look off, this recomputes your totals from your actual logged skips. Donations and purchases are not affected.
        </p>
        {recalcDone && (
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--green-primary)", marginBottom: 8 }}>✓ Done — balances updated.</p>
        )}
        <button
          onClick={async () => {
            if (!user || !profile || recalcWorking) return;
            setRecalcWorking(true);
            setRecalcDone(false);
            try {
              const result = await recalculateTotals(user.uid, normalizeJarSplit(profile.jarSplit as any));
              updateProfile(result);
              setRecalcDone(true);
              setTimeout(() => setRecalcDone(false), 3000);
            } finally {
              setRecalcWorking(false);
            }
          }}
          disabled={recalcWorking}
          style={{
            width: "100%", padding: "10px 0", fontWeight: 600, fontSize: 14, borderRadius: 12,
            border: "1px solid var(--border-emphasis)", color: "var(--text-secondary)",
            background: "transparent", cursor: recalcWorking ? "not-allowed" : "pointer",
            opacity: recalcWorking ? 0.5 : 1,
          }}
        >
          {recalcWorking ? "Recalculating…" : "Recalculate"}
        </button>
      </div>

      {editingSkip && (
        <EditSkipModal
          skip={editingSkip}
          onClose={() => setEditingSkip(null)}
        />
      )}
    </div>
  );
}
