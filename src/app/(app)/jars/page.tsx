"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import {
  completeGoal,
  transferLiveToGive,
  subscribeToSpendingHistory,
  updateSpendingHistory,
  deleteSpendingHistory,
  setActiveProject,
  normalizeJarSplit,
  normalizeSpendingGoals,
  updateSpendingGoals,
  subscribeToDonations,
} from "@/lib/services/firebase/users";
import { addCustomProject, updateCustomProject, deleteCustomProject } from "@/lib/services/firebase/projects";
import { SpendingHistoryEvent, Project, SpendingGoal, DonationEvent } from "@/lib/types/models";

type Tab = "cause" | "live";

function JarsPageInner() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: Tab = rawTab === "live" || rawTab === "cause" ? rawTab : "cause";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

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
  const givingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const spendingBalance = Math.max(0, liveTotal - (profile.totalSpent ?? 0));

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? projects[0] ?? null;

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;

  async function handleSelectCause(project: Project) {
    await setActiveProject(user!.uid, project.id);
    updateProfile({ activeProjectId: project.id });
  }

  async function handleAddCause(title: string, sponsor: string, location: string | undefined, goalAmount: number, donationURL?: string) {
    await addCustomProject(user!.uid, { title, sponsor, location, goalAmount, donationURL });
    await refetch();
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
    const newGoals = spendingGoals.map((g) => (g.id === goalId ? { ...g, ...updates } : g));
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

  async function handleSetActiveGoal(goalId: string) {
    await updateSpendingGoals(user!.uid, spendingGoals, goalId);
    updateProfile({ activeSpendingGoalId: goalId });
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
    });
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
    { id: "live",  label: "Live a Little", emoji: "😊" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-5">My Jars</h1>

      {/* Tab row */}
      <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
            style={
              activeTab === t.id
                ? { background: "linear-gradient(135deg, var(--green-primary), var(--green-cta))", color: "var(--bg-base)" }
                : { color: "var(--text-muted)" }
            }
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {activeTab === "cause" && (
        <CauseTab
          uid={user.uid}
          projects={projects}
          activeProject={activeProject}
          givingBalance={givingBalance}
          donations={donations}
          onSelectCause={handleSelectCause}
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
          spendingHistory={spendingHistory}
          onAddGoal={handleAddGoal}
          onEditGoal={handleEditGoal}
          onDeleteGoal={handleDeleteGoal}
          onSetActiveGoal={handleSetActiveGoal}
          onCompleteGoal={handleCompleteGoal}
          onMoveToGive={handleMoveToGive}
          onEditHistory={(event, newAmount) => {
            updateProfile({ totalSpent: (profile.totalSpent ?? 0) + (newAmount - event.amountSaved) });
            return updateSpendingHistory(user.uid, event.id, newAmount, event.amountSaved);
          }}
          onDeleteHistory={(event) => {
            updateProfile({ totalSpent: (profile.totalSpent ?? 0) - event.amountSaved });
            return deleteSpendingHistory(user.uid, event.id, event.amountSaved);
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

/* ── Cause Tab ── */
function CauseTab({
  uid,
  projects,
  activeProject,
  givingBalance,
  donations,
  onSelectCause,
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
  onSelectCause: (p: Project) => void;
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
  const [editDonationAmountStr, setEditDonationAmountStr] = useState("");
  const [deletingDonationId, setDeletingDonationId] = useState<string | null>(null);
  const [donationWorking, setDonationWorking] = useState(false);

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
    if (givingBalance > 0 && activeProject && activeProject.id !== project.id) {
      setSwitchTarget(project);
    } else {
      onSelectCause(project);
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
        {activeProject?.id === project.id && (
          donatingId === project.id ? (
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
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Switch modal */}
      {switchTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwitchTarget(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>Switch active cause?</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Your Give a Little jar has {formatCurrency(givingBalance)} saved toward <span className="font-semibold">{activeProject?.title}</span>.
              </p>
            </div>
            <div style={{ borderTop: "1px solid var(--border-default)" }}>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                style={{ borderBottom: "1px solid var(--border-default)" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { setSwitchTarget(null); setDonatingId(activeProject?.id ?? null); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>💸 Donate first</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Empty your current jar before switching</p>
              </button>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { onSelectCause(switchTarget); setSwitchTarget(null); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>→ Move funds to {switchTarget.title}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Your balance will count toward the new cause</p>
              </button>
            </div>
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={() => setSwitchTarget(null)}
                className="w-full py-2.5 font-semibold rounded-xl text-sm"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
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

      {/* Active cause highlight */}
      {activeProject && (
        <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-emphasis)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--green-primary)" }}>Your active cause</p>
          <div className="flex items-start justify-between gap-2">
            <p className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>{activeProject.title}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {activeProject.isCustom && (
                <>
                  <button
                    onClick={() => startEdit(activeProject)}
                    className="p-1 text-base" style={{ color: "var(--green-primary)", opacity: 0.6 }}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(activeProject.id)}
                    className="p-1 text-base" style={{ color: "rgba(46,204,113,0.5)" }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </>
              )}
              {activeProject.donationURL && (
                <a href={activeProject.donationURL} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-0.5" style={{ color: "var(--green-primary)" }}>
                  ↗ Learn more
                </a>
              )}
            </div>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{activeProject.sponsor}</p>
          {activeProject.location && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Location: {activeProject.location}</p>
          )}
          {activeProject.goalAmount > 0 && (
            <p className="text-xs font-semibold mt-1" style={{ color: "var(--green-primary)" }}>
              {formatCurrency(givingBalance)} saved · Skipped Amount Needed: {formatCurrency(activeProject.goalAmount)}
            </p>
          )}
          <CauseDonateRow project={activeProject} />
        </div>
      )}

      {/* All causes */}
      <div>
        <p className="text-sm font-semibold text-[rgba(237,245,240,0.6)] mb-3">All causes</p>
        <div className="space-y-3">
          {projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            if (isActive) return null;
            const isEditing = editingProjectId === project.id;
            return (
              <div
                key={project.id}
                className="rounded-2xl p-4"
                style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
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
                      placeholder="Organisation (e.g. Caring for Cambodia)"
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-extrabold text-[#EDF5F0] text-base">{project.title}</p>
                          {project.donationURL && (
                            <a href={project.donationURL} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2ECC71] underline flex-shrink-0 mt-0.5">
                              ↗ Learn more
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-[rgba(237,245,240,0.6)] mt-0.5">{project.sponsor}</p>
                        {project.location && (
                          <p className="text-xs text-[rgba(237,245,240,0.6)] mt-0.5">Location: {project.location}</p>
                        )}
                        {project.goalAmount > 0 && (
                          <p className="text-xs text-[#2ECC71] font-semibold mt-1">
                            Skipped Amount Needed: {formatCurrency(project.goalAmount)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {project.isCustom && (
                          <>
                            <button
                              onClick={() => startEdit(project)}
                              className="p-1 text-base" style={{ color: "var(--text-muted)" }}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(project.id)}
                              className="text-[rgba(237,245,240,0.35)] hover:text-red-400 p-1 text-base"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleSetActive(project)}
                          className="text-xs font-semibold text-[#2ECC71] border border-[#2ECC71] px-3 py-1.5 rounded-full hover:bg-[#162E23] transition-colors"
                        >
                          Set as My Jar
                        </button>
                      </div>
                    </div>
                    {project.donationURL && (
                      <a
                        href={project.donationURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 border border-[#2ECC71] text-[#2ECC71] font-semibold rounded-xl hover:bg-[#162E23] transition-colors text-xs"
                      >
                        🌍 Donate →
                      </a>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Donation history */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-[rgba(237,245,240,0.6)] uppercase tracking-wide mb-2">Donations</p>
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
              placeholder="Organisation (e.g. Caring for Cambodia)"
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
            className="mt-3 w-full py-2.5 border border-dashed border-[rgba(46,204,113,0.25)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl hover:border-[#2ECC71] hover:text-[#2ECC71] transition-colors text-sm"
          >
            ＋ Add your own cause
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Splurge Tab ── */
function SplurgeTab({
  spendingBalance,
  goals,
  activeGoalId,
  spendingHistory,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onSetActiveGoal,
  onCompleteGoal,
  onMoveToGive,
  onEditHistory,
  onDeleteHistory,
}: {
  spendingBalance: number;
  goals: SpendingGoal[];
  activeGoalId: string | null;
  spendingHistory: SpendingHistoryEvent[];
  onAddGoal: (goal: Omit<SpendingGoal, "id">) => Promise<void>;
  onEditGoal: (goalId: string, updates: Partial<SpendingGoal>) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
  onSetActiveGoal: (goalId: string) => Promise<void>;
  onCompleteGoal: (goalId: string) => Promise<void>;
  onMoveToGive: (goalId: string) => Promise<void>;
  onEditHistory: (event: SpendingHistoryEvent, newAmount: number) => Promise<void>;
  onDeleteHistory: (event: SpendingHistoryEvent) => Promise<void>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addType, setAddType] = useState<"splurge" | "donation">("splurge");
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

  const activeGoal = goals.find((g) => g.id === activeGoalId) ?? null;

  function handleSetActiveGoalWithCheck(goal: SpendingGoal) {
    if (spendingBalance > 0 && activeGoalId && activeGoalId !== goal.id) {
      setSwitchTarget(goal);
    } else {
      onSetActiveGoal(goal.id);
    }
  }

  async function handleAddGoal() {
    const amount = parseFloat(addAmount);
    if (!addLabel.trim() || !amount || amount <= 0) return;
    setSaving(true);
    const goal: Omit<SpendingGoal, "id"> = {
      label: addLabel.trim(),
      targetAmount: amount,
      type: addType,
    };
    if (addLink.trim()) goal.shoppingLink = addLink.trim();
    await onAddGoal(goal);
    setAddLabel("");
    setAddAmount("");
    setAddLink("");
    setAddType("splurge");
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
            <div className="px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>Switch active goal?</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Your Live a Little jar has {formatCurrency(spendingBalance)} saved toward <span className="font-semibold">{activeGoal?.label}</span>.
              </p>
            </div>
            <div style={{ borderTop: "1px solid var(--border-default)" }}>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                style={{ borderBottom: "1px solid var(--border-default)" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { setSwitchTarget(null); setConfirmCompleteId(activeGoalId); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {activeGoal?.type === "donation" ? "💛 Donate first" : "🛒 Shop first"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Empty your current jar before switching</p>
              </button>
              <button
                className="w-full text-left px-5 py-4 transition-colors"
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { onSetActiveGoal(switchTarget.id); setSwitchTarget(null); }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>→ Move funds to {switchTarget.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Your balance will count toward the new goal</p>
              </button>
            </div>
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={() => setSwitchTarget(null)}
                className="w-full py-2.5 font-semibold rounded-xl text-sm"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active goal highlight */}
      {activeGoal && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.35)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#8B5CF6" }}>Your active goal</p>
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{activeGoal.label}</p>
            {!deletingActiveGoal && (
              <button
                onClick={() => { setDeletingActiveGoal(true); setConfirmCompleteId(null); }}
                className="text-[#8B5CF6]/50 hover:text-red-500 p-1 text-base flex-shrink-0"
                title="Delete"
              >
                🗑️
              </button>
            )}
          </div>
          <div className="mt-2">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
              <div
                className="h-full rounded-full transition-all duration-700" style={{ background: "#8B5CF6" }}
                style={{ width: `${Math.min(100, (spendingBalance / activeGoal.targetAmount) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>{formatCurrency(spendingBalance)} saved</span>
              <span>Goal: {formatCurrency(activeGoal.targetAmount)}</span>
            </div>
          </div>
          {(activeGoal.shoppingLink || activeGoal.donationURL) && (
            <a
              href={activeGoal.shoppingLink ?? activeGoal.donationURL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[rgba(139,92,246,0.15)] transition-colors text-xs"
            >
              {activeGoal.type === "donation" ? "💛 Donate →" : "🛒 Shop now →"}
            </a>
          )}
          {!confirmCompleteId && (
            <button
              onClick={() => setConfirmCompleteId(activeGoal.id)}
              className="mt-2 w-full py-2 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[rgba(139,92,246,0.15)] transition-colors text-xs"
            >
              {activeGoal.type === "donation" ? "✓ I Donated!" : "✓ I Bought It!"}
            </button>
          )}
          {confirmCompleteId === activeGoal.id && (
            <div className="mt-2 rounded-xl p-3" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <p className="text-xs font-semibold text-[#EDF5F0] mb-1">
                {activeGoal.type === "donation" ? "Mark as donated?" : "Mark as purchased?"}
              </p>
              <p className="text-xs text-[rgba(237,245,240,0.6)] mb-2">
                This will log {formatCurrency(spendingBalance)} as spent and remove this goal.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setCompleting(true); onCompleteGoal(activeGoal.id).then(() => { setConfirmCompleteId(null); setCompleting(false); }); }}
                  disabled={completing}
                  className="flex-1 bg-[#8B5CF6] text-white font-semibold py-1.5 rounded-xl text-xs disabled:opacity-50"
                >
                  {completing ? "…" : "Yes, confirm"}
                </button>
                <button onClick={() => setConfirmCompleteId(null)} className="flex-1 border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-xl text-xs">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {deletingActiveGoal && (
            <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <p className="text-xs font-semibold text-[#EDF5F0]">Delete "{activeGoal.label}"?</p>
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
                    {completing ? "…" : activeGoal.type === "donation" ? "💛 Mark as Donated" : "🛒 Mark as Purchased"}
                  </button>
                  <button
                    onClick={() => { setMovingToGive(true); onMoveToGive(activeGoal.id).then(() => { setDeletingActiveGoal(false); setMovingToGive(false); }); }}
                    disabled={completing || movingToGive}
                    className="w-full bg-[#2ECC71] text-[#0B1A14] font-semibold py-2 rounded-xl text-xs disabled:opacity-50"
                  >
                    {movingToGive ? "…" : "🤲 Move All to Donation Jar"}
                  </button>
                  <button
                    onClick={() => setDeletingActiveGoal(false)}
                    className="w-full border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold py-2 rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { onDeleteGoal(activeGoal.id).then(() => setDeletingActiveGoal(false)); }}
                    className="flex-1 bg-red-500 text-white font-semibold py-1.5 rounded-xl text-xs"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeletingActiveGoal(false)}
                    className="flex-1 border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold text-white">😊 Live a little — Goals</h2>
        <span className="text-sm font-bold text-[#8B5CF6]">{formatCurrency(spendingBalance)} available</span>
      </div>

      {/* Goal list — all goals except active (shown at top) */}
      {goals.filter((g) => g.id !== activeGoalId).length > 0 && (
        <div className="space-y-3">
          {goals.filter((g) => g.id !== activeGoalId).map((goal) => {
            const isActive = false;
            const fillPct = 0;
            const isEditing = editingGoalId === goal.id;
            const isConfirmComplete = confirmCompleteId === goal.id;
            const isConfirmDelete = deletingGoalId === goal.id;

            return (
              <div
                key={goal.id}
                className="rounded-2xl p-4 transition-all"
                style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      placeholder="Goal name"
                      autoFocus
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        placeholder="Target amount"
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
                        className="px-4 py-2 border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-[#EDF5F0] text-sm">{goal.label}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            goal.type === "donation"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-[rgba(139,92,246,0.15)] text-[#8B5CF6]"
                          }`}>
                            {goal.type === "donation" ? "💛 Donation" : "🛍️ Splurge"}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#162E23] text-[#2ECC71]">
                              ★ Main
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[rgba(237,245,240,0.6)] mt-0.5">Goal: {formatCurrency(goal.targetAmount)}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEditGoal(goal)}
                          className="text-[rgba(237,245,240,0.35)] hover:text-[#8B5CF6] p-1 text-base"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeletingGoalId(goal.id)}
                          className="text-[rgba(237,245,240,0.35)] hover:text-red-400 p-1 text-base"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Shopping/donation link */}
                    {(goal.shoppingLink || goal.donationURL) && (
                      <a
                        href={goal.shoppingLink ?? goal.donationURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full py-2 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[rgba(139,92,246,0.15)] transition-colors text-xs mb-2"
                      >
                        {goal.type === "donation" ? "💛 Donate →" : "🛒 Shop now →"}
                      </a>
                    )}

                    {/* Set as active */}
                    {!isActive && (
                      <button
                        onClick={() => handleSetActiveGoalWithCheck(goal)}
                        className="w-full py-2 mt-1 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[rgba(139,92,246,0.15)] transition-colors text-xs"
                      >
                        Set as My Jar
                      </button>
                    )}

                    {/* Confirm delete */}
                    {isConfirmDelete && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                        <p className="text-xs text-red-400">Delete "{goal.label}"?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingGoalId(null)}
                            className="text-xs border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1 rounded-lg"
                          >
                            Cancel
                          </button>
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

      {/* Add goal */}
      {showAddForm ? (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>New goal</p>

          {/* Type toggle */}
          <div className="flex rounded-xl p-1" style={{ background: "var(--bg-surface-2)" }}>
            <button
              onClick={() => setAddType("splurge")}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition"
              style={addType === "splurge" ? { background: "var(--bg-surface-3)", color: "#8B5CF6" } : { color: "var(--text-muted)" }}
            >
              🛍️ Splurge
            </button>
            <button
              onClick={() => setAddType("donation")}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition"
              style={addType === "donation" ? { background: "var(--bg-surface-3)", color: "#F59E0B" } : { color: "var(--text-muted)" }}
            >
              💛 Donation
            </button>
          </div>

          <input
            type="text"
            placeholder={addType === "splurge" ? "e.g. AirPods, Vacation, Shoes" : "e.g. Red Cross, Local shelter"}
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
              placeholder={addType === "splurge" ? "Shopping link (optional)" : "Donation link (optional)"}
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
              {saving ? "Saving…" : "Add Goal"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddLabel(""); setAddAmount(""); setAddLink(""); setAddType("splurge"); }}
              className="px-5 py-3 border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm hover:text-[#EDF5F0] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2.5 border border-dashed border-[rgba(46,204,113,0.25)] text-[rgba(237,245,240,0.6)] font-semibold rounded-xl hover:border-[#8B5CF6] hover:text-[#8B5CF6] transition-colors text-sm"
        >
          ＋ Add goal
        </button>
      )}

      {/* Spending history */}
      <div>
        <p className="text-xs font-semibold text-[rgba(237,245,240,0.6)] uppercase tracking-wide mb-2 mt-2">History</p>
        {spendingHistory.length === 0 ? (
          <p className="text-xs text-[rgba(237,245,240,0.35)] py-2">No purchases yet — complete a goal to log it here.</p>
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
                    <button onClick={() => setEditingHistoryId(null)} className="text-xs border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1.5 rounded-lg">Cancel</button>
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
                      <button onClick={() => setDeletingHistoryId(null)} className="text-xs border-[rgba(46,204,113,0.12)] text-[rgba(237,245,240,0.6)] px-3 py-1 rounded-lg">Cancel</button>
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

