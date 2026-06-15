"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import {
  completeGoal,
  recordPurchase,
  transferLiveToGive,
  subscribeToSpendingHistory,
  updateSpendingHistory,
  deleteSpendingHistory,
  setActiveProject,
  switchCause,
  switchGoal,
  normalizeJarSplit,
  normalizeSpendingGoals,
  updateSpendingGoals,
  setUserCauseGoal,
} from "@/lib/services/firebase/users";
import { addCustomProject, updateCustomProject, deleteCustomProject, isCauseProject, isChallengeProject, isProjectEnded } from "@/lib/services/firebase/projects";
import { formatUnits } from "@/lib/utils/impact";
import { SpendingHistoryEvent, Project, SpendingGoal, DonationEvent } from "@/lib/types/models";

type Tab = "cause" | "live";

function JarsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: Tab = rawTab === "live" || rawTab === "cause" ? rawTab : "cause";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setActiveTab(rawTab === "live" ? "live" : "cause");
  }, [rawTab]);

  const { user, profile, updateProfile } = useAuthStore();
  const { donate, editDonation, deleteDonation, donations } = useSkips();
  const { projects, refetch } = useProjects();
  const [spendingHistory, setSpendingHistory] = useState<SpendingHistoryEvent[]>([]);
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToSpendingHistory(user.uid, setSpendingHistory);
    return unsub;
  }, [user?.uid]);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editPurchaseAmountStr, setEditPurchaseAmountStr] = useState("");
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);
  const [purchaseWorking, setPurchaseWorking] = useState(false);

  if (!profile || !user) return null;

  const split = normalizeJarSplit(profile.jarSplit as any);
  const giveTotal = profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100);
  const liveTotal = profile.totalLiveAllocated ?? profile.totalSaved * (split.live / 100);
  const globalGivingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const globalSpendingBalance = Math.max(0, liveTotal - (profile.totalSpent ?? 0));

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;

  const completedChallenges = (profile.joinedProjectIds ?? [])
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p && isChallengeProject(p) && isProjectEnded(p))
    .filter((p) => (profile.causeJarBalances?.[p.id] ?? 0) > 0)
    .map((p) => ({
      project: p,
      balance: profile.causeJarBalances?.[p.id] ?? 0,
      donated: donations.filter((d) => d.causeId === p.id).reduce((sum, d) => sum + d.amount, 0),
    }));

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;

  const givingBalance = globalGivingBalance;
  const spendingBalance = globalSpendingBalance;

  async function handleSelectCause(project: Project) {
    const transfer = await switchCause(user!.uid, activeProject?.id ?? null, project.id);
    const currentBalances = profile!.causeJarBalances ?? {};
    const newCauseJarBalances = transfer
      ? Object.fromEntries(
          Object.entries({ ...currentBalances, ...transfer }).map(([k, v]) => [k, v as number])
        )
      : currentBalances;
    updateProfile({ activeProjectId: project.id, causeJarBalances: newCauseJarBalances });
  }

  async function handleSetCauseGoal(causeId: string, amount: number) {
    await setUserCauseGoal(user!.uid, causeId, amount);
    updateProfile({ causeGoalAmounts: { ...profile!.causeGoalAmounts, [causeId]: amount } });
  }

  async function handleAddCause(title: string, sponsor: string, location: string | undefined, goalAmount: number, donationURL?: string, description?: string, tags?: string[]) {
    await addCustomProject(user!.uid, { title, sponsor, location, goalAmount, donationURL, description, tags });
    await refetch();
  }

  async function handleDeactivateCause() {
    await setActiveProject(user!.uid, null);
    updateProfile({ activeProjectId: null });
  }

  async function handleDeleteCause(projectId: string) {
    await deleteCustomProject(user!.uid, projectId);
    if (profile!.activeProjectId === projectId) {
      const remaining = projects.filter((p) => p.id !== projectId && isCauseProject(p));
      const nextId = remaining[0]?.id ?? null;
      await setActiveProject(user!.uid, nextId);
      updateProfile({ activeProjectId: nextId });
    }
    await refetch();
  }

  async function handleAddGoal(goalData: Omit<SpendingGoal, "id">, activate = false): Promise<string> {
    const newGoal: SpendingGoal = { ...goalData, id: Date.now().toString() };
    const newGoals = [...spendingGoals, newGoal];
    const newActiveId = activate ? newGoal.id : activeSpendingGoalId ?? newGoal.id;
    await updateSpendingGoals(user!.uid, newGoals, newActiveId);
    updateProfile({ spendingGoals: newGoals, activeSpendingGoalId: newActiveId });
    return newGoal.id;
  }

  async function handleEditGoal(goalId: string, updates: Partial<SpendingGoal>) {
    const newGoals = spendingGoals.map((g) => {
      if (g.id !== goalId) return g;
      const merged = { ...g, ...updates };
      // Firestore rejects undefined field values — strip them before writing
      return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as unknown as SpendingGoal;
    });
    await updateSpendingGoals(user!.uid, newGoals, activeSpendingGoalId);
    updateProfile({ spendingGoals: newGoals });
  }

  async function handleDeleteGoal(goalId: string) {
    const newGoals = spendingGoals.filter((g) => g.id !== goalId);
    const newActiveId =
      activeSpendingGoalId === goalId ? (newGoals[0]?.id ?? null) : activeSpendingGoalId;
    await updateSpendingGoals(user!.uid, newGoals, newActiveId);
    updateProfile({ spendingGoals: newGoals, activeSpendingGoalId: newActiveId });
  }

  async function handleSetActiveGoal(goalId: string, moveFunds = false) {
    const transfer = await switchGoal(user!.uid, activeSpendingGoalId, goalId, moveFunds, spendingGoals);
    const currentBalances = profile!.goalJarBalances ?? {};
    const newGoalJarBalances = transfer
      ? Object.fromEntries(
          Object.entries({ ...currentBalances, ...transfer }).map(([k, v]) => [k, v as number])
        )
      : currentBalances;
    updateProfile({ activeSpendingGoalId: goalId, goalJarBalances: newGoalJarBalances });
  }

  async function handleCompleteGoal(goalId: string) {
    const goal = spendingGoals.find((g) => g.id === goalId);
    if (!goal) return;
    await completeGoal(
      user!.uid,
      goalId,
      goal.label,
      goal.targetAmount,
      spendingBalance,
      spendingGoals,
      activeSpendingGoalId
    );
    const newGoals = spendingGoals.filter((g) => g.id !== goalId);
    const newActiveId =
      activeSpendingGoalId === goalId ? (newGoals[0]?.id ?? null) : activeSpendingGoalId;
    updateProfile({
      totalSpent: (profile!.totalSpent ?? 0) + spendingBalance,
      spendingGoals: newGoals,
      activeSpendingGoalId: newActiveId,
      goalJarBalances: { ...(profile!.goalJarBalances ?? {}), [goalId]: 0 },
    });
  }

  async function handleDeactivateGoal() {
    await updateSpendingGoals(user!.uid, spendingGoals, null);
    updateProfile({ activeSpendingGoalId: null, spendingGoals, spendingGoal: null });
  }

  async function handleMoveToGive(goalId: string) {
    await transferLiveToGive(user!.uid, spendingBalance, spendingGoals, goalId, activeSpendingGoalId);
    const newGoals = spendingGoals.filter((g) => g.id !== goalId);
    const newActiveId =
      activeSpendingGoalId === goalId ? (newGoals[0]?.id ?? null) : activeSpendingGoalId;
    updateProfile({
      totalLiveAllocated: (profile!.totalLiveAllocated ?? 0) - spendingBalance,
      totalGiveAllocated: (profile!.totalGiveAllocated ?? 0) + spendingBalance,
      spendingGoals: newGoals,
      activeSpendingGoalId: newActiveId,
    });
  }

  const splurgeProps = {
    spendingBalance,
    totalLiveAllocated: liveTotal,
    totalSpent: profile.totalSpent ?? 0,
    goals: spendingGoals,
    activeGoalId: activeSpendingGoalId,
    activeGoal,
    spendingHistory,
    goalJarBalances: profile.goalJarBalances,
    onAddGoal: handleAddGoal,
    onEditGoal: handleEditGoal,
    onDeleteGoal: handleDeleteGoal,
    onSetActiveGoal: handleSetActiveGoal,
    onDeactivateGoal: handleDeactivateGoal,
    onCompleteGoal: handleCompleteGoal,
    onMoveToGive: handleMoveToGive,
    onPurchase: async (amount: number) => {
      if (!activeSpendingGoalId || !activeGoal) return;
      await recordPurchase(user.uid, activeSpendingGoalId, activeGoal.label, activeGoal.targetAmount, amount);
      updateProfile({ totalSpent: (profile.totalSpent ?? 0) + amount });
    },
    onEditHistory: (event: SpendingHistoryEvent, newAmount: number) => {
      updateProfile({ totalSpent: (profile.totalSpent ?? 0) + (newAmount - event.amountSaved) });
      return updateSpendingHistory(user.uid, event.id, newAmount, event.amountSaved);
    },
    onDeleteHistory: (event: SpendingHistoryEvent) => {
      const updates: Parameters<typeof updateProfile>[0] = { totalSpent: (profile.totalSpent ?? 0) - event.amountSaved };
      if (event.goalId) {
        updates.goalJarBalances = {
          ...(profile.goalJarBalances ?? {}),
          [event.goalId]: (profile.goalJarBalances?.[event.goalId] ?? 0) + event.amountSaved,
        };
      }
      updateProfile(updates);
      return deleteSpendingHistory(user.uid, event.id, event.amountSaved, event.goalId);
    },
  };

  const currentSplit = normalizeJarSplit(profile.jarSplit as any);
  const [splitGive, setSplitGive] = useState(currentSplit.give);
  const [savingSplit, setSavingSplit] = useState(false);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      {/* Jar split card */}
      <div className="rounded-2xl p-4 mb-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Preferred Jar Split</p>
        <div className="flex justify-between mb-2">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--green-primary)" }}>🤲 Giving Jar</p>
            <p className="text-xl font-black" style={{ color: "var(--green-primary)" }}>{splitGive}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold" style={{ color: "#8B5CF6" }}>😊 Reward Jar</p>
            <p className="text-xl font-black" style={{ color: "#8B5CF6" }}>{100 - splitGive}%</p>
          </div>
        </div>
        {/* Two-tone track */}
        <div className="relative h-2 rounded-full mb-4 overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${splitGive}%`, background: "linear-gradient(90deg, var(--green-primary), #2ECC71)" }} />
          <div className="absolute inset-y-0 right-0 rounded-full" style={{ width: `${100 - splitGive}%`, background: "linear-gradient(90deg, #7C3AED, #8B5CF6)" }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={splitGive}
          onChange={(e) => setSplitGive(Number(e.target.value))}
          className="w-full mb-4"
          style={{ accentColor: "var(--green-primary)", height: 4 }}
        />
        {splitGive !== currentSplit.give && (
          <button
            disabled={savingSplit}
            onClick={async () => {
              setSavingSplit(true);
              const { updateJarSettings } = await import("@/lib/services/firebase/users");
              await updateJarSettings(user.uid, { give: splitGive, live: 100 - splitGive }, null);
              updateProfile({ jarSplit: { give: splitGive, live: 100 - splitGive } });
              setSavingSplit(false);
            }}
            className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--green-primary)", color: "#0B1A14" }}
          >
            {savingSplit ? "Saving…" : "Save split"}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex rounded-2xl p-1 mb-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        <button
          onClick={() => router.push("/jars?tab=cause")}
          className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
          style={activeTab === "cause"
            ? { background: "var(--green-primary)", color: "#0B1A14" }
            : { color: "var(--text-muted)" }}
        >
          My Giving Jar
        </button>
        <button
          onClick={() => router.push("/jars?tab=live")}
          className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
          style={activeTab === "live"
            ? { background: "#8B5CF6", color: "white" }
            : { color: "var(--text-muted)" }}
        >
          My Reward Jar
        </button>
      </div>

      {activeTab === "live" ? (
        <SplurgeTab {...splurgeProps} />
      ) : (
        <div className="space-y-5">
          <CauseTab
            uid={user.uid}
            projects={projects}
            activeProject={activeProject}
            givingBalance={givingBalance}
            donations={donations}
            causeJarBalances={profile.causeJarBalances}
            causeGoalAmounts={profile.causeGoalAmounts}
            completedChallenges={completedChallenges}
            onSelectCause={handleSelectCause}
            onSetGoal={handleSetCauseGoal}
            onDeactivateCause={handleDeactivateCause}
            onAddCause={handleAddCause}
            onEditCause={async (projectId, data) => {
              await updateCustomProject(user!.uid, projectId, data);
              await refetch();
            }}
            onDeleteCause={handleDeleteCause}
            onDonate={(amount) =>
              donate(amount, activeProject?.id ?? "giving", activeProject?.title ?? "Giving")
            }
            onDonateCompleted={(amount, projectId, projectTitle) =>
              donate(amount, projectId, projectTitle)
            }
            onEditDonation={editDonation}
            onDeleteDonation={deleteDonation}
            onShowCommunityChallenges={() => router.push("/challenges")}
            totalGiveAllocated={giveTotal}
            totalDonated={profile.totalDonated ?? 0}
          />
        </div>
      )}
    </div>
  );
}

export default function JarsPage() {
  return (
    <Suspense>
      <JarsPageInner />
    </Suspense>
  );
}

function JarPreview({ fillPct, color, gradEnd, label, amount, emptyPrompt, unitDisplay, unitCount, centerValue, centerLabel, goalAmount, hideTopLabel }: {
  fillPct: number;
  color: string;
  gradEnd: string;
  label: string | null;
  amount: string;
  emptyPrompt: string;
  unitDisplay?: string;
  unitCount?: number;
  centerValue?: string;
  centerLabel?: string;
  goalAmount?: number;
  hideTopLabel?: boolean;
}) {
  const clamp = Math.min(Math.max(fillPct, 0), 100);
  const w = 130;
  const h = 185;
  const scale = w / 120;
  const fillH = (clamp / 100) * 120 * scale;
  const jarH = 170 * scale;
  const yStart = jarH - fillH;
  const uid = `${label ?? emptyPrompt}-${color}-${Math.round(clamp)}`.replace(/\W/g, "");

  const jarPath = makeJarPath(scale);

  return (
    <div className="flex flex-col items-center" style={{ marginBottom: hideTopLabel ? 0 : 20 }}>
      {!hideTopLabel && (
        <div style={{
          fontSize: label ? 14 : 13,
          fontWeight: label ? 700 : 600,
          color: label ? color : "rgba(255,255,255,0.55)",
          textAlign: "center",
          marginBottom: 6,
          maxWidth: w,
          lineHeight: 1.3,
          padding: "0 4px",
        }}>
          {label ?? emptyPrompt}
        </div>
      )}

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={`jp-gf-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={gradEnd} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <linearGradient id={`jp-glass-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
          </linearGradient>
          <linearGradient id={`jp-shine-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id={`jp-soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy={3*scale} stdDeviation={4*scale} floodColor={color} floodOpacity="0.25" />
          </filter>
          <clipPath id={`jp-jc-${uid}`}>
            <path d={jarPath} />
          </clipPath>
        </defs>

        <ellipse cx={60*scale} cy={169*scale} rx={38*scale} ry={7*scale} fill="rgba(0,0,0,0.22)" />
        <path d={jarPath} fill={`url(#jp-glass-${uid})`} />

        <g clipPath={`url(#jp-jc-${uid})`}>
          {clamp > 0 && (
            <rect
              x={15*scale} y={yStart}
              width={90*scale} height={fillH + 15*scale}
              fill={`url(#jp-gf-${uid})`}
              rx={4*scale}
              filter={`url(#jp-soft-${uid})`}
            >
              <animate attributeName="y" from={jarH} to={yStart} dur="1.2s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
            </rect>
          )}
          {clamp > 4 && (
            <path
              d={`M${15*scale},${yStart} Q${37*scale},${yStart-5*scale} ${60*scale},${yStart} T${105*scale},${yStart}`}
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={2*scale}
              strokeLinecap="round"
            />
          )}
          {clamp > 10 && (
            <circle cx={40*scale} cy={yStart + fillH*0.4} r={3*scale} fill="rgba(255,255,255,0.24)">
              <animate attributeName="cy" values={`${yStart+fillH*0.7};${yStart+fillH*0.1}`} dur="3s" repeatCount="indefinite" />
            </circle>
          )}
          {clamp > 18 && (
            <circle cx={76*scale} cy={yStart + fillH*0.58} r={2*scale} fill="rgba(255,255,255,0.18)">
              <animate attributeName="cy" values={`${yStart+fillH*0.82};${yStart+fillH*0.25}`} dur="4s" repeatCount="indefinite" />
            </circle>
          )}
        </g>

        <path
          d={`M${45*scale},${16*scale} L${45*scale},${28*scale} M${75*scale},${16*scale} L${75*scale},${28*scale}`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1.5*scale}
          strokeLinecap="round"
        />
        <path d={jarPath} fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth={2.4*scale} strokeLinejoin="round" />
        <path
          d={`M${36*scale},${46*scale} Q${28*scale},${82*scale} ${35*scale},${139*scale}`}
          fill="none"
          stroke={`url(#jp-shine-${uid})`}
          strokeWidth={4*scale}
          strokeLinecap="round"
          opacity="0.85"
        />

        {unitDisplay && unitCount !== undefined ? (
          <>
            <text x={60*scale} y={84*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={15*scale} fontWeight="800"
              fill={clamp > 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"}
              style={{ fontFamily: "inherit" }}>
              {unitCount >= 10 ? Math.round(unitCount) : parseFloat(unitCount.toFixed(1))}
            </text>
            <text x={60*scale} y={102*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={7*scale} fontWeight="600" fill="rgba(255,255,255,0.65)"
              style={{ fontFamily: "inherit" }}>
              {unitDisplay}
            </text>
            <text x={60*scale} y={114*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={6*scale} fontWeight="500" fill="rgba(255,255,255,0.4)"
              style={{ fontFamily: "inherit" }}>
              pledged
            </text>
          </>
        ) : (
          <>
            <text x={60*scale} y={92*scale} textAnchor="middle" dominantBaseline="middle"
              transform={goalAmount && goalAmount > 0 ? `translate(0 ${-8*scale})` : undefined}
              fontSize={(centerValue && centerValue.length > 4 ? 14 : 17)*scale} fontWeight="800"
              fill={clamp > 0 || centerValue ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"}
              style={{ fontFamily: "inherit" }}>
              {centerValue ?? `${Math.round(clamp)}%`}
            </text>
            {(clamp > 0 || centerLabel) && (
              <text x={60*scale} y={112*scale} textAnchor="middle" dominantBaseline="middle"
                transform={goalAmount && goalAmount > 0 ? `translate(0 ${-10*scale})` : undefined}
                fontSize={7*scale} fontWeight="600" fill="rgba(255,255,255,0.5)"
                style={{ fontFamily: "inherit" }}>
                {goalAmount && goalAmount > 0 ? "to goal of" : centerLabel ?? "to goal"}
              </text>
            )}
            {goalAmount && goalAmount > 0 && (
              <text x={60*scale} y={114*scale} textAnchor="middle" dominantBaseline="middle"
                fontSize={7*scale} fontWeight="700" fill="rgba(255,255,255,0.72)"
                style={{ fontFamily: "inherit" }}>
                {formatCurrency(goalAmount)}
              </text>
            )}
          </>
        )}
      </svg>

      <div style={{ fontSize: 26, fontWeight: 800, color: label ? "var(--text-primary)" : "var(--text-muted)", marginTop: 2 }}>
        {amount}
      </div>
    </div>
  );
}

function makeJarPath(scale: number) {
  return [
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
}

function getCategoryFallback(project: Project): { img: string | null; abbr: string; color: string } {
  if (project.tags?.includes("education")) return { img: "/categories/education.png", abbr: "EDU", color: "#2ECC71" };
  if (project.tags?.includes("food"))      return { img: "/categories/meal.png",      abbr: "MEAL", color: "#F59E0B" };
  if (project.tags?.includes("health"))    return { img: "/categories/health.png",    abbr: "CARE", color: "#3B82F6" };
  if (project.isCustom) return { img: null, abbr: project.title.slice(0, 3).toUpperCase(), color: "#8B5CF6" };
  return { img: null, abbr: "GIVE", color: "#2ECC71" };
}

/* ── Giving Jar Tab ── */
function CauseTab({
  projects,
  activeProject,
  givingBalance,
  donations,
  causeJarBalances,
  completedChallenges,
  onDonate,
  onDonateCompleted,
  onEditDonation,
  onDeleteDonation,
  onShowCommunityChallenges,
  totalGiveAllocated,
  totalDonated,
}: {
  uid: string;
  projects: Project[];
  activeProject: Project | null;
  givingBalance: number;
  donations: DonationEvent[];
  causeJarBalances: Record<string, number> | undefined;
  causeGoalAmounts: Record<string, number> | undefined;
  completedChallenges: { project: Project; balance: number; donated: number }[];
  onSelectCause: (p: Project) => void;
  onSetGoal: (causeId: string, amount: number) => Promise<void>;
  onDeactivateCause: () => Promise<void>;
  onAddCause: (title: string, sponsor: string, location: string | undefined, goalAmount: number, donationURL?: string, description?: string, tags?: string[]) => Promise<void>;
  onEditCause: (projectId: string, data: { title: string; sponsor: string; location?: string; goalAmount: number; donationURL?: string; description?: string }) => Promise<void>;
  onDeleteCause: (projectId: string) => Promise<void>;
  onDonate: (amount: number) => Promise<void>;
  onDonateCompleted: (amount: number, projectId: string, projectTitle: string) => Promise<void>;
  onEditDonation: (donation: DonationEvent, newAmount: number) => Promise<void>;
  onDeleteDonation: (donation: DonationEvent) => Promise<void>;
  onShowCommunityChallenges: () => void;
  totalGiveAllocated: number;
  totalDonated: number;
}) {
  const [showLogDonation, setShowLogDonation] = useState(false);
  const [donateAmountStr, setDonateAmountStr] = useState("");
  const [donating, setDonating] = useState(false);
  const [editingDonationId, setEditingDonationId] = useState<string | null>(null);
  const [editDonationAmountStr, setEditDonationAmountStr] = useState("");
  const [deletingDonationId, setDeletingDonationId] = useState<string | null>(null);
  const [donationWorking, setDonationWorking] = useState(false);
  const [completedDonateId, setCompletedDonateId] = useState<string | null>(null);
  const [completedDonateAmountStr, setCompletedDonateAmountStr] = useState("");
  const [completedDonating, setCompletedDonating] = useState(false);

  const completedIds = new Set(completedChallenges.map((c) => c.project.id));

  return (
    <div className="space-y-5">
      {/* Scoreboard card */}
      {activeProject ? (
        <div className="rounded-2xl p-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>
            {activeProject.sponsor ? `${activeProject.sponsor}` : "Active Challenge"}
          </p>
          <p className="text-base font-black leading-snug mb-4" style={{ color: "var(--text-primary)" }}>
            {activeProject.title}
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Lifetime Given</p>
              <p className="text-lg font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalGiveAllocated)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Donated</p>
              <p className="text-lg font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalDonated)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.35)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#2ECC71" }}>Jar Balance</p>
              <p className="text-lg font-extrabold leading-tight" style={{ color: "#2ECC71" }}>{formatCurrency(givingBalance)}</p>
            </div>
          </div>
          {showLogDonation ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={donateAmountStr}
                  onChange={(e) => setDonateAmountStr(e.target.value)}
                  className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid #2ECC71", color: "var(--text-primary)" }}
                  autoFocus
                />
              </div>
              <button
                onClick={async () => {
                  const amt = parseFloat(donateAmountStr);
                  if (!amt || amt <= 0) return;
                  setDonating(true);
                  await onDonate(amt);
                  setDonateAmountStr("");
                  setShowLogDonation(false);
                  setDonating(false);
                }}
                disabled={donating || !donateAmountStr || parseFloat(donateAmountStr) <= 0}
                className="px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#0B1A14" }}
              >{donating ? "…" : "✓"}</button>
              <button
                onClick={() => { setShowLogDonation(false); setDonateAmountStr(""); }}
                className="px-3 py-2 rounded-xl text-sm"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >✕</button>
            </div>
          ) : (
            <div className="flex gap-2">
              {activeProject?.donationURL && (
                <a
                  href={activeProject.donationURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl text-center"
                  style={{ background: "#2ECC71", color: "#0B1A14", textDecoration: "none" }}
                >Donate ↗</a>
              )}
              <button
                onClick={() => setShowLogDonation(true)}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl"
                style={activeProject?.donationURL
                  ? { border: "1px solid rgba(46,204,113,0.4)", color: "#2ECC71" }
                  : { background: "#2ECC71", color: "#0B1A14" }}
              >Log Donation</button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-surface-1)", border: "1px dashed rgba(46,204,113,0.3)" }}>
          <p className="text-lg font-black mb-1" style={{ color: "var(--text-primary)" }}>No active challenge</p>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Join a challenge to start saving toward a cause with others.
          </p>
          <button
            onClick={onShowCommunityChallenges}
            className="px-6 py-2.5 rounded-full text-sm font-bold"
            style={{ background: "var(--green-primary)", color: "#0B1A14" }}
          >
            Browse Challenges
          </button>
        </div>
      )}

      {/* Completed Challenges */}
      {completedChallenges.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Completed Challenges</p>
          <div className="space-y-4">
            {completedChallenges.map(({ project: p, balance, donated }) => (
              <div key={p.id}>
                <p className="text-sm font-black leading-snug" style={{ color: "var(--text-primary)" }}>{p.groupName || p.title}</p>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{p.sponsor}</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "Saved", value: formatCurrency(balance + donated), color: "var(--text-primary)" },
                    { label: "Donated", value: formatCurrency(donated), color: "#2ECC71" },
                    { label: "Remaining", value: formatCurrency(balance), color: "#F59E0B" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                      <p className="text-sm font-extrabold" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {completedDonateId === p.id ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={completedDonateAmountStr}
                        onChange={(e) => setCompletedDonateAmountStr(e.target.value)}
                        className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface-2)", border: "1px solid #F59E0B", color: "var(--text-primary)" }}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={async () => {
                        const amt = parseFloat(completedDonateAmountStr);
                        if (!amt || amt <= 0) return;
                        setCompletedDonating(true);
                        await onDonateCompleted(amt, p.id, p.groupName || p.title);
                        setCompletedDonateAmountStr("");
                        setCompletedDonateId(null);
                        setCompletedDonating(false);
                      }}
                      disabled={completedDonating || !completedDonateAmountStr || parseFloat(completedDonateAmountStr) <= 0}
                      className="px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                      style={{ background: "#F59E0B", color: "#0B1A14" }}
                    >{completedDonating ? "…" : "✓"}</button>
                    <button
                      onClick={() => { setCompletedDonateId(null); setCompletedDonateAmountStr(""); }}
                      className="px-3 py-2 rounded-xl text-sm"
                      style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
                    >✕</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {p.donationURL && (
                      <a
                        href={p.donationURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 text-sm font-bold rounded-xl text-center"
                        style={{ background: "#F59E0B", color: "#0B1A14", textDecoration: "none" }}
                      >Donate ↗</a>
                    )}
                    <button
                      onClick={() => { setCompletedDonateId(p.id); setCompletedDonateAmountStr(""); }}
                      className="flex-1 py-2.5 text-sm font-bold rounded-xl"
                      style={p.donationURL
                        ? { border: "1px solid rgba(245,158,11,0.4)", color: "#F59E0B" }
                        : { background: "#F59E0B", color: "#0B1A14" }}
                    >Log Donation</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Donation history */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Donations</p>
        {donations.length === 0 ? (
          <p className="text-xs py-1" style={{ color: "var(--text-muted)" }}>No donations yet — your jar doesn&apos;t need to be full to give!</p>
        ) : (
          <div className="space-y-1">
            {donations.map((d) => (
              <div key={d.id}>
                {editingDonationId === d.id ? (
                  <div className="flex gap-2 py-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[rgba(237,245,240,0.6)]">$</span>
                      <input
                        type="number"
                        value={editDonationAmountStr}
                        onChange={(e) => setEditDonationAmountStr(e.target.value)}
                        className="w-full pl-6 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--green-primary)", color: "var(--text-primary)" }}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={async () => {
                        const newAmount = parseFloat(editDonationAmountStr);
                        if (!newAmount || newAmount <= 0) return;
                        setDonationWorking(true);
                        await onEditDonation(d, newAmount);
                        setEditingDonationId(null);
                        setDonationWorking(false);
                      }}
                      disabled={donationWorking}
                      className="text-xs bg-[#2ECC71] text-[#0B1A14] px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {donationWorking ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingDonationId(null)} className="text-xs border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1.5 rounded-lg">Cancel</button>
                  </div>
                ) : deletingDonationId === d.id ? (
                  <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/30">
                    <p className="text-xs text-red-400">Delete {formatCurrency(d.amount)} to {d.causeTitle}?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setDonationWorking(true);
                          await onDeleteDonation(d);
                          setDeletingDonationId(null);
                          setDonationWorking(false);
                        }}
                        disabled={donationWorking}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        {donationWorking ? "…" : "Delete"}
                      </button>
                      <button onClick={() => setDeletingDonationId(null)} className="text-xs border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <div>
                      <p className="text-sm text-[#EDF5F0]">{d.causeTitle}</p>
                      <p className="text-xs text-[rgba(237,245,240,0.35)]">{d.date ?? (d.donatedAt?.toDate ? d.donatedAt.toDate().toLocaleDateString() : "")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-[#2ECC71]">{formatCurrency(d.amount)}</span>
                      <button onClick={() => { setEditingDonationId(d.id); setEditDonationAmountStr(String(d.amount)); }} className="text-white/30 hover:text-[#2ECC71] text-base p-1">✏️</button>
                      <button onClick={() => setDeletingDonationId(d.id)} className="text-white/30 hover:text-red-400 text-base p-1">🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-[rgba(237,245,240,0.35)] text-center mt-6 leading-relaxed">
        I Skipped connects you with charitable organizations. Donations are processed directly by each organization. I Skipped does not handle or hold any donation funds.
      </p>
    </div>
  );
}


function pickMilestoneStep(targetAmount: number): number {
  const oneFifth = targetAmount * 0.2;
  return [10, 25, 50, 100].reduce((best, m) =>
    Math.abs(m - oneFifth) < Math.abs(best - oneFifth) ? m : best
  );
}

function getNextMilestone(targetAmount: number, balance: number): { value: number; need: number } | null {
  if (balance >= targetAmount) return null;
  const step = pickMilestoneStep(targetAmount);
  const next = Math.min(Math.ceil((balance + 0.01) / step) * step, targetAmount);
  return { value: next, need: Math.max(0, next - balance) };
}

/* ── Compact Reward Jar (shown on combined My Jars view) ── */
function CompactRewardJar({
  spendingBalance,
  totalLiveAllocated,
  totalSpent,
  activeGoal,
  onPurchase,
  onManageRewards,
}: {
  spendingBalance: number;
  totalLiveAllocated: number;
  totalSpent: number;
  activeGoal: SpendingGoal | null;
  onPurchase: (amount: number) => Promise<void>;
  onManageRewards: () => void;
}) {
  const [showPurchaseInput, setShowPurchaseInput] = useState(false);
  const [purchaseAmountStr, setPurchaseAmountStr] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  const pct = activeGoal && activeGoal.targetAmount > 0
    ? Math.min(100, Math.round((spendingBalance / activeGoal.targetAmount) * 100))
    : 0;

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(139,92,246,0.3)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide font-bold" style={{ color: "#8B5CF6" }}>Reward Jar</p>
        <button
          onClick={onManageRewards}
          className="text-xs font-semibold"
          style={{ color: "var(--text-muted)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          Manage rewards →
        </button>
      </div>

      {/* Balance + goal */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {activeGoal ? (
            <>
              <p className="text-base font-black leading-snug" style={{ color: "var(--text-primary)" }}>{activeGoal.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {formatCurrency(spendingBalance)} of {formatCurrency(activeGoal.targetAmount)} goal
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>No reward set</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black" style={{ color: "#8B5CF6" }}>{formatCurrency(spendingBalance)}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>in jar</p>
        </div>
      </div>

      {/* Progress bar */}
      {activeGoal && activeGoal.targetAmount > 0 && (
        <div className="mb-3">
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: "#8B5CF6" }}
            />
          </div>
          <p className="text-xs mt-1 text-right" style={{ color: "var(--text-muted)" }}>{pct}%</p>
        </div>
      )}

      {/* Action buttons */}
      {showPurchaseInput ? (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
            <input
              type="number"
              placeholder={activeGoal ? String(activeGoal.targetAmount) : "0.00"}
              value={purchaseAmountStr}
              onChange={(e) => setPurchaseAmountStr(e.target.value)}
              className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid #8B5CF6", color: "var(--text-primary)" }}
              autoFocus
            />
          </div>
          <button
            onClick={async () => {
              const amt = parseFloat(purchaseAmountStr);
              if (!amt || amt <= 0) return;
              setPurchasing(true);
              await onPurchase(amt);
              setPurchaseAmountStr("");
              setShowPurchaseInput(false);
              setPurchasing(false);
            }}
            disabled={purchasing || !purchaseAmountStr || parseFloat(purchaseAmountStr) <= 0}
            className="px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: "#8B5CF6", color: "white" }}
          >
            {purchasing ? "…" : "✓"}
          </button>
          <button
            onClick={() => { setShowPurchaseInput(false); setPurchaseAmountStr(""); }}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ border: "1px solid rgba(139,92,246,0.3)", color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>
      ) : activeGoal ? (
        <div className="flex gap-2">
          {activeGoal.shoppingLink ? (
            <a
              href={activeGoal.shoppingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 text-sm font-bold rounded-xl text-center"
              style={{ background: "#8B5CF6", color: "white" }}
            >
              Buy Now ↗
            </a>
          ) : null}
          <button
            onClick={() => { setShowPurchaseInput(true); setPurchaseAmountStr(String(activeGoal.targetAmount)); }}
            className="flex-1 py-2 text-sm font-semibold rounded-xl"
            style={activeGoal.shoppingLink
              ? { border: "1px solid rgba(139,92,246,0.4)", color: "#8B5CF6" }
              : { background: "#8B5CF6", color: "white" }
            }
          >
            Log Purchase
          </button>
          {!activeGoal.shoppingLink && (
            <button
              onClick={onManageRewards}
              className="flex-1 py-2 text-sm font-semibold rounded-xl"
              style={{ border: "1px solid rgba(139,92,246,0.3)", color: "var(--text-muted)" }}
            >
              Manage →
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={onManageRewards}
          className="w-full py-2.5 text-sm font-bold rounded-xl"
          style={{ background: "#8B5CF6", color: "white" }}
        >
          Set a Reward Goal
        </button>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-surface-2)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Lifetime Saved</p>
          <p className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalLiveAllocated)}</p>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "#8B5CF6" }}>In Jar</p>
          <p className="text-sm font-extrabold" style={{ color: "#8B5CF6" }}>{formatCurrency(spendingBalance)}</p>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-surface-2)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Lifetime Spent</p>
          <p className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalSpent)}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Splurge Tab ── */
function SplurgeTab({
  spendingBalance,
  totalLiveAllocated,
  totalSpent,
  goals,
  activeGoalId,
  activeGoal: activeGoalProp,
  spendingHistory,
  goalJarBalances,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onSetActiveGoal,
  onDeactivateGoal,
  onCompleteGoal,
  onMoveToGive,
  onPurchase,
  onEditHistory,
  onDeleteHistory,
}: {
  spendingBalance: number;
  totalLiveAllocated: number;
  totalSpent: number;
  goals: SpendingGoal[];
  activeGoalId: string | null;
  activeGoal: SpendingGoal | null;
  spendingHistory: SpendingHistoryEvent[];
  goalJarBalances: Record<string, number> | undefined;
  onAddGoal: (goal: Omit<SpendingGoal, "id">, activate?: boolean) => Promise<string>;
  onEditGoal: (goalId: string, updates: Partial<SpendingGoal>) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
  onSetActiveGoal: (goalId: string, moveFunds: boolean) => Promise<void>;
  onDeactivateGoal: () => Promise<void>;
  onCompleteGoal: (goalId: string) => Promise<void>;
  onMoveToGive: (goalId: string) => Promise<void>;
  onPurchase: (amount: number) => Promise<void>;
  onEditHistory: (event: SpendingHistoryEvent, newAmount: number) => Promise<void>;
  onDeleteHistory: (event: SpendingHistoryEvent) => Promise<void>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addLink, setAddLink] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editWorking, setEditWorking] = useState(false);

  const [completing, setCompleting] = useState(false);
  const [deletingActiveGoal, setDeletingActiveGoal] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [movingToGive, setMovingToGive] = useState(false);

  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editHistoryAmountStr, setEditHistoryAmountStr] = useState("");
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [historyWorking, setHistoryWorking] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<SpendingGoal | null>(null);

  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseAmountStr, setPurchaseAmountStr] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [deactivatingGoal, setDeactivatingGoal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [rewardFilter, setRewardFilter] = useState<"all" | "prebuilt" | "custom">("all");

  const activeGoal = activeGoalProp;
  const rewardPresets = [
    { label: "Coffee Date", amount: 25, note: "Small treat" },
    { label: "New Book", amount: 40, note: "Quiet win" },
    { label: "Dinner Out", amount: 75, note: "Night off" },
    { label: "New Shoes", amount: 120, note: "Worth waiting" },
    { label: "Weekend Trip", amount: 300, note: "Bigger goal" },
  ];
  const savedRewardNames = new Set(goals.map((goal) => goal.label.trim().toLowerCase()));
  const suggestedRewards = rewardPresets.filter((preset) => !savedRewardNames.has(preset.label.toLowerCase()));

  function handleSetActiveGoalWithCheck(goal: SpendingGoal) {
    if (activeGoalId && activeGoalId !== goal.id) {
      setSwitchTarget(goal);
    } else {
      onSetActiveGoal(goal.id, false);
    }
  }

  async function handleAddGoal() {
    const amount = parseFloat(addAmount);
    if (!addLabel.trim() || !amount || amount <= 0) return;
    setSaving(true);
    const goal: Omit<SpendingGoal, "id"> = {
      label: addLabel.trim(),
      targetAmount: amount,
      type: "splurge",
    };
    if (addLink.trim()) goal.shoppingLink = addLink.trim();
    await onAddGoal(goal);
    setAddLabel("");
    setAddAmount("");
    setAddLink("");
    setShowAddForm(false);
    setSaving(false);
  }

  async function handleAddPresetGoal(label: string, amount: number) {
    const existingGoal = goals.find(
      (goal) => goal.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (existingGoal) {
      handleSetActiveGoalWithCheck(existingGoal);
      return;
    }

    setSaving(true);
    await onAddGoal({
      label,
      targetAmount: amount,
      type: "splurge",
    }, true);
    setSaving(false);
  }

  function startEditGoal(goal: SpendingGoal) {
    setEditingGoalId(goal.id);
    setEditLabel(goal.label);
    setEditAmount(String(goal.targetAmount));
    setEditLink(goal.shoppingLink ?? goal.donationURL ?? "");
  }

  async function handleEditGoalSave(goalId: string, goalType: "splurge" | "donation") {
    const amount = parseFloat(editAmount);
    if (!editLabel.trim() || !amount || amount <= 0) return;
    setEditWorking(true);
    const updates: Partial<SpendingGoal> = { label: editLabel.trim(), targetAmount: amount };
    if (editLink.trim()) {
      if (goalType === "splurge") updates.shoppingLink = editLink.trim();
      else updates.donationURL = editLink.trim();
    } else {
      updates.shoppingLink = undefined;
      updates.donationURL = undefined;
    }
    await onEditGoal(goalId, updates);
    setEditingGoalId(null);
    setEditWorking(false);
  }

  return (
    <div className="space-y-4">
      {/* Switch modal */}
      {switchTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwitchTarget(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setSwitchTarget(null)} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Switch active goal?</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                You have <span className="font-semibold" style={{ color: "#8B5CF6" }}>{formatCurrency(spendingBalance)}</span> saved toward <span className="font-semibold">{activeGoal?.label}</span>. What would you like to do with it?
              </p>
            </div>
            <div>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                style={{ borderBottom: "1px solid var(--border-default)" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { setSwitchTarget(null); if (activeGoalId) setPurchasingId(activeGoalId); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {activeGoal?.type === "donation" ? "Log a donation first" : "Log a purchase first"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Enter how much you spent, then switch</p>
              </button>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { onSetActiveGoal(switchTarget.id, true); setSwitchTarget(null); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>→ Move balance to {switchTarget.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Your balance will count toward the new goal</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate goal modal */}
      {deactivatingGoal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setDeactivatingGoal(false)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setDeactivatingGoal(false)} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Deactivate this goal?</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                Deactivating will park your {formatCurrency(spendingBalance)} Reward Jar balance until you pick a new reward.
              </p>
            </div>
            <div className="px-5 py-4 flex gap-2">
              <button
                onClick={async () => { setDeactivating(true); await onDeactivateGoal(); setDeactivating(false); setDeactivatingGoal(false); }}
                disabled={deactivating}
                className="flex-1 py-2.5 font-semibold rounded-xl text-sm disabled:opacity-50"
                style={{ background: "#8B5CF6", color: "white" }}
              >
                {deactivating ? "Deactivating…" : "Deactivate"}
              </button>
              <button
                onClick={() => setDeactivatingGoal(false)}
                className="flex-1 py-2.5 font-semibold rounded-xl text-sm"
                style={{ border: "1px solid rgba(139,92,246,0.3)", color: "rgba(237,245,240,0.6)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active goal summary card */}
      {activeGoal ? (() => {
        const pct = activeGoal.targetAmount > 0
          ? Math.min(100, Math.round((spendingBalance / activeGoal.targetAmount) * 100))
          : 0;
        const isEditing = editingGoalId === activeGoal.id;
        return (
          <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>

            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  placeholder="Savings goal name"
                  autoFocus
                />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    placeholder="Target amount"
                  />
                </div>
                <input
                  type="url"
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  placeholder="Shopping link (optional)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditGoalSave(activeGoal.id, activeGoal.type)}
                    disabled={editWorking}
                    className="flex-1 bg-[#8B5CF6] text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-50"
                  >
                    {editWorking ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingGoalId(null)}
                    className="px-4 py-2 text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm"
                    style={{ border: "1px solid rgba(139,92,246,0.12)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                  Current active reward: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{activeGoal.label}</span>
                </p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Lifetime Saved</p>
                    <p className="text-lg font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalLiveAllocated)}</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Lifetime Spent</p>
                    <p className="text-lg font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalSpent)}</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.35)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#8B5CF6" }}>In Current Reward Jar</p>
                    <p className="text-lg font-extrabold leading-tight" style={{ color: "#8B5CF6" }}>{formatCurrency(spendingBalance)}</p>
                  </div>
                </div>
                <div className="mt-3">
                {purchasingId === activeGoal.id ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={purchaseAmountStr}
                        onChange={(e) => setPurchaseAmountStr(e.target.value)}
                        className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid #8B5CF6", color: "var(--text-primary)" }}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={async () => {
                        const amt = parseFloat(purchaseAmountStr);
                        if (!amt || amt <= 0) return;
                        setPurchasing(true);
                        await onPurchase(amt);
                        setPurchaseAmountStr("");
                        setPurchasingId(null);
                        setPurchasing(false);
                      }}
                      disabled={purchasing || !purchaseAmountStr || parseFloat(purchaseAmountStr) <= 0}
                      className="w-full bg-[#8B5CF6] text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
                    >
                      {purchasing ? "…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => { setPurchasingId(null); setPurchaseAmountStr(""); }}
                      className="w-full text-[rgba(237,245,240,0.6)] px-3 py-2 rounded-xl text-sm"
                      style={{ border: "1px solid rgba(139,92,246,0.12)" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {activeGoal.shoppingLink && (
                      <a
                        href={activeGoal.shoppingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center py-2.5 font-bold rounded-xl text-sm"
                        style={{ background: "#8B5CF6", color: "white", textDecoration: "none" }}
                      >
                        Buy Now ↗
                      </a>
                    )}
                    <button
                      onClick={() => { setPurchasingId(activeGoal.id); setPurchaseAmountStr(String(activeGoal.targetAmount)); }}
                      className="flex-1 py-2.5 font-bold rounded-xl text-sm"
                      style={activeGoal.shoppingLink
                        ? { border: "1px solid rgba(139,92,246,0.4)", color: "#8B5CF6" }
                        : { background: "#8B5CF6", color: "white" }}
                    >
                      Log Purchase
                    </button>
                  </div>
                    )}
                </div>

                {deletingActiveGoal && (
                  <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <p className="text-xs font-semibold text-[#EDF5F0]">Delete &quot;{activeGoal.label}&quot;?</p>
                    {spendingBalance > 0 && (
                      <p className="text-xs text-[rgba(237,245,240,0.6)]">You have {formatCurrency(spendingBalance)} in this jar.</p>
                    )}
                    {spendingBalance > 0 ? (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => { setCompleting(true); onCompleteGoal(activeGoal.id).then(() => { setDeletingActiveGoal(false); setCompleting(false); }); }}
                          disabled={completing || movingToGive}
                          className="w-full bg-[#8B5CF6] text-white font-semibold py-2 rounded-xl text-xs disabled:opacity-50"
                        >
                          {completing ? "…" : "🛒 Mark as Purchased"}
                        </button>
<button onClick={() => setDeletingActiveGoal(false)} className="w-full text-[rgba(237,245,240,0.6)] font-semibold py-2 rounded-xl text-xs" style={{ border: "1px solid rgba(139,92,246,0.12)" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { onDeleteGoal(activeGoal.id).then(() => setDeletingActiveGoal(false)); }} className="flex-1 bg-red-500 text-white font-semibold py-1.5 rounded-xl text-xs">Delete</button>
                        <button onClick={() => setDeletingActiveGoal(false)} className="flex-1 text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-xl text-xs" style={{ border: "1px solid rgba(139,92,246,0.12)" }}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })() : (
        <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(139,92,246,0.35)" }}>
          <div className="flex items-center justify-between gap-4">
            <div style={{ minWidth: 0 }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Reward Jar</p>
              <p className="text-3xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                {formatCurrency(spendingBalance)}
              </p>
              <p className="text-sm mt-1" style={{ color: "#8B5CF6", fontWeight: 700 }}>
                {spendingBalance > 0 ? "ready to assign" : "ready for your next skip"}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Choose where this reward goes, then future skips will fill the jar.
              </p>
            </div>
            <JarPreview
              fillPct={spendingBalance > 0 ? 14 : 0}
              color="#8B5CF6"
              gradEnd="#6D28D9"
              label={null}
              amount=""
              emptyPrompt="Pick a reward"
              centerValue={spendingBalance > 0 ? formatCurrency(spendingBalance) : "$0"}
              centerLabel={spendingBalance > 0 ? "ready" : "saved"}
            />
          </div>
        </div>
      )}

      {/* Edit form for inactive goals */}
      {editingGoalId && editingGoalId !== activeGoalId && (() => {
        const goal = goals.find((g) => g.id === editingGoalId);
        if (!goal) return null;
        return (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Edit reward</p>
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              placeholder="Savings goal name"
              autoFocus
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                placeholder="Target amount"
              />
            </div>
            <input
              type="url"
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              placeholder="Shopping link (optional)"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleEditGoalSave(goal.id, goal.type)}
                disabled={editWorking}
                className="flex-1 bg-[#8B5CF6] text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-50"
              >
                {editWorking ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingGoalId(null)}
                className="px-4 py-2 text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm"
                style={{ border: "1px solid rgba(139,92,246,0.12)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Rewards list */}
      {!showAddForm && !editingGoalId && (
        <div className="mt-2">
          {/* Filter tabs */}
          <div className="flex gap-1.5 mb-3">
            {(["all", "prebuilt", "custom"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setRewardFilter(f)}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={rewardFilter === f
                  ? { background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.45)", color: "#8B5CF6" }
                  : { background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                {f === "all" ? "All" : f === "prebuilt" ? "Pre-built" : "Custom"}
              </button>
            ))}
          </div>
          {/* Add button */}
          <div className="flex justify-start mb-4">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2.5 rounded-full text-sm font-black shrink-0"
              style={{ background: "white", color: "#0B1A14", border: "none" }}
            >
              + Add a Reward
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Pre-built cards */}
            {rewardFilter !== "custom" && rewardPresets.map((preset) => {
              const matchingGoal = goals.find(
                (g) => g.label.toLowerCase() === preset.label.toLowerCase() && g.targetAmount === preset.amount
              );
              const isActive = matchingGoal?.id === activeGoalId;
              return (
                <button
                  key={`preset-${preset.label}`}
                  onClick={() => handleAddPresetGoal(preset.label, preset.amount)}
                  disabled={saving}
                  className="rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: isActive ? "rgba(139,92,246,0.16)" : "var(--bg-surface-1)",
                    border: isActive ? "2px solid #8B5CF6" : "1px solid rgba(139,92,246,0.3)",
                  }}
                >
                  {isActive && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 inline-block" style={{ background: "rgba(139,92,246,0.2)", color: "#8B5CF6" }}>
                      Active
                    </span>
                  )}
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Pre-built</div>
                  <div className="text-sm font-bold mb-1" style={{ color: "#8B5CF6" }}>{preset.label}</div>
                  <div className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{formatCurrency(preset.amount)}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{matchingGoal ? "tap to activate" : preset.note}</div>
                </button>
              );
            })}

            {/* Custom goal cards */}
            {rewardFilter !== "prebuilt" && goals.map((goal) => {
              const isActiveGoal = goal.id === activeGoalId;
              return (
                <div
                  key={goal.id}
                  className="rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] relative"
                  style={{ background: "var(--bg-surface-1)", border: deletingGoalId === goal.id ? "1px solid rgba(239,68,68,0.4)" : isActiveGoal ? "2px solid #8B5CF6" : "1px solid rgba(139,92,246,0.3)" }}
                >
                  <div className="absolute top-2 right-2 flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { startEditGoal(goal); setDeletingGoalId(null); }} className="text-[rgba(237,245,240,0.3)] hover:text-[#8B5CF6] p-1 text-sm leading-none" title="Edit">✏️</button>
                    <button onClick={() => setDeletingGoalId(deletingGoalId === goal.id ? null : goal.id)} className="text-[rgba(237,245,240,0.3)] hover:text-red-400 p-1 text-sm leading-none" title="Delete">🗑️</button>
                  </div>
                  {deletingGoalId === goal.id ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs text-red-400 mb-2 pr-12">Delete &quot;{goal.label}&quot;?</p>
                      <div className="flex gap-1.5">
                        <button onClick={() => { onDeleteGoal(goal.id); setDeletingGoalId(null); }} className="flex-1 bg-red-500 text-white font-semibold py-1.5 rounded-lg text-xs">Delete</button>
                        <button onClick={() => setDeletingGoalId(null)} className="flex-1 text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-lg text-xs" style={{ border: "1px solid rgba(139,92,246,0.12)" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => !isActiveGoal && handleSetActiveGoalWithCheck(goal)} className={isActiveGoal ? "" : "cursor-pointer"}>
                      {isActiveGoal && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 inline-block" style={{ background: "rgba(139,92,246,0.15)", color: "#8B5CF6" }}>✓ Active</span>
                      )}
                      <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Custom</div>
                      <div className="text-sm font-bold mb-1 pr-12" style={{ color: "#8B5CF6" }}>{goal.label}</div>
                      <div className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{formatCurrency(goal.targetAmount)}</div>
                      {!isActiveGoal && <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>tap to activate</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom reward form */}
      {showAddForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Create Reward</p>
          <input
            type="text"
            placeholder="e.g. AirPods, Vacation, Shoes"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
            <input
              type="number"
              placeholder="Target amount"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">🔗</span>
            <input
              type="url"
              placeholder="Shopping link (optional)"
              value={addLink}
              onChange={(e) => setAddLink(e.target.value)}
              className="w-full pl-10 rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddGoal}
              disabled={saving || !addLabel.trim() || !addAmount}
              className="flex-1 py-3 bg-[#8B5CF6] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Reward"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddLabel(""); setAddAmount(""); setAddLink(""); }}
              className="px-5 py-3 text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm hover:text-[#EDF5F0] transition-colors"
              style={{ border: "1px solid rgba(139,92,246,0.12)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spending history */}
      <div>
        <p className="text-xs font-semibold text-[rgba(237,245,240,0.85)] uppercase tracking-wide mb-2 mt-2">Purchases</p>
        {spendingHistory.length === 0 ? (
          <div className="rounded-2xl px-4 py-3" style={{ background: "var(--bg-surface-1)", border: "1px dashed rgba(139,92,246,0.25)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>No purchases yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              When you buy a reward, it will show up here as proof your skips turned into something real.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {spendingHistory.map((event) => (
              <div key={event.id}>
                {editingHistoryId === event.id ? (
                  <div className="flex gap-2 py-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[rgba(237,245,240,0.6)]">$</span>
                      <input
                        type="number"
                        value={editHistoryAmountStr}
                        onChange={(e) => setEditHistoryAmountStr(e.target.value)}
                        className="w-full pl-6 rounded-lg px-2 py-1.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid #8B5CF6", color: "var(--text-primary)" }}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={async () => {
                        const newAmount = parseFloat(editHistoryAmountStr);
                        if (!newAmount || newAmount <= 0) return;
                        setHistoryWorking(true);
                        await onEditHistory(event, newAmount);
                        setEditingHistoryId(null);
                        setHistoryWorking(false);
                      }}
                      disabled={historyWorking}
                      className="text-xs bg-[#8B5CF6] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {historyWorking ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingHistoryId(null)} className="text-xs border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1.5 rounded-lg">Cancel</button>
                  </div>
                ) : deletingHistoryId === event.id ? (
                  <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/30">
                    <p className="text-xs text-red-400">Delete {event.label}?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setHistoryWorking(true);
                          await onDeleteHistory(event);
                          setDeletingHistoryId(null);
                          setHistoryWorking(false);
                        }}
                        disabled={historyWorking}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        {historyWorking ? "…" : "Delete"}
                      </button>
                      <button onClick={() => setDeletingHistoryId(null)} className="text-xs border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between py-1.5">
                    <div>
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{event.label}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>goal: {formatCurrency(event.targetAmount)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#8B5CF6]">{formatCurrency(event.amountSaved)}</p>
                      <button onClick={() => { setEditingHistoryId(event.id); setEditHistoryAmountStr(String(event.amountSaved)); }} className="text-[rgba(237,245,240,0.35)] hover:text-[#8B5CF6] text-base p-1">✏️</button>
                      <button onClick={() => setDeletingHistoryId(event.id)} className="text-[rgba(237,245,240,0.35)] hover:text-red-400 text-base p-1">🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
