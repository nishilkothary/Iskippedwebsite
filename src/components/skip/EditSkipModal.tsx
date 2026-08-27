"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Skip } from "@/lib/types/models";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAuthStore } from "@/store/authStore";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { formatCurrency } from "@/lib/utils/currency";
import { SkipSourceAllocation, SkipValueSource } from "@/lib/types/models";
interface Props {
  skip: Skip;
  onClose: () => void;
}

export function EditSkipModal({ skip, onClose }: Props) {
  const { edit, deleteSkip } = useSkips();
  const { projects } = useProjects();
  const { profile } = useAuthStore();

  const initialCat =
    SKIP_CATEGORIES.find((c) => c.id === skip.category) ?? SKIP_CATEGORIES[0];
  const isCustomInit = !SKIP_CATEGORIES.find((c) => c.id === skip.category && c.id !== "custom");
  const initialCustomLabel =
    initialCat.id === "custom" ? (skip.categoryLabel ?? "") : "";

  const [selectedCat, setSelectedCat] = useState(initialCat);
  const [customLabel, setCustomLabel] = useState(initialCustomLabel);
  const [amount, setAmount] = useState(skip.amount.toString());
  const [whatSkipped, setWhatSkipped] = useState(skip.whatSkipped ?? "");
  const [notes, setNotes] = useState(skip.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingAction, setPendingAction] = useState<"edit" | "delete" | null>(null);
  const [pendingPlan, setPendingPlan] = useState<SkipSourceAllocation[]>([]);
  const [pendingRemovalAmount, setPendingRemovalAmount] = useState(0);
  const [changingSourceIndex, setChangingSourceIndex] = useState<number | null>(null);
  const [allocationError, setAllocationError] = useState("");
  const dialogRef = useModalA11y(onClose);

  const num = parseFloat(amount) || 0;
  const { goals } = normalizeSpendingGoals(profile ?? {} as any);
  const savedTarget = skip.allocationTarget
    ?? (skip.projectId ? { type: "fundraiser" as const, id: skip.projectId } : null);
  const savedTargetLabel = savedTarget?.type === "goal"
    ? goals.find((goal) => goal.id === savedTarget.id)?.label ?? "Reward jar"
    : savedTarget?.type === "fundraiser"
      ? skip.projectTitle
        ?? projects.find((project) => project.id === savedTarget.id)?.groupName
        ?? projects.find((project) => project.id === savedTarget.id)?.title
        ?? "Fundraiser jar"
      : null;
  const savedTargetTypeLabel = savedTarget?.type === "goal" ? "Reward jar" : "Fundraiser jar";

  function sourceKey(source: SkipValueSource) {
    return source.type === "skip-bucks" ? "skip-bucks" : `${source.type}:${source.id}`;
  }

  function sourceBalance(source: SkipValueSource) {
    if (source.type === "skip-bucks") return getSkipBalanceSummary(profile).unassignedSkipBank;
    return source.type === "goal"
      ? Math.max(0, profile?.goalJarBalances?.[source.id] ?? 0)
      : Math.max(0, profile?.causeJarBalances?.[source.id] ?? 0);
  }

  function sourceLabel(source: SkipValueSource) {
    if (source.type === "skip-bucks") return "Skip Bucks";
    const name = source.type === "goal"
      ? goals.find((goal) => goal.id === source.id)?.label ?? "Reward jar"
      : projects.find((project) => project.id === source.id)?.groupName
      ?? projects.find((project) => project.id === source.id)?.title
      ?? "Fundraiser jar";
    const activeTarget = profile?.activeSkipTarget
      ?? (profile?.activeSpendingGoalId ? { type: "goal" as const, id: profile.activeSpendingGoalId } : null)
      ?? (profile?.activeProjectId ? { type: "fundraiser" as const, id: profile.activeProjectId } : null);
    return activeTarget?.type === source.type && activeTarget.id === source.id ? `Active jar · ${name}` : `Parked jar · ${name}`;
  }

  const sourceOptions: Array<{ source: SkipValueSource; balance: number; label: string }> = [];
  const addSourceOption = (source: SkipValueSource) => {
    if (sourceOptions.some((option) => sourceKey(option.source) === sourceKey(source))) return;
    const balance = sourceBalance(source);
    if (balance > 0) sourceOptions.push({ source, balance, label: sourceLabel(source) });
  };
  if (savedTarget) addSourceOption(savedTarget);
  addSourceOption({ type: "skip-bucks" });
  Object.entries(profile?.goalJarBalances ?? {}).forEach(([id]) => addSourceOption({ type: "goal", id }));
  Object.entries(profile?.causeJarBalances ?? {}).forEach(([id]) => addSourceOption({ type: "fundraiser", id }));

  function buildDefaultPlan(amountToRemove: number, orderedSources = sourceOptions.map((option) => option.source)) {
    let remaining = Math.round(Math.max(0, amountToRemove) * 100) / 100;
    const plan: SkipSourceAllocation[] = [];
    for (const source of orderedSources) {
      if (remaining <= 0) break;
      const option = sourceOptions.find((candidate) => sourceKey(candidate.source) === sourceKey(source));
      if (!option) continue;
      const amountFromSource = Math.min(option.balance, remaining);
      if (amountFromSource > 0) plan.push({ source: option.source, amount: Math.round(amountFromSource * 100) / 100 });
      remaining = Math.round((remaining - amountFromSource) * 100) / 100;
    }
    return { plan, remaining };
  }

  function beginAllocationReview(action: "edit" | "delete", amountToRemove: number) {
    const { plan, remaining } = buildDefaultPlan(amountToRemove);
    setAllocationError(remaining > 0 ? `You only have ${formatCurrency(amountToRemove - remaining)} of available skipped savings to remove.` : "");
    setPendingPlan(plan);
    setPendingRemovalAmount(amountToRemove);
    setPendingAction(action);
    setChangingSourceIndex(null);
    setConfirmDelete(false);
  }

  function changePlanSource(index: number, nextKey: string) {
    const nextOption = sourceOptions.find((option) => sourceKey(option.source) === nextKey);
    if (!nextOption) return;
    const currentOrder = [
      ...pendingPlan.map((allocation) => allocation.source),
      ...sourceOptions.map((option) => option.source),
    ].filter((source, sourceIndex, sources) => sources.findIndex((candidate) => sourceKey(candidate) === sourceKey(source)) === sourceIndex);
    const nextOrder = currentOrder.filter((source) => sourceKey(source) !== nextKey);
    nextOrder.splice(Math.min(index, nextOrder.length), 0, nextOption.source);
    const recalculated = buildDefaultPlan(pendingRemovalAmount, nextOrder);
    setAllocationError(recalculated.remaining > 0 ? `You only have ${formatCurrency(pendingRemovalAmount - recalculated.remaining)} of available skipped savings to remove.` : "");
    setPendingPlan(recalculated.plan);
    setChangingSourceIndex(null);
  }

  async function commitEdit(sourceAllocations?: SkipSourceAllocation[]) {
    await edit(skip, {
      amount: num,
      category: selectedCat.id,
      categoryLabel: selectedCat.id === "custom" ? (customLabel || "Custom") : selectedCat.label,
      categoryEmoji: selectedCat.emoji,
      whatSkipped: whatSkipped || undefined,
      notes: notes || undefined,
    }, sourceAllocations);
    onClose();
  }

  function handleCatSelect(cat: typeof initialCat) {
    setSelectedCat(cat);
    if (cat.id !== "custom") setCustomLabel("");
  }

  async function handleSave() {
    if (!num || num <= 0) return;
    setLoading(true);
    try {
      if (num < skip.amount) {
        beginAllocationReview("edit", skip.amount - num);
        return;
      }
      await commitEdit();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      beginAllocationReview("delete", skip.amount);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-skip-title"
        tabIndex={-1}
        className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 id="edit-skip-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Edit Skip</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        {pendingAction ? (
          <div className="px-6 py-5 space-y-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.12em]" style={{ color: "var(--green-primary)" }}>
                {pendingAction === "delete" ? "Delete this skip?" : "Adjust this skip?"}
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                This will reduce your total skipped savings by {formatCurrency(pendingAction === "delete" ? skip.amount : skip.amount - num)}. Choose where that reduction should come from.
              </p>
            </div>

            <div className="space-y-3">
              {pendingPlan.map((allocation, index) => {
                const option = sourceOptions.find((candidate) => sourceKey(candidate.source) === sourceKey(allocation.source));
                return (
                  <div key={`${sourceKey(allocation.source)}-${index}`} className="rounded-xl px-4 py-3" style={{ background: "rgba(237,245,240,0.04)", border: "1px solid var(--border-default)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black truncate" style={{ color: "var(--text-primary)" }}>{option?.label ?? "Skip Bucks"}</p>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{formatCurrency(allocation.amount)} will come from here</p>
                      </div>
                      <button type="button" className="shrink-0 text-xs font-black underline" style={{ color: "var(--green-primary)" }} onClick={() => setChangingSourceIndex(changingSourceIndex === index ? null : index)}>
                        Change
                      </button>
                    </div>
                    {changingSourceIndex === index && (
                      <select
                        value={sourceKey(allocation.source)}
                        onChange={(event) => changePlanSource(index, event.target.value)}
                        className="mt-3 w-full rounded-lg px-3 py-2 text-sm"
                        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                      >
                        {sourceOptions
                          .filter((candidate) => !pendingPlan.slice(0, index).some((prior) => sourceKey(prior.source) === sourceKey(candidate.source)))
                          .map((candidate) => (
                            <option key={sourceKey(candidate.source)} value={sourceKey(candidate.source)}>{candidate.label} · {formatCurrency(candidate.balance)} available</option>
                          ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            {allocationError && (
              <p className="text-sm font-semibold" style={{ color: "#FCA5A5" }}>{allocationError}</p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setPendingAction(null)} disabled={loading} className="flex-1 rounded-xl py-3 text-sm font-bold" style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
                Back
              </button>
              <button
                type="button"
                disabled={loading || Boolean(allocationError) || pendingPlan.reduce((sum, allocation) => sum + allocation.amount, 0) < (pendingAction === "delete" ? skip.amount : skip.amount - num) - 0.001}
                onClick={async () => {
                  setLoading(true);
                  try {
                    if (pendingAction === "delete") await deleteSkip(skip, pendingPlan);
                    else await commitEdit(pendingPlan);
                    onClose();
                  } catch (error) {
                    console.error("skip action failed", error);
                    toast.error(error instanceof Error ? error.message : "Couldn't update this skip — please try again.");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex-1 rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: pendingAction === "delete" ? "#ef4444" : "var(--gold-cta)", color: "var(--bg-base)" }}
              >
                {loading ? "Saving…" : pendingAction === "delete" ? "Delete skip" : "Save changes"}
              </button>
            </div>
          </div>
        ) : (
        <div className="px-6 py-5 space-y-5">
          {/* What did you skip */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>What did you skip?</label>
            <input
              type="text"
              value={whatSkipped}
              onChange={(e) => setWhatSkipped(e.target.value)}
              placeholder={skip.categoryLabel}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Amount skipped</label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: "var(--green-primary)" }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw);
                }}
                className="w-28 text-2xl font-bold border-b-2 focus:outline-none bg-transparent"
                style={{ color: "var(--green-primary)", borderColor: "var(--green-primary)" }}
              />
            </div>
          </div>

          {savedTarget && savedTargetLabel && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "rgba(237,245,240,0.04)", border: "1px solid var(--border-default)" }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                Originally skipped for
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {savedTargetLabel}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {savedTargetTypeLabel}
              </p>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Category</label>
            <div className="grid grid-cols-4 gap-2">
              {SKIP_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCatSelect(cat)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl text-sm transition-all"
                  style={
                    selectedCat.id === cat.id
                      ? {
                          border: "1px solid var(--green-primary)",
                          background: "var(--bg-surface-2)",
                          color: "var(--green-primary)",
                        }
                      : {
                          border: "1px solid var(--border-default)",
                          background: "transparent",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-xs font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
            {selectedCat.id === "custom" && (
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Enter category"
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none mt-2"
                style={{
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Personal notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any thoughts?"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
        )}

        {/* Actions */}
        {!pendingAction && <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleSave}
            disabled={loading || num <= 0}
            className="w-full font-bold py-4 rounded-xl text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
            }}
          >
            {loading ? "Saving…" : "Save changes"}
          </button>

          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 font-semibold py-3 rounded-xl text-sm"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60"
              >
                {loading ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full font-semibold py-3 rounded-xl text-sm hover:bg-red-500/10 transition-colors"
              style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
            >
              Delete skip
            </button>
          )}
        </div>}
      </div>
    </div>
  );
}
