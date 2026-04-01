"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import {
  updateJarSettings,
  completeGoal,
  subscribeToSpendingHistory,
  updateSpendingHistory,
  deleteSpendingHistory,
  setActiveProject,
  normalizeJarSplit,
  normalizeSpendingGoals,
  updateSpendingGoals,
} from "@/lib/services/firebase/users";
import { addCustomProject } from "@/lib/services/firebase/projects";
import { SpendingHistoryEvent, Project, SpendingGoal } from "@/lib/types/models";

type Tab = "cause" | "splurge" | "split";

function JarsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "cause";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const { user, profile, updateProfile } = useAuthStore();
  const { donate } = useSkips();
  const { projects, refetch } = useProjects();
  const [spendingHistory, setSpendingHistory] = useState<SpendingHistoryEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToSpendingHistory(user.uid, setSpendingHistory);
    return unsub;
  }, [user?.uid]);

  if (!profile || !user) return null;

  const split = normalizeJarSplit(profile.jarSplit as any);
  const giveTotal = profile.totalSaved * (split.give / 100);
  const liveTotal = profile.totalSaved * (split.live / 100);
  const givingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const spendingBalance = Math.max(0, liveTotal - (profile.totalSpent ?? 0));

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? projects[0] ?? null;

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;

  async function handleSelectCause(project: Project) {
    await setActiveProject(user!.uid, project.id);
    updateProfile({ activeProjectId: project.id });
  }

  async function handleAddCause(title: string, goalAmount: number, donationURL?: string) {
    await addCustomProject(user!.uid, { title, goalAmount, donationURL });
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
      totalSpent: (profile.totalSpent ?? 0) + spendingBalance,
      spendingGoals: newGoals,
      activeSpendingGoalId: newActiveId,
    });
  }

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "cause",   label: "Cause",   emoji: "🌍" },
    { id: "splurge", label: "Splurge", emoji: "🛍️" },
    { id: "split",   label: "Split",   emoji: "⚙️" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-[#111827] mb-5">My Jars</h1>

      {/* Tab row */}
      <div className="flex gap-2 mb-6 bg-[#F3F4F6] p-1 rounded-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === t.id
                ? "bg-white text-[#111827] shadow-sm"
                : "text-[#6B7280] hover:text-[#111827]"
            }`}
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
          onSelectCause={handleSelectCause}
          onAddCause={handleAddCause}
          onDonate={(amount) =>
            donate(amount, activeProject?.id ?? "giving", activeProject?.title ?? "Giving")
          }
        />
      )}

      {activeTab === "splurge" && (
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

      {activeTab === "split" && (
        <JarSplitSection
          uid={user.uid}
          initialSplit={split}
          spendingGoal={profile.spendingGoal ?? null}
          onSave={(newSplit) => updateProfile({ jarSplit: newSplit })}
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
  onSelectCause,
  onAddCause,
  onDonate,
}: {
  uid: string;
  projects: Project[];
  activeProject: Project | null;
  onSelectCause: (p: Project) => void;
  onAddCause: (title: string, goalAmount: number, donationURL?: string) => Promise<void>;
  onDonate: (amount: number) => Promise<void>;
}) {
  const [donatingId, setDonatingId] = useState<string | null>(null);
  const [donateAmountStr, setDonateAmountStr] = useState("");
  const [donating, setDonating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customGoalStr, setCustomGoalStr] = useState("");
  const [customURL, setCustomURL] = useState("");
  const [addingCause, setAddingCause] = useState(false);

  async function handleAddCause() {
    if (!customTitle.trim()) return;
    const goalAmount = parseFloat(customGoalStr) || 0;
    setAddingCause(true);
    await onAddCause(customTitle.trim(), goalAmount, customURL.trim() || undefined);
    setCustomTitle("");
    setCustomGoalStr("");
    setCustomURL("");
    setShowAddForm(false);
    setAddingCause(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-[#111827] mb-3">Choose your cause</p>
        <div className="space-y-3">
          {projects.filter((p) => !p.isCustom).map((project) => {
            const isActive = activeProject?.id === project.id;
            return (
              <div
                key={project.id}
                className={`bg-white rounded-2xl p-4 border shadow-sm transition-colors ${
                  isActive ? "border-[#3D8B68]" : "border-[#E5E7EB]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#111827] text-sm">{project.sponsor}</p>
                    <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">{project.description}</p>
                    <p className="text-xs text-[#6B7280] mt-1.5">
                      <span className="font-semibold text-[#111827]">Cause: </span>{project.title}
                    </p>
                    {project.goalAmount > 0 && (
                      <p className="text-xs text-[#3D8B68] font-semibold mt-1">
                        Skipped Expense Needed: {formatCurrency(project.goalAmount)}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3D8B68] bg-[#E4F0E8] px-2.5 py-1 rounded-full">
                        ✓ Active
                      </span>
                    ) : (
                      <button
                        onClick={() => onSelectCause(project)}
                        className="text-xs font-semibold text-[#6B7280] border border-[#E5E7EB] px-3 py-1.5 rounded-full hover:border-[#3D8B68] hover:text-[#3D8B68] transition-colors"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {project.donationURL && (
                    <a
                      href={project.donationURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full py-2 border border-[#3D8B68] text-[#3D8B68] font-semibold rounded-xl hover:bg-[#E4F0E8] transition-colors text-xs"
                    >
                      🌍 Donate →
                    </a>
                  )}
                  {isActive && (
                    donatingId === project.id ? (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={donateAmountStr}
                            onChange={(e) => setDonateAmountStr(e.target.value)}
                            className="w-full pl-7 border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
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
                          className="bg-[#3D8B68] text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
                        >
                          {donating ? "…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => { setDonatingId(null); setDonateAmountStr(""); }}
                          className="border border-[#E5E7EB] text-[#6B7280] px-3 py-2 rounded-xl text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDonatingId(project.id)}
                        className="w-full py-2 border border-[#3D8B68] text-[#3D8B68] font-semibold rounded-xl hover:bg-[#E4F0E8] transition-colors text-xs"
                      >
                        💸 I Donated
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showAddForm ? (
          <div className="mt-3 bg-white rounded-2xl p-4 border border-[#E5E7EB] shadow-sm space-y-3">
            <p className="text-sm font-semibold text-[#111827]">Add your own cause</p>
            <input
              type="text"
              placeholder="Organisation name"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
              <input
                type="number"
                placeholder="0"
                value={customGoalStr}
                onChange={(e) => setCustomGoalStr(e.target.value)}
                className="w-full pl-7 border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">Skipped Expense Needed</span>
            </div>
            <input
              type="url"
              placeholder="Donation link (optional)"
              value={customURL}
              onChange={(e) => setCustomURL(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddCause}
                disabled={addingCause || !customTitle.trim()}
                className="flex-1 bg-[#3D8B68] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {addingCause ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setCustomTitle(""); setCustomGoalStr(""); setCustomURL(""); }}
                className="px-4 py-2.5 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl text-sm hover:text-[#111827] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 w-full py-2.5 border border-dashed border-[#D1D5DB] text-[#6B7280] font-semibold rounded-xl hover:border-[#3D8B68] hover:text-[#3D8B68] transition-colors text-sm"
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

  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editHistoryAmountStr, setEditHistoryAmountStr] = useState("");
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [historyWorking, setHistoryWorking] = useState(false);

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
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold text-[#111827]">✨ Live a little — Goals</h2>
        <span className="text-sm font-bold text-[#8B5CF6]">{formatCurrency(spendingBalance)} available</span>
      </div>

      {/* Goal list */}
      {goals.length > 0 && (
        <div className="space-y-3">
          {goals.map((goal) => {
            const isActive = goal.id === activeGoalId;
            const fillPct = isActive ? Math.min(100, (spendingBalance / goal.targetAmount) * 100) : 0;
            const isEditing = editingGoalId === goal.id;
            const isConfirmComplete = confirmCompleteId === goal.id;
            const isConfirmDelete = deletingGoalId === goal.id;

            return (
              <div
                key={goal.id}
                className={`bg-white rounded-2xl p-4 border shadow-sm transition-all ${
                  isActive ? "border-[#8B5CF6]" : "border-[#E5E7EB]"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                      placeholder="Goal name"
                      autoFocus
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full pl-7 border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                        placeholder="Target amount"
                      />
                    </div>
                    <input
                      type="url"
                      value={editLink}
                      onChange={(e) => setEditLink(e.target.value)}
                      className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
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
                        className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl text-sm"
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
                          <p className="font-bold text-[#111827] text-sm">{goal.label}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            goal.type === "donation"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-[#F5F3FF] text-[#8B5CF6]"
                          }`}>
                            {goal.type === "donation" ? "💛 Donation" : "🛍️ Splurge"}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E4F0E8] text-[#3D8B68]">
                              ★ Main
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] mt-0.5">Goal: {formatCurrency(goal.targetAmount)}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEditGoal(goal)}
                          className="text-[#9CA3AF] hover:text-[#8B5CF6] p-1 text-base"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeletingGoalId(goal.id)}
                          className="text-[#9CA3AF] hover:text-red-500 p-1 text-base"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Progress bar — only for active goal */}
                    {isActive && (
                      <div className="mb-3">
                        <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#8B5CF6] rounded-full transition-all duration-700"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-[#6B7280]">
                          <span>{formatCurrency(spendingBalance)} saved</span>
                          <span>{Math.round(fillPct)}% of goal</span>
                        </div>
                      </div>
                    )}

                    {/* Shopping/donation link */}
                    {(goal.shoppingLink || goal.donationURL) && (
                      <a
                        href={goal.shoppingLink ?? goal.donationURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full py-2 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[#F5F3FF] transition-colors text-xs mb-2"
                      >
                        {goal.type === "donation" ? "💛 Donate →" : "🛒 Shop now →"}
                      </a>
                    )}

                    {/* Set as main / Complete */}
                    <div className="flex gap-2">
                      {!isActive && (
                        <button
                          onClick={() => onSetActiveGoal(goal.id)}
                          className="flex-1 py-2 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl hover:border-[#8B5CF6] hover:text-[#8B5CF6] transition-colors text-xs"
                        >
                          Set as main
                        </button>
                      )}
                      {isActive && !isConfirmComplete && (
                        <button
                          onClick={() => setConfirmCompleteId(goal.id)}
                          className="flex-1 py-2 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[#F5F3FF] transition-colors text-xs"
                        >
                          {goal.type === "donation" ? "✓ I Donated!" : "✓ I Bought It!"}
                        </button>
                      )}
                    </div>

                    {/* Confirm complete */}
                    {isConfirmComplete && (
                      <div className="mt-2 bg-[#FFF7ED] border border-orange-200 rounded-xl p-3">
                        <p className="text-xs font-semibold text-[#111827] mb-1">
                          {goal.type === "donation" ? "Mark as donated?" : "Mark as purchased?"}
                        </p>
                        <p className="text-xs text-[#6B7280] mb-2">
                          This will log {formatCurrency(spendingBalance)} as spent and remove this goal.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleComplete(goal.id)}
                            disabled={completing}
                            className="flex-1 bg-[#8B5CF6] text-white font-semibold py-1.5 rounded-xl text-xs disabled:opacity-50"
                          >
                            {completing ? "…" : "Yes, confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmCompleteId(null)}
                            className="flex-1 border border-[#E5E7EB] text-[#6B7280] font-semibold py-1.5 rounded-xl text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Confirm delete */}
                    {isConfirmDelete && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                        <p className="text-xs text-red-600">Delete "{goal.label}"?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingGoalId(null)}
                            className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1 rounded-lg"
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
        <div className="bg-white rounded-2xl p-4 border border-[#E5E7EB] shadow-sm space-y-3">
          <p className="text-sm font-semibold text-[#111827]">New goal</p>

          {/* Type toggle */}
          <div className="flex bg-[#F3F4F6] rounded-xl p-1">
            <button
              onClick={() => setAddType("splurge")}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                addType === "splurge" ? "bg-white text-[#8B5CF6] shadow-sm" : "text-[#6B7280]"
              }`}
            >
              🛍️ Splurge
            </button>
            <button
              onClick={() => setAddType("donation")}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                addType === "donation" ? "bg-white text-amber-600 shadow-sm" : "text-[#6B7280]"
              }`}
            >
              💛 Donation
            </button>
          </div>

          <input
            type="text"
            placeholder={addType === "splurge" ? "e.g. AirPods, Vacation, Shoes" : "e.g. Red Cross, Local shelter"}
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
            <input
              type="number"
              placeholder="Target amount"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full pl-8 border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
            />
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">🔗</span>
            <input
              type="url"
              placeholder={addType === "splurge" ? "Shopping link (optional)" : "Donation link (optional)"}
              value={addLink}
              onChange={(e) => setAddLink(e.target.value)}
              className="w-full pl-10 border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
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
              className="px-5 py-3 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl text-sm hover:text-[#111827] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2.5 border border-dashed border-[#D1D5DB] text-[#6B7280] font-semibold rounded-xl hover:border-[#8B5CF6] hover:text-[#8B5CF6] transition-colors text-sm"
        >
          ＋ Add goal
        </button>
      )}

      {/* Spending history */}
      {spendingHistory.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2 mt-2">History</p>
          <div className="space-y-1">
            {spendingHistory.map((event) => (
              <div key={event.id}>
                {editingHistoryId === event.id ? (
                  <div className="flex gap-2 py-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280]">$</span>
                      <input
                        type="number"
                        value={editHistoryAmountStr}
                        onChange={(e) => setEditHistoryAmountStr(e.target.value)}
                        className="w-full pl-6 border border-[#8B5CF6] rounded-lg px-2 py-1.5 text-sm text-[#111827] focus:outline-none"
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
                    <button onClick={() => setEditingHistoryId(null)} className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-lg">Cancel</button>
                  </div>
                ) : deletingHistoryId === event.id ? (
                  <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600">Delete {event.label}?</p>
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
                      <button onClick={() => setDeletingHistoryId(null)} className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between py-1.5">
                    <div>
                      <p className="text-sm text-[#111827]">{event.label}</p>
                      <p className="text-xs text-[#9CA3AF]">goal: {formatCurrency(event.targetAmount)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#8B5CF6]">{formatCurrency(event.amountSaved)}</p>
                      <button onClick={() => { setEditingHistoryId(event.id); setEditHistoryAmountStr(String(event.amountSaved)); }} className="text-[#9CA3AF] hover:text-[#8B5CF6] text-base p-1">✏️</button>
                      <button onClick={() => setDeletingHistoryId(event.id)} className="text-[#9CA3AF] hover:text-red-500 text-base p-1">🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Jar Split Section ── */
function JarSplitSection({
  uid,
  initialSplit,
  spendingGoal,
  onSave,
}: {
  uid: string;
  initialSplit: { give: number; live: number };
  spendingGoal: { label: string; targetAmount: number; shoppingLink?: string } | null;
  onSave: (split: { give: number; live: number }) => void;
}) {
  const [give, setGive] = useState(String(initialSplit.give));
  const [live, setLive] = useState(String(initialSplit.live));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const total = (parseInt(give) || 0) + (parseInt(live) || 0);
  const valid = total === 100;

  const presets = [
    { label: "50 / 50",    g: 50,  l: 50 },
    { label: "60/40 Give", g: 60,  l: 40 },
    { label: "40/60 Live", g: 40,  l: 60 },
    { label: "100 Give",   g: 100, l: 0  },
  ];

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    const split = { give: parseInt(give), live: parseInt(live) };
    await updateJarSettings(uid, split, spendingGoal);
    onSave(split);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm">
      <h2 className="text-base font-bold text-[#111827] mb-4">Jar Split</h2>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => { setGive(String(p.g)); setLive(String(p.l)); }}
            className="py-1.5 text-xs font-semibold rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:border-[#3D8B68]/50 hover:text-[#3D8B68] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "💚 Give a little", value: give, set: setGive },
          { label: "✨ Live a little", value: live, set: setLive },
        ].map((row) => (
          <div key={row.label} className="text-center">
            <p className="text-xs text-[#6B7280] mb-1">{row.label}</p>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={row.value}
                onChange={(e) => row.set(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-xl px-2 py-2 text-sm text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">%</span>
            </div>
          </div>
        ))}
      </div>

      {!valid && <p className="text-xs text-red-500 mb-3 text-center">Total is {total}% — must equal 100%</p>}
      {valid && <p className="text-xs text-[#3D8B68] mb-3 text-center">✓ Looks good</p>}

      <button
        onClick={handleSave}
        disabled={!valid || saving}
        className="w-full py-3 bg-[#3D8B68] text-white font-semibold rounded-xl text-sm hover:bg-[#2D6A4F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Split"}
      </button>
    </div>
  );
}
