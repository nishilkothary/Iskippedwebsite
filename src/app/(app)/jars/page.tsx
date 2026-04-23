"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  subscribeToDonations,
  setUserCauseGoal,
} from "@/lib/services/firebase/users";
import { addCustomProject, updateCustomProject, deleteCustomProject } from "@/lib/services/firebase/projects";
import { formatUnits } from "@/lib/utils/impact";
import { SpendingHistoryEvent, Project, SpendingGoal, DonationEvent } from "@/lib/types/models";

type Tab = "cause" | "live";

function JarsPageInner() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: Tab = rawTab === "live" || rawTab === "cause" ? rawTab : "cause";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setActiveTab(rawTab === "live" ? "live" : "cause");
  }, [rawTab]);

  const { user, profile, updateProfile } = useAuthStore();
  const { donate, editDonation, deleteDonation } = useSkips();
  const { projects, refetch } = useProjects();
  const [spendingHistory, setSpendingHistory] = useState<SpendingHistoryEvent[]>([]);
  const [donations, setDonations] = useState<DonationEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToSpendingHistory(user.uid, setSpendingHistory);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToDonations(user.uid, setDonations);
    return unsub;
  }, [user?.uid]);

  if (!profile || !user) return null;

  const split = normalizeJarSplit(profile.jarSplit as any);
  const giveTotal = profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100);
  const liveTotal = profile.totalLiveAllocated ?? profile.totalSaved * (split.live / 100);
  const globalGivingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const globalSpendingBalance = Math.max(0, liveTotal - (profile.totalSpent ?? 0));

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;

  const givingBalance = globalGivingBalance;
  const spendingBalance = globalSpendingBalance;

  async function handleSelectCause(project: Project, moveFunds: boolean) {
    const transfer = await switchCause(user!.uid, activeProject?.id ?? null, project.id, moveFunds);
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

  async function handleAddCause(title: string, sponsor: string, location: string | undefined, goalAmount: number, donationURL?: string) {
    await addCustomProject(user!.uid, { title, sponsor, location, goalAmount, donationURL });
    await refetch();
  }

  async function handleDeactivateCause() {
    await setActiveProject(user!.uid, null);
    updateProfile({ activeProjectId: null });
  }

  async function handleDeleteCause(projectId: string) {
    await deleteCustomProject(projectId);
    if (profile!.activeProjectId === projectId) {
      const remaining = projects.filter((p) => p.id !== projectId);
      const nextId = remaining[0]?.id ?? null;
      await setActiveProject(user!.uid, nextId ?? "");
      updateProfile({ activeProjectId: nextId });
    }
    await refetch();
  }

  async function handleAddGoal(goalData: Omit<SpendingGoal, "id">) {
    const newGoal: SpendingGoal = { ...goalData, id: Date.now().toString() };
    const newGoals = [...spendingGoals, newGoal];
    const newActiveId = activeSpendingGoalId ?? newGoal.id;
    await updateSpendingGoals(user!.uid, newGoals, newActiveId);
    updateProfile({ spendingGoals: newGoals, activeSpendingGoalId: newActiveId });
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

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "cause", label: "Give a Little", emoji: "🤲" },
    { id: "live",  label: "Save a Little", emoji: "😊" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold mb-5" style={{ color: "var(--text-primary)" }}>
        {activeTab === "cause" ? "🤲 Give a Little" : "😊 Save a Little"}
      </h1>

      {activeTab === "cause" && (
        <CauseTab
          uid={user.uid}
          projects={projects}
          activeProject={activeProject}
          givingBalance={givingBalance}
          donations={donations}
          causeJarBalances={profile.causeJarBalances}
          causeGoalAmounts={profile.causeGoalAmounts}
          onSelectCause={handleSelectCause}
          onSetGoal={handleSetCauseGoal}
          onDeactivateCause={handleDeactivateCause}
          onAddCause={handleAddCause}
          onEditCause={async (projectId, data) => {
            await updateCustomProject(projectId, { ...data });
            await refetch();
          }}
          onDeleteCause={handleDeleteCause}
          onDonate={(amount) =>
            donate(amount, activeProject?.id ?? "giving", activeProject?.title ?? "Giving")
          }
          onEditDonation={editDonation}
          onDeleteDonation={deleteDonation}
        />
      )}

      {activeTab === "live" && (
        <SplurgeTab
          spendingBalance={spendingBalance}
          goals={spendingGoals}
          activeGoalId={activeSpendingGoalId}
          activeGoal={activeGoal}
          spendingHistory={spendingHistory}
          goalJarBalances={profile.goalJarBalances}
          onAddGoal={handleAddGoal}
          onEditGoal={handleEditGoal}
          onDeleteGoal={handleDeleteGoal}
          onSetActiveGoal={handleSetActiveGoal}
          onDeactivateGoal={handleDeactivateGoal}
          onCompleteGoal={handleCompleteGoal}
          onMoveToGive={handleMoveToGive}
          onPurchase={async (amount) => {
            if (!activeSpendingGoalId || !activeGoal) return;
            await recordPurchase(user.uid, activeSpendingGoalId, activeGoal.label, activeGoal.targetAmount, amount);
            updateProfile({ totalSpent: (profile.totalSpent ?? 0) + amount });
          }}
          onEditHistory={(event, newAmount) => {
            updateProfile({ totalSpent: (profile.totalSpent ?? 0) + (newAmount - event.amountSaved) });
            return updateSpendingHistory(user.uid, event.id, newAmount, event.amountSaved);
          }}
          onDeleteHistory={(event) => {
            const updates: Parameters<typeof updateProfile>[0] = { totalSpent: (profile.totalSpent ?? 0) - event.amountSaved };
            if (event.goalId) {
              updates.goalJarBalances = {
                ...(profile.goalJarBalances ?? {}),
                [event.goalId]: (profile.goalJarBalances?.[event.goalId] ?? 0) + event.amountSaved,
              };
            }
            updateProfile(updates);
            return deleteSpendingHistory(user.uid, event.id, event.amountSaved, event.goalId);
          }}
        />
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

function JarPreview({ fillPct, color, gradEnd, label, amount, emptyPrompt, unitDisplay, unitCount }: {
  fillPct: number;
  color: string;
  gradEnd: string;
  label: string | null;
  amount: string;
  emptyPrompt: string;
  unitDisplay?: string;
  unitCount?: number;
}) {
  const clamp = Math.min(Math.max(fillPct, 0), 100);
  const w = 130;
  const h = 185;
  const scale = w / 120;
  const fillH = (clamp / 100) * 120 * scale;
  const jarH = 170 * scale;
  const yStart = jarH - fillH;
  const uid = (label ?? "empty").replace(/\W/g, "");

  const jarPath = makeJarPath(scale);

  return (
    <div className="flex flex-col items-center mb-5">
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

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={`jp-gf-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={gradEnd} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <clipPath id={`jp-jc-${uid}`}>
            <path d={jarPath} />
          </clipPath>
        </defs>

        <g clipPath={`url(#jp-jc-${uid})`}>
          {clamp > 0 && (
            <rect
              x={15*scale} y={yStart}
              width={90*scale} height={fillH + 15*scale}
              fill={`url(#jp-gf-${uid})`}
              rx={4*scale}
            >
              <animate attributeName="y" from={jarH} to={yStart} dur="1.2s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
            </rect>
          )}
          {clamp > 10 && (
            <circle cx={40*scale} cy={yStart + fillH*0.4} r={3*scale} fill="rgba(255,255,255,0.2)">
              <animate attributeName="cy" values={`${yStart+fillH*0.7};${yStart+fillH*0.1}`} dur="3s" repeatCount="indefinite" />
            </circle>
          )}
        </g>

        <path d={jarPath} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={2*scale} strokeLinejoin="round" />

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
              funded
            </text>
          </>
        ) : (
          <>
            <text x={60*scale} y={92*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={17*scale} fontWeight="800"
              fill={clamp > 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"}
              style={{ fontFamily: "inherit" }}>
              {Math.round(clamp)}%
            </text>
            {clamp > 0 && (
              <text x={60*scale} y={112*scale} textAnchor="middle" dominantBaseline="middle"
                fontSize={7*scale} fontWeight="600" fill="rgba(255,255,255,0.5)"
                style={{ fontFamily: "inherit" }}>
                to goal
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

/* ── Cause Tab ── */
function CauseTab({
  uid,
  projects,
  activeProject,
  givingBalance,
  donations,
  causeJarBalances,
  causeGoalAmounts,
  onSelectCause,
  onSetGoal,
  onDeactivateCause,
  onAddCause,
  onEditCause,
  onDeleteCause,
  onDonate,
  onEditDonation,
  onDeleteDonation,
}: {
  uid: string;
  projects: Project[];
  activeProject: Project | null;
  givingBalance: number;
  donations: DonationEvent[];
  causeJarBalances: Record<string, number> | undefined;
  causeGoalAmounts: Record<string, number> | undefined;
  onSelectCause: (p: Project, moveFunds: boolean) => void;
  onSetGoal: (causeId: string, amount: number) => Promise<void>;
  onDeactivateCause: () => Promise<void>;
  onAddCause: (title: string, sponsor: string, location: string | undefined, goalAmount: number, donationURL?: string) => Promise<void>;
  onEditCause: (projectId: string, data: { title: string; sponsor: string; location?: string; goalAmount: number; donationURL?: string }) => Promise<void>;
  onDeleteCause: (projectId: string) => Promise<void>;
  onDonate: (amount: number) => Promise<void>;
  onEditDonation: (donation: DonationEvent, newAmount: number) => Promise<void>;
  onDeleteDonation: (donation: DonationEvent) => Promise<void>;
}) {
  const [donatingId, setDonatingId] = useState<string | null>(null);
  const [donateAmountStr, setDonateAmountStr] = useState("");
  const [donating, setDonating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customSponsor, setCustomSponsor] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [customGoalStr, setCustomGoalStr] = useState("");
  const [customURL, setCustomURL] = useState("");
  const [addingCause, setAddingCause] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<Project | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSponsor, setEditSponsor] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editGoalStr, setEditGoalStr] = useState("");
  const [editURL, setEditURL] = useState("");
  const [editWorking, setEditWorking] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingDonationId, setEditingDonationId] = useState<string | null>(null);
  const [goalSettingProject, setGoalSettingProject] = useState<Project | null>(null);
  const [goalInputStr, setGoalInputStr] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [editDonationAmountStr, setEditDonationAmountStr] = useState("");
  const [deletingDonationId, setDeletingDonationId] = useState<string | null>(null);
  const [donationWorking, setDonationWorking] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  async function handleDelete(projectId: string) {
    setDeleting(true);
    await onDeleteCause(projectId);
    setConfirmDeleteId(null);
    setDeleting(false);
  }

  function startEdit(project: Project) {
    setEditingProjectId(project.id);
    setEditTitle(project.title);
    setEditSponsor(project.sponsor);
    setEditLocation(project.location ?? "");
    setEditGoalStr(project.goalAmount > 0 ? String(project.goalAmount) : "");
    setEditURL(project.donationURL ?? "");
  }

  async function handleEditSave(projectId: string) {
    if (!editTitle.trim()) return;
    setEditWorking(true);
    await onEditCause(projectId, {
      title: editTitle.trim(),
      sponsor: editSponsor.trim(),
      location: editLocation.trim() || undefined,
      goalAmount: parseFloat(editGoalStr) || 0,
      donationURL: editURL.trim() || undefined,
    });
    setEditingProjectId(null);
    setEditWorking(false);
  }

  async function handleAddCause() {
    if (!customTitle.trim()) return;
    const goalAmount = parseFloat(customGoalStr) || 0;
    setAddingCause(true);
    await onAddCause(customTitle.trim(), customSponsor.trim(), customLocation.trim() || undefined, goalAmount, customURL.trim() || undefined);
    setCustomTitle("");
    setCustomSponsor("");
    setCustomLocation("");
    setCustomGoalStr("");
    setCustomURL("");
    setShowAddForm(false);
    setAddingCause(false);
  }

  function handleSetActive(project: Project) {
    if (activeProject && activeProject.id !== project.id) {
      setSwitchTarget(project);
    } else {
      onSelectCause(project, false);
      setGoalInputStr(causeGoalAmounts?.[project.id] ? String(causeGoalAmounts[project.id]) : "");
      setGoalSettingProject(project);
    }
  }

  function CauseDonateRow({ project }: { project: Project }) {
    return (
      <div className="mt-3 space-y-2">
        {project.donationURL && (
          <a
            href={project.donationURL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2 font-semibold rounded-xl transition-colors text-xs"
            style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
          >
            🌍 Donate →
          </a>
        )}
        {donatingId === project.id ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={donateAmountStr}
                  onChange={(e) => setDonateAmountStr(e.target.value)}
                  className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
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
                  setDonatingId(null);
                  setDonating(false);
                }}
                disabled={donating || !donateAmountStr || parseFloat(donateAmountStr) <= 0}
                className="bg-[#2ECC71] text-[#0B1A14] font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
              >
                {donating ? "…" : "Confirm"}
              </button>
              <button
                onClick={() => { setDonatingId(null); setDonateAmountStr(""); }}
                className="border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-2 rounded-xl text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDonatingId(project.id)}
              className="w-full py-2 bg-[#2ECC71] text-[#0B1A14] font-semibold rounded-xl hover:bg-[#1DB954] transition-colors text-xs"
            >
              💸 I Donated
            </button>
          )
        }
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Deactivate confirm modal */}
      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setDeactivateConfirm(false)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setDeactivateConfirm(false)} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Deactivate this jar?</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                You have <span className="font-semibold" style={{ color: "var(--coral-primary)" }}>{formatCurrency(givingBalance)}</span> in your Give a Little jar. After deactivating, it stays available until you pick a new cause.
              </p>
            </div>
            <div className="px-5 py-4 flex gap-2">
              <button
                onClick={async () => {
                  setDeactivating(true);
                  await onDeactivateCause();
                  setDeactivating(false);
                  setDeactivateConfirm(false);
                }}
                disabled={deactivating}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ background: "var(--coral-primary)", color: "#fff", border: "none", cursor: "pointer", opacity: deactivating ? 0.6 : 1 }}
              >
                {deactivating ? "Deactivating…" : "Deactivate"}
              </button>
              <button
                onClick={() => setDeactivateConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "transparent", border: "1px solid var(--border-emphasis)", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch modal */}
      {switchTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwitchTarget(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setSwitchTarget(null)} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Switch active cause?</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                You have <span className="font-semibold" style={{ color: "var(--coral-primary)" }}>{formatCurrency(givingBalance)}</span> saved toward <span className="font-semibold">{activeProject?.title}</span>. What would you like to do with it?
              </p>
            </div>
            <div>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                style={{ borderBottom: "1px solid var(--border-default)" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { setSwitchTarget(null); setDonatingId(activeProject?.id ?? null); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Log a donation first</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Enter how much you donated, then switch</p>
              </button>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { onSelectCause(switchTarget, true); setSwitchTarget(null); setGoalInputStr(causeGoalAmounts?.[switchTarget.id] ? String(causeGoalAmounts[switchTarget.id]) : ""); setGoalSettingProject(switchTarget); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>→ Move balance to {switchTarget.title}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Existing savings count toward the new cause</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal-setting modal */}
      {goalSettingProject && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setGoalSettingProject(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setGoalSettingProject(null)} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Set a saving goal</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{goalSettingProject.title}</p>
              {goalSettingProject.unitName && goalSettingProject.unitCost && (
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "#2BBAA4" }}>
                  1 {goalSettingProject.unitName} = {goalSettingProject.unitCost < 1 ? `${Math.round(goalSettingProject.unitCost * 100)}¢` : formatCurrency(goalSettingProject.unitCost)}
                </p>
              )}
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>How much do you want to save toward this cause?</p>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 25"
                value={goalInputStr}
                onChange={(e) => setGoalInputStr(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
              {(() => {
                const dollars = parseFloat(goalInputStr);
                if (!dollars || dollars <= 0) return null;
                const { unitName, unitCost, unitDisplay, unitIsGoal } = goalSettingProject;
                if (unitName && unitCost && !unitIsGoal) {
                  const count = dollars / unitCost;
                  const display = count >= 10 ? Math.round(count) : parseFloat(count.toFixed(1));
                  return <p className="text-xs font-semibold" style={{ color: "#2BBAA4" }}>≈ {display} {unitDisplay ?? unitName.toLowerCase()}</p>;
                } else if (unitName && unitCost && unitIsGoal) {
                  const pct = Math.round((dollars / unitCost) * 100);
                  return <p className="text-xs font-semibold" style={{ color: "#2BBAA4" }}>≈ {pct}% of 1 {unitName}</p>;
                }
                return null;
              })()}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={async () => {
                    const dollars = parseFloat(goalInputStr);
                    if (!dollars || dollars <= 0) return;
                    setSavingGoal(true);
                    await onSetGoal(goalSettingProject.id, dollars);
                    setSavingGoal(false);
                    setGoalSettingProject(null);
                  }}
                  disabled={savingGoal || !parseFloat(goalInputStr) || parseFloat(goalInputStr) <= 0}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors"
                  style={{ background: "#2BBAA4", color: "#fff", border: "none", cursor: "pointer", opacity: savingGoal ? 0.6 : 1 }}
                >
                  {savingGoal ? "Saving…" : "Save Goal"}
                </button>
                <button
                  onClick={() => setGoalSettingProject(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "transparent", border: "1px solid var(--border-emphasis)", color: "var(--text-secondary)", cursor: "pointer" }}
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>Delete this cause?</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>This can&apos;t be undone.</p>
            </div>
            <div className="px-5 py-4 flex gap-2">
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 font-semibold py-2.5 rounded-xl text-sm"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Give impact summary */}
      {activeProject ? (
        <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <p className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>My Active Giving Jar</p>
          {(() => {
            const personalGoal = causeGoalAmounts?.[activeProject.id] ?? activeProject.goalAmount ?? 0;
            const pct = personalGoal > 0 ? Math.round(Math.min(100, (givingBalance / personalGoal) * 100)) : null;
            const unitFormatted = activeProject.unitCost && !activeProject.unitIsGoal && activeProject.unitName
              ? formatUnits(givingBalance, activeProject.unitCost, activeProject.unitName)
              : null;
            return (
              <>
                {pct !== null ? (
                  <div className="mb-2">
                    <span className="text-3xl font-extrabold" style={{ color: "#2BBAA4" }}>{pct}%</span>
                    <span className="text-sm ml-1.5" style={{ color: "var(--text-muted)" }}>towards goal</span>
                  </div>
                ) : (
                  <div className="mb-2">
                    <span className="text-3xl font-extrabold" style={{ color: "#2BBAA4" }}>{formatCurrency(givingBalance)}</span>
                    <span className="text-sm ml-1.5" style={{ color: "var(--text-muted)" }}>saved</span>
                  </div>
                )}
                {unitFormatted !== null && (
                  <p className="text-sm font-semibold mb-3" style={{ color: "#2BBAA4" }}>
                    {unitFormatted} funded
                  </p>
                )}
              </>
            );
          })()}
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>{activeProject.title}</p>
          <CauseDonateRow project={activeProject} />
        </div>
      ) : (
        <div className="mb-4 px-1">
          <p className="text-2xl font-extrabold" style={{ color: "#2BBAA4" }}>{formatCurrency(givingBalance)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Available to give — pick a cause below</p>
        </div>
      )}

      {/* All causes */}
      <div>
        <p className="text-xl font-bold text-[#EDF5F0] mb-3">Featured Causes</p>
        <div className="space-y-3">
          {projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            const isEditing = editingProjectId === project.id;
            return (
              <div
                key={project.id}
                className="rounded-2xl p-3"
                style={{
                  background: isActive ? "rgba(255,255,255,0.04)" : "var(--bg-surface-1)",
                  border: isActive ? "2px solid rgba(255,255,255,0.7)" : "1px solid var(--border-default)",
                }}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Cause (e.g. A Student's Yearly Education)"
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editSponsor}
                      onChange={(e) => setEditSponsor(e.target.value)}
                      placeholder="Organization (e.g. Caring for Cambodia)"
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="Location (optional, e.g. Cambodia)"
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
                      <input
                        type="number"
                        value={editGoalStr}
                        onChange={(e) => setEditGoalStr(e.target.value)}
                        placeholder="Skipped Amount Needed"
                        className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      />
                    </div>
                    <input
                      type="url"
                      value={editURL}
                      onChange={(e) => setEditURL(e.target.value)}
                      placeholder="Donation link (optional)"
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditSave(project.id)}
                        disabled={editWorking || !editTitle.trim()}
                        className="flex-1 bg-[#2ECC71] text-[#0B1A14] font-semibold py-2 rounded-xl text-sm disabled:opacity-50"
                      >
                        {editWorking ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingProjectId(null)}
                        className="px-4 py-2 border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {isActive ? (
                      <>
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="font-extrabold text-[#EDF5F0] text-base flex-1 min-w-0">{project.title}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {project.isCustom && (
                              <>
                                <button onClick={() => startEdit(project)} className="p-1 text-base" style={{ color: "var(--text-muted)" }} title="Edit">✏️</button>
                                <button onClick={() => setConfirmDeleteId(project.id)} className="text-[rgba(237,245,240,0.35)] hover:text-red-400 p-1 text-base" title="Delete">🗑️</button>
                              </>
                            )}
                            <button
                              onClick={() => setDeactivateConfirm(true)}
                              className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(232,99,122,0.15)", color: "var(--coral-primary)", border: "none", cursor: "pointer" }}
                            >
                              ✓ Active
                            </button>
                          </div>
                        </div>
                        {project.unitName && project.unitCost ? (
                          <p className="text-sm font-bold text-[#2ECC71] mt-1">
                            1 {project.unitName} = {project.unitCost < 1 ? `${Math.round(project.unitCost * 100)}¢` : formatCurrency(project.unitCost)}
                          </p>
                        ) : project.goalAmount > 0 ? (
                          <p className="text-sm font-bold text-[#2ECC71] mt-1">
                            Goal: {formatCurrency(project.goalAmount)}
                          </p>
                        ) : null}
                        <p className="text-sm text-[rgba(237,245,240,0.6)] mt-0.5">Organization: {project.sponsor}</p>
                        {project.donationURL && (
                          <a href={project.donationURL} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2ECC71] underline mt-0.5 block">
                            ↗ Learn more
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="font-extrabold text-[#EDF5F0] text-base flex-1 min-w-0">{project.title}</p>
                          {project.isCustom && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button onClick={() => startEdit(project)} className="p-1 text-base" style={{ color: "var(--text-muted)" }} title="Edit">✏️</button>
                              <button onClick={() => setConfirmDeleteId(project.id)} className="text-[rgba(237,245,240,0.35)] hover:text-red-400 p-1 text-base" title="Delete">🗑️</button>
                            </div>
                          )}
                        </div>
                        {project.unitName && project.unitCost ? (
                          <p className="text-sm font-bold text-[#2ECC71] mt-1">
                            1 {project.unitName} = {project.unitCost < 1 ? `${Math.round(project.unitCost * 100)}¢` : formatCurrency(project.unitCost)}
                          </p>
                        ) : project.goalAmount > 0 ? (
                          <p className="text-sm font-bold text-[#2ECC71] mt-1">
                            Goal: {formatCurrency(project.goalAmount)}
                          </p>
                        ) : null}
                        <p className="text-sm text-[rgba(237,245,240,0.6)] mt-0.5">Organization: {project.sponsor}</p>
                        {project.donationURL && (
                          <a href={project.donationURL} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2ECC71] underline mt-0.5 block">
                            ↗ Learn more
                          </a>
                        )}
                        <button
                          onClick={() => handleSetActive(project)}
                          className="mt-3 w-full py-2 text-xs font-semibold text-[#2ECC71] border border-[#2ECC71] rounded-xl hover:bg-[#162E23] transition-colors"
                        >
                          Set as My Jar
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Add your own cause */}
        {showAddForm ? (
          <div className="mt-3 rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Add your own cause</p>
            <input
              type="text"
              placeholder="Cause (e.g. A Student's Yearly Education)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
            <input
              type="text"
              placeholder="Organization (e.g. Caring for Cambodia)"
              value={customSponsor}
              onChange={(e) => setCustomSponsor(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
            <input
              type="text"
              placeholder="Location (optional, e.g. Cambodia)"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
              <input
                type="number"
                placeholder="Skipped Amount Needed"
                value={customGoalStr}
                onChange={(e) => setCustomGoalStr(e.target.value)}
                className="w-full pl-7 rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>
            <input
              type="url"
              placeholder="Donation link (optional)"
              value={customURL}
              onChange={(e) => setCustomURL(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddCause}
                disabled={addingCause || !customTitle.trim()}
                className="flex-1 bg-[#2ECC71] text-[#0B1A14] font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {addingCause ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setCustomTitle(""); setCustomSponsor(""); setCustomLocation(""); setCustomGoalStr(""); setCustomURL(""); }}
                className="px-4 py-2.5 border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm hover:text-[#EDF5F0] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 w-full py-2.5 border border-dashed border-[rgba(46,204,113,0.25)] text-white font-bold rounded-xl hover:border-[#2ECC71] hover:text-[#2ECC71] transition-colors text-sm"
          >
            ＋ Add your own cause
          </button>
        )}

        {/* Donation history */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-[rgba(237,245,240,0.85)] uppercase tracking-wide mb-2">Donations</p>
          {donations.length === 0 ? (
            <p className="text-xs text-[rgba(237,245,240,0.35)] py-2">No donations yet — your jar doesn&apos;t need to be full to give!</p>
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
                          className="w-full pl-6 rounded-lg px-2 py-1.5 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--green-primary)", color: "var(--text-primary)" }}
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
    </div>
  );
}

const PREBUILT_REWARDS = [
  { label: "Concert Tickets", targetAmount: 150 },
  { label: "Vacation Fund", targetAmount: 1000 },
  { label: "New Kicks", targetAmount: 120 },
];

/* ── Splurge Tab ── */
function SplurgeTab({
  spendingBalance,
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
  goals: SpendingGoal[];
  activeGoalId: string | null;
  activeGoal: SpendingGoal | null;
  spendingHistory: SpendingHistoryEvent[];
  goalJarBalances: Record<string, number> | undefined;
  onAddGoal: (goal: Omit<SpendingGoal, "id">) => Promise<void>;
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

  const [confirmCompleteId, setConfirmCompleteId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [deletingActiveGoal, setDeletingActiveGoal] = useState(false);
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

  const activeGoal = activeGoalProp;

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

  async function handleComplete(goalId: string) {
    setCompleting(true);
    await onCompleteGoal(goalId);
    setConfirmCompleteId(null);
    setCompleting(false);
  }

  async function handleDeleteGoal(goalId: string) {
    await onDeleteGoal(goalId);
    setDeletingGoalId(null);
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

      {/* My Active Reward Jar scoreboard — only when a goal is active */}
      {activeGoal ? (
        <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>My Active Reward Jar</p>
          <div className="mb-3">
            <span className="text-3xl font-extrabold" style={{ color: "#8B5CF6" }}>
              {Math.round(Math.min(100, (spendingBalance / activeGoal.targetAmount) * 100))}%
            </span>
            <span className="text-sm ml-1.5" style={{ color: "var(--text-muted)" }}>towards goal</span>
          </div>
          <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>{activeGoal.label}</p>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>My reward costs: {formatCurrency(activeGoal.targetAmount)}</p>
          <div className="space-y-2">
            {activeGoal.shoppingLink && (
              <a
                href={activeGoal.shoppingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-2 font-semibold rounded-xl transition-colors text-xs"
                style={{ border: "1px solid rgba(139,92,246,0.4)", color: "#8B5CF6" }}
              >
                🛒 Shop now →
              </a>
            )}
            {purchasingId === activeGoal.id ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
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
                  className="bg-[#8B5CF6] text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
                >
                  {purchasing ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => { setPurchasingId(null); setPurchaseAmountStr(""); }}
                  className="text-[rgba(237,245,240,0.6)] px-3 py-2 rounded-xl text-sm"
                  style={{ border: "1px solid rgba(139,92,246,0.12)" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPurchasingId(activeGoal.id)}
                className="w-full py-2 font-semibold rounded-xl hover:opacity-90 transition-colors text-xs"
                style={{ background: "#8B5CF6", color: "white" }}
              >
                🛍️ I Bought It
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-4 px-1">
          <p className="text-2xl font-extrabold" style={{ color: "#8B5CF6" }}>{formatCurrency(spendingBalance)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Available to spend — pick a savings goal below</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <p className="text-xl font-bold text-[#EDF5F0]">I am Saving for...</p>
        <span className="text-sm font-bold text-[#8B5CF6]">{formatCurrency(spendingBalance)} available</span>
      </div>

      {/* Goal list — all goals */}
      {goals.length > 0 && (
        <div className="space-y-3 mt-4">
          {goals.map((goal) => {
            const isActive = goal.id === activeGoalId;
            const isEditing = editingGoalId === goal.id;
            const isConfirmComplete = confirmCompleteId === goal.id;
            const isConfirmDelete = deletingGoalId === goal.id;

            return (
              <div
                key={goal.id}
                className="rounded-2xl p-3 transition-all"
                style={{
                  background: isActive ? "rgba(255,255,255,0.04)" : "var(--bg-surface-1)",
                  border: isActive ? "2px solid rgba(255,255,255,0.7)" : "1px solid var(--border-default)",
                }}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      placeholder="Savings goal name"
                      autoFocus
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        placeholder="Skipped Amount Needed"
                      />
                    </div>
                    <input
                      type="url"
                      value={editLink}
                      onChange={(e) => setEditLink(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      placeholder={goal.type === "splurge" ? "Shopping link (optional)" : "Donation link (optional)"}
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
                        className="px-4 py-2 border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {isActive ? (
                      <>
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="font-extrabold text-[#EDF5F0] text-base flex-1 min-w-0 mr-2">{goal.label}</p>
                          <button
                            onClick={() => { setDeactivatingGoal(true); setDeletingActiveGoal(false); setConfirmCompleteId(null); }}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: "rgba(139,92,246,0.15)", color: "#8B5CF6", border: "none", cursor: "pointer" }}
                          >
                            ✓ Active
                          </button>
                        </div>
                        {goal.targetAmount > 0 && (
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-[rgba(237,245,240,0.5)]">My reward costs: {formatCurrency(goal.targetAmount)}</p>
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEditGoal(goal)} className="text-[rgba(237,245,240,0.35)] hover:text-[#8B5CF6] p-1 text-base" title="Edit">✏️</button>
                              <button onClick={() => (setDeletingActiveGoal(true), setConfirmCompleteId(null), setDeactivatingGoal(false))} className="text-[rgba(237,245,240,0.35)] hover:text-red-400 p-1 text-base" title="Delete">🗑️</button>
                            </div>
                          </div>
                        )}

                        {/* Deactivate confirmation */}
                        {deactivatingGoal && (
                          <div className="mt-2 rounded-xl p-3" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}>
                            <p className="text-xs font-semibold text-[#EDF5F0] mb-1">Deactivate &quot;{goal.label}&quot;?</p>
                            <p className="text-xs text-[rgba(237,245,240,0.6)] mb-2">
                              Your {formatCurrency(spendingBalance)} balance stays in your reward jar.
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={async () => { setDeactivating(true); await onDeactivateGoal(); setDeactivatingGoal(false); setDeactivating(false); }}
                                disabled={deactivating}
                                className="flex-1 font-semibold py-1.5 rounded-xl text-xs disabled:opacity-50"
                                style={{ background: "#8B5CF6", color: "white", border: "none", cursor: "pointer" }}
                              >
                                {deactivating ? "…" : "Deactivate"}
                              </button>
                              <button
                                onClick={() => setDeactivatingGoal(false)}
                                className="flex-1 font-semibold py-1.5 rounded-xl text-xs"
                                style={{ border: "1px solid rgba(139,92,246,0.2)", color: "rgba(237,245,240,0.6)", background: "none", cursor: "pointer" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <p className="font-extrabold text-[#EDF5F0] text-base flex-1 min-w-0">{goal.label}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => startEditGoal(goal)} className="text-[rgba(237,245,240,0.35)] hover:text-[#8B5CF6] p-1 text-base" title="Edit">✏️</button>
                            <button onClick={() => setDeletingGoalId(goal.id)} className="text-[rgba(237,245,240,0.35)] hover:text-red-400 p-1 text-base" title="Delete">🗑️</button>
                          </div>
                        </div>
                        {goal.targetAmount > 0 && (
                          <p className="text-xs text-[rgba(237,245,240,0.5)] mb-1">My reward costs: {formatCurrency(goal.targetAmount)}</p>
                        )}
                        <button
                          onClick={() => handleSetActiveGoalWithCheck(goal)}
                          className="mt-3 w-full py-2 text-xs font-semibold text-[#8B5CF6] border border-[#8B5CF6] rounded-xl hover:bg-[rgba(139,92,246,0.15)] transition-colors"
                        >
                          Set as My Jar
                        </button>
                      </>
                    )}

                    {/* Active: confirm complete */}
                    {isActive && isConfirmComplete && (
                      <div className="mt-2 rounded-xl p-3" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                        <p className="text-xs font-semibold text-[#EDF5F0] mb-1">
                          {goal.type === "donation" ? "Mark as donated?" : "Mark as purchased?"}
                        </p>
                        <p className="text-xs text-[rgba(237,245,240,0.6)] mb-2">
                          This will log {formatCurrency(spendingBalance)} as spent and remove this goal.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setCompleting(true); onCompleteGoal(goal.id).then(() => { setConfirmCompleteId(null); setCompleting(false); }); }}
                            disabled={completing}
                            className="flex-1 bg-[#8B5CF6] text-white font-semibold py-1.5 rounded-xl text-xs disabled:opacity-50"
                          >
                            {completing ? "…" : "Yes, confirm"}
                          </button>
                          <button onClick={() => setConfirmCompleteId(null)} className="flex-1 border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-xl text-xs">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Active: delete with balance options */}
                    {isActive && deletingActiveGoal && (
                      <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                        <p className="text-xs font-semibold text-[#EDF5F0]">Delete &quot;{goal.label}&quot;?</p>
                        {spendingBalance > 0 && (
                          <p className="text-xs text-[rgba(237,245,240,0.6)]">You have {formatCurrency(spendingBalance)} in this jar.</p>
                        )}
                        {spendingBalance > 0 ? (
                          <div className="space-y-1.5">
                            <button
                              onClick={() => { setCompleting(true); onCompleteGoal(goal.id).then(() => { setDeletingActiveGoal(false); setCompleting(false); }); }}
                              disabled={completing || movingToGive}
                              className="w-full bg-[#8B5CF6] text-white font-semibold py-2 rounded-xl text-xs disabled:opacity-50"
                            >
                              {completing ? "…" : goal.type === "donation" ? "💛 Mark as Donated" : "🛒 Mark as Purchased"}
                            </button>
                            <button
                              onClick={() => { setMovingToGive(true); onMoveToGive(goal.id).then(() => { setDeletingActiveGoal(false); setMovingToGive(false); }); }}
                              disabled={completing || movingToGive}
                              className="w-full bg-[#2ECC71] text-[#0B1A14] font-semibold py-2 rounded-xl text-xs disabled:opacity-50"
                            >
                              {movingToGive ? "…" : "🤲 Move All to Donation Jar"}
                            </button>
                            <button onClick={() => setDeletingActiveGoal(false)} className="w-full border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] font-semibold py-2 rounded-xl text-xs">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => { onDeleteGoal(goal.id).then(() => setDeletingActiveGoal(false)); }} className="flex-1 bg-red-500 text-white font-semibold py-1.5 rounded-xl text-xs">Delete</button>
                            <button onClick={() => setDeletingActiveGoal(false)} className="flex-1 border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-xl text-xs">Cancel</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inactive: confirm delete */}
                    {!isActive && isConfirmDelete && (
                      <div className="mt-2 rounded-xl p-3 flex items-center justify-between" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                        <p className="text-xs text-red-400">Delete &quot;{goal.label}&quot;?</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleDeleteGoal(goal.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg">Delete</button>
                          <button onClick={() => setDeletingGoalId(null)} className="text-xs border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1 rounded-lg">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Prebuilt reward suggestions — shown only when no goals exist */}
      {goals.length === 0 && !showAddForm && (
        <div className="space-y-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Quick start</p>
          <div className="flex flex-wrap gap-2">
            {PREBUILT_REWARDS.map((r) => (
              <button
                key={r.label}
                onClick={() => { setAddLabel(r.label); setAddAmount(String(r.targetAmount)); setShowAddForm(true); }}
                className="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
                style={{ background: "rgba(139,92,246,0.15)", color: "#C4B5FD", border: "1px solid rgba(139,92,246,0.3)" }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add reward */}
      {showAddForm ? (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>New savings goal</p>

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
              {saving ? "Saving…" : "Add Savings Goal"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddLabel(""); setAddAmount(""); setAddLink(""); }}
              className="px-5 py-3 border-[rgba(139,92,246,0.12)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm hover:text-[#EDF5F0] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2.5 border border-dashed border-[rgba(139,92,246,0.25)] text-white font-bold rounded-xl hover:border-[#8B5CF6] hover:text-[#8B5CF6] transition-colors text-sm"
        >
          ＋ Add a savings goal
        </button>
      )}

      {/* Spending history */}
      <div>
        <p className="text-xs font-semibold text-[rgba(237,245,240,0.85)] uppercase tracking-wide mb-2 mt-2">Purchases</p>
        {spendingHistory.length === 0 ? (
          <p className="text-xs text-[rgba(237,245,240,0.35)] py-2">No purchases yet — tap &quot;I Bought It&quot; above to log one.</p>
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

