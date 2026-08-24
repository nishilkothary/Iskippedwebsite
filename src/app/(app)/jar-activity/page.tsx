"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import {
  JarBalanceEndpoint,
  normalizeSpendingGoals,
  pinProjectToHome,
  moveJarBalance,
  recordPurchase,
  setActiveProject,
  setActiveSkipTarget,
  setUserCauseGoal,
  parkSkipTarget,
  deactivateSkipTarget,
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
  onDonate,
  onPurchase,
  onDeactivate,
  onEditGoalAmount,
}: {
  item: JarActivityItem;
  working: boolean;
  onResume: (item: JarActivityItem) => void;
  onDonate: (project: Project) => void;
  onPurchase: (goal: SpendingGoal) => void;
  onDeactivate: (item: JarActivityItem) => void;
  onEditGoalAmount: (item: JarActivityItem) => void;
}) {
  const percent = progressPercent(item.balance, item.goalAmount);
  const accent = item.type === "fundraiser" ? "var(--green-primary)" : "#A78BFA";
  const gradEnd = item.type === "fundraiser" ? "#1E9485" : "#6D5FD4";
  const actionLabel = item.type === "fundraiser" ? "Donate my skips" : "Spend my skips";
  const visualFillPercent = Math.max(percent, item.balance > 0 ? 8 : 0);
  const fillHeight = (visualFillPercent / 100) * 120;
  const fillY = 170 - fillHeight;
  const jarUid = `${item.type}-${item.id}`.replace(/\W/g, "");
  const jarPath = "M20,40 Q20,40 25,35 L35,30 Q40,28 42,25 L42,15 Q42,10 48,10 L72,10 Q78,10 78,15 L78,25 Q80,28 85,30 L95,35 Q100,40 100,45 L100,155 Q100,170 85,170 L35,170 Q20,170 20,155 Z";

  return (
    <article
      className="jar-activity-card w-[172px] p-0"
      style={{
        background: "transparent",
      }}
    >
      <div className="jar-activity-card-heading text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="jar-activity-card-title truncate text-sm font-black leading-tight" style={{ color: accent }}>{item.title}</h2>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <p className="jar-activity-card-subtitle text-xs" style={{ color: "var(--text-muted)" }}>{goalLine(item)}</p>
          {item.active && (
            <button
              type="button"
              onClick={() => onEditGoalAmount(item)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] leading-none"
              style={{ background: item.type === "fundraiser" ? "rgba(46,204,113,0.13)" : "rgba(167,139,250,0.16)", border: `1px solid ${accent}`, color: accent }}
              title="Edit jar goal"
              aria-label="Edit jar goal"
            >
              ✎
            </button>
          )}
        </div>
      </div>

      <div className="jar-activity-card-visual mt-4 flex justify-center">
        <svg width="108" height="170" viewBox="0 0 120 190" role="img" aria-label={`${formatCurrency(item.balance)} saved`}>
          <defs>
            <linearGradient id={`jar-fill-${jarUid}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={gradEnd} />
              <stop offset="100%" stopColor={accent} />
            </linearGradient>
            <linearGradient id={`jar-glass-${jarUid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.04)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
            </linearGradient>
            <linearGradient id={`jar-shine-${jarUid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <clipPath id={`jar-clip-${jarUid}`}>
              <path d={jarPath} />
            </clipPath>
          </defs>
          <ellipse cx="60" cy="170" rx="38" ry="7" fill="rgba(0,0,0,0.22)" />
          <path d={jarPath} fill={`url(#jar-glass-${jarUid})`} />
          <g clipPath={`url(#jar-clip-${jarUid})`}>
            <rect x="15" y={fillY} width="90" height={fillHeight + 12} rx="4" fill={`url(#jar-fill-${jarUid})`} opacity="0.86" />
            {visualFillPercent > 5 && (
              <path d={`M15,${fillY} Q35,${fillY - 4} 60,${fillY} T105,${fillY}`} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" />
            )}
          </g>
          <path d="M45,16 L45,28 M75,16 L75,28" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round" />
          <path d={jarPath} fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M36,46 Q28,82 35,139" fill="none" stroke={`url(#jar-shine-${jarUid})`} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
          <text x="60" y="85" textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="900" fill="rgba(255,255,255,0.92)" style={{ fontFamily: "inherit" }}>
            {formatCurrency(item.balance)}
          </text>
          <text x="60" y="101" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="800" fill="rgba(255,255,255,0.68)" style={{ fontFamily: "inherit", letterSpacing: 0.8 }}>
            SAVED
          </text>
        </svg>
      </div>

      <div className="jar-activity-card-actions mt-3 grid gap-1.5">
        {item.type === "fundraiser" && item.project ? (
          <button
            type="button"
            onClick={() => onDonate(item.project!)}
            className="rounded-full px-3 py-1.5 text-center text-[11px] font-black"
            style={{ background: "rgba(46,204,113,0.18)", border: `1px solid ${accent}`, color: accent }}
          >
            {actionLabel}
          </button>
        ) : item.type === "goal" ? (
          <button
            type="button"
            onClick={() => onPurchase(item.goal)}
            className="rounded-full px-3 py-1.5 text-center text-[11px] font-black"
            style={{ background: "rgba(167,139,250,0.18)", border: `1px solid ${accent}`, color: "#DDD6FE" }}
          >
            {actionLabel}
          </button>
        ) : null}
        {item.active ? (
          <button
            type="button"
            onClick={() => onDeactivate(item)}
            disabled={working}
            className="rounded-full px-3 py-1.5 text-[11px] font-black disabled:opacity-50"
            style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.34)", color: "#FCA5A5" }}
          >
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onResume(item)}
            disabled={working}
            className="rounded-full px-3 py-1.5 text-[11px] font-black disabled:opacity-50"
            style={{ background: "transparent", border: `1px solid ${accent}`, color: accent }}
          >
            Make active
          </button>
        )}
      </div>
    </article>
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

function JarShelfLabel({ label, count, helper }: { label: string; count?: number; helper?: string }) {
  return (
    <div className="jar-shelf-heading flex items-center justify-between gap-3">
      <div>
        <h2 className="jar-shelf-title text-lg font-black" style={{ color: "var(--text-primary)" }}>
          {label}
        </h2>
        {helper && <p className="jar-shelf-helper mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{helper}</p>}
      </div>
      {typeof count === "number" && count > 0 && (
        <span className="jar-shelf-count rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: "rgba(46,204,113,0.1)", color: "var(--green-primary)" }}>
          {count}
        </span>
      )}
    </div>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{children}</p>
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
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(event) => event.stopPropagation()}>
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

function JarActivityPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [purchasingGoal, setPurchasingGoal] = useState<SpendingGoal | null>(null);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseWorking, setPurchaseWorking] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState<"logged" | "emptied" | null>(null);
  const [editingJarGoal, setEditingJarGoal] = useState<JarActivityItem | null>(null);
  const [jarGoalAmount, setJarGoalAmount] = useState("");
  const [jarGoalWorking, setJarGoalWorking] = useState(false);
  const [deactivatePrompt, setDeactivatePrompt] = useState<JarActivityItem | null>(null);
  const [resumePrompt, setResumePrompt] = useState<JarActivityItem | null>(null);
  const [resumeAmount, setResumeAmount] = useState("");

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

  const items = useMemo<JarActivityItem[]>(() => {
    if (!profile) return [];
    const fundraiserIds = new Set([
      ...Object.entries(profile.causeJarBalances ?? {}).filter(([, balance]) => Math.max(0, balance) > 0).map(([id]) => id),
      ...(profile.parkedSkipTargets ?? [])
        .filter((target) => target.type === "fundraiser" && Math.max(0, profile.causeJarBalances?.[target.id] ?? 0) > 0)
        .map((target) => target.id),
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
      .filter((goal) =>
        Math.max(0, profile.goalJarBalances?.[goal.id] ?? 0) > 0
        || activeTarget?.type === "goal" && activeTarget.id === goal.id
        || (profile.parkedSkipTargets ?? []).some((target) =>
          target.type === "goal"
          && target.id === goal.id
          && Math.max(0, profile.goalJarBalances?.[goal.id] ?? 0) > 0
        )
      )
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

  const inJars = cents(items.reduce((sum, item) => sum + item.balance, 0));
  const unassignedSkipBucks = Math.max(0, cents(totalSkipBucks - inJars));
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
  const backHref = searchParams.get("from") === "profile" ? "/profile" : "/jars";
  const backLabel = searchParams.get("from") === "profile" ? "Profile" : "Jars";

  function beginResume(item: JarActivityItem) {
    setResumePrompt(item);
    setResumeAmount("");
  }

  function closeResumePrompt() {
    if (workingId) return;
    setResumePrompt(null);
    setResumeAmount("");
  }

  async function confirmResume(item: JarActivityItem) {
    if (!user || workingId) return;
    const requestedAmount = resumeAmount.trim() ? cents(Number.parseFloat(resumeAmount)) : 0;
    if (!Number.isFinite(requestedAmount) || requestedAmount < 0 || requestedAmount > unassignedSkipBucks) {
      toast.error(`Enter an amount up to ${formatCurrency(unassignedSkipBucks)}.`);
      return;
    }
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
      if (requestedAmount > 0) {
        const destination: JarBalanceEndpoint = { type: item.type, id: item.id };
        const appliedAmount = await moveJarBalance(user.uid, { type: "skip-bucks" }, destination, requestedAmount);
        if (item.type === "fundraiser") {
          updateProfile({
            causeJarBalances: {
              ...(profileData.causeJarBalances ?? {}),
              [item.id]: cents((profileData.causeJarBalances?.[item.id] ?? 0) + appliedAmount),
            },
          });
        } else {
          updateProfile({
            goalJarBalances: {
              ...(profileData.goalJarBalances ?? {}),
              [item.id]: cents((profileData.goalJarBalances?.[item.id] ?? 0) + appliedAmount),
            },
          });
        }
      }
      closeResumePrompt();
      router.push("/home");
    } catch {
      toast.error("Could not make this jar active. Try again.");
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
    setDonatingProject(project);
  }

  function beginPurchase(goal: SpendingGoal) {
    const balance = Math.max(0, profileData.goalJarBalances?.[goal.id] ?? 0);
    setPurchasingGoal(goal);
    setPurchaseAmount(amountInputValue(balance));
    setPurchaseDone(null);
  }

  function beginEditJarGoal(item: JarActivityItem) {
    setEditingJarGoal(item);
    setJarGoalAmount(item.goalAmount > 0 ? amountInputValue(item.goalAmount) : "");
  }

  function closeJarGoalEditor() {
    setEditingJarGoal(null);
    setJarGoalAmount("");
    setJarGoalWorking(false);
  }

  async function saveJarGoalAmount() {
    if (!user || !editingJarGoal) return;
    const nextAmount = cents(Number.parseFloat(jarGoalAmount));
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      toast.error("Enter a goal amount.");
      return;
    }
    setJarGoalWorking(true);
    try {
      if (editingJarGoal.type === "fundraiser") {
        await setUserCauseGoal(user.uid, editingJarGoal.id, nextAmount);
        updateProfile({
          causeGoalAmounts: {
            ...(profileData.causeGoalAmounts ?? {}),
            [editingJarGoal.id]: nextAmount,
          },
        });
      } else {
        const nextGoals = spendingGoals.map((goal) =>
          goal.id === editingJarGoal.id ? { ...goal, targetAmount: nextAmount } : goal
        );
        await updateSpendingGoals(user.uid, nextGoals, activeSpendingGoalId);
        updateProfile({ spendingGoals: nextGoals });
      }
      toast.success("Jar goal updated.");
      closeJarGoalEditor();
    } catch {
      toast.error("Could not update that goal. Try again.");
      setJarGoalWorking(false);
    }
  }

  function closePurchaseModal() {
    setPurchasingGoal(null);
    setPurchaseAmount("");
    setPurchaseDone(null);
    setPurchaseWorking(false);
  }

  async function handlePurchaseLog(goal: SpendingGoal) {
    if (!user) return;
    const amount = parseFloat(purchaseAmount);
    const jarBalance = Math.max(0, profileData.goalJarBalances?.[goal.id] ?? 0);
    const totalAvailable = jarBalance + unassignedSkipBucks;
    if (!amount || amount <= 0 || amount > totalAvailable) return;
    setPurchaseWorking(true);
    try {
      const result = await recordPurchase(user.uid, goal.id, goal.label, goal.targetAmount, amount);
      updateProfile({
        totalSpent: (profileData.totalSpent ?? 0) + result.amountFromSkips,
        goalJarBalances: {
          ...(profileData.goalJarBalances ?? {}),
          [goal.id]: Math.max(0, jarBalance - result.jarDecrease),
        },
      });
      toast.success("Purchase logged.");
      if (jarBalance > 0 && amount >= jarBalance) {
        setPurchaseDone("emptied");
      } else {
        setPurchaseDone("logged");
        window.setTimeout(closePurchaseModal, 1400);
      }
    } catch {
      toast.error("Couldn't log your purchase. Try again.");
    } finally {
      setPurchaseWorking(false);
    }
  }

  function handleDeactivate(item: JarActivityItem) {
    if (item.balance <= 0) {
      setDeactivatePrompt(item);
      return;
    }
    void confirmDeactivate(item);
  }

  async function confirmDeactivate(item: JarActivityItem) {
    if (!user || workingId) return;
    setWorkingId(item.id);
    try {
      const target = { type: item.type, id: item.id } as const;
      if (item.balance > 0) {
        await parkSkipTarget(user.uid, target);
      } else {
        await deactivateSkipTarget(user.uid, target);
      }
      updateProfile({
        activeSkipTarget: null,
        parkedSkipTargets: item.balance > 0
          ? [
              ...(profileData.parkedSkipTargets ?? []).filter((parked) => parked.type !== target.type || parked.id !== target.id),
              target,
            ]
          : (profileData.parkedSkipTargets ?? []).filter((parked) => parked.type !== target.type || parked.id !== target.id),
        ...(item.type === "fundraiser"
          ? { activeProjectId: null }
          : { activeSpendingGoalId: null, spendingGoal: null }),
      });
      setDeactivatePrompt(null);
      toast.success("Future skips will go to Unassigned Skip Bucks.");
    } catch {
      toast.error("Could not pause this jar. Try again.");
    } finally {
      setWorkingId(null);
    }
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
                [event.goalId]: Math.max(0, profileData.goalJarBalances?.[event.goalId] ?? 0) + Math.max(0, event.amountSaved),
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
    <div className="jar-activity-page-shell p-4 md:p-8 max-w-4xl mx-auto pb-24 md:pb-8">
      <div className="jar-activity-page-header mb-4 flex justify-end">
        <Link
          href={backHref}
          className="jar-activity-back-link inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-black"
          style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)", textDecoration: "none" }}
        >
          <span className="sm:hidden" aria-hidden="true">←</span>
          <span className="sr-only sm:hidden">Back to {backLabel.toLowerCase()}</span>
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="col-span-2 rounded-xl p-3 sm:p-4 md:col-span-1" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>Total Skip Bucks</p>
          <p className="mt-1 text-2xl font-black sm:text-3xl" style={{ color: "var(--green-primary)" }}>{formatCurrency(totalSkipBucks)}</p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Saved and not used yet.
          </p>
        </div>
        <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>In Jars</p>
          <p className="mt-1 text-2xl font-black sm:text-3xl" style={{ color: "var(--text-primary)" }}>{formatCurrency(inJars)}</p>
          <p className="mt-2 hidden text-xs leading-relaxed sm:block" style={{ color: "var(--text-secondary)" }}>
            Earmarked for a reward or cause.
          </p>
        </div>
        <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>Unassigned Skip Bucks</p>
          <p className="mt-1 text-2xl font-black sm:text-3xl" style={{ color: "var(--green-primary)" }}>{formatCurrency(unassignedSkipBucks)}</p>
          <p className="mt-2 hidden text-xs leading-relaxed sm:block" style={{ color: "var(--text-secondary)" }}>
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
        <div className="space-y-4">
          <div>
            <JarShelfLabel label="Current jar" count={activeItems.length} helper="Future skips go here." />
            {activeItems.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                No current jar. Make a parked jar active when you want future skips to go there.
              </p>
            ) : (
              <div className="jar-shelf-grid mt-3 flex flex-wrap gap-x-8 gap-y-6">
                {activeItems.map((item) => (
                  <JarActivityCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    working={workingId === item.id}
                    onResume={beginResume}
                    onDonate={beginDonate}
                    onPurchase={beginPurchase}
                    onDeactivate={handleDeactivate}
                    onEditGoalAmount={beginEditJarGoal}
                  />
                ))}
              </div>
            )}
          </div>

          {inactiveItems.length > 0 && (
            <div>
              <JarShelfLabel label="Parked jars" count={inactiveItems.length} helper="Saved for later." />
              <div className="jar-shelf-grid mt-3 flex flex-wrap gap-x-8 gap-y-6">
                {inactiveItems.map((item) => (
                  <JarActivityCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    working={workingId === item.id}
                    onResume={beginResume}
                    onDonate={beginDonate}
                    onPurchase={beginPurchase}
                    onDeactivate={handleDeactivate}
                    onEditGoalAmount={beginEditJarGoal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
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

      {resumePrompt && (() => {
        const parsedAmount = Number.parseFloat(resumeAmount);
        const additionalAmount = resumeAmount.trim() && Number.isFinite(parsedAmount)
          ? Math.max(0, cents(parsedAmount))
          : 0;
        const projectedBalance = cents(resumePrompt.balance + additionalAmount);
        const projectedPercent = progressPercent(projectedBalance, resumePrompt.goalAmount);
        const currentJar = activeItems[0];
        const canUseAmount = additionalAmount <= unassignedSkipBucks;
        const actionLabel = additionalAmount > 0
          ? `Add ${formatCurrency(additionalAmount)} and make active`
          : "Make active";
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={closeResumePrompt}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="resume-jar-title"
              className="w-full max-w-sm rounded-2xl shadow-2xl"
              style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative px-5 py-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
                <h2 id="resume-jar-title" className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
                  Make {resumePrompt.title} your active jar?
                </h2>
                <button
                  type="button"
                  onClick={closeResumePrompt}
                  aria-label="Close activation confirmation"
                  className="absolute right-4 top-4 text-xl leading-none"
                  style={{ color: "var(--text-muted)" }}
                >
                  x
                </button>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Future skips will go here.{currentJar ? ` ${currentJar.title} will stay parked with its saved balance.` : ""}
                </p>

                <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  <label htmlFor="resume-skip-bucks" className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Use Unassigned Skip Bucks (optional)
                  </label>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {formatCurrency(unassignedSkipBucks)} available to add.
                  </p>
                  <div className="mt-3 flex items-center rounded-lg px-3 py-2" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
                    <span className="text-sm font-black" style={{ color: "var(--text-muted)" }}>$</span>
                    <input
                      id="resume-skip-bucks"
                      type="number"
                      min="0"
                      max={unassignedSkipBucks}
                      step="0.01"
                      inputMode="decimal"
                      value={resumeAmount}
                      onChange={(event) => setResumeAmount(event.target.value)}
                      placeholder="0.00"
                      className="min-w-0 flex-1 bg-transparent pl-2 text-base font-black outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>
                  {!canUseAmount && (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "#F59E0B" }}>
                      You have {formatCurrency(unassignedSkipBucks)} available.
                    </p>
                  )}
                </div>

                <p className="text-sm font-semibold" style={{ color: resumePrompt.type === "fundraiser" ? "var(--green-primary)" : "#C4B5FD" }}>
                  Your jar will have {formatCurrency(projectedBalance)}{resumePrompt.goalAmount > 0 ? `, ${projectedPercent}% of its ${formatCurrency(resumePrompt.goalAmount)} goal.` : "."}
                </p>

                <button
                  type="button"
                  onClick={() => void confirmResume(resumePrompt)}
                  disabled={workingId === resumePrompt.id || !canUseAmount}
                  className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                  style={{ background: resumePrompt.type === "fundraiser" ? "#2ECC71" : "#8B5CF6", color: resumePrompt.type === "fundraiser" ? "#071B14" : "#FFFFFF" }}
                >
                  {workingId === resumePrompt.id ? "Making active..." : actionLabel}
                </button>
                <button
                  type="button"
                  onClick={closeResumePrompt}
                  disabled={workingId === resumePrompt.id}
                  className="w-full py-1 text-sm font-black disabled:opacity-50"
                  style={{ color: "var(--text-muted)" }}
                >
                  Keep current jar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {deactivatePrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setDeactivatePrompt(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-empty-jar-title"
            className="w-full max-w-sm rounded-2xl shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative px-5 py-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <h2 id="deactivate-empty-jar-title" className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
                Deactivate this jar?
              </h2>
              <button
                type="button"
                onClick={() => setDeactivatePrompt(null)}
                aria-label="Close deactivate confirmation"
                className="absolute right-4 top-4 text-xl leading-none"
                style={{ color: "var(--text-muted)" }}
              >
                x
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                This jar has no saved Skip Bucks. Future skips will no longer go toward it.
              </p>
              <button
                type="button"
                onClick={() => void confirmDeactivate(deactivatePrompt)}
                disabled={workingId === deactivatePrompt.id}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                {workingId === deactivatePrompt.id ? "Deactivating..." : "Deactivate jar"}
              </button>
              <button
                type="button"
                onClick={() => setDeactivatePrompt(null)}
                disabled={workingId === deactivatePrompt.id}
                className="w-full py-1 text-sm font-black disabled:opacity-50"
                style={{ color: "var(--text-muted)" }}
              >
                Keep active
              </button>
            </div>
          </div>
        </div>
      )}

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

      {donatingProject && (
        <DonationLogModal
          projectId={donatingProject.id}
          projectTitle={donatingProject.groupName ?? donatingProject.title}
          initialAmount={Math.max(0, profileData.causeJarBalances?.[donatingProject.id] ?? 0)}
          donationURL={donatingProject.donationURL ?? undefined}
          donationRecipient={donatingProject.sponsor || donatingProject.groupName || donatingProject.title}
          unassignedSkipBucks={unassignedSkipBucks}
          onClose={() => setDonatingProject(null)}
        />
      )}

      {editingJarGoal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={closeJarGoalEditor}>
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jar-goal-edit-title"
          >
            <div className="relative px-5 py-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button
                type="button"
                onClick={closeJarGoalEditor}
                aria-label="Close"
                className="absolute right-4 top-4 text-xl leading-none"
                style={{ color: "var(--text-muted)" }}
              >
                ×
              </button>
              <p id="jar-goal-edit-title" className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Edit jar goal
              </p>
              <p className="mt-1 text-xs font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {editingJarGoal.title}
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Current progress</p>
                <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {formatCurrency(editingJarGoal.balance)} saved toward {editingJarGoal.goalAmount > 0 ? formatCurrency(editingJarGoal.goalAmount) : "an open goal"}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }} htmlFor="jar-goal-amount">
                  Goal amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    id="jar-goal-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    value={jarGoalAmount}
                    onChange={(event) => setJarGoalAmount(event.target.value)}
                    className="w-full rounded-xl py-3 pl-8 pr-4 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveJarGoalAmount()}
                  disabled={jarGoalWorking || !jarGoalAmount || Number.parseFloat(jarGoalAmount) <= 0}
                  className="flex-1 rounded-xl py-3 text-sm font-black disabled:opacity-50"
                  style={{ background: editingJarGoal.type === "fundraiser" ? "var(--green-primary)" : "#8B5CF6", color: editingJarGoal.type === "fundraiser" ? "#071B14" : "white" }}
                >
                  {jarGoalWorking ? "Saving..." : "Save goal"}
                </button>
                <button
                  type="button"
                  onClick={closeJarGoalEditor}
                  className="rounded-xl px-4 py-3 text-sm font-black"
                  style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {purchasingGoal && (() => {
        const jarBalance = Math.max(0, profileData.goalJarBalances?.[purchasingGoal.id] ?? 0);
        const parsedAmount = parseFloat(purchaseAmount);
        const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
        const totalAvailable = jarBalance + unassignedSkipBucks;
        const amountOverAvailable = cleanAmount > totalAvailable;
        const extraFromSkipBucks = Math.max(0, cleanAmount - jarBalance);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closePurchaseModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="jar-activity-purchase-title"
              className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl"
              style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
                <h2 id="jar-activity-purchase-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  {purchaseDone === "emptied" ? "Jar emptied" : "Spend my skips"}
                </h2>
                <button type="button" onClick={closePurchaseModal} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
              </div>
              <div className="px-6 py-5">
                {purchaseDone === "logged" ? (
                  <div className="text-center py-4">
                    <p className="text-2xl mb-2">✓</p>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Purchase logged!</p>
                  </div>
                ) : purchaseDone === "emptied" ? (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4 text-center" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
                      <p className="text-2xl mb-2">✓</p>
                      <p className="font-black" style={{ color: "var(--text-primary)" }}>Purchase logged.</p>
                      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        You used everything saved in {purchasingGoal.label}.
                      </p>
                    </div>
                    <p className="text-sm font-bold leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Keep this as your active jar for future skips?
                    </p>
                    <div className="space-y-2">
                      <button type="button" onClick={closePurchaseModal} className="w-full rounded-xl py-3 text-sm font-black" style={{ background: "#8B5CF6", color: "white" }}>
                        Keep this active
                      </button>
                      <button type="button" onClick={closePurchaseModal} className="w-full rounded-xl py-3 text-sm font-black" style={{ background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-secondary)" }}>
                        Pick a new jar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)" }}>
                      <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Step 1</p>
                      <p className="mt-1 text-sm font-black" style={{ color: "var(--text-primary)" }}>Buy {purchasingGoal.label}</p>
                      {purchasingGoal.shoppingLink ? (
                        <a href={purchasingGoal.shoppingLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl py-3 text-sm font-black" style={{ background: "#8B5CF6", color: "white", textDecoration: "none" }}>
                          Open purchase page
                        </a>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          Buy where intended, then log it here.
                        </p>
                      )}
                      <p className="mt-3 text-[10px] font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        iSkipped does not process, verify, or manage outside purchases.
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Step 2</p>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>After buying, log the amount here.</p>
                    </div>
                    <div className="mb-5">
                      <label className="mb-1 block text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Amount</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium" style={{ color: "var(--text-secondary)" }}>$</span>
                        <input
                          type="number"
                          min="1"
                          max={totalAvailable || undefined}
                          value={purchaseAmount}
                          onChange={(event) => setPurchaseAmount(event.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl py-3 pl-8 pr-4 text-lg font-semibold focus:outline-none"
                          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                          autoFocus
                        />
                      </div>
                      <p className="mt-2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>{formatCurrency(jarBalance)} saved in this jar.</p>
                      {amountOverAvailable && (
                        <p className="mt-2 text-xs font-bold leading-relaxed" style={{ color: "#EF4444" }}>
                          That is more than your saved skips. Lower the amount to {formatCurrency(totalAvailable)} or less.
                        </p>
                      )}
                      {!amountOverAvailable && extraFromSkipBucks > 0 && cleanAmount > 0 && (
                        <p className="mt-2 text-xs font-bold leading-relaxed" style={{ color: "#F59E0B" }}>
                          You are spending more than this jar holds. {formatCurrency(extraFromSkipBucks)} will come from your saved Skip Bucks.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePurchaseLog(purchasingGoal)}
                      disabled={purchaseWorking || !purchaseAmount || cleanAmount < 1 || amountOverAvailable}
                      className="w-full rounded-xl py-3.5 font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: "#8B5CF6", color: "white" }}
                    >
                      {purchaseWorking ? "Logging..." : "I spent this amount"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function JarActivityPage() {
  return (
    <Suspense>
      <JarActivityPageInner />
    </Suspense>
  );
}
