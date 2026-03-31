"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  normalizeJarSplit,
} from "@/lib/services/firebase/users";
import { addCustomProject } from "@/lib/services/firebase/projects";
import { SpendingHistoryEvent, DonationEvent, Project } from "@/lib/types/models";

type Tab = "cause" | "splurge" | "split";

function JarsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "cause";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const { user, profile, updateProfile } = useAuthStore();
  const { donate, donations, editDonation, deleteDonation } = useSkips();
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

  async function handleSelectCause(project: Project) {
    await setActiveProject(user!.uid, project.id);
    updateProfile({ activeProjectId: project.id });
  }

  async function handleAddCause(title: string, goalAmount: number, donationURL?: string) {
    await addCustomProject(user!.uid, { title, goalAmount, donationURL });
    await refetch();
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
          givingBalance={givingBalance}
          totalDonated={profile.totalDonated}
          donations={donations}
          projects={projects}
          activeProject={activeProject}
          onSelectCause={handleSelectCause}
          onAddCause={handleAddCause}
          onDonate={(amount) =>
            donate(amount, activeProject?.id ?? "giving", activeProject?.title ?? "Giving")
          }
          onEditDonation={editDonation}
          onDeleteDonation={deleteDonation}
        />
      )}

      {activeTab === "splurge" && (
        <SplurgeTab
          uid={user.uid}
          spendingBalance={spendingBalance}
          spendingGoal={profile.spendingGoal ?? null}
          spendingHistory={spendingHistory}
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
  givingBalance,
  totalDonated,
  donations,
  projects,
  activeProject,
  onSelectCause,
  onAddCause,
  onDonate,
  onEditDonation,
  onDeleteDonation,
}: {
  uid: string;
  givingBalance: number;
  totalDonated: number;
  donations: DonationEvent[];
  projects: Project[];
  activeProject: Project | null;
  onSelectCause: (p: Project) => void;
  onAddCause: (title: string, goalAmount: number, donationURL?: string) => Promise<void>;
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
    <div className="space-y-5">
      {/* Cause list */}
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
                {project.donationURL && (
                  <a
                    href={project.donationURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 border border-[#3D8B68] text-[#3D8B68] font-semibold rounded-xl hover:bg-[#E4F0E8] transition-colors text-xs"
                  >
                    🌍 Donate →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* Add your own cause */}
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

      {/* Giving balance + donate */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm">
        <h2 className="text-base font-bold text-[#111827] mb-3">
          🌍 {activeProject?.title ?? "Giving Jar"}
        </h2>

        <div className="flex items-center justify-between bg-[#F0FAF5] rounded-xl px-4 py-3 mb-4">
          <div>
            <p className="text-2xl font-bold text-[#3D8B68]">{formatCurrency(givingBalance)}</p>
            <p className="text-xs text-[#6B7280]">
            {activeProject?.goalAmount
              ? `${formatCurrency(givingBalance)} of ${formatCurrency(activeProject.goalAmount)} goal`
              : formatCurrency(givingBalance)}
          </p>
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
                      <button onClick={() => handleEditConfirm(d)} disabled={working} className="text-xs bg-[#3D8B68] text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{working ? "…" : "Save"}</button>
                      <button onClick={() => setEditingId(null)} className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-lg">Cancel</button>
                    </div>
                  ) : deletingId === d.id ? (
                    <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-600">Delete {formatCurrency(d.amount)}?</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleDeleteConfirm(d)} disabled={working} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg disabled:opacity-50">{working ? "…" : "Delete"}</button>
                        <button onClick={() => setDeletingId(null)} className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm text-[#111827]">{d.causeTitle}</p>
                        <p className="text-xs text-[#9CA3AF]">{d.donatedAt?.toDate ? formatRelativeTime(d.donatedAt.toDate()) : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#3D8B68]">{formatCurrency(d.amount)}</p>
                        <button onClick={() => { setEditingId(d.id); setEditAmountStr(String(d.amount)); }} className="text-[#9CA3AF] hover:text-[#3D8B68] text-base p-1">✏️</button>
                        <button onClick={() => setDeletingId(d.id)} className="text-[#9CA3AF] hover:text-red-500 text-base p-1">🗑️</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Splurge Tab ── */
function SplurgeTab({
  uid,
  spendingBalance,
  spendingGoal,
  spendingHistory,
  onPurchased,
  onGoalSaved,
  onEditHistory,
  onDeleteHistory,
}: {
  uid: string;
  spendingBalance: number;
  spendingGoal: { label: string; targetAmount: number; shoppingLink?: string } | null;
  spendingHistory: SpendingHistoryEvent[];
  onPurchased: (label: string, targetAmount: number, amountSaved: number) => Promise<void>;
  onGoalSaved: (goal: { label: string; targetAmount: number; shoppingLink?: string }) => Promise<void>;
  onEditHistory: (event: SpendingHistoryEvent, newAmount: number) => Promise<void>;
  onDeleteHistory: (event: SpendingHistoryEvent) => Promise<void>;
}) {
  const [confirmPurchase, setConfirmPurchase] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalLink, setGoalLink] = useState("");
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
    const goal: { label: string; targetAmount: number; shoppingLink?: string } = {
      label: goalLabel,
      targetAmount: amount,
    };
    if (goalLink.trim()) goal.shoppingLink = goalLink.trim();
    await onGoalSaved(goal);
    setGoalLabel("");
    setGoalAmount("");
    setGoalLink("");
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
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm space-y-4">
      <h2 className="text-base font-bold text-[#111827]">🛍️ Splurge Goal</h2>

      {spendingGoal ? (
        <>
          <div className="bg-[#F5F3FF] rounded-xl px-4 py-3">
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

          {/* Shopping link */}
          {spendingGoal.shoppingLink && (
            <a
              href={spendingGoal.shoppingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 border border-[#8B5CF6] text-[#8B5CF6] font-semibold rounded-xl hover:bg-[#F5F3FF] transition-colors text-sm"
            >
              🛒 Shop now →
            </a>
          )}

          {confirmPurchase ? (
            <div className="bg-[#FFF7ED] border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-[#111827] mb-1">Mark as purchased?</p>
              <p className="text-xs text-[#6B7280] mb-3">
                This will log {formatCurrency(spendingBalance)} as spent and clear your goal.
              </p>
              <div className="flex gap-2">
                <button onClick={handlePurchase} disabled={purchasing} className="flex-1 bg-[#8B5CF6] text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-50">
                  {purchasing ? "Saving…" : "Yes, I bought it!"}
                </button>
                <button onClick={() => setConfirmPurchase(false)} className="flex-1 border border-[#E5E7EB] text-[#6B7280] font-semibold py-2 rounded-xl text-sm">
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
          <p className="text-sm text-[#6B7280]">What are you saving your splurge jar toward?</p>
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
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">🔗</span>
              <input
                type="url"
                placeholder="Shopping link (optional)"
                value={goalLink}
                onChange={(e) => setGoalLink(e.target.value)}
                className="w-full pl-10 border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
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
        <div>
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Purchase History</p>
          <div className="space-y-1">
            {spendingHistory.map((event) => (
              <div key={event.id}>
                {editingId === event.id ? (
                  <div className="flex gap-2 py-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280]">$</span>
                      <input type="number" value={editAmountStr} onChange={(e) => setEditAmountStr(e.target.value)} className="w-full pl-6 border border-[#8B5CF6] rounded-lg px-2 py-1.5 text-sm text-[#111827] focus:outline-none" autoFocus />
                    </div>
                    <button onClick={() => handleEditConfirm(event)} disabled={working} className="text-xs bg-[#8B5CF6] text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{working ? "…" : "Save"}</button>
                    <button onClick={() => setEditingId(null)} className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-lg">Cancel</button>
                  </div>
                ) : deletingId === event.id ? (
                  <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600">Delete {event.label}?</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleDeleteConfirm(event)} disabled={working} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg disabled:opacity-50">{working ? "…" : "Delete"}</button>
                      <button onClick={() => setDeletingId(null)} className="text-xs border border-[#E5E7EB] text-[#6B7280] px-3 py-1 rounded-lg">Cancel</button>
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
                      <button onClick={() => { setEditingId(event.id); setEditAmountStr(String(event.amountSaved)); }} className="text-[#9CA3AF] hover:text-[#8B5CF6] text-base p-1">✏️</button>
                      <button onClick={() => setDeletingId(event.id)} className="text-[#9CA3AF] hover:text-red-500 text-base p-1">🗑️</button>
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
    { label: "50 / 50",    g: 50, l: 50 },
    { label: "60/40 Give", g: 60, l: 40 },
    { label: "40/60 Live", g: 40, l: 60 },
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

      <div className="flex gap-2 mb-3">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => { setGive(String(p.g)); setLive(String(p.l)); }}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:border-[#3D8B68]/50 hover:text-[#3D8B68] transition-colors"
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
