"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import {
  JarBalanceEndpoint,
  normalizeSpendingGoals,
  pinProjectToHome,
  moveJarBalance,
  setActiveSkipTarget,
  deleteDonation,
  deleteSpendingHistory,
  subscribeToDonations,
  subscribeToSpendingHistory,
  updateDonation,
  updateSpendingHistory,
  updateSpendingGoals,
} from "@/lib/services/firebase/users";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { DonationEvent, Project, SpendingGoal, SpendingHistoryEvent } from "@/lib/types/models";
import { DonationLogModal } from "@/components/skip/DonationLogModal";

const SKIP_BUCKS_DESTINATION = "skip-bucks";

type JarActivityItem =
  | {
      type: "fundraiser";
      id: string;
      title: string;
      subtitle: string;
      balance: number;
      goalAmount: number;
      active: boolean;
      project: Project | null;
    }
  | {
      type: "goal";
      id: string;
      title: string;
      subtitle: string;
      balance: number;
      goalAmount: number;
      active: boolean;
      goal: SpendingGoal;
    };

type SkipBucksSource = {
  type: "skip-bucks";
  id: typeof SKIP_BUCKS_DESTINATION;
  title: "Unassigned Skip Bucks";
  balance: number;
};

type MoveSource = JarActivityItem | SkipBucksSource;

type SpentSkipEvent =
  | { kind: "donation"; id: string; title: string; meta: string; amount: number; timestamp: number; event: DonationEvent }
  | { kind: "purchase"; id: string; title: string; meta: string; amount: number; timestamp: number; event: SpendingHistoryEvent };

function progressPercent(balance: number, goalAmount: number) {
  if (goalAmount <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, balance) / goalAmount) * 100));
}

function goalLine(item: JarActivityItem) {
  if (item.goalAmount <= 0) return "Open goal";
  return `${progressPercent(item.balance, item.goalAmount)}% of ${formatCurrency(item.goalAmount)}`;
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function amountInputValue(value: number) {
  const rounded = cents(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatEventDate(value: { toDate?: () => Date } | undefined, fallback?: string) {
  if (fallback) return fallback;
  const date = value?.toDate?.();
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function eventTime(value: { toDate?: () => Date } | undefined, fallback?: string) {
  if (fallback) return new Date(`${fallback}T00:00:00`).getTime();
  return value?.toDate?.().getTime() ?? 0;
}

function jarKey(item: JarActivityItem) {
  return `${item.type}:${item.id}`;
}

function moveSourceKey(source: MoveSource) {
  return source.type === "skip-bucks" ? SKIP_BUCKS_DESTINATION : jarKey(source);
}

function jarOptionLabel(item: JarActivityItem) {
  return `${item.type === "fundraiser" ? "Fundraiser" : "Reward"} - ${item.title} (${formatCurrency(item.balance)})`;
}

function moveSourceOptionLabel(source: MoveSource) {
  return source.type === "skip-bucks"
    ? `Unassigned Skip Bucks (${formatCurrency(source.balance)})`
    : jarOptionLabel(source);
}

function JarActivityCard({
  item,
  working,
  onResume,
  onLogDonation,
  onDonate,
}: {
  item: JarActivityItem;
  working: boolean;
  onResume: (item: JarActivityItem) => void;
  onLogDonation: (project: Project) => void;
  onDonate: (project: Project) => void;
}) {
  const percent = progressPercent(item.balance, item.goalAmount);
  const accent = item.type === "fundraiser" ? "var(--green-primary)" : "#A78BFA";

  return (
    <article className="rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: accent }}>
              {item.type === "fundraiser" ? "Fundraiser" : "Reward"}
            </p>
            {item.active && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "rgba(46,204,113,0.14)", color: "var(--green-primary)" }}>
                Active
              </span>
            )}
          </div>
          <h2 className="mt-1 text-xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>{item.title}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{item.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{formatCurrency(item.balance)}</p>
          <p className="text-xs font-bold mt-1" style={{ color: "var(--text-muted)" }}>{goalLine(item)}</p>
          {!item.active && (
            <button
              type="button"
              onClick={() => onResume(item)}
              disabled={working}
              className="rounded-full px-3 py-1.5 text-xs font-black disabled:opacity-50"
              style={{ background: "transparent", border: `1px solid ${accent}`, color: accent }}
            >
              Make active
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}>
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: accent }} />
      </div>

      {item.type === "fundraiser" && item.project && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onDonate(item.project!)}
            className="rounded-full px-4 py-2.5 text-center text-sm font-black"
            style={{ background: "var(--green-primary)", color: "#071B14" }}
          >
            Donate
          </button>
          <button
            type="button"
            onClick={() => onLogDonation(item.project!)}
            className="rounded-full px-4 py-2.5 text-sm font-black"
            style={{ background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          >
            Log donation
          </button>
        </div>
      )}
    </article>
  );
}

