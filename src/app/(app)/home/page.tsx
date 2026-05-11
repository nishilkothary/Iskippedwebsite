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
import { InstallPrompt } from "@/components/InstallPrompt";
import { normalizeJarSplit, normalizeSpendingGoals } from "@/lib/services/firebase/users";
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
  emptyLabel?: string;
  href?: string;
  onClick?: () => void;
  unitDisplay?: string;  // e.g. "days", "meals" — shown in jar instead of %
  unitCount?: number;    // pre-computed count of units funded
}

function Jar({ fillPercent, color, gradEnd, label, amount, emoji, causeLabel, goalAmount, emptyLabel, href, onClick, unitDisplay, unitCount }: JarProps) {
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

        {/* Center display: only shown when a cause/goal is active */}
        {causeLabel && (
          <>
            <text
              x={60*scale} y={goalAmount && goalAmount > 0 ? 84*scale : 92*scale}
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
              x={60*scale} y={goalAmount && goalAmount > 0 ? 102*scale : 112*scale}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7*scale}
              fontWeight="600"
              fill="rgba(255,255,255,0.55)"
              style={{ fontFamily: "inherit" }}
            >
              {goalAmount && goalAmount > 0 ? "to goal of" : "saved"}
            </text>
            {goalAmount && goalAmount > 0 && (
              <text
                x={60*scale} y={114*scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={7*scale}
                fontWeight="700"
                fill="rgba(255,255,255,0.75)"
                style={{ fontFamily: "inherit" }}
              >
                ${Math.round(goalAmount).toLocaleString()}
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
      </div>
    </div>
  );

  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}


// ─── Home Page ──────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { projects } = useProjects();
  const { setShowSkipPicker } = useUIStore();
  const [editingSkip, setEditingSkip] = useState<Skip | null>(null);

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


  const personalGoal = profile.causeGoalAmounts?.[activeProject?.id ?? ""] ?? activeProject?.goalAmount ?? 0;
  const givingFillPct = personalGoal > 0 ? Math.min(100, (givingBalance / personalGoal) * 100) : 0;
  const spendingFillPct = activeGoal
    ? Math.min(100, (spendingBalance / activeGoal.targetAmount) * 100)
    : 0;

  const firstName = profile.displayName.split(" ")[0];

  const motivationalLine = (() => {
    if (!activeProject) return "";
    if (activeProject.unitIsGoal && activeProject.goalAmount) {
      const pct = Math.round((10 / activeProject.goalAmount) * 100);
      return `A $10 Skip today funds ${pct}% of ${activeProject.unitName ?? "goal"}`;
    }
    if (activeProject.unitCost && activeProject.unitDisplay) {
      const units = Math.floor(10 / activeProject.unitCost);
      return `A $10 Skip today funds ${units} more ${activeProject.unitDisplay}`;
    }
    return `Every skip makes a difference`;
  })();

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
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--text-muted)" }}>What did you almost buy today?</p>

        <button
          onClick={() => setShowSkipPicker(true)}
          className="w-full font-black py-4 rounded-full text-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          ✨ Log a Skip
        </button>
      </div>

      {/* ── Cause card (My Skip Motivator) ── */}
      {activeProject && (() => {
        const motivatorImg = activeProject.imageURL
          ?? (activeProject.tags?.includes("education") ? "/categories/education.png"
            : activeProject.tags?.includes("food") ? "/categories/meal.png"
            : activeProject.tags?.includes("health") ? "/categories/health.png"
            : null);
        const isPlaceholderImg = !activeProject.imageURL && !!motivatorImg;
        return (
          <div
            style={{ ...cardStyle, marginBottom: 20, overflow: "hidden", padding: 0, cursor: "pointer" }}
            onClick={() => router.push("/jars?tab=cause")}
          >
            {motivatorImg && (
              <div className="relative overflow-hidden h-36 md:h-52" style={{ background: "var(--bg-surface-2)" }}>
                <img
                  src={motivatorImg}
                  alt={activeProject.title}
                  style={{
                    width: "100%", height: "100%",
                    objectFit: isPlaceholderImg ? "contain" : "cover",
                    objectPosition: isPlaceholderImg ? "center" : (activeProject.imagePosition ?? "center"),
                  }}
                />
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.65))",
                }} />
              </div>
            )}
            <div style={{ padding: "14px 16px" }}>
              {!motivatorImg && (
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>
                  {activeProject.title}
                </p>
              )}
              <p style={{
                fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px", lineHeight: 1.4,
              }}>
                There is no better reason to skip today than to help fund {activeProject.title}.
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#2BBAA4", margin: 0 }}>
                {motivationalLine}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Jars card (full width) ── */}
      <div style={{ ...cardStyle, marginBottom: 20, position: "relative" }}>
        {profile.streak > 0 && (
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
            <span style={{ fontSize: 11, fontWeight: 700, color: "#E8924A" }}>{profile.streak}</span>
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
            fillPercent={givingFillPct}
            color="#2BBAA4"
            gradEnd="#1E9485"
            label="Giving Jar"
            amount={formatCurrency(givingBalance)}
            emoji="🤲"
            causeLabel={activeProject?.title}
            goalAmount={personalGoal > 0 ? personalGoal : undefined}
            emptyLabel="Choose who your skips help"
            href="/jars?tab=cause"
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
            emptyLabel="Choose what future you gets"
            onClick={() => router.push("/jars?tab=live")}
          />
        </div>

      </div>

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

      {/* ── Recent Skips ── */}
      <div>
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

      <InstallPrompt />

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
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
