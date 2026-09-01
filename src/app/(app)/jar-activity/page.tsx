"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  deleteJar,
  deleteDonation,
  deleteSpendingHistory,
  subscribeToDonations,
  subscribeToSpendingHistory,
  updateSpendingHistory,
  updateSpendingGoals,
} from "@/lib/services/firebase/users";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { DonationEvent, Project, SpendingGoal, SpendingHistoryEvent } from "@/lib/types/models";
import { DonationLogModal } from "@/components/skip/DonationLogModal";
import { getPersonalFundraiserGoalProgress, isValidRaisedFundraiserGoal } from "@/lib/utils/fundraiserGoals";

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
      donatedTowardGoal: number;
      remainingGoal: number | null;
      completed: boolean;
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
  title: "Skip Bucks";
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

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCompactCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
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
    ? `Skip Bucks (${formatCurrency(source.balance)})`
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
  onDelete,
}: {
  item: JarActivityItem;
  working: boolean;
  onResume: (item: JarActivityItem) => void;
  onDonate: (project: Project) => void;
  onPurchase: (goal: SpendingGoal) => void;
  onDeactivate: (item: JarActivityItem) => void;
  onEditGoalAmount: (item: JarActivityItem) => void;
  onDelete: (item: JarActivityItem) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const percent = progressPercent(item.balance, item.goalAmount);
  const accent = item.type === "fundraiser" ? "var(--green-primary)" : "#A78BFA";
  const gradEnd = item.type === "fundraiser" ? "#1E9485" : "#6D5FD4";
  const visualFillPercent = Math.max(percent, item.balance > 0 ? 8 : 0);
  const fillHeight = (visualFillPercent / 100) * 120;
  const fillY = 170 - fillHeight;
  const jarUid = `${item.type}-${item.id}`.replace(/\W/g, "");
  const jarPath = "M20,40 Q20,40 25,35 L35,30 Q40,28 42,25 L42,15 Q42,10 48,10 L72,10 Q78,10 78,15 L78,25 Q80,28 85,30 L95,35 Q100,40 100,45 L100,155 Q100,170 85,170 L35,170 Q20,170 20,155 Z";

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <article
      className={`jar-activity-card w-[172px] p-0 ${menuOpen ? "z-40" : ""}`}
      style={{
        background: "transparent",
        position: "relative",
      }}
    >
      <div className="jar-activity-card-heading text-center">
        <h2 className="jar-activity-card-title truncate text-sm font-black leading-tight" style={{ color: item.active ? accent : "var(--text-muted)" }}>{item.title}</h2>
        <p className="jar-activity-card-status mt-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: item.active ? accent : "var(--text-muted)" }}>
          {item.active ? "Active" : "Paused"}
        </p>
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

      <div ref={menuRef} className="jar-activity-card-manage relative mt-3 text-center">
        {item.type === "fundraiser" && item.remainingGoal !== null && (
          <div className="mb-2 min-h-8 text-[10px] font-bold leading-tight" style={{ color: "var(--text-secondary)" }}>
            <p>{formatCompactCurrency(item.donatedTowardGoal)} donated</p>
            <p className="mt-0.5">{formatCompactCurrency(item.remainingGoal)} left to goal</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-full px-2.5 py-1 text-[11px] font-black leading-none"
          style={{
            background: item.active ? "rgba(46,204,113,0.1)" : "rgba(237,245,240,0.04)",
            border: item.active ? "1px solid rgba(46,204,113,0.5)" : "1px solid rgba(237,245,240,0.12)",
            color: item.active ? "var(--green-primary)" : "var(--text-muted)",
          }}
          aria-label={`Manage ${item.title}`}
          aria-expanded={menuOpen}
        >
          Manage
        </button>
        {menuOpen && (
          <div
            className="jar-activity-card-menu absolute left-0 top-full z-30 mt-2 min-w-[168px] rounded-xl p-1.5 shadow-xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>Manage jar</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close jar menu"
                className="flex h-6 w-6 items-center justify-center rounded-full text-base font-black leading-none"
                style={{ color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>
            {item.type === "fundraiser" && item.project ? (
              <button type="button" onClick={() => { setMenuOpen(false); onDonate(item.project!); }} className="jar-action-menu-item">Donate my skips</button>
            ) : item.type === "goal" ? (
              <button type="button" onClick={() => { setMenuOpen(false); onPurchase(item.goal); }} className="jar-action-menu-item">Spend my skips</button>
            ) : null}
            {item.active ? (
              <button type="button" onClick={() => { setMenuOpen(false); onDeactivate(item); }} disabled={working} className="jar-action-menu-item">Deactivate</button>
            ) : (
              <button type="button" onClick={() => { setMenuOpen(false); onResume(item); }} disabled={working} className="jar-action-menu-item">Make active</button>
            )}
            <button type="button" onClick={() => { setMenuOpen(false); onEditGoalAmount(item); }} className="jar-action-menu-item">Edit goal</button>
            <button type="button" onClick={() => { setMenuOpen(false); onDelete(item); }} disabled={working} className="jar-action-menu-item">Delete jar</button>
          </div>
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
            Move saved money between jars, or back to Skip Bucks.
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
  canEdit,
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
  canEdit: boolean;
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
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-full px-3 py-1 text-xs font-black"
                style={{ background: "rgba(46,204,113,0.1)", border: "1px solid rgba(46,204,113,0.22)", color: "var(--green-primary)" }}
              >
                Edit
              </button>
            )}
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
  const destinationLabel = releasing ? "Skip Bucks" : selected?.title ?? "another jar";
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
              ? `Move saved money from Skip Bucks into ${destinationLabel}.`
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
                {!sourceIsSkipBucks && <option value={SKIP_BUCKS_DESTINATION}>Skip Bucks</option>}
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
                  ? `You skipped ${formatCurrency(parsedAmount || 0)} for ${source.title}. Are you sure you want to move it back to Skip Bucks?`
                  : sourceIsSkipBucks
                    ? `Are you sure you want to move ${formatCurrency(parsedAmount || 0)} from Skip Bucks into ${selected?.title}?`
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
  const [raisingCompletedGoal, setRaisingCompletedGoal] = useState(false);
  const [jarGoalAmount, setJarGoalAmount] = useState("");
  const [jarGoalWorking, setJarGoalWorking] = useState(false);
  const [deactivatePrompt, setDeactivatePrompt] = useState<JarActivityItem | null>(null);
  const [resumePrompt, setResumePrompt] = useState<JarActivityItem | null>(null);
  const [resumeStep, setResumeStep] = useState<"current" | "funding">("funding");
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
      ...Object.entries(profile.causeStats ?? {}).filter(([, stats]) => Math.max(0, stats.donated ?? 0) > 0).map(([id]) => id),
      ...donations.map((donation) => donation.causeId).filter(Boolean),
      ...(activeTarget?.type === "fundraiser" ? [activeTarget.id] : []),
    ]);
    const fundraiserItems: JarActivityItem[] = Array.from(fundraiserIds).map((id) => {
      const project = projects.find((candidate) => candidate.id === id) ?? null;
      const title = project?.groupName ?? project?.title ?? "Fundraiser jar";
      const balance = Math.max(0, profile.causeJarBalances?.[id] ?? 0);
      const goalAmount = Math.max(0, profile.causeGoalAmounts?.[id] ?? 0);
      const visibleDonationTotal = donations
        .filter((donation) => donation.causeId === id)
        .reduce((sum, donation) => sum + Math.max(0, donation.amount), 0);
      const donated = Math.max(visibleDonationTotal, Math.max(0, profile.causeStats?.[id]?.donated ?? 0));
      const { donatedTowardGoal, remainingGoal } = getPersonalFundraiserGoalProgress(goalAmount, donated);
      const active = activeTarget?.type === "fundraiser" && activeTarget.id === id;
      return {
        type: "fundraiser",
        id,
        title,
        subtitle: project?.sponsor ? `by ${project.sponsor}` : "Saved for this cause",
        balance,
        goalAmount,
        active,
        project,
        donatedTowardGoal,
        remainingGoal,
        completed: !active && donated > 0 && remainingGoal === 0 && balance <= 0,
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
  }, [profile, projects, activeTarget?.type, activeTarget?.id, spendingGoals, donations]);

  const inJars = cents(items.reduce((sum, item) => sum + item.balance, 0));
  const unassignedSkipBucks = Math.max(0, cents(totalSkipBucks - inJars));
  const completedItems = items.filter((item): item is Extract<JarActivityItem, { type: "fundraiser" }> => item.type === "fundraiser" && item.completed);
  const jarItems = items.filter((item) => item.type !== "fundraiser" || !item.completed);
  const activeItems = jarItems.filter((item) => item.active);
  const inactiveItems = jarItems.filter((item) => !item.active);
  const spentSkipEvents = useMemo<SpentSkipEvent[]>(() => {
    const donationEvents: SpentSkipEvent[] = donations.map((event) => ({
      kind: "donation",
      id: event.id,
      title: `Donation to ${event.causeTitle}`,
      meta: [
        formatEventDate(event.donatedAt, event.date),
        `${formatCurrency(Math.max(0, event.jarDecrease ?? event.amountFromSkips ?? event.amount))} jar`,
        (event.skipBucksDecrease ?? 0) > 0 ? `${formatCurrency(event.skipBucksDecrease ?? 0)} Skip Bucks` : "",
        (event.outsideContribution ?? 0) > 0 ? `${formatCurrency(event.outsideContribution ?? 0)} outside` : "",
      ].filter(Boolean).join(" · "),
      amount: event.amount,
      timestamp: eventTime(event.donatedAt, event.date),
      event,
    }));
    const purchaseEvents: SpentSkipEvent[] = spendingHistory.map((event) => ({
      kind: "purchase",
      id: event.id,
      title: `Purchase for ${event.label}`,
      meta: [
        formatEventDate(event.purchasedAt),
        `${formatCurrency(Math.max(0, event.jarDecrease ?? event.amountSaved))} jar`,
        (event.skipBucksDecrease ?? 0) > 0 ? `${formatCurrency(event.skipBucksDecrease ?? 0)} Skip Bucks` : "",
        (event.outsideContribution ?? 0) > 0 ? `${formatCurrency(event.outsideContribution ?? 0)} outside` : "",
      ].filter(Boolean).join(" · "),
      amount: event.totalAmount ?? event.amountSaved,
      timestamp: eventTime(event.purchasedAt),
      event,
    }));
    return [...donationEvents, ...purchaseEvents].sort((a, b) => b.timestamp - a.timestamp);
  }, [donations, spendingHistory]);
  const transferSources = items.filter((item) => item.balance > 0);
  const skipBucksSource: SkipBucksSource | null = unassignedSkipBucks > 0
    ? { type: "skip-bucks", id: SKIP_BUCKS_DESTINATION, title: "Skip Bucks", balance: unassignedSkipBucks }
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
    setResumeStep(activeItems.length > 0 ? "current" : "funding");
    setResumeAmount("");
  }

  function closeResumePrompt() {
    if (workingId) return;
    setResumePrompt(null);
    setResumeStep("funding");
    setResumeAmount("");
  }

  function continueResumeActivation() {
    setResumeStep("funding");
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

  async function handleDeleteJar(item: JarActivityItem) {
    if (!user || workingId) return;
    const confirmed = window.confirm(
      `${item.balance > 0 ? `${formatCurrency(item.balance)} will be moved to Skip Bucks, then ` : ""}delete ${item.title}?`,
    );
    if (!confirmed) return;
    setWorkingId(item.id);
    try {
      await deleteJar(user.uid, { type: item.type === "fundraiser" ? "fundraiser" : "goal", id: item.id });
      if (item.type === "fundraiser") {
        const nextCauseBalances = { ...(profileData.causeJarBalances ?? {}) };
        delete nextCauseBalances[item.id];
        updateProfile({
          causeJarBalances: nextCauseBalances,
          joinedProjectIds: (profileData.joinedProjectIds ?? []).filter((id) => id !== item.id),
          parkedSkipTargets: (profileData.parkedSkipTargets ?? []).filter((target) => target.type !== "fundraiser" || target.id !== item.id),
          ...(profileData.activeProjectId === item.id ? { activeProjectId: null } : {}),
          ...(profileData.activeSkipTarget?.type === "fundraiser" && profileData.activeSkipTarget.id === item.id ? { activeSkipTarget: null } : {}),
        });
      } else {
        const nextGoalBalances = { ...(profileData.goalJarBalances ?? {}) };
        delete nextGoalBalances[item.id];
        updateProfile({
          goalJarBalances: nextGoalBalances,
          spendingGoals: spendingGoals.filter((goal) => goal.id !== item.id),
          ...(profileData.activeSpendingGoalId === item.id ? { activeSpendingGoalId: null, activeSkipTarget: null, spendingGoal: null } : {}),
          parkedSkipTargets: (profileData.parkedSkipTargets ?? []).filter((target) => target.type !== "goal" || target.id !== item.id),
        });
      }
      toast.success(`${item.title} deleted. Saved money was moved to Skip Bucks.`);
    } catch {
      toast.error("Could not delete this jar. Try again.");
    } finally {
      setWorkingId(null);
    }
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

  function beginEditJarGoal(item: JarActivityItem, restart = false) {
    setEditingJarGoal(item);
    setRaisingCompletedGoal(restart);
    setJarGoalAmount(restart ? "" : item.goalAmount > 0 ? amountInputValue(item.goalAmount) : "");
  }

  function closeJarGoalEditor() {
    setEditingJarGoal(null);
    setRaisingCompletedGoal(false);
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
    if (
      raisingCompletedGoal
      && editingJarGoal.type === "fundraiser"
      && !isValidRaisedFundraiserGoal(nextAmount, editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal)
    ) {
      toast.error(`Enter a total greater than ${formatCurrency(Math.max(editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal))}.`);
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
      toast.success(raisingCompletedGoal ? "Goal raised. Reactivate this fundraiser when you’re ready." : "Jar goal updated.");
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
    if (!amount || amount <= 0) return;
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
      toast.success("Future skips will go to Skip Bucks.");
    } catch {
      toast.error("Could not pause this jar. Try again.");
    } finally {
      setWorkingId(null);
    }
  }

  function beginSelectedMoveBalance() {
    if (!moveSources[0]) {
      toast.info("No balances to move yet. Once you have Skip Bucks or money in a jar, you can move it here.");
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
      toast.success(`${formatCurrency(appliedAmount)} moved to ${destination?.title ?? "Skip Bucks"}.`);
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
      const result = await updateSpendingHistory(user.uid, event.id, nextAmount, event.amountSaved);
      updateProfile({
        totalSpent: Math.max(0, (profileData.totalSpent ?? 0) + delta),
        ...(event.goalId
          ? {
              goalJarBalances: {
                ...(profileData.goalJarBalances ?? {}),
                [event.goalId]: result.goalBalance ?? Math.max(0, currentBal - jarDecreaseDelta),
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
    const coveredBySkips = Math.max(0, event.amountFromSkips ?? event.amount);
    const outsideContribution = Math.max(0, event.outsideContribution ?? 0);
    const confirmed = window.confirm(`Delete this ${formatCurrency(event.amount)} donation record? ${formatCurrency(coveredBySkips)} funded by saved skips will be restored.${outsideContribution > 0 ? ` The ${formatCurrency(outsideContribution)} outside contribution will only be removed from the record.` : ""}`);
    if (!confirmed) return;
    setHistoryWorkingId(`donation-${event.id}`);
    try {
      const funding = await deleteDonation(user.uid, event.id, event.amount, event.causeId);
      const currentBal = Math.max(0, profileData.causeJarBalances?.[event.causeId] ?? 0);
      updateProfile({
        totalDonated: Math.max(0, (profileData.totalDonated ?? 0) - event.amount),
        totalDonatedFromSkips: Math.max(0, (profileData.totalDonatedFromSkips ?? profileData.totalDonated ?? 0) - funding.amountFromSkips),
        causeStats: {
          ...(profileData.causeStats ?? {}),
          [event.causeId]: {
            donated: Math.max(0, (profileData.causeStats?.[event.causeId]?.donated ?? 0) - event.amount),
          },
        },
        causeJarBalances: {
          ...(profileData.causeJarBalances ?? {}),
          [event.causeId]: funding.causeJarBalance ?? currentBal + funding.jarDecrease,
        },
      });
      const restoredParts = [
        funding.jarDecrease > 0 ? `${formatCurrency(funding.jarDecrease)} to the ${event.causeTitle} jar` : "",
        funding.skipBucksDecrease > 0 ? `${formatCurrency(funding.skipBucksDecrease)} to Skip Bucks` : "",
      ].filter(Boolean);
      toast.success(restoredParts.length > 0
        ? `Donation deleted. Restored ${restoredParts.join(" and ")}.`
        : "Donation record deleted. It was logged as an outside contribution, so no Skip Bucks were restored.");
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
                [event.goalId]: Math.max(0, profileData.goalJarBalances?.[event.goalId] ?? 0) + Math.max(0, event.jarDecrease ?? event.amountSaved),
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
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>Total unspent savings</p>
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
          <p className="text-xs uppercase tracking-[0.12em] font-black" style={{ color: "var(--text-muted)" }}>Skip Bucks</p>
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
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Your jars</h2>
          </div>
          {jarItems.length > 0 && (
            <span className="jar-shelf-count rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: "rgba(46,204,113,0.1)", color: "var(--green-primary)" }}>
              {jarItems.length}
            </span>
          )}
        </div>
        {jarItems.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No jars yet. Choose a reward or fundraiser when you are ready.
          </p>
        ) : (
          <div className="jar-shelf-grid flex flex-wrap gap-x-8 gap-y-6">
            {jarItems.map((item) => (
              <JarActivityCard
                key={`${item.type}-${item.id}`}
                item={item}
                working={workingId === item.id}
                onResume={beginResume}
                onDonate={beginDonate}
                onPurchase={beginPurchase}
                onDeactivate={handleDeactivate}
                onEditGoalAmount={beginEditJarGoal}
                onDelete={handleDeleteJar}
              />
            ))}
          </div>
        )}
      </section>

      {completedItems.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Your Completed Goals</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Personal donation goals you reached.</p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: "rgba(46,204,113,0.1)", color: "var(--green-primary)" }}>
              {completedItems.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {completedItems.map((item) => (
              <article key={`completed-${item.id}`} className="rounded-2xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(46,204,113,0.28)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#A7F3D0" }}>✓ Your goal reached</p>
                <h3 className="mt-2 text-base font-black" style={{ color: "var(--text-primary)" }}>{item.title}</h3>
                <p className="mt-1 text-sm font-black" style={{ color: "var(--green-primary)" }}>{formatCurrency(item.donatedTowardGoal)} donated</p>
                <div className="mt-4 flex gap-2">
                  <a href="#activity-history" className="flex-1 rounded-lg py-2 text-center text-xs font-black" style={{ border: "1px solid rgba(46,204,113,0.3)", color: "#A7F3D0", textDecoration: "none" }}>
                    View activity
                  </a>
                  <button type="button" onClick={() => beginEditJarGoal(item, true)} className="flex-1 rounded-lg py-2 text-xs font-black" style={{ background: "rgba(46,204,113,0.16)", color: "#A7F3D0" }}>
                    Raise your goal
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section id="activity-history" className="mt-8 scroll-mt-6 pt-6" style={{ borderTop: "1px solid rgba(237,245,240,0.12)" }}>
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
                canEdit={spentEvent.kind === "purchase"}
                onEdit={() => beginEditHistory(spentEvent.kind, spentEvent.id, spentEvent.amount)}
                onEditValue={setEditingAmount}
                onCancel={() => setEditingHistoryId(null)}
                onDelete={() => spentEvent.kind === "donation" ? void deleteDonationHistory(spentEvent.event) : void deletePurchaseHistory(spentEvent.event)}
                onSave={() => spentEvent.kind === "purchase" ? savePurchaseEdit(spentEvent.event) : undefined}
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
                  {resumeStep === "current" ? "Change Your Active Jar?" : `Add Skip Bucks to ${resumePrompt.title}?`}
                </h2>
                {resumeStep === "current" && currentJar && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    You currently have {formatCurrency(currentJar.balance)} saved for {currentJar.title}.
                  </p>
                )}
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
                {resumeStep === "funding" && (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    You already have {formatCurrency(resumePrompt.balance)} in this jar. Add any Skip Bucks to it?
                  </p>
                )}

                {resumeStep === "funding" && <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  <label htmlFor="resume-skip-bucks" className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Use Skip Bucks (optional)
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
                </div>}

                {resumeStep === "funding" && <p className="text-sm font-semibold" style={{ color: resumePrompt.type === "fundraiser" ? "var(--green-primary)" : "#C4B5FD" }}>
                  Your jar will have {formatCurrency(projectedBalance)}{resumePrompt.goalAmount > 0 ? `, ${projectedPercent}% of its ${formatCurrency(resumePrompt.goalAmount)} goal.` : "."}
                </p>}

                <button
                  type="button"
                  onClick={() => resumeStep === "current" ? continueResumeActivation() : void confirmResume(resumePrompt)}
                  disabled={workingId === resumePrompt.id || (resumeStep === "funding" && !canUseAmount)}
                  className={`w-full rounded-xl px-4 py-3 disabled:opacity-50 ${resumeStep === "funding" ? "text-center" : "text-left"}`}
                  style={resumeStep === "current"
                    ? { background: "#2ECC71", color: "#071B14" }
                    : { background: resumePrompt.type === "fundraiser" ? "#2ECC71" : "#8B5CF6", color: resumePrompt.type === "fundraiser" ? "#071B14" : "#FFFFFF" }}
                >
                  <span className="block text-sm font-black">
                    {workingId === resumePrompt.id ? "Making active..." : resumeStep === "current" ? `Start skipping for ${resumePrompt.title}` : actionLabel}
                  </span>
                  {resumeStep === "current" && currentJar && (
                    <span className="mt-0.5 block text-xs font-bold opacity-80">
                      Your {formatCurrency(currentJar.balance)} will remain in {currentJar.title}.
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeResumePrompt}
                  disabled={workingId === resumePrompt.id}
                  className={`w-full ${resumeStep === "current" ? "rounded-xl px-4 py-3 text-left" : "py-1"} text-sm font-black disabled:opacity-50`}
                  style={resumeStep === "current"
                    ? { background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-primary)" }
                    : { color: "var(--text-muted)" }}
                >
                  {resumeStep === "current" ? `Keep skipping for ${currentJar?.title ?? "your current jar"}` : "Cancel"}
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
                {raisingCompletedGoal ? "Raise your donation goal" : "Edit jar goal"}
              </p>
              <p className="mt-1 text-xs font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {editingJarGoal.title}
              </p>
            </div>
            <div className="space-y-4 p-5">
              {!raisingCompletedGoal && <div>
                <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Current progress</p>
                <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {formatCurrency(editingJarGoal.balance)} saved toward {editingJarGoal.goalAmount > 0 ? formatCurrency(editingJarGoal.goalAmount) : "an open goal"}
                </p>
              </div>}
              {raisingCompletedGoal && editingJarGoal.type === "fundraiser" && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  You donated {formatCurrency(editingJarGoal.donatedTowardGoal)} toward this goal. Set a new total above that amount to keep your progress.
                </p>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }} htmlFor="jar-goal-amount">
                  {raisingCompletedGoal ? "New total donation goal" : "Goal amount"}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    id="jar-goal-amount"
                    type="number"
                    min={raisingCompletedGoal && editingJarGoal.type === "fundraiser"
                      ? Math.floor(Math.max(editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal) * 100 + 1) / 100
                      : 1}
                    step="0.01"
                    value={jarGoalAmount}
                    onChange={(event) => setJarGoalAmount(event.target.value)}
                    className="w-full rounded-xl py-3 pl-8 pr-4 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    autoFocus
                  />
                </div>
                {raisingCompletedGoal && editingJarGoal.type === "fundraiser" && jarGoalAmount && (
                  <p className="mt-2 text-xs font-bold" style={{ color: isValidRaisedFundraiserGoal(Number.parseFloat(jarGoalAmount), editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal) ? "#A7F3D0" : "#FCA5A5" }}>
                    {isValidRaisedFundraiserGoal(Number.parseFloat(jarGoalAmount), editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal)
                      ? `${formatCurrency(Number.parseFloat(jarGoalAmount) - editingJarGoal.donatedTowardGoal)} to go`
                      : `Enter a total greater than ${formatCurrency(Math.max(editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal))}.`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveJarGoalAmount()}
                  disabled={jarGoalWorking || !jarGoalAmount || Number.parseFloat(jarGoalAmount) <= 0 || (
                    raisingCompletedGoal
                    && editingJarGoal.type === "fundraiser"
                    && !isValidRaisedFundraiserGoal(Number.parseFloat(jarGoalAmount), editingJarGoal.goalAmount, editingJarGoal.donatedTowardGoal)
                  )}
                  className="flex-1 rounded-xl py-3 text-sm font-black disabled:opacity-50"
                  style={{ background: editingJarGoal.type === "fundraiser" ? "var(--green-primary)" : "#8B5CF6", color: editingJarGoal.type === "fundraiser" ? "#071B14" : "white" }}
                >
                  {jarGoalWorking ? "Saving..." : raisingCompletedGoal ? "Raise goal" : "Save goal"}
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
        const jarUsed = Math.min(cleanAmount, jarBalance);
        const skipBucksUsed = Math.min(Math.max(0, cleanAmount - jarUsed), unassignedSkipBucks);
        const outsideContribution = Math.max(0, cleanAmount - jarUsed - skipBucksUsed);
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
                <div>
                  <h2 id="jar-activity-purchase-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    {purchaseDone === "emptied" ? "Jar emptied" : "Spend my skips"}
                  </h2>
                  {purchaseDone === null && <p className="mt-1 text-xs font-black" style={{ color: "#C4B5FD" }}>In this jar: {formatCurrency(jarBalance)}</p>}
                </div>
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
                          value={purchaseAmount}
                          onChange={(event) => setPurchaseAmount(event.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl py-3 pl-8 pr-4 text-lg font-semibold focus:outline-none"
                          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                          autoFocus
                        />
                      </div>
                      {cleanAmount > 0 && (
                        <div className="mt-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)", color: "var(--text-secondary)" }}>
                          <p><strong style={{ color: "var(--text-primary)" }}>{formatCurrency(jarUsed)}</strong> will come from this jar.</p>
                          {skipBucksUsed > 0 && <p><strong style={{ color: "var(--text-primary)" }}>{formatCurrency(skipBucksUsed)}</strong> will come from Skip Bucks.</p>}
                          {outsideContribution > 0 && <p className="mt-1 font-bold" style={{ color: "#F59E0B" }}>Note: the remaining {formatCurrency(outsideContribution)} is outside iSkipped and will not be covered by your skips.</p>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePurchaseLog(purchasingGoal)}
                      disabled={purchaseWorking || !purchaseAmount || cleanAmount < 1}
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