function DonationNextStepModal({
  project,
  onClose,
  onLogDonation,
}: {
  project: Project;
  onClose: () => void;
  onLogDonation: (project: Project) => void;
}) {
  const hasLink = Boolean(project.donationURL);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative px-5 py-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
          <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--green-primary)" }}>
            {hasLink ? "Donation link opened" : "No donation link"}
          </p>
          <p className="mt-2 text-xl font-black leading-tight pr-6" style={{ color: "var(--text-primary)" }}>
            {hasLink ? "Did you complete the donation?" : "Donate outside iSkipped"}
          </p>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {hasLink
              ? "When you come back, log the donation so your jar and fundraiser history stay accurate."
              : "No donation link is attached to this fundraiser yet. Please donate directly through the organization, then log it here so your jar stays accurate."}
          </p>
          {hasLink && (
            <button
              type="button"
              onClick={() => window.open(project.donationURL!, "_blank", "noopener,noreferrer")}
              className="w-full rounded-xl py-3 text-sm font-black"
              style={{ background: "rgba(237,245,240,0.06)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-primary)" }}
            >
              Open donation link again
            </button>
          )}
          <button
            type="button"
            onClick={() => onLogDonation(project)}
            className="w-full rounded-xl py-3 text-sm font-black"
            style={{ background: "var(--green-primary)", color: "#071B14" }}
          >
            Log donation
          </button>
          <button type="button" onClick={onClose} className="w-full py-1 text-sm font-black" style={{ color: "var(--text-muted)" }}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {subtitle && <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-surface-1)", border: "1px dashed var(--border-default)" }}>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{children}</p>
    </div>
  );
}

function BalanceManager({
  sources,
  working,
  onMove,
}: {
  sources: MoveSource[];
  working: boolean;
  onMove: () => void;
}) {
  return (
    <section className="mb-6 rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Manage balance</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Move saved money between jars, or back to Unassigned Skip Bucks.
          </p>
        </div>
        <button
          type="button"
          onClick={onMove}
          disabled={working}
          className="rounded-full px-5 py-3 text-sm font-black disabled:opacity-50"
          style={{ background: "var(--green-primary)", color: "#071B14" }}
        >
          Move balance
        </button>
      </div>
    </section>
  );
}

function EditableHistoryRow({
  eyebrow,
  title,
  meta,
  amount,
  amountPrefix = "",
  editing,
  editValue,
  working,
  accent,
  onEdit,
  onEditValue,
  onCancel,
  onDelete,
  onSave,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  amount: number;
  amountPrefix?: string;
  editing: boolean;
  editValue: string;
  working: boolean;
  accent: string;
  onEdit: () => void;
  onEditValue: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>{eyebrow}</p>
          <p className="mt-1 text-base font-black" style={{ color: "var(--text-primary)" }}>{title}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{meta}</p>
        </div>
        {editing ? (
          <div className="w-32">
            <div className="flex items-center rounded-lg px-2 py-1.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <span className="text-xs font-black mr-1" style={{ color: "var(--text-muted)" }}>$</span>
              <input
                type="number"
                min="0"
                value={editValue}
                onChange={(event) => onEditValue(event.target.value)}
                className="w-full bg-transparent text-right text-sm font-black outline-none"
                style={{ color: "var(--text-primary)" }}
                autoFocus
              />
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>{amountPrefix}{formatCurrency(amount)}</p>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full px-3 py-1 text-xs font-black"
              style={{ background: "rgba(46,204,113,0.1)", border: "1px solid rgba(46,204,113,0.22)", color: "var(--green-primary)" }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full px-3 py-1 text-xs font-black"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#FCA5A5" }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex justify-end gap-3">
          <>
            <button type="button" onClick={onCancel} className="text-xs font-black" style={{ color: "var(--text-muted)" }}>Cancel</button>
            <button type="button" onClick={onSave} disabled={working} className="text-xs font-black disabled:opacity-50" style={{ color: "var(--green-primary)" }}>
              {working ? "Saving..." : "Save"}
            </button>
          </>
        </div>
      )}
    </div>
  );
}

