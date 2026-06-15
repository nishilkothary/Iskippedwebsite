"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { useSkips } from "@/hooks/useSkips";
import { useUIStore } from "@/store/uiStore";
import { formatCurrency } from "@/lib/utils/currency";

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
      <p className="text-[11px] uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xl font-black mt-1" style={{ color: "var(--text-primary)" }}>{value}</p>
      {detail && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{detail}</p>}
    </div>
  );
}

function CommunityJarProgress({ amount, goal, skips }: { amount: number; goal: number; skips: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((amount / goal) * 100)) : 0;
  const fillHeight = Math.max(10, pct * 1.06);

  return (
    <div className="rounded-xl p-4 flex items-center gap-5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="relative w-28 h-32 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 86 108" className="w-28 h-32" aria-hidden="true">
          <defs>
            <clipPath id="community-jar-clip">
              <path d="M27 16h32v13c0 4 2 6 6 8l7 4c5 3 8 8 8 14v34c0 11-8 17-19 17H25C14 106 6 100 6 89V55c0-6 3-11 8-14l7-4c4-2 6-4 6-8V16Z" />
            </clipPath>
            <linearGradient id="community-jar-fill" x1="0" x2="0" y1="1" y2="0">
              <stop offset="0%" stopColor="var(--green-grad-end)" />
              <stop offset="100%" stopColor="var(--green-primary)" />
            </linearGradient>
          </defs>
          <g clipPath="url(#community-jar-clip)">
            <rect x="0" y="0" width="86" height="108" fill="rgba(255,255,255,0.04)" />
            <rect
              x="0"
              y={106 - fillHeight}
              width="86"
              height={fillHeight + 4}
              fill="url(#community-jar-fill)"
            />
            <path
              d={`M6 ${106 - fillHeight} C 22 ${100 - fillHeight}, 36 ${112 - fillHeight}, 52 ${106 - fillHeight} S 75 ${100 - fillHeight}, 86 ${106 - fillHeight}`}
              fill="none"
              stroke="rgba(255,255,255,0.26)"
              strokeWidth="2"
            />
          </g>
          <path d="M27 16h32v13c0 4 2 6 6 8l7 4c5 3 8 8 8 14v34c0 11-8 17-19 17H25C14 106 6 100 6 89V55c0-6 3-11 8-14l7-4c4-2 6-4 6-8V16Z" fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="3" />
          <path d="M27 16h32" stroke="rgba(255,255,255,0.42)" strokeWidth="6" strokeLinecap="round" />
          <path d="M24 42c-7 8-8 19-8 37" stroke="rgba(255,255,255,0.18)" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pt-4">
          <span className="text-2xl font-black leading-none" style={{ color: "var(--text-primary)" }}>{pct}%</span>
          <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>full</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide font-black" style={{ color: "var(--text-muted)" }}>Community Jar</p>
        <p className="text-2xl font-black mt-1" style={{ color: "var(--text-primary)" }}>{formatCurrency(amount)}</p>
        <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-muted)" }}>
          raised by {skips} {skips === 1 ? "skip" : "skips"}
        </p>
        <p className="text-sm font-black mt-2" style={{ color: "var(--green-primary)" }}>
          {formatCurrency(goal)} community goal
        </p>
      </div>
    </div>
  );
}

