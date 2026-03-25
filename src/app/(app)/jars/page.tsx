"use client";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";
import {
  updateJarSettings,
  completePurchase,
  subscribeToSpendingHistory,
  updateSpendingHistory,
  deleteSpendingHistory,
  setActiveProject,
} from "@/lib/services/firebase/users";
import { SpendingHistoryEvent, DonationEvent, Project } from "@/lib/types/models";

const CHILD_YEAR_COST = 300;

function givingImpact(amount: number): string {
  if (amount <= 0) return "0 days of education";
  const days = Math.round((amount / CHILD_YEAR_COST) * 365);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} of education`;
  const months = (amount / CHILD_YEAR_COST) * 12;
  if (months < 12) return `${months.toFixed(1)} months of education`;
  const years = amount / CHILD_YEAR_COST;
  return `${years.toFixed(1)} years of education`;
}

export default function JarsPage() {
  const { user, profile, updateProfile } = useAuthStore();
  const { donate, donations, editDonation, deleteDonation } = useSkips();
  const { projects } = useProjects();
  const [spendingHistory, setSpendingHistory] = useState<SpendingHistoryEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToSpendingHistory(user.uid, setSpendingHistory);
    return unsub;
  }, [user?.uid]);

  if (!profile || !user) return null;

  const split = profile.jarSplit ?? { giving: 34, spending: 33, savings: 33 };
  const givingTotal = profile.totalSaved * (split.giving / 100);
  const spendingTotal = profile.totalSaved * (split.spending / 100);
  const givingBalance = Math.max(0, givingTotal - (profile.totalDonated ?? 0));
  const spendingBalance = Math.max(0, spendingTotal - (profile.totalSpent ?? 0));

  // Resolve the active cause from projects (falls back to first project)
  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? projects[0] ?? null;

  async function handleSelectCause(project: Project) {
    await setActiveProject(user!.uid, project.id);
    updateProfile({ activeProjectId: project.id });
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-[#111827] mb-8">My Jars</h1>

      {/* Giving Jar */}
      <GivingSection
        givingBalance={givingBalance}
        totalDonated={profile.totalDonated}
        donations={donations}
        activeProject={activeProject}
        projects={projects}
        onSelectCause={handleSelectCause}
        onDonate={(amount) =>
          donate(amount, activeProject?.id ?? "giving", activeProject?.title ?? "Giving")
        }
        onEditDonation={editDonation}
        onDeleteDonation={deleteDonation}
      />

      {/* Spending Jar */}
      <SpendingSection
        uid={user.uid}
        spendingBalance={spendingBalance}
        spendingGoal={profile.spendingGoal ?? null}
        spendingHistory={spendingHistory}
        totalSpent={profile.totalSpent ?? 0}
        onPurchased={(label, targetAmount, amountSaved) => {
          updateProfile({ spendingGoal: null, totalSpent: (profile.totalSpent ?? 0) + amountSaved });
          return completePurchase(user.uid, label, targetAmount, amountSaved);
        }}
        onGoalSaved={(goal) => {
          updateProfile({ spendingGoal: goal });
          return updateJarSettings(user.uid, split, goal);
        }}
        onEditHistory={(event, newAmount) => {
          updateProfile({ totalSpent: (profile.totalSpent ?? 0) + (newAmount - event.amountSaved) });
          return updateSpendingHistory(user.uid, event.id, newAmount, event.amountSaved);
        }}
        onDeleteHistory={(event) => {
          updateProfile({ totalSpent: (profile.totalSpent ?? 0) - event.amountSaved });
          return deleteSpendingHistory(user.uid, event.id, event.amountSaved);
        }}
      />

      {/* Jar Split */}
      <JarSplitSection
        uid={user.uid}
        initialSplit={split}
        spendingGoal={profile.spendingGoal ?? null}
        onSave={(newSplit) => updateProfile({ jarSplit: newSplit })}
      />
    </div>
  );
}

/* ── Giving Section ── */
function GivingSection({
  givingBalance,
  totalDonated,
  donations,
  activeProject,
  projects,
  onSelectCause,
  onDonate,
  onEditDonation,
  onDeleteDonation,
}: {
  givingBalance: number;
  totalDonated: number;
  donations: DonationEvent[];
  activeProject: Project | null;
  projects: Project[];
  onSelectCause: (p: Project) => void;
  onDonate: (amount: number) => Promise<void>;
  onEditDonation: (donation: DonationEvent, newAmount: number) => Promise<void>;
  onDeleteDonation: (donation: DonationEvent) => Promise<void>;
}) {
  const [showInput, setShowInput] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmountStr, setEditAmountStr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleDonate() {
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await onDonate(amount);
    setAmountStr("");
    setShowInput(false);
    setSaving(false);
  }

  async function handleEditConfirm(donation: DonationEvent) {
    const newAmount = parseFloat(editAmountStr);
    if (!newAmount || newAmount <= 0) return;
    setWorking(true);
    await onEditDonation(donation, newAmount);
    setEditingId(null);
    setWorking(false);
  }

  async function handleDeleteConfirm(donation: DonationEvent) {
    setWorking(true);
    await onDeleteDonation(donation);
    setDeletingId(null);
    setWorking(false);
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-6">
      {/* Cause header + picker */}
      <h2 className="text-base font-bold text-[#111827] mb-1">
        🌍 Giving{activeProject ? ` — ${activeProject.title}` : ""}
      </h2>
      {activeProject && (
        <p className="text-xs text-[#6B7280] mb-3">
          {activeProject.description?.slice(0, 100) ||
            "Every dollar funds a child's education in rural Cambodia."}
        </p>
      )}

      {/* Cause selector — only shown when multiple causes exist */}
      {projects.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectCause(p)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                activeProject?.id === p.id
                  ? "bg-[#3D8B68] border-[#3D8B68] text-white"
                  : "border-[#E5E7EB] text-[#6B7280] hover:border-[#3D8B68]/50 hover:text-[#3D8B68]"
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between bg-[#F0FAF5] rounded-xl px-4 py-3 mb-4">
        <div>
          <p className="text-2xl font-bold text-[#3D8B68]">{formatCurrency(givingBalance)}</p>
          <p className="text-xs text-[#6B7280]">{givingImpact(givingBalance)} ready to fund</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#6B7280]">{formatCurrency(totalDonated)}</p>
          <p className="text-xs text-[#9CA3AF]">donated total</p>
        </div>
      </div>

      {showInput ? (
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
            <input
              type="number"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full pl-7 border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
              autoFocus
            />
          </div>
          <button
            onClick={handleDonate}
            disabled={saving || !amountStr || parseFloat(amountStr) <= 0}
            className="bg-[#3D8B68] text-white font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
          <button
            onClick={() => { setShowInput(false); setAmountStr(""); }}
            className="text-[#9CA3AF] hover:text-[#111827] px-3 py-2.5 rounded-xl border border-[#E5E7EB] text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="w-full py-2.5 border border-[#3D8B68] text-[#3D8B68] font-semibold rounded-xl hover:bg-[#E4F0E8] transition-colors text-sm"
        >
          💸 I Donated
        </button>
      )}

      {donations.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Donation History</p>
          <div className="space-y-1">
            {donations.slice(0, 10).map((d) => (
              <div key={d.id}>
                {editingId === d.id ? (
                  <div className="flex gap-2 py-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280]">$</span>
                      <input
                        type="number"
                        value={editAmountStr}
                        onChange={(e) => setEditAmountStr(e.target.value)}
                        className="w-full pl-6 border border-[#3D8B68] rounded-lg px-2 py-1.5 text-sm text-[#111827] focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => handleEditConfirm(d)}
                      disabled={working}
                      className="text-xs bg-[#3D8B68] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {working ? "…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : deletingId === d.id ? (
                  <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600">Delete {formatCurrency(d.amount)}?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteConfirm(d)}
                        disabled={working}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        {working ? "…" : "Delete"}
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between py-1.5">
                    <div>
                      <p className="text-sm text-[#111827]">{d.causeTitle}</p>
                      <p className="text-xs text-[#9CA3AF]">
                        {d.donatedAt?.toDate ? formatRelativeTime(d.donatedAt.toDate()) : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#3D8B68]">{formatCurrency(d.amount)}</p>
                      <button
                        onClick={() => { setEditingId(d.id); setEditAmountStr(String(d.amount)); }}
                        className="text-[#9CA3AF] hover:text-[#3D8B68] text-base p-1"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={() => setDeletingId(d.id)}
                        className="text-[#9CA3AF] hover:text-red-500 text-base p-1"
                        title="Delete"
                      >🗑️</button>
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

/* ── Spending Section ── */
function SpendingSection({
  uid,
  spendingBalance,
  spendingGoal,
  spendingHistory,
  totalSpent,
  onPurchased,
  onGoalSaved,
  onEditHistory,
  onDeleteHistory,
}: {
  uid: string;
  spendingBalance: number;
  spendingGoal: { label: string; targetAmount: number } | null;
  spendingHistory: SpendingHistoryEvent[];
  totalSpent: number;
  onPurchased: (label: string, targetAmount: number, amountSaved: number) => Promise<void>;
  onGoalSaved: (goal: { label: string; targetAmount: number }) => Promise<void>;
  onEditHistory: (event: SpendingHistoryEvent, newAmount: number) => Promise<void>;
  onDeleteHistory: (event: SpendingHistoryEvent) => Promise<void>;
}) {
  const [confirmPurchase, setConfirmPurchase] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmountStr, setEditAmountStr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const fillPct = spendingGoal
    ? Math.min(100, (spendingBalance / spendingGoal.targetAmount) * 100)
    : 0;

  async function handlePurchase() {
    if (!spendingGoal) return;
    setPurchasing(true);
    await onPurchased(spendingGoal.label, spendingGoal.targetAmount, spendingBalance);
    setConfirmPurchase(false);
    setPurchasing(false);
  }

  async function handleSaveGoal() {
    const amount = parseFloat(goalAmount);
    if (!goalLabel || !amount || amount <= 0) return;
    setSavingGoal(true);
    await onGoalSaved({ label: goalLabel, targetAmount: amount });
    setGoalLabel("");
    setGoalAmount("");
    setSavingGoal(false);
  }

  async function handleEditConfirm(event: SpendingHistoryEvent) {
    const newAmount = parseFloat(editAmountStr);
    if (!newAmount || newAmount <= 0) return;
    setWorking(true);
    await onEditHistory(event, newAmount);
    setEditingId(null);
    setWorking(false);
  }

  async function handleDeleteConfirm(event: SpendingHistoryEvent) {
    setWorking(true);
    await onDeleteHistory(event);
    setDeletingId(null);
    setWorking(false);
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-6">
      <h2 className="text-base font-bold text-[#111827] mb-4">🛍️ Spending Goal</h2>

      {spendingGoal ? (
        <>
          <div className="bg-[#F5F3FF] rounded-xl px-4 py-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-[#111827]">{spendingGoal.label}</p>
              <p className="text-sm font-bold text-[#8B5CF6]">{Math.round(fillPct)}%</p>
            </div>
            <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#8B5CF6] rounded-full transition-all duration-700"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-[#6B7280]">
              <span>{formatCurrency(spendingBalance)} saved</span>
              <span>goal: {formatCurrency(spendingGoal.targetAmount)}</span>
            </div>
          </div>

          {confirmPurchase ? (
            <div className="bg-[#FFF7ED] border border-orange-200 rounded-xl p-4 mb-2">
              <p className="text-sm font-semibold text-[#111827] mb-1">Mark as purchased?</p>
              <p className="text-xs text-[#6B7280] mb-3">
                This will log {formatCurrency(spendingBalance)} as spent and clear your goal.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="flex-1 bg-[#8B5CF6] text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-50"
                >
                  {purchasing ? "Saving…" : "Yes, I bought it!"}
                </button>
                <button
                  onClick={() => setConfirmPurchase(false)}
                  className="flex-1 border border-[#E5E7EB] text-[#6B7280] font-semibold py-2 rounded-xl text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmPurchase(true)}
              className="w-full py-2.5 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[#F5F3FF] transition-colors text-sm"
            >
              ✓ Mark as Purchased
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-[#6B7280] mb-4">What are you saving your spending jar toward?</p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="e.g. AirPods, Vacation, New shoes"
              value={goalLabel}
              onChange={(e) => setGoalLabel(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
            />
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
              <input
                type="number"
                placeholder="Target amount"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="w-full pl-8 border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
              />
            </div>
            <button
              onClick={handleSaveGoal}
              disabled={savingGoal || !goalLabel || !goalAmount}
              className="w-full py-3 bg-[#8B5CF6] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
            >
              {savingGoal ? "Saving…" : "Set Goal"}
            </button>
          </div>
        </>
      )}

      {spendingHistory.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Purchase History</p>
          <div className="space-y-1">
            {spendingHistory.map((event) => (
              <div key={event.id}>
                {editingId === event.id ? (
                  <div className="flex gap-2 py-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280]">$</span>
                      <input
                        type="number"
                        value={editAmountStr}
                        onChange={(e) => setEditAmountStr(e.target.value)}
                        className="w-full pl-6 border border-[#8B5CF6] rounded-lg px-2 py-1.5 text-sm text-[#111827] focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => handleEditConfirm(event)}
                      disabled={working}
                      className="text-xs bg-[#8B5CF6] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {working ? "…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : deletingId === event.id ? (
                  <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600">Delete {event.label}?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteConfirm(event)}
                        disabled={working}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        {working ? "…" : "Delete"}
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1 rounded-lg"
                      >
                        Cancel
                      </button>
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
                      <button
                        onClick={() => { setEditingId(event.id); setEditAmountStr(String(event.amountSaved)); }}
                        className="text-[#9CA3AF] hover:text-[#8B5CF6] text-base p-1"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={() => setDeletingId(event.id)}
                        className="text-[#9CA3AF] hover:text-red-500 text-base p-1"
                        title="Delete"
                      >🗑️</button>
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
  initialSplit: { giving: number; spending: number; savings: number };
  spendingGoal: { label: string; targetAmount: number } | null;
  onSave: (split: { giving: number; spending: number; savings: number }) => void;
}) {
  const [giving, setGiving] = useState(String(initialSplit.giving));
  const [spending, setSpending] = useState(String(initialSplit.spending));
  const [savings, setSavings] = useState(String(initialSplit.savings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const total = (parseInt(giving) || 0) + (parseInt(spending) || 0) + (parseInt(savings) || 0);
  const valid = total === 100;

  const presets = [
    { label: "Equal", g: 34, sp: 33, sa: 33 },
    { label: "50/25/25", g: 50, sp: 25, sa: 25 },
    { label: "All Giving", g: 100, sp: 0, sa: 0 },
  ];

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    const split = { giving: parseInt(giving), spending: parseInt(spending), savings: parseInt(savings) };
    await updateJarSettings(uid, split, spendingGoal);
    onSave(split);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-6">
      <h2 className="text-base font-bold text-[#111827] mb-4">Jar Split</h2>

      <div className="flex gap-2 mb-3">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => { setGiving(String(p.g)); setSpending(String(p.sp)); setSavings(String(p.sa)); }}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:border-[#3D8B68]/50 hover:text-[#3D8B68] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "🌍 Giving", value: giving, set: setGiving },
          { label: "🛍️ Spending", value: spending, set: setSpending },
          { label: "💰 Savings", value: savings, set: setSavings },
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

      {!valid && (
        <p className="text-xs text-red-500 mb-3 text-center">Total is {total}% — must equal 100%</p>
      )}
      {valid && (
        <p className="text-xs text-[#3D8B68] mb-3 text-center">✓ Looks good</p>
      )}

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