function MoveBalanceModal({
  sources,
  source,
  destinations,
  selectedId,
  amount,
  working,
  onSourceSelect,
  onSelect,
  onAmountChange,
  onClose,
  onConfirm,
}: {
  sources: MoveSource[];
  source: MoveSource;
  destinations: JarActivityItem[];
  selectedId: string;
  amount: string;
  working: boolean;
  onSourceSelect: (id: string) => void;
  onSelect: (id: string) => void;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const selected = destinations.find((item) => jarKey(item) === selectedId) ?? null;
  const releasing = source.type !== "skip-bucks" && selectedId === SKIP_BUCKS_DESTINATION;
  const destinationLabel = releasing ? "Unassigned Skip Bucks" : selected?.title ?? "another jar";
  const sourceIsSkipBucks = source.type === "skip-bucks";
  const parsedAmount = cents(Number.parseFloat(amount));
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= cents(source.balance);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(event) => event.stopPropagation()}>
        <div className="relative px-5 py-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
          <p className="text-lg font-black leading-tight pr-6" style={{ color: "var(--text-primary)" }}>Move balance?</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {sourceIsSkipBucks
              ? `Move saved money from Unassigned Skip Bucks into ${destinationLabel}.`
              : "Review this move before changing where saved skips are kept."}
          </p>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--green-primary)" }}>From</span>
            <select
              value={moveSourceKey(source)}
              onChange={(event) => onSourceSelect(event.target.value)}
              className="mt-2 w-full rounded-xl px-3 py-3 text-sm font-black outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            >
              {sources.map((item) => (
                <option key={moveSourceKey(item)} value={moveSourceKey(item)}>
                  {moveSourceOptionLabel(item)}
                </option>
              ))}
            </select>
          </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--green-primary)" }}>Move to</span>
              <select
                value={selectedId}
                onChange={(event) => onSelect(event.target.value)}
                className="mt-2 w-full rounded-xl px-3 py-3 text-sm font-black outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              >
                {!sourceIsSkipBucks && <option value={SKIP_BUCKS_DESTINATION}>Unassigned Skip Bucks</option>}
                {destinations.map((item) => (
                  <option key={jarKey(item)} value={jarKey(item)}>
                    {jarOptionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--green-primary)" }}>Amount to move</span>
            <div
              className="mt-2 flex items-center rounded-xl px-3 py-3"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
            >
              <span className="mr-2 text-sm font-black" style={{ color: "var(--text-muted)" }}>$</span>
              <input
                type="number"
                min="0.01"
                max={source.balance}
                step="0.01"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
                className="w-full bg-transparent text-sm font-black outline-none"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
            <p className="mt-1 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
              {formatCurrency(source.balance)} available
            </p>
          </label>
          {(selected || releasing) && (
            <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <p className="text-xs font-bold leading-relaxed" style={{ color: "var(--gold-cta)" }}>
                {releasing
                  ? `You skipped ${formatCurrency(parsedAmount || 0)} for ${source.title}. Are you sure you want to move it back to Unassigned Skip Bucks?`
                  : sourceIsSkipBucks
                    ? `Are you sure you want to move ${formatCurrency(parsedAmount || 0)} from Unassigned Skip Bucks into ${selected?.title}?`
                  : `You skipped ${formatCurrency(parsedAmount || 0)} for ${source.title}. Are you sure you want to move it to ${selected?.title}?`}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={working || !selectedId || !validAmount}
            className="w-full rounded-full py-3 text-sm font-black disabled:opacity-50"
            style={{ background: "var(--green-primary)", color: "#071B14" }}
          >
            {working ? "Moving..." : "Move balance"}
          </button>
          <button type="button" onClick={onClose} className="w-full py-1 text-sm font-black" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JarActivityPage() {
  const { user, profile, updateProfile } = useAuthStore();
  const { projects } = useProjects();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [donations, setDonations] = useState<DonationEvent[]>([]);
  const [spendingHistory, setSpendingHistory] = useState<SpendingHistoryEvent[]>([]);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState("");
  const [historyWorkingId, setHistoryWorkingId] = useState<string | null>(null);
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const [donatingProject, setDonatingProject] = useState<Project | null>(null);
  const [donationNextStepProject, setDonationNextStepProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubDonations = subscribeToDonations(user.uid, setDonations);
    const unsubPurchases = subscribeToSpendingHistory(user.uid, setSpendingHistory);
    return () => {
      unsubDonations();
      unsubPurchases();
    };
  }, [user]);

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile ?? ({} as any));
  const activeTarget = profile?.activeSkipTarget === undefined
    ? (activeSpendingGoalId ? { type: "goal" as const, id: activeSpendingGoalId } : null)
      ?? (profile?.activeProjectId ? { type: "fundraiser" as const, id: profile.activeProjectId } : null)
    : profile.activeSkipTarget;
  const skipBalanceSummary = getSkipBalanceSummary(profile);
  const totalSkipBucks = skipBalanceSummary.availableFromSkips;
  const inJars = skipBalanceSummary.assignedToJars;
  const unassignedSkipBucks = skipBalanceSummary.unassignedSkipBank;

  const items = useMemo<JarActivityItem[]>(() => {
    if (!profile) return [];
    const fundraiserIds = new Set([
      ...Object.entries(profile.causeJarBalances ?? {}).filter(([, balance]) => Math.max(0, balance) > 0).map(([id]) => id),
      ...(profile.activeProjectId ? [profile.activeProjectId] : []),
      ...(activeTarget?.type === "fundraiser" ? [activeTarget.id] : []),
    ]);
    const fundraiserItems: JarActivityItem[] = Array.from(fundraiserIds).map((id) => {
      const project = projects.find((candidate) => candidate.id === id) ?? null;
      const title = project?.groupName ?? project?.title ?? "Fundraiser jar";
      return {
        type: "fundraiser",
        id,
        title,
        subtitle: project?.sponsor ? `by ${project.sponsor}` : "Saved for this cause",
        balance: Math.max(0, profile.causeJarBalances?.[id] ?? 0),
        goalAmount: profile.causeGoalAmounts?.[id] ?? project?.goalAmount ?? 0,
        active: activeTarget?.type === "fundraiser" && activeTarget.id === id,
        project,
      };
    });

    const rewardItems: JarActivityItem[] = spendingGoals
      .filter((goal) => Math.max(0, profile.goalJarBalances?.[goal.id] ?? 0) > 0 || activeTarget?.type === "goal" && activeTarget.id === goal.id)
      .map((goal) => ({
        type: "goal",
        id: goal.id,
        title: goal.label,
        subtitle: goal.category ?? "Personal reward",
        balance: Math.max(0, profile.goalJarBalances?.[goal.id] ?? 0),
        goalAmount: goal.targetAmount,
        active: activeTarget?.type === "goal" && activeTarget.id === goal.id,
        goal,
      }));

    return [...fundraiserItems, ...rewardItems].sort((a, b) => Number(b.active) - Number(a.active) || b.balance - a.balance);
  }, [profile, projects, activeTarget?.type, activeTarget?.id, spendingGoals]);

  const activeItems = items.filter((item) => item.active);
  const inactiveItems = items.filter((item) => !item.active);
  const spentSkipEvents = useMemo<SpentSkipEvent[]>(() => {
    const donationEvents: SpentSkipEvent[] = donations.map((event) => ({
      kind: "donation",
      id: event.id,
      title: `Donation to ${event.causeTitle}`,
      meta: formatEventDate(event.donatedAt, event.date),
      amount: event.amount,
      timestamp: eventTime(event.donatedAt, event.date),
      event,
    }));
    const purchaseEvents: SpentSkipEvent[] = spendingHistory.map((event) => ({
      kind: "purchase",
      id: event.id,
      title: `Purchase for ${event.label}`,
      meta: formatEventDate(event.purchasedAt),
      amount: event.amountSaved,
      timestamp: eventTime(event.purchasedAt),
      event,
    }));
    return [...donationEvents, ...purchaseEvents].sort((a, b) => b.timestamp - a.timestamp);
  }, [donations, spendingHistory]);
  const transferSources = items.filter((item) => item.balance > 0);
  const skipBucksSource: SkipBucksSource | null = unassignedSkipBucks > 0
    ? { type: "skip-bucks", id: SKIP_BUCKS_DESTINATION, title: "Unassigned Skip Bucks", balance: unassignedSkipBucks }
    : null;
  const moveSources: MoveSource[] = [
    ...(skipBucksSource ? [skipBucksSource] : []),
    ...transferSources,
  ];
  const moveDestinations = moveSource
    ? items.filter((item) => moveSource.type === "skip-bucks" || !(item.type === moveSource.type && item.id === moveSource.id))
    : [];

  if (!user || !profile) return null;
  const profileData = profile;

  async function handleResume(item: JarActivityItem) {
    if (!user || workingId) return;
    setWorkingId(item.id);
    try {
      if (item.type === "fundraiser") {
        await pinProjectToHome(user.uid, item.id);
        updateProfile({
          activeProjectId: item.id,
          activeSkipTarget: { type: "fundraiser", id: item.id },
          joinedProjectIds: Array.from(new Set([...(profileData.joinedProjectIds ?? []), item.id])),
        });
      } else {
        await Promise.all([
          updateSpendingGoals(user.uid, spendingGoals, item.id),
          setActiveSkipTarget(user.uid, { type: "goal", id: item.id }),
        ]);
        updateProfile({ activeSpendingGoalId: item.id, activeSkipTarget: { type: "goal", id: item.id } });
      }
      toast.success("Future skips will go to this jar.");
    } catch {
      toast.error("Could not resume this jar. Try again.");
    } finally {
      setWorkingId(null);
    }
  }

  function beginMoveBalance(item: MoveSource) {
    const destinations = items.filter((candidate) => item.type === "skip-bucks" || !(candidate.type === item.type && candidate.id === item.id));
    setMoveSource(item);
    setMoveDestinationId(item.type === "skip-bucks" ? (destinations[0] ? jarKey(destinations[0]) : "") : (destinations[0] ? jarKey(destinations[0]) : SKIP_BUCKS_DESTINATION));
    setMoveAmount(amountInputValue(item.balance));
  }

  function beginDonate(project: Project) {
    if (project.donationURL) {
      window.open(project.donationURL, "_blank", "noopener,noreferrer");
    }
    setDonationNextStepProject(project);
  }

  function beginDonationLog(project: Project) {
    setDonationNextStepProject(null);
    setDonatingProject(project);
  }

  function beginSelectedMoveBalance() {
    if (!moveSources[0]) {
      toast.info("No balances to move yet. Once you have Unassigned Skip Bucks or money in a jar, you can move it here.");
      return;
    }
    if (items.length === 0) {
      toast.info("Create or join a jar first, then you can move Skip Bucks into it.");
      return;
    }
    beginMoveBalance(moveSources[0]);
  }

  function selectMoveSource(sourceId: string) {
    const nextSource = moveSources.find((item) => moveSourceKey(item) === sourceId);
    if (!nextSource) return;
    const destinations = items.filter((candidate) => nextSource.type === "skip-bucks" || jarKey(candidate) !== jarKey(nextSource));
    setMoveSource(nextSource);
    setMoveDestinationId(nextSource.type === "skip-bucks" ? (destinations[0] ? jarKey(destinations[0]) : "") : (destinations[0] ? jarKey(destinations[0]) : SKIP_BUCKS_DESTINATION));
    setMoveAmount(amountInputValue(nextSource.balance));
  }

  async function handleMoveBalance() {
    if (!user || !moveSource || workingId || moveSource.balance <= 0 || !moveDestinationId) return;
    const amountToMove = cents(Number.parseFloat(moveAmount));
    if (!Number.isFinite(amountToMove) || amountToMove <= 0) {
      toast.error("Enter an amount to move.");
      return;
    }
    if (amountToMove > cents(moveSource.balance)) {
      toast.error("That is more than this balance has available.");
      return;
    }
    const destination = moveDestinationId === SKIP_BUCKS_DESTINATION
      ? null
      : moveDestinations.find((item) => jarKey(item) === moveDestinationId);
    if (!destination && moveDestinationId !== SKIP_BUCKS_DESTINATION) return;
    const sourceEndpoint: JarBalanceEndpoint = moveSource.type === "skip-bucks"
      ? { type: "skip-bucks" }
      : { type: moveSource.type === "fundraiser" ? "fundraiser" : "goal", id: moveSource.id };
    const destinationEndpoint: JarBalanceEndpoint = moveDestinationId === SKIP_BUCKS_DESTINATION
      ? { type: "skip-bucks" }
      : { type: destination!.type === "fundraiser" ? "fundraiser" : "goal", id: destination!.id };
    setWorkingId(moveSourceKey(moveSource));
    try {
      const appliedAmount = await moveJarBalance(user.uid, sourceEndpoint, destinationEndpoint, amountToMove);
      const nextCauseBalances = { ...(profileData.causeJarBalances ?? {}) };
      const nextGoalBalances = { ...(profileData.goalJarBalances ?? {}) };
      if (moveSource.type === "fundraiser") {
        nextCauseBalances[moveSource.id] = Math.max(0, cents((nextCauseBalances[moveSource.id] ?? 0) - appliedAmount));
      }
      if (moveSource.type === "goal") {
        nextGoalBalances[moveSource.id] = Math.max(0, cents((nextGoalBalances[moveSource.id] ?? 0) - appliedAmount));
      }
      if (destination?.type === "fundraiser") {
        nextCauseBalances[destination.id] = cents(Math.max(0, nextCauseBalances[destination.id] ?? 0) + appliedAmount);
      }
      if (destination?.type === "goal") {
        nextGoalBalances[destination.id] = cents(Math.max(0, nextGoalBalances[destination.id] ?? 0) + appliedAmount);
      }
      updateProfile({
        causeJarBalances: nextCauseBalances,
        goalJarBalances: nextGoalBalances,
        ...(destination?.type === "fundraiser"
          ? { joinedProjectIds: Array.from(new Set([...(profileData.joinedProjectIds ?? []), destination.id])) }
          : {}),
      });
      setMoveSource(null);
      setMoveAmount("");
      toast.success(`${formatCurrency(appliedAmount)} moved to ${destination?.title ?? "Unassigned Skip Bucks"}.`);
    } catch {
      toast.error("Could not move this balance. Try again.");
    } finally {
      setWorkingId(null);
    }
  }

  function beginEditHistory(kind: "donation" | "purchase", id: string, amount: number) {
    setEditingHistoryId(`${kind}-${id}`);
    setEditingAmount(String(amount));
  }

  async function saveDonationEdit(event: DonationEvent) {
    if (!user) return;
    const nextAmount = Number(editingAmount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
    const delta = nextAmount - event.amount;
    const currentBal = Math.max(0, profileData.causeJarBalances?.[event.causeId] ?? 0);
    const jarDecreaseDelta = delta > 0
      ? Math.min(delta, currentBal)
      : delta;
    setHistoryWorkingId(`donation-${event.id}`);
    try {
      await updateDonation(user.uid, event.id, nextAmount, event.amount, event.causeId, event.date);
      updateProfile({
        totalDonated: Math.max(0, (profileData.totalDonated ?? 0) + delta),
        causeJarBalances: {
          ...(profileData.causeJarBalances ?? {}),
          [event.causeId]: Math.max(0, currentBal - jarDecreaseDelta),
        },
      });
      setEditingHistoryId(null);
      toast.success("Donation updated.");
    } catch {
      toast.error("Could not update donation.");
    } finally {
      setHistoryWorkingId(null);
    }
  }

  async function savePurchaseEdit(event: SpendingHistoryEvent) {
    if (!user) return;
    const nextAmount = Number(editingAmount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
    const delta = nextAmount - event.amountSaved;
    const currentBal = event.goalId ? Math.max(0, profileData.goalJarBalances?.[event.goalId] ?? 0) : 0;
    const jarDecreaseDelta = delta > 0
      ? Math.min(delta, currentBal)
      : delta;
    setHistoryWorkingId(`purchase-${event.id}`);
    try {
      await updateSpendingHistory(user.uid, event.id, nextAmount, event.amountSaved);
      updateProfile({
        totalSpent: Math.max(0, (profileData.totalSpent ?? 0) + delta),
        ...(event.goalId
          ? {
              goalJarBalances: {
                ...(profileData.goalJarBalances ?? {}),
                [event.goalId]: Math.max(0, currentBal - jarDecreaseDelta),
              },
            }
          : {}),
      });
      setEditingHistoryId(null);
      toast.success("Purchase updated.");
    } catch {
      toast.error("Could not update purchase.");
    } finally {
      setHistoryWorkingId(null);
    }
  }

  async function deleteDonationHistory(event: DonationEvent) {
    if (!user) return;
    const confirmed = window.confirm("Delete this donation record? The skipped amount it used will go back to this jar.");
    if (!confirmed) return;
    setHistoryWorkingId(`donation-${event.id}`);
    try {
      await deleteDonation(user.uid, event.id, event.amount, event.causeId);
      const currentBal = Math.max(0, profileData.causeJarBalances?.[event.causeId] ?? 0);
      updateProfile({
        totalDonated: Math.max(0, (profileData.totalDonated ?? 0) - event.amount),
        causeJarBalances: {
          ...(profileData.causeJarBalances ?? {}),
          [event.causeId]: currentBal + event.amount,
        },
      });
      toast.success("Donation deleted.");
    } catch {
      toast.error("Could not delete donation.");
    } finally {
      setHistoryWorkingId(null);
    }
  }

  async function deletePurchaseHistory(event: SpendingHistoryEvent) {
    if (!user) return;
    const confirmed = window.confirm("Delete this purchase record? The skipped amount it used will go back to this reward jar.");
    if (!confirmed) return;
    setHistoryWorkingId(`purchase-${event.id}`);
    try {
      await deleteSpendingHistory(user.uid, event.id, event.amountSaved, event.goalId);
      updateProfile({
        totalSpent: Math.max(0, (profileData.totalSpent ?? 0) - event.amountSaved),
        ...(event.goalId
          ? {
              goalJarBalances: {
                ...(profileData.goalJarBalances ?? {}),
                [event.goalId]: Math.max(0, profileData.goalJarBalances?.[event.goalId] ?? 0) + event.amountSaved,
              },
            }
          : {}),
      });
      toast.success("Purchase deleted.");
    } catch {
      toast.error("Could not delete purchase.");
    } finally {
      setHistoryWorkingId(null);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24 md:pb-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] font-black" style={{ color: "var(--green-primary)" }}>Jar Activity</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Where your skips are saved</h1>
        </div>
        <Link
          href="/jars"
          className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-black"
          style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)", textDecoration: "none" }}
        >
          Browse jars
        </Link>
      </div>

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>Total Skip Bucks</p>
          <p className="mt-1 text-3xl font-black" style={{ color: "var(--green-primary)" }}>{formatCurrency(totalSkipBucks)}</p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Saved and not used yet.
          </p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>In Jars</p>
          <p className="mt-1 text-3xl font-black" style={{ color: "var(--text-primary)" }}>{formatCurrency(inJars)}</p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Earmarked for a reward or cause.
          </p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>Unassigned Skip Bucks</p>
          <p className="mt-1 text-3xl font-black" style={{ color: "var(--green-primary)" }}>{formatCurrency(unassignedSkipBucks)}</p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Available to add to any jar.
          </p>
        </div>
      </section>

      <BalanceManager
        sources={moveSources}
        working={Boolean(moveSource && workingId === moveSourceKey(moveSource))}
        onMove={beginSelectedMoveBalance}
      />

      <section className="mb-6">
        <SectionHeader title="Active Jar" subtitle="Future skips go here." />
        {activeItems.length === 0 ? (
          <EmptySection>No active jar right now.</EmptySection>
        ) : (
          <div className="space-y-3">
            {activeItems.map((item) => (
              <JarActivityCard
                key={`${item.type}-${item.id}`}
                item={item}
                working={workingId === item.id}
                onResume={handleResume}
                onLogDonation={setDonatingProject}
                onDonate={beginDonate}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <SectionHeader title="Inactive Jars" subtitle="Saved progress that is parked for later." />
        {inactiveItems.length === 0 ? (
          <EmptySection>No inactive jar balances yet.</EmptySection>
        ) : (
          <div className="space-y-3">
            {inactiveItems.map((item) => (
            <JarActivityCard
              key={`${item.type}-${item.id}`}
              item={item}
              working={workingId === item.id}
              onResume={handleResume}
              onLogDonation={setDonatingProject}
              onDonate={beginDonate}
            />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(237,245,240,0.12)" }}>
        <div className="mb-4 flex items-center gap-3">
          <span className="h-9 w-1 rounded-full" style={{ background: "var(--green-primary)" }} aria-hidden="true" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>History</p>
            <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>How I Spent My Skips</h2>
          </div>
        </div>
        {spentSkipEvents.length === 0 ? (
          <EmptySection>No donations or purchases logged yet.</EmptySection>
        ) : (
          <div className="space-y-3">
            {spentSkipEvents.map((spentEvent) => (
              <EditableHistoryRow
                key={`${spentEvent.kind}-${spentEvent.id}`}
                eyebrow={spentEvent.kind === "donation" ? "Donation" : "Purchase"}
                title={spentEvent.title}
                meta={spentEvent.meta}
                amount={spentEvent.amount}
                amountPrefix="+"
                editing={editingHistoryId === `${spentEvent.kind}-${spentEvent.id}`}
                editValue={editingAmount}
                working={historyWorkingId === `${spentEvent.kind}-${spentEvent.id}`}
                accent={spentEvent.kind === "donation" ? "var(--green-primary)" : "#A78BFA"}
                onEdit={() => beginEditHistory(spentEvent.kind, spentEvent.id, spentEvent.amount)}
                onEditValue={setEditingAmount}
                onCancel={() => setEditingHistoryId(null)}
                onDelete={() => spentEvent.kind === "donation" ? void deleteDonationHistory(spentEvent.event) : void deletePurchaseHistory(spentEvent.event)}
                onSave={() => spentEvent.kind === "donation" ? saveDonationEdit(spentEvent.event) : savePurchaseEdit(spentEvent.event)}
              />
            ))}
          </div>
        )}
      </section>

      {moveSource && (
        <MoveBalanceModal
          sources={moveSources}
          source={moveSource}
          destinations={moveDestinations}
          selectedId={moveDestinationId}
          amount={moveAmount}
          working={workingId === moveSourceKey(moveSource)}
          onSourceSelect={selectMoveSource}
          onSelect={setMoveDestinationId}
          onAmountChange={setMoveAmount}
          onClose={() => setMoveSource(null)}
          onConfirm={handleMoveBalance}
        />
      )}

      {donationNextStepProject && (
        <DonationNextStepModal
          project={donationNextStepProject}
          onClose={() => setDonationNextStepProject(null)}
          onLogDonation={beginDonationLog}
        />
      )}

      {donatingProject && (
        <DonationLogModal
          projectId={donatingProject.id}
          projectTitle={donatingProject.groupName ?? donatingProject.title}
          initialAmount={Math.max(0, profileData.causeJarBalances?.[donatingProject.id] ?? 0)}
          onClose={() => setDonatingProject(null)}
        />
      )}
    </div>
  );
}