export default function HomeChallengePreviewPage() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { projects } = useProjects();
  const { recentSkips } = useSkips();
  const { setShowSkipPicker } = useUIStore();

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === profile?.activeProjectId)
      ?? projects.find((project) => project.id === "kc")
      ?? projects[0]
      ?? null;
  }, [projects, profile?.activeProjectId]);

  const challengeSkips = useMemo(
    () => recentSkips.filter((skip) => skip.projectId === activeProject?.id),
    [recentSkips, activeProject?.id]
  );

  const goal = activeProject?.goalAmount && activeProject.goalAmount > 0 ? activeProject.goalAmount : 250;
  const raised = Math.min(goal, Math.max(activeProject?.totalRaised ?? 0, goal * 0.18));
  const userSaved = challengeSkips.reduce((sum, skip) => sum + skip.amount, 0) || 22;
  const userSkips = challengeSkips.length || 3;
  const rewardBalance = Math.max(0, (profile?.totalLiveAllocated ?? 56) - (profile?.totalSpent ?? 14));
  const rewardPct = Math.min(100, Math.round((rewardBalance / 100) * 100));
  const firstName = profile?.displayName?.split(" ")[0] || "there";
  const recentActivity = challengeSkips.length > 0
    ? challengeSkips.slice(0, 4).map((skip) => ({
        label: skip.whatSkipped || skip.categoryLabel,
        amount: skip.amount,
      }))
    : [
        { label: "Skipped coffee", amount: 5 },
        { label: "Skipped lunch out", amount: 12 },
        { label: "Skipped a rideshare", amount: 18 },
        { label: "Skipped dessert", amount: 7 },
      ];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-8">
      <div className="flex md:hidden justify-center mb-5">
        <p className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          i<span style={{ color: "var(--green-primary)" }}>skipped</span>
        </p>
      </div>

      <div className="mb-5">
        <p className="text-xs uppercase tracking-wide font-black" style={{ color: "var(--green-primary)" }}>Home Preview</p>
        <h1 className="text-2xl font-black mt-1" style={{ color: "var(--text-primary)" }}>Hey {firstName}.</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>What did you skip today?</p>
      </div>

      <section className="rounded-xl p-4 mb-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        <button
          type="button"
          onClick={() => setShowSkipPicker(true)}
          className="w-full py-4 rounded-full text-lg font-black transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          Log a Skip
        </button>

        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-default)" }}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide font-black" style={{ color: "var(--green-primary)" }}>Active Challenge</p>
              <h2 className="text-lg font-black leading-tight mt-1" style={{ color: "var(--text-primary)" }}>
                {activeProject?.title ?? "Chromebook for A Student In Kenya"}
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {activeProject?.sponsor ? `by ${activeProject.sponsor}` : "community challenge"}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => router.push(activeProject ? `/challenges/${activeProject.id}` : "/challenges")}
                className="px-3 py-1.5 rounded-full text-xs font-black"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => router.push("/challenges")}
                className="px-3 py-1.5 rounded-full text-xs font-black"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Change
              </button>
            </div>
          </div>

          <CommunityJarProgress amount={raised} goal={goal} skips={userSkips} />
        </div>
      </section>

      <section className="mt-5">
        <p className="text-sm uppercase tracking-wide font-black mb-3" style={{ color: "var(--text-secondary)" }}>Your Contribution</p>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Skips" value={`${userSkips}`} />
          <StatTile label="Saved" value={formatCurrency(userSaved)} />
          <StatTile label="Impact" value={activeProject?.unitCost ? `${Math.max(1, Math.floor(userSaved / activeProject.unitCost))}` : "1"} detail={activeProject?.unitDisplay ?? activeProject?.unitName ?? "steps"} />
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm uppercase tracking-wide font-black" style={{ color: "var(--text-secondary)" }}>Recent Challenge Skips</p>
          <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Community</span>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          {recentActivity.map((activity, index) => (
            <div
              key={`${activity.label}-${index}`}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{ borderBottom: index < recentActivity.length - 1 ? "1px solid var(--border-default)" : "none" }}
            >
              <div className="min-w-0">
                <p className="text-sm font-black truncate" style={{ color: "var(--text-primary)" }}>{activity.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>toward {activeProject?.title ?? "this challenge"}</p>
              </div>
              <span className="text-sm font-black shrink-0" style={{ color: "var(--green-primary)" }}>{formatCurrency(activity.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide font-black" style={{ color: "var(--text-muted)" }}>Reward Jar</p>
            <p className="text-xl font-black mt-1" style={{ color: "var(--text-primary)" }}>{formatCurrency(rewardBalance)}</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>You also saved a little for yourself.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/jars?tab=reward")}
            className="px-3 py-1.5 rounded-full text-xs font-black shrink-0"
            style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          >
            Rewards
          </button>
        </div>
        <div className="h-2 rounded-full overflow-hidden mt-4" style={{ background: "var(--bg-surface-3)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${rewardPct}%`,
              background: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
            }}
          />
        </div>
      </section>
    </div>
  );
}
