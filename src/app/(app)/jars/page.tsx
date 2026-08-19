"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { toast } from "sonner";
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
  setActiveSkipTarget,
  allocateSkipBankToJar,
  releaseJarToSkipBank,
  pinProjectToHome,
} from "@/lib/services/firebase/users";
import { addCustomProject, updateCustomProject, deleteCustomProject, isCauseProject, isChallengeProject, isProjectEnded, PARTNER_CHALLENGE_IDS } from "@/lib/services/firebase/projects";
import { formatAggregateImpactUnitsDecimal, formatUnits } from "@/lib/utils/impact";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { SpendingHistoryEvent, Project, SpendingGoal, DonationEvent, SkipAllocationTarget } from "@/lib/types/models";
import { DonationLogModal } from "@/components/skip/DonationLogModal";
import { apiRequest } from "@/lib/services/firebase/apiClient";

type Tab = "cause" | "live";

const rewardArtwork = [
  { background: "linear-gradient(135deg, #4C1D95 0%, #8B5CF6 48%, #E9D5FF 140%)", accent: "#E9D5FF" },
  { background: "linear-gradient(135deg, #064E3B 0%, #0F766E 48%, #99F6E4 140%)", accent: "#CCFBF1" },
  { background: "linear-gradient(135deg, #78350F 0%, #D97706 48%, #FDE68A 140%)", accent: "#FEF3C7" },
  { background: "linear-gradient(135deg, #831843 0%, #DB2777 48%, #FBCFE8 140%)", accent: "#FCE7F3" },
  { background: "linear-gradient(135deg, #0C4A6E 0%, #0284C7 48%, #BAE6FD 140%)", accent: "#E0F2FE" },
];

function rewardArtFor(label: string) {
  const index = [...label].reduce((total, char) => total + char.charCodeAt(0), 0) % rewardArtwork.length;
  return rewardArtwork[index];
}

function normalizeExternalLink(link: string) {
  const trimmed = link.trim();
  if (!trimmed) return "";
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}

function amazonProductImage(link?: string) {
  if (!link) return null;
  try {
    const url = new URL(normalizeExternalLink(link));
    if (!url.hostname.includes("amazon.")) return null;
    const asin = url.pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i)?.[1];
    return asin ? `https://images-na.ssl-images-amazon.com/images/P/${asin.toUpperCase()}.01.LZZZZZZZ.jpg` : null;
  } catch {
    return null;
  }
}

function goalCoverage(balance: number, target: number) {
  const percent = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
  return { percent, remaining: Math.max(0, target - balance) };
}

function rewardCategory(label: string, explicitCategory?: string) {
  const category = explicitCategory?.trim();
  if (category) return { tag: category, accent: "#C4B5FD" };
  const normalized = label.toLowerCase();
  if (/(trip|flight|hotel|travel|weekend|vacation|getaway)/.test(normalized)) return { tag: "Getaway", accent: "#38BDF8" };
  if (/(book|course|class|learn|editor|laptop|camera|desk|tool)/.test(normalized)) return { tag: "Personal reward", accent: "#A78BFA" };
  if (/(dinner|coffee|meal|date|restaurant|brunch)/.test(normalized)) return { tag: "Treat yourself", accent: "#F59E0B" };
  if (/(shoe|jacket|watch|bag|clothes|style)/.test(normalized)) return { tag: "Upgrade", accent: "#F472B6" };
  return { tag: "Personal reward", accent: "#8B5CF6" };
}

function rewardDefaultImage(label: string, explicitCategory?: string) {
  const normalized = `${label} ${explicitCategory ?? ""}`.toLowerCase();
  if (/(spa|self-care|self care|massage|recharge)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80";
  }
  if (/(concert|ticket|music|show|experience)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80";
  }
  if (/(flight|abroad|plane|travel|trip|weekend|vacation|getaway)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80";
  }
  if (/(book|course|class|learn)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80";
  }
  if (/(editor|laptop|camera|desk|tool|upgrade)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80";
  }
  if (/(dinner|coffee|meal|date|restaurant|brunch|treat)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80";
  }
  return null;
}

const rewardInspoPics = [
  {
    label: "Travel",
    category: "Travel",
    url: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Beach",
    category: "Getaway",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "City",
    category: "Getaway",
    url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Concert",
    category: "Experience",
    url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Festival",
    category: "Experience",
    url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Museum",
    category: "Experience",
    url: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Spa",
    category: "Self-care",
    url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Wellness",
    category: "Self-care",
    url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Fitness",
    category: "Wellness",
    url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Dinner",
    category: "Date Night",
    url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Coffee",
    category: "Treat yourself",
    url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Dessert",
    category: "Treat yourself",
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Books",
    category: "Learning",
    url: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Class",
    category: "Learning",
    url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Camera",
    category: "Creative",
    url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Setup",
    category: "Upgrade",
    url: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Headphones",
    category: "Upgrade",
    url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Style",
    category: "Upgrade",
    url: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
  },
];

function rewardMomentumLine(balance: number, target: number, availableSkipBankBalance: number) {
  const remaining = Math.max(0, target - balance);
  if (target <= 0) return "Set a target to track progress";
  if (remaining <= 0) return "Ready to claim";
  if (availableSkipBankBalance >= remaining) return `${formatCurrency(remaining)} from Skip Bucks finishes it`;
  if (availableSkipBankBalance > 0) {
    const boostedPercent = Math.min(100, Math.round(((balance + availableSkipBankBalance) / target) * 100));
    return `${formatCurrency(availableSkipBankBalance)} SB could push this to ${boostedPercent}%`;
  }
  return `${formatCurrency(remaining)} left to unlock`;
}

function rewardSkipEquivalentLine(balance: number, target: number) {
  const remaining = Math.max(0, target - balance);
  if (target <= 0) return "Set a target to track progress";
  if (remaining <= 0) return "Ready to claim";
  const coffees = Math.max(1, Math.ceil(remaining / 5));
  return `~${coffees.toLocaleString()} coffee skips`;
}

function RewardArtwork({ label, amount, link, imageURL, imagePosition, category: categoryLabel, featured = false }: { label: string; amount?: number; link?: string; imageURL?: string; imagePosition?: string; category?: string; featured?: boolean }) {
  const art = rewardArtFor(label);
  const category = rewardCategory(label, categoryLabel);
  const previewImageURL = imageURL ?? amazonProductImage(link) ?? rewardDefaultImage(label, category.tag);
  return (
    <div className={`relative overflow-hidden ${featured ? "min-h-44 sm:min-h-full" : "aspect-[1.35]"}`} style={{ background: art.background }}>
      {previewImageURL && (
        <>
          <img
            src={previewImageURL}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: imagePosition ?? "50% 50%" }}
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071B14]/95 via-[#071B14]/25 to-transparent" />
        </>
      )}
      {!previewImageURL && (
        <>
          <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(120deg, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border border-white/25 bg-white/10" />
          <div className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full border border-black/10 bg-black/10" />
        </>
      )}
      <div className="relative flex h-full flex-col justify-between p-4" style={{ color: art.accent }}>
        <div className="flex items-start justify-end gap-3">
          {amount !== undefined && (
            <span className="shrink-0 rounded-full px-2 py-1 text-xs font-black text-white shadow-sm" style={{ background: "rgba(0,0,0,0.28)", boxShadow: `0 8px 18px ${category.accent}30` }}>
              {formatCurrency(amount)}
            </span>
          )}
        </div>
        <div>
          <p className={`font-black leading-tight text-white ${featured ? "text-2xl" : "text-lg"}`}>{label}</p>
        </div>
      </div>
    </div>
  );
}

function RewardProgress({
  balance,
  target,
  availableSkipBankBalance,
  active,
}: {
  balance: number;
  target: number;
  availableSkipBankBalance: number;
  active?: boolean;
}) {
  const { percent, remaining } = goalCoverage(balance, target);
  const boostedPercent = target > 0 ? Math.min(100, Math.round(((balance + availableSkipBankBalance) / target) * 100)) : 0;
  if (!active) {
    return (
      <div className="mt-3 rounded-xl px-3 py-2" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.18)" }}>
        <p className="text-[11px] font-bold leading-snug" style={{ color: "var(--text-secondary)" }}>
          {rewardSkipEquivalentLine(balance, target)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide" style={{ color: "#DDD6FE" }}>
        <span>{percent}% covered</span>
        <span>{remaining > 0 ? `${formatCurrency(remaining)} left` : "Ready"}</span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "rgba(139,92,246,0.15)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${boostedPercent}%`, background: "rgba(167,139,250,0.26)" }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${percent}%`, background: "#8B5CF6" }} />
      </div>
      <p className="mt-2 min-h-8 text-[11px] font-bold leading-snug" style={{ color: "var(--text-secondary)" }}>
        {rewardMomentumLine(balance, target, availableSkipBankBalance)}
      </p>
    </div>
  );
}

function JarsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const autoOpenDonationLog = searchParams.get("donate") === "1";
  const initialTab: Tab = rawTab === "live" || rawTab === "cause" ? rawTab : "cause";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setActiveTab(rawTab === "live" ? "live" : "cause");
  }, [rawTab]);

  const { user, profile, updateProfile } = useAuthStore();
  const { donate, editDonation, deleteDonation, donations } = useSkips();
  const { projects, refetch } = useProjects();
  const [groupProgress, setGroupProgress] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user || projects.length === 0) return;
    const fundraiserIds = projects
      .filter((project) => !isProjectEnded(project) && (isChallengeProject(project) || PARTNER_CHALLENGE_IDS.includes(project.id)))
      .map((project) => project.id);
    if (fundraiserIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      fundraiserIds.map(async (id) => {
        try {
          const result = await apiRequest<{ total: number }>(`/api/challenges/${id}/progress`, "GET");
          return [id, Math.max(0, result.total)] as const;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setGroupProgress((current) => ({
        ...current,
        ...Object.fromEntries(results.filter((result): result is readonly [string, number] => result !== null)),
      }));
    });
    return () => { cancelled = true; };
  }, [projects, user?.uid]);
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
  // Must be declared before the early return to satisfy Rules of Hooks
  const [splitGive, setSplitGive] = useState(() => normalizeJarSplit(profile?.jarSplit as any).give);
  const [savingSplit, setSavingSplit] = useState(false);
  // Sync slider when profile loads async or changes from another tab
  useEffect(() => {
    setSplitGive(normalizeJarSplit(profile?.jarSplit as any).give);
  }, [profile?.jarSplit]);

  useEffect(() => {
    if (!user || !profile?.spendingGoals?.length) return;

    const { goals, activeId } = normalizeSpendingGoals(profile);
    let changed = false;
    const starterRewardsCleaned = goals.flatMap((goal) => {
      const label = goal.label.trim().toLowerCase();
      if (label === "new book" && goal.targetAmount === 40) {
        changed = true;
        return [];
      }
      if (label === "dinner out" && goal.targetAmount === 75) {
        changed = true;
        return [{ ...goal, label: "Date Night", category: goal.category ?? "Date Night" }];
      }
      return [goal];
    });

    if (!changed) return;
    const nextActiveId = activeId && starterRewardsCleaned.some((goal) => goal.id === activeId)
      ? activeId
      : starterRewardsCleaned[0]?.id ?? null;

    void updateSpendingGoals(user.uid, starterRewardsCleaned, nextActiveId)
      .then(() => updateProfile({ spendingGoals: starterRewardsCleaned, activeSpendingGoalId: nextActiveId }))
      .catch((error) => {
        console.error("starter reward cleanup failed", error);
      });
  }, [profile, updateProfile, user]);

  if (!profile || !user) return null;

  const split = normalizeJarSplit(profile.jarSplit as any);
  const giveTotal = profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100);
  const globalGivingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
  const skipBalanceSummary = getSkipBalanceSummary(profile);
  // Skip Bank is the unassigned part of lifetime skipped savings. Jars hold money
  // already picked for a specific reward or fundraiser.
  const skipBankBalance = skipBalanceSummary.unassignedSkipBank;

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
  const spendingBalance = skipBankBalance;

  async function handleSelectCause(project: Project) {
    let transfer;
    try {
      transfer = await switchCause(user!.uid, activeProject?.id ?? null, project.id);
    } catch (err) {
      console.error("switchCause failed", err);
      toast.error("Couldn't switch your cause — check your connection and try again.");
      return;
    }
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
    let transfer;
    try {
      transfer = await switchGoal(user!.uid, activeSpendingGoalId, goalId, moveFunds, spendingGoals);
    } catch (err) {
      console.error("switchGoal failed", err);
      toast.error("Couldn't switch your goal — check your connection and try again.");
      return;
    }
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
    try {
      await completeGoal(
        user!.uid,
        goalId,
        goal.label,
        goal.targetAmount,
        spendingBalance,
        spendingGoals,
        activeSpendingGoalId
      );
    } catch (err) {
      console.error("completeGoal failed", err);
      toast.error("Couldn't complete your goal — check your connection and try again.");
      return;
    }
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
    try {
      await transferLiveToGive(user!.uid, spendingBalance, spendingGoals, goalId, activeSpendingGoalId);
    } catch (err) {
      console.error("transferLiveToGive failed", err);
      toast.error("Couldn't move your funds — check your connection and try again.");
      return;
    }
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
    totalLiveAllocated: skipBankBalance,
    totalSpent: profile.totalSpent ?? 0,
    goals: spendingGoals,
    projects,
    activeGoalId: activeSpendingGoalId,
    activeGoal,
    activeProject,
    activeSkipTarget: profile.activeSkipTarget ?? null,
    skipBankBalance,
    availableSkipBankBalance: skipBalanceSummary.availableFromSkips,
    spendingHistory,
    goalJarBalances: profile.goalJarBalances,
    causeJarBalances: profile.causeJarBalances,
    causeGoalAmounts: profile.causeGoalAmounts,
    groupProgress,
    onAddGoal: handleAddGoal,
    onEditGoal: handleEditGoal,
    onDeleteGoal: handleDeleteGoal,
    onSetActiveGoal: handleSetActiveGoal,
    onDeactivateGoal: handleDeactivateGoal,
    onCompleteGoal: handleCompleteGoal,
    onMoveToGive: handleMoveToGive,
    onPurchase: async (amount: number) => {
      if (!activeSpendingGoalId || !activeGoal) return;
      let purchaseResult: { amountFromSkips: number; jarDecrease: number };
      try {
        purchaseResult = await recordPurchase(user.uid, activeSpendingGoalId, activeGoal.label, activeGoal.targetAmount, amount);
      } catch (err) {
        console.error("recordPurchase failed", err);
        toast.error("Couldn't log your purchase — check your connection and try again.");
        return;
      }
      updateProfile({
        totalSpent: (profile.totalSpent ?? 0) + purchaseResult.amountFromSkips,
        goalJarBalances: { ...(profile.goalJarBalances ?? {}), [activeSpendingGoalId]: Math.max(0, (profile.goalJarBalances?.[activeSpendingGoalId] ?? 0) - purchaseResult.jarDecrease) },
      });
      toast.success("Purchase logged.");
    },
    onSetSkipTarget: async (target: SkipAllocationTarget | null) => {
      if (!target) {
        await setActiveSkipTarget(user.uid, null);
        updateProfile({
          activeSkipTarget: null,
          ...(profile.activeSkipTarget?.type === "fundraiser" ? { activeProjectId: null } : {}),
        });
        return;
      }
      if (target?.type === "fundraiser") {
        await pinProjectToHome(user.uid, target.id);
        updateProfile({
          activeProjectId: target.id,
          activeSkipTarget: target,
          joinedProjectIds: Array.from(new Set([...(profile.joinedProjectIds ?? []), target.id])),
        });
        return;
      }
      await setActiveSkipTarget(user.uid, target);
      updateProfile({ activeSkipTarget: target });
    },
    onSetFundraiserGoal: handleSetCauseGoal,
    onApplySkipBank: async (target: SkipAllocationTarget, amount: number, mode: "increment" | "set" = "increment") => {
      const appliedAmount = await allocateSkipBankToJar(user.uid, target, amount, mode);
      if (appliedAmount > 0) {
        if (target.type === "goal") {
          updateProfile({
            goalJarBalances: {
              ...(profile.goalJarBalances ?? {}),
              [target.id]: mode === "set"
                ? appliedAmount
                : (profile.goalJarBalances?.[target.id] ?? 0) + appliedAmount,
            },
            activeSkipTarget: target,
          });
        } else {
          updateProfile({
            causeJarBalances: {
              ...(profile.causeJarBalances ?? {}),
              [target.id]: mode === "set"
                ? appliedAmount
                : (profile.causeJarBalances?.[target.id] ?? 0) + appliedAmount,
            },
            activeSkipTarget: target,
          });
        }
      }
      return appliedAmount;
    },
    onReleaseJar: async (target: SkipAllocationTarget) => {
      const releasedAmount = await releaseJarToSkipBank(user.uid, target);
      if (releasedAmount > 0) {
        if (target.type === "goal") {
          updateProfile({
            goalJarBalances: {
              ...(profile.goalJarBalances ?? {}),
              [target.id]: Math.max(0, (profile.goalJarBalances?.[target.id] ?? 0) - releasedAmount),
            },
          });
        } else {
          updateProfile({
            causeJarBalances: {
              ...(profile.causeJarBalances ?? {}),
              [target.id]: Math.max(0, (profile.causeJarBalances?.[target.id] ?? 0) - releasedAmount),
            },
          });
        }
      }
      return releasedAmount;
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

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <div className="mb-5">
        <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Skip for something</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Pick a personal goal, or a group fundraiser, and make your skips count.
        </p>
      </div>
      <SplurgeTab {...splurgeProps} />
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
  causeGoalAmounts,
  completedChallenges,
  onSetGoal,
  onDonate,
  onDonateCompleted,
  onEditDonation,
  onDeleteDonation,
  onShowCommunityChallenges,
  totalGiveAllocated,
  totalDonated,
  autoOpenDonationLog,
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
  autoOpenDonationLog?: boolean;
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
  const [editingGivingGoal, setEditingGivingGoal] = useState(false);
  const [givingGoalStr, setGivingGoalStr] = useState("");

  useEffect(() => {
    if (autoOpenDonationLog && activeProject) {
      setShowLogDonation(true);
    }
  }, [activeProject, autoOpenDonationLog]);
  const [savingGivingGoal, setSavingGivingGoal] = useState(false);

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
          {/* Personal giving goal */}
          {editingGivingGoal ? (
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={givingGoalStr}
                  onChange={(e) => setGivingGoalStr(e.target.value)}
                  className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid rgba(46,204,113,0.5)", color: "var(--text-primary)" }}
                  autoFocus
                />
              </div>
              <button
                onClick={async () => {
                  const amt = parseFloat(givingGoalStr);
                  if (!amt || amt <= 0) return;
                  setSavingGivingGoal(true);
                  await onSetGoal(activeProject.id, amt);
                  setGivingGoalStr("");
                  setEditingGivingGoal(false);
                  setSavingGivingGoal(false);
                }}
                disabled={savingGivingGoal || !givingGoalStr || parseFloat(givingGoalStr) <= 0}
                className="px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#0B1A14" }}
              >{savingGivingGoal ? "…" : "✓"}</button>
              <button
                onClick={() => { setEditingGivingGoal(false); setGivingGoalStr(""); }}
                className="px-3 py-2 rounded-xl text-sm"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >✕</button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Giving goal:{" "}
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {(causeGoalAmounts?.[activeProject.id] ?? 0) > 0
                    ? `$${causeGoalAmounts![activeProject.id].toLocaleString()}`
                    : "Not set"}
                </span>
              </p>
              <button
                onClick={() => {
                  setGivingGoalStr(causeGoalAmounts?.[activeProject.id] ? String(causeGoalAmounts[activeProject.id]) : "");
                  setEditingGivingGoal(true);
                }}
                className="text-xs font-bold"
                style={{ color: "var(--green-primary)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                {(causeGoalAmounts?.[activeProject.id] ?? 0) > 0 ? "Edit" : "Set goal"}
              </button>
            </div>
          )}

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
                  if (!amt || amt <= 0 || amt > givingBalance) return;
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
  projects,
  activeGoalId,
  activeGoal: activeGoalProp,
  activeProject,
  activeSkipTarget,
  skipBankBalance,
  availableSkipBankBalance,
  spendingHistory,
  goalJarBalances,
  causeJarBalances,
  causeGoalAmounts,
  groupProgress,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onSetActiveGoal,
  onDeactivateGoal,
  onCompleteGoal,
  onMoveToGive,
  onPurchase,
  onSetSkipTarget,
  onSetFundraiserGoal,
  onApplySkipBank,
  onReleaseJar,
  onEditHistory,
  onDeleteHistory,
}: {
  spendingBalance: number;
  totalLiveAllocated: number;
  totalSpent: number;
  goals: SpendingGoal[];
  projects: Project[];
  activeGoalId: string | null;
  activeGoal: SpendingGoal | null;
  activeProject: Project | null;
  activeSkipTarget: SkipAllocationTarget | null;
  skipBankBalance: number;
  availableSkipBankBalance: number;
  spendingHistory: SpendingHistoryEvent[];
  goalJarBalances: Record<string, number> | undefined;
  causeJarBalances: Record<string, number> | undefined;
  causeGoalAmounts: Record<string, number> | undefined;
  groupProgress: Record<string, number>;
  onAddGoal: (goal: Omit<SpendingGoal, "id">, activate?: boolean) => Promise<string>;
  onEditGoal: (goalId: string, updates: Partial<SpendingGoal>) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
  onSetActiveGoal: (goalId: string, moveFunds: boolean) => Promise<void>;
  onDeactivateGoal: () => Promise<void>;
  onCompleteGoal: (goalId: string) => Promise<void>;
  onMoveToGive: (goalId: string) => Promise<void>;
  onPurchase: (amount: number) => Promise<void>;
  onSetSkipTarget: (target: SkipAllocationTarget | null) => Promise<void>;
  onSetFundraiserGoal: (fundraiserId: string, amount: number) => Promise<void>;
  onApplySkipBank: (target: SkipAllocationTarget, amount: number, mode?: "increment" | "set") => Promise<number>;
  onReleaseJar: (target: SkipAllocationTarget) => Promise<number>;
  onEditHistory: (event: SpendingHistoryEvent, newAmount: number) => Promise<void>;
  onDeleteHistory: (event: SpendingHistoryEvent) => Promise<void>;
}) {
  const router = useRouter();
  const [shopView, setShopView] = useState<"rewards" | "fundraisers">(
    activeSkipTarget?.type === "goal" ? "rewards" : "fundraisers"
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addLink, setAddLink] = useState("");
  const [addImageURL, setAddImageURL] = useState("");
  const [addImagePosition, setAddImagePosition] = useState({ x: 50, y: 50 });
  const [addImageSource, setAddImageSource] = useState<"manual" | "product" | null>(null);
  const [addImageError, setAddImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissedStarterIds, setDismissedStarterIds] = useState<string[]>([]);
  const rewardImageDragStart = useRef<{ clientX: number; clientY: number; posX: number; posY: number } | null>(null);

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
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
  const [fundingTarget, setFundingTarget] = useState<SkipAllocationTarget | null>(null);
  const [fundingAmountStr, setFundingAmountStr] = useState("");
  const [fundingWorking, setFundingWorking] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<{ previous: SkipAllocationTarget; next: SkipAllocationTarget; balance: number } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{ target: SkipAllocationTarget; balance: number } | null>(null);
  const [donationSwitchPrompt, setDonationSwitchPrompt] = useState<{ previous: SkipAllocationTarget; next: SkipAllocationTarget; balance: number } | null>(null);
  const [switchWorking, setSwitchWorking] = useState(false);
  const [fundraiserSetup, setFundraiserSetup] = useState<Project | null>(null);
  const [donatingProject, setDonatingProject] = useState<Project | null>(null);
  const [fundraiserGoalStr, setFundraiserGoalStr] = useState("");
  const [fundraiserBankStr, setFundraiserBankStr] = useState("");
  const [fundraiserSetupWorking, setFundraiserSetupWorking] = useState(false);
  const fundraiserGoalAmountPreview = parseFloat(fundraiserGoalStr);
  const fundraiserGoalUnitPreview = fundraiserSetup?.unitCost && fundraiserGoalAmountPreview > 0
    ? formatAggregateImpactUnitsDecimal(
        fundraiserGoalAmountPreview,
        fundraiserSetup.unitCost,
        fundraiserSetup.unitName ?? fundraiserSetup.unitDisplay ?? "unit",
        fundraiserSetup.unitDisplay,
        fundraiserSetup.unitIsGoal,
      )
    : null;
  const fundraiserBankAmountPreview = parseFloat(fundraiserBankStr);
  const fundraiserBankUnitPreview = fundraiserSetup?.unitCost && fundraiserBankAmountPreview > 0
    ? formatAggregateImpactUnitsDecimal(
        fundraiserBankAmountPreview,
        fundraiserSetup.unitCost,
        fundraiserSetup.unitName ?? fundraiserSetup.unitDisplay ?? "unit",
        fundraiserSetup.unitDisplay,
        fundraiserSetup.unitIsGoal,
      )
    : null;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("iskipped.dismissedRewardStarters");
      setDismissedStarterIds(stored ? JSON.parse(stored) as string[] : []);
    } catch {
      setDismissedStarterIds([]);
    }
  }, []);

  const activeGoal = activeGoalProp;
  const activeFundraiser = activeSkipTarget?.type === "fundraiser"
    ? projects.find((project) => project.id === activeSkipTarget.id) ?? activeProject
    : null;
  const activeFundraiserJarBalance = activeFundraiser ? fundraiserJar(activeFundraiser) : 0;
  const rewardPresets = [
    { id: "weekend-trip", label: "Weekend Trip", amount: 300, category: "Getaway" },
    { id: "concert-tickets", label: "Concert Tickets", amount: 180, category: "Experience" },
    { id: "flight-abroad", label: "Flight Abroad", amount: 900, category: "Travel" },
    { id: "spa-day", label: "Spa Day", amount: 150, category: "Self-care" },
  ];
  const savedRewardNames = new Set(goals.map((goal) => goal.label.trim().toLowerCase()));
  const dismissedStarterSet = new Set(dismissedStarterIds);
  const suggestedRewards = goals.length === 0
    ? rewardPresets.filter((preset) => !savedRewardNames.has(preset.label.toLowerCase()) && !dismissedStarterSet.has(preset.id))
    : [];
  const activeGoalJarBalance = activeGoal ? (goalJarBalances?.[activeGoal.id] ?? 0) : 0;
  const fundraisers = projects
    .filter((project) =>
      !isProjectEnded(project)
      && (isChallengeProject(project) || PARTNER_CHALLENGE_IDS.includes(project.id))
    )
    .sort((a, b) => {
      if (activeSkipTarget?.type === "fundraiser") {
        if (a.id === activeSkipTarget.id) return -1;
        if (b.id === activeSkipTarget.id) return 1;
      }
      if (activeProject?.id === a.id) return -1;
      if (activeProject?.id === b.id) return 1;
      return a.title.localeCompare(b.title);
    });

  function fundraiserGoal(project: Project) {
    return causeGoalAmounts?.[project.id] ?? project.goalAmount ?? 0;
  }

  function fundraiserJar(project: Project) {
    return Math.max(0, causeJarBalances?.[project.id] ?? 0);
  }

  function unitCostLabel(project: Project) {
    if (!project.unitCost) return null;
    return `${formatCurrency(project.unitCost)}${project.unitName ? ` / ${project.unitName}` : ""}`;
  }

  function fundraiserGoalBadge(project: Project, groupGoal: number) {
    if (groupGoal <= 0) return "Fundraiser";
    if (project.unitCost && project.unitCost > 0 && project.unitName) {
      return `Goal ${formatUnits(groupGoal, project.unitCost, project.unitName, project.unitDisplay)}`;
    }
    return `Goal ${formatCurrency(groupGoal)}`;
  }

  function fundraiserHelpCopy(project: Project) {
    const description = project.description.trim();
    if (!description) return "Your skips will help fund this fundraiser.";
    return `Your skips will help fund ${description}`;
  }

  function fundraiserTrustLabel(project: Project) {
    return project.isCustom ? "Community" : "Verified";
  }

  function targetBalance(target: SkipAllocationTarget | null) {
    if (target?.type === "goal") return Math.max(0, goalJarBalances?.[target.id] ?? 0);
    if (target?.type === "fundraiser") return Math.max(0, causeJarBalances?.[target.id] ?? 0);
    return 0;
  }

  function targetLabel(target: SkipAllocationTarget | null) {
    if (target?.type === "goal") return goals.find((goal) => goal.id === target.id)?.label ?? "your reward";
    if (target?.type === "fundraiser") {
      if (activeProject?.id === target.id) return activeProject.groupName ?? activeProject.title;
      return projects.find((project) => project.id === target.id)?.groupName
        ?? projects.find((project) => project.id === target.id)?.title
        ?? "your fundraiser";
    }
    return "your current pick";
  }

  async function handleSkipFor(target: SkipAllocationTarget) {
    const isCurrentTarget = activeSkipTarget?.type === target.type && activeSkipTarget.id === target.id;
    if (isCurrentTarget) {
      setDeactivateTarget({ target, balance: targetBalance(target) });
      return;
    }
    if (
      activeSkipTarget
      && (activeSkipTarget.type !== target.type || activeSkipTarget.id !== target.id)
      && targetBalance(activeSkipTarget) > 0
    ) {
      setSwitchPrompt({ previous: activeSkipTarget, next: target, balance: targetBalance(activeSkipTarget) });
      return;
    }
    await proceedToTarget(target);
  }

  async function proceedToTarget(target: SkipAllocationTarget) {
    if (target.type === "fundraiser") {
      const project = projects.find((candidate) => candidate.id === target.id);
      if (project) {
        setFundraiserSetup(project);
        setFundraiserGoalStr(String(causeGoalAmounts?.[project.id] ?? project.goalAmount ?? ""));
        setFundraiserBankStr("");
        return;
      }
    }
    await activateSkipTarget(target);
  }

  async function activateSkipTarget(target: SkipAllocationTarget) {
    await onSetSkipTarget(target);
    if (availableSkipBankBalance > 0) {
      setFundingTarget(target);
      setFundingAmountStr("");
      return;
    }
    toast.success("Future skips will go to this jar.");
  }

  async function releasePreviousAndContinue() {
    if (!switchPrompt) return;
    setSwitchWorking(true);
    const releasedAmount = await onReleaseJar(switchPrompt.previous);
    setSwitchWorking(false);
    const next = switchPrompt.next;
    setSwitchPrompt(null);
    if (releasedAmount > 0) toast.success(`${formatCurrency(releasedAmount)} moved back to your Skip Bank.`);
    await proceedToTarget(next);
  }

  async function confirmFundraiserSetup() {
    if (!fundraiserSetup) return;
    const target: SkipAllocationTarget = { type: "fundraiser", id: fundraiserSetup.id };
    const goalAmount = parseFloat(fundraiserGoalStr);
    const bankAmount = parseFloat(fundraiserBankStr);
    if (!goalAmount || goalAmount <= 0) return;
    setFundraiserSetupWorking(true);
    await onSetFundraiserGoal(fundraiserSetup.id, goalAmount);
    await onSetSkipTarget(target);
    if (bankAmount > 0 && availableSkipBankBalance > 0) {
      const appliedAmount = await onApplySkipBank(target, Math.min(bankAmount, availableSkipBankBalance), "set");
      if (appliedAmount > 0) toast.success(`${formatCurrency(appliedAmount)} moved into the fundraiser jar.`);
    }
    setFundraiserSetupWorking(false);
    setFundraiserSetup(null);
    setFundraiserGoalStr("");
    setFundraiserBankStr("");
    toast.success("Future skips will go to this fundraiser.");
  }

  async function confirmSkipBankFunding() {
    if (!fundingTarget) return;
    const amount = parseFloat(fundingAmountStr);
    if (!amount || amount <= 0) return;
    setFundingWorking(true);
    const appliedAmount = await onApplySkipBank(fundingTarget, Math.min(amount, availableSkipBankBalance), "set");
    setFundingWorking(false);
    setFundingTarget(null);
    setFundingAmountStr("");
    if (appliedAmount > 0) toast.success(`${formatCurrency(appliedAmount)} moved into the jar.`);
  }

  function skipFundingPromptLabel(target: SkipAllocationTarget | null) {
    if (target?.type === "goal") {
      return goals.find((goal) => goal.id === target.id)?.label ?? "this reward";
    }
    if (target?.type === "fundraiser") {
      return projects.find((project) => project.id === target.id)?.title ?? "this fundraiser";
    }
    return "this jar";
  }

  function skipFundingPreview(target: SkipAllocationTarget | null, amountStr: string) {
    const amount = parseFloat(amountStr);
    if (!target || !amount || amount <= 0) return null;
    if (target.type === "goal") {
      const goal = goals.find((candidate) => candidate.id === target.id);
      if (!goal?.targetAmount) return null;
      const currentBalance = Math.max(0, goalJarBalances?.[goal.id] ?? 0);
      const percent = Math.min(100, Math.round(((currentBalance + Math.min(amount, availableSkipBankBalance)) / goal.targetAmount) * 100));
      return `This would fund ${percent}% of ${goal.label}.`;
    }
    const project = projects.find((candidate) => candidate.id === target.id);
    if (project?.unitCost && project.unitCost > 0) {
      return `That is about ${formatAggregateImpactUnitsDecimal(
        Math.min(amount, availableSkipBankBalance),
        project.unitCost,
        project.unitName ?? project.unitDisplay ?? "unit",
        project.unitDisplay,
        project.unitIsGoal,
      )}.`;
    }
    return null;
  }

  function handleSetActiveGoalWithCheck(goal: SpendingGoal) {
    if (activeGoalId && activeGoalId !== goal.id) {
      setSwitchTarget(goal);
    } else {
      onSetActiveGoal(goal.id, false);
    }
  }

  async function enrichGoalImage(goalId: string, shoppingLink: string) {
    try {
      const response = await fetch(`/api/product-preview?url=${encodeURIComponent(shoppingLink)}`);
      if (!response.ok) return;
      const preview = await response.json() as { imageURL?: string | null };
      if (preview.imageURL) await onEditGoal(goalId, { imageURL: preview.imageURL });
    } catch {
      // Retailers may block preview requests; the artwork fallback remains visible.
    }
  }

  async function previewProductImage() {
    if (!addLink.trim() || addImageSource === "manual") return;
    try {
      const response = await fetch(`/api/product-preview?url=${encodeURIComponent(normalizeExternalLink(addLink))}`);
      if (!response.ok) return;
      const preview = await response.json() as { imageURL?: string | null };
      if (preview.imageURL) {
        setAddImageURL(preview.imageURL);
        setAddImagePosition({ x: 50, y: 50 });
        setAddImageSource("product");
      }
    } catch {
      // A reward can still be saved when a retailer blocks image previews.
    }
  }

  function handleRewardImage(file: File | undefined) {
    if (!file) return;
    setAddImageError("");
    if (!file.type.startsWith("image/")) {
      setAddImageError("Please choose an image file.");
      return;
    }

    const objectURL = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectURL);
      const maxWidth = 900;
      const scale = image.width > maxWidth ? maxWidth / image.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      setAddImageURL(canvas.toDataURL("image/jpeg", 0.8));
      setAddImagePosition({ x: 50, y: 50 });
      setAddImageSource("manual");
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      setAddImageError("Could not read that image. Try another file.");
    };
    image.src = objectURL;
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
    if (addCategory.trim()) goal.category = addCategory.trim();
    if (addLink.trim()) goal.shoppingLink = normalizeExternalLink(addLink);
    if (addImageURL) {
      goal.imageURL = addImageURL;
      goal.imagePosition = `${addImagePosition.x}% ${addImagePosition.y}%`;
    }
    const goalId = await onAddGoal(goal);
    if (goal.shoppingLink && !goal.imageURL) void enrichGoalImage(goalId, goal.shoppingLink);
    setAddLabel("");
    setAddAmount("");
    setAddCategory("");
    setAddLink("");
    setAddImageURL("");
    setAddImagePosition({ x: 50, y: 50 });
    setAddImageSource(null);
    setAddImageError("");
    setShowAddForm(false);
    setSaving(false);
    toast.success("Reward added to your list.");
  }

  async function handleAddPresetGoal(label: string, amount: number, category?: string) {
    const existingGoal = goals.find(
      (goal) => goal.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (existingGoal) {
      await handleSkipFor({ type: "goal", id: existingGoal.id });
      return;
    }

    setSaving(true);
    const goalId = await onAddGoal({
      label,
      targetAmount: amount,
      type: "splurge",
      category: category ?? rewardCategory(label).tag,
    });
    setSaving(false);
    await handleSkipFor({ type: "goal", id: goalId });
  }

  function dismissStarterIdea(presetId: string) {
    setDismissedStarterIds((current) => {
      if (current.includes(presetId)) return current;
      const next = [...current, presetId];
      window.localStorage.setItem("iskipped.dismissedRewardStarters", JSON.stringify(next));
      return next;
    });
  }

  function startAddPresetGoal(label: string, amount: number, category?: string) {
    const image = rewardDefaultImage(label, category);
    setAddLabel(label);
    setAddAmount(String(amount));
    setAddCategory(category ?? rewardCategory(label).tag);
    setAddLink("");
    setAddImageURL(image ?? "");
    setAddImagePosition({ x: 50, y: 50 });
    setAddImageSource(image ? "manual" : null);
    setAddImageError("");
    setShowAddForm(true);
  }

  function startEditGoal(goal: SpendingGoal) {
    setEditingGoalId(goal.id);
    setEditLabel(goal.label);
    setEditAmount(String(goal.targetAmount));
    setEditCategory(goal.category ?? "");
    setEditLink(goal.shoppingLink ?? goal.donationURL ?? "");
  }

  async function handleEditGoalSave(goalId: string, goalType: "splurge" | "donation") {
    const amount = parseFloat(editAmount);
    if (!editLabel.trim() || !amount || amount <= 0) return;
    setEditWorking(true);
    const updates: Partial<SpendingGoal> = { label: editLabel.trim(), targetAmount: amount, category: editCategory.trim() || undefined };
    let shoppingLink = "";
    if (editLink.trim()) {
      if (goalType === "splurge") {
        shoppingLink = normalizeExternalLink(editLink);
        updates.shoppingLink = shoppingLink;
        updates.imageURL = undefined;
      }
      else updates.donationURL = normalizeExternalLink(editLink);
    } else {
      updates.shoppingLink = undefined;
      updates.donationURL = undefined;
      if (goalType === "splurge") updates.imageURL = undefined;
    }
    await onEditGoal(goalId, updates);
    if (goalType === "splurge" && shoppingLink) void enrichGoalImage(goalId, shoppingLink);
    setEditingGoalId(null);
    setEditWorking(false);
  }

  return (
    <div className="space-y-4">
      {switchPrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwitchPrompt(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Switch what you're skipping for?
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                You currently have skipped {formatCurrency(switchPrompt.balance)} for {targetLabel(switchPrompt.previous)} that you haven&apos;t {switchPrompt.previous.type === "goal" ? "spent" : "donated"} yet.
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                What would you like to do before picking a new jar?
              </p>
            </div>
            <div className="space-y-3 p-5">
              <button
                onClick={() => {
                  setSwitchPrompt(null);
                  if (switchPrompt.previous.type === "goal") {
                    setPurchasingId(switchPrompt.previous.id);
                    setPurchaseAmountStr(String(switchPrompt.balance));
                  } else {
                    setDonationSwitchPrompt(switchPrompt);
                  }
                }}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-45"
                style={{ background: "#8B5CF6", color: "white" }}
              >
                {switchPrompt.previous.type === "goal" ? "Record purchase first" : "Record donation first"}
              </button>
              <button
                onClick={releasePreviousAndContinue}
                disabled={switchWorking}
                className="w-full py-1 text-sm font-black disabled:opacity-50"
                style={{ color: "var(--text-secondary)" }}
              >
                {switchWorking
                  ? "Moving it back..."
                  : `I no longer want to skip for this ${switchPrompt.previous.type === "goal" ? "reward" : "cause"}`}
              </button>
              <button
                onClick={() => setSwitchPrompt(null)}
                className="w-full rounded-xl py-3 text-sm font-bold"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {donationSwitchPrompt?.previous.type === "fundraiser" && (() => {
        const project = projects.find((candidate) => candidate.id === donationSwitchPrompt.previous.id);
        if (!project) return null;
        return (
          <DonationLogModal
            projectId={project.id}
            projectTitle={project.groupName ?? project.title}
            initialAmount={donationSwitchPrompt.balance}
            onClose={() => setDonationSwitchPrompt(null)}
            onLogged={async () => {
              const next = donationSwitchPrompt.next;
              setDonationSwitchPrompt(null);
              await proceedToTarget(next);
            }}
          />
        );
      })()}

      {donatingProject && (
        <DonationLogModal
          projectId={donatingProject.id}
          projectTitle={donatingProject.groupName ?? donatingProject.title}
          initialAmount={fundraiserJar(donatingProject)}
          onClose={() => setDonatingProject(null)}
        />
      )}

      {fundraiserSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setFundraiserSetup(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Skip for {fundraiserSetup.groupName ?? fundraiserSetup.title}?
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "#A7F3D0" }}>
                  Personal skipping goal
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    min="1"
                    value={fundraiserGoalStr}
                    onChange={(event) => setFundraiserGoalStr(event.target.value)}
                    placeholder="100"
                    className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    autoFocus
                  />
                </div>
                {fundraiserSetup?.unitCost && fundraiserGoalUnitPreview && (
                  <p className="mt-2 text-xs font-bold" style={{ color: "#A7F3D0" }}>
                    About {fundraiserGoalUnitPreview}.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Use Skip Bank money
                </label>
                <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  You have already skipped {formatCurrency(availableSkipBankBalance)} of expenses that you haven&apos;t used yet. Do you want to move some of it to this cause?
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    min="0"
                    max={availableSkipBankBalance}
                    value={fundraiserBankStr}
                    onChange={(event) => setFundraiserBankStr(event.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </div>
                {fundraiserSetup?.unitCost && fundraiserBankUnitPreview && (
                  <p className="mt-2 text-xs font-bold" style={{ color: "#A7F3D0" }}>
                    That would start this jar at about {fundraiserBankUnitPreview}.
                  </p>
                )}
              </div>

              <button
                onClick={confirmFundraiserSetup}
                disabled={fundraiserSetupWorking || !fundraiserGoalStr || parseFloat(fundraiserGoalStr) <= 0}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                {fundraiserSetupWorking ? "Setting up..." : "Set goal and skip"}
              </button>
              <button
                onClick={() => {
                  setFundraiserSetup(null);
                  setFundraiserGoalStr("");
                  setFundraiserBankStr("");
                }}
                className="w-full rounded-xl py-3 text-sm font-bold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {fundingTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setFundingTarget(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Use some Skip Bank money?
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                You have already skipped {formatCurrency(availableSkipBankBalance)} of expenses that you haven&apos;t used yet. Move some into {skipFundingPromptLabel(fundingTarget)}.
              </p>
            </div>
            <div className="space-y-3 p-5">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                <input
                  type="number"
                  min="0"
                  max={availableSkipBankBalance}
                  value={fundingAmountStr}
                  onChange={(event) => setFundingAmountStr(event.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  autoFocus
                />
              </div>
              {skipFundingPreview(fundingTarget, fundingAmountStr) && (
                <p className="text-xs font-bold leading-relaxed" style={{ color: "#C4B5FD" }}>
                  {skipFundingPreview(fundingTarget, fundingAmountStr)}
                </p>
              )}
              <button
                onClick={confirmSkipBankFunding}
                disabled={fundingWorking || !fundingAmountStr || parseFloat(fundingAmountStr) <= 0}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "#8B5CF6", color: "white" }}
              >
                {fundingWorking ? "Moving..." : "Move money to jar"}
              </button>
              <button
                onClick={() => {
                  setFundingTarget(null);
                  setFundingAmountStr("");
                  toast.success("Future skips will go to this jar.");
                }}
                className="w-full rounded-xl py-3 text-sm font-bold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Start without moving money
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
              <button onClick={() => setSwitchTarget(null)} aria-label="Close" className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
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
              <button onClick={() => setDeactivatingGoal(false)} aria-label="Close" className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Deactivate this goal?</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                Deactivating will keep your {formatCurrency(spendingBalance)} in your Skip Bank until you pick a new goal.
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

      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setDeactivateTarget(null)}>
          <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setDeactivateTarget(null)} aria-label="Close" className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
              <p className="text-lg font-bold pr-6" style={{ color: "var(--text-primary)" }}>Stop skipping for this?</p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                You currently have {formatCurrency(deactivateTarget.balance)} in this jar. What would you like to do with it?
              </p>
            </div>
            <div className="px-5 py-4 space-y-2">
              <button
                onClick={async () => {
                  if (deactivateTarget.balance > 0) await onReleaseJar(deactivateTarget.target);
                  await onSetSkipTarget(null);
                  setDeactivateTarget(null);
                  toast.success("Your jar was moved back to the Skip Bank.");
                }}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold text-left"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
              >
                I no longer want to skip for this
              </button>
              <button onClick={() => setDeactivateTarget(null)} className="w-full py-2 text-sm font-semibold" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
                Keep this active
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        <button
          type="button"
          onClick={() => {
            setShopView("fundraisers");
            setShowAddForm(false);
            setEditingGoalId(null);
          }}
          className="rounded-full px-4 py-2 text-sm font-black transition-colors"
          style={shopView === "fundraisers" ? { background: "#2ECC71", color: "#071B14" } : { color: "var(--text-secondary)" }}
        >
          Fundraisers
        </button>
        <button
          type="button"
          onClick={() => {
            setShopView("rewards");
            setShowAddForm(false);
          }}
          className="rounded-full px-4 py-2 text-sm font-black transition-colors"
          style={shopView === "rewards" ? { background: "#8B5CF6", color: "white" } : { color: "var(--text-secondary)" }}
        >
          Personal Rewards
        </button>
      </div>

      {/* Active goal summary card */}
      {shopView === "rewards" && activeGoal && activeSkipTarget?.type === "goal" && activeSkipTarget.id === activeGoal.id ? (() => {
        const pct = activeGoal.targetAmount > 0
          ? Math.min(100, Math.round((activeGoalJarBalance / activeGoal.targetAmount) * 100))
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
                    placeholder="Skipped amount needed"
                  />
                </div>
                <input
                  type="url"
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  placeholder="Shopping link"
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "#C4B5FD" }}>My Reward Jar</p>
                    <p className="mt-1 text-3xl font-extrabold leading-none" style={{ color: "#8B5CF6" }}>{formatCurrency(activeGoalJarBalance)}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{activeGoal.label}</p>
                  </div>
                  {purchasingId !== activeGoal.id && (
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      <div className="flex gap-2">
                        {activeGoal.shoppingLink && (
                          <a
                            href={activeGoal.shoppingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold"
                            style={{ background: "#8B5CF6", color: "white", textDecoration: "none" }}
                          >
                            Buy Now ↗
                          </a>
                        )}
                        <button
                          onClick={() => { setPurchasingId(activeGoal.id); setPurchaseAmountStr(String(activeGoal.targetAmount)); }}
                          className="rounded-xl px-4 py-2 text-sm font-bold"
                          style={activeGoal.shoppingLink
                            ? { border: "1px solid rgba(139,92,246,0.4)", color: "#8B5CF6" }
                            : { background: "#8B5CF6", color: "white" }}
                        >
                          Log Purchase
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className={purchasingId === activeGoal.id ? "mt-3" : ""}>
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
                ) : null}
                </div>

                {deletingActiveGoal && (
                  <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <p className="text-xs font-semibold text-[#EDF5F0]">Delete &quot;{activeGoal.label}&quot;?</p>
                    {spendingBalance > 0 && (
                      <p className="text-xs text-[rgba(237,245,240,0.6)]">You have {formatCurrency(spendingBalance)} available in your Skip Bank.</p>
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
      })() : null}

      {/* Edit form for inactive goals */}
      {shopView === "rewards" && editingGoalId && editingGoalId !== activeGoalId && (() => {
        const goal = goals.find((g) => g.id === editingGoalId);
        if (!goal) return null;
        return (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Edit goal</p>
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              placeholder="Savings goal name"
              autoFocus
            />
            <input
              type="text"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              placeholder="Category (optional)"
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full pl-7 rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                placeholder="Skipped amount needed"
              />
            </div>
            <input
              type="url"
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              placeholder="Shopping link"
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

      {/* Goals list */}
      {shopView === "rewards" && !showAddForm && !editingGoalId && (
        <div className="mt-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#8B5CF6" }}>Your reward wishlist</p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="shrink-0 rounded-full px-3 py-2 text-xs font-black"
              style={{ background: "white", color: "#0B1A14", border: "none" }}
            >
              + Add to my list
            </button>
          </div>

          {suggestedRewards.length > 0 && (
            <>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                Starter ideas
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {suggestedRewards.map((preset) => {
              const matchingGoal = goals.find(
                (g) => g.label.toLowerCase() === preset.label.toLowerCase() && g.targetAmount === preset.amount
              );
              const isActive = activeSkipTarget?.type === "goal" && matchingGoal?.id === activeSkipTarget.id;
              const balance = matchingGoal ? (goalJarBalances?.[matchingGoal.id] ?? 0) : 0;
              return (
                <div
                  key={`preset-${preset.label}`}
                  className="overflow-hidden rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: isActive ? "rgba(139,92,246,0.18)" : "linear-gradient(180deg, var(--bg-surface-1), rgba(16,36,27,0.86))",
                    border: isActive ? "2px solid #8B5CF6" : "1px solid rgba(139,92,246,0.3)",
                    boxShadow: isActive ? "0 18px 38px rgba(139,92,246,0.14)" : "0 12px 26px rgba(0,0,0,0.12)",
                  }}
                >
                  <RewardArtwork label={preset.label} amount={preset.amount} category={preset.category} />
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>{preset.category}</div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startAddPresetGoal(preset.label, preset.amount, preset.category)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-[#8B5CF6]"
                          style={{ background: "rgba(139,92,246,0.13)", border: "1px solid rgba(139,92,246,0.36)", color: "#C4B5FD" }}
                          title="Edit starter idea"
                          aria-label="Edit starter idea"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissStarterIdea(preset.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-red-500"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(248,113,113,0.32)", color: "#FCA5A5" }}
                          title="Remove starter idea"
                          aria-label="Remove starter idea"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <RewardProgress balance={balance} target={preset.amount} availableSkipBankBalance={availableSkipBankBalance} active={isActive} />
                    <button
                      type="button"
                      onClick={() => handleAddPresetGoal(preset.label, preset.amount, preset.category)}
                      disabled={saving}
                      className="mt-3 w-full rounded-lg py-2 text-center text-[10px] font-black uppercase tracking-wide disabled:opacity-60"
                      style={{ background: "rgba(139,92,246,0.2)", color: "#DDD6FE" }}
                    >
                      Skip for this
                    </button>
                  </div>
                </div>
              );
            })}
              </div>
            </>
          )}
          {goals.length > 0 && (
            <>
              {suggestedRewards.length > 0 && (
                <p className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                  Saved rewards
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {goals.map((goal) => {
              const isActiveGoal = activeSkipTarget?.type === "goal" && goal.id === activeSkipTarget.id;
              const balance = goalJarBalances?.[goal.id] ?? 0;
              return (
                <div
                  key={goal.id}
                  className="relative overflow-hidden rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: isActiveGoal ? "linear-gradient(180deg, rgba(139,92,246,0.18), var(--bg-surface-1))" : "linear-gradient(180deg, var(--bg-surface-1), rgba(16,36,27,0.86))",
                    border: deletingGoalId === goal.id ? "1px solid rgba(239,68,68,0.4)" : isActiveGoal ? "2px solid #8B5CF6" : "1px solid rgba(139,92,246,0.3)",
                    boxShadow: isActiveGoal ? "0 18px 38px rgba(139,92,246,0.14)" : "0 12px 26px rgba(0,0,0,0.12)",
                  }}
                >
                  {isActiveGoal && (
                    <div className="absolute left-3 top-3 z-10 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide" style={{ background: "#8B5CF6", color: "white", boxShadow: "0 8px 18px rgba(139,92,246,0.3)" }}>
                      Active
                    </div>
                  )}
                  {deletingGoalId !== goal.id && (
                    <div className="absolute right-3 top-12 z-20 flex gap-1">
                      <button
                        onClick={() => { startEditGoal(goal); setDeletingGoalId(null); }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none shadow-lg transition-colors hover:bg-[#8B5CF6]"
                        style={{ background: "rgba(23,37,84,0.74)", border: "1px solid rgba(139,92,246,0.46)", color: "#DDD6FE", backdropFilter: "blur(8px)" }}
                        title="Edit reward"
                        aria-label="Edit reward"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setDeletingGoalId(goal.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none shadow-lg transition-colors hover:bg-red-500"
                        style={{ background: "rgba(69,10,10,0.58)", border: "1px solid rgba(248,113,113,0.42)", color: "#FECACA", backdropFilter: "blur(8px)" }}
                        title="Delete reward"
                        aria-label="Delete reward"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <RewardArtwork label={goal.label} amount={goal.targetAmount} link={goal.shoppingLink} imageURL={goal.imageURL} imagePosition={goal.imagePosition} category={goal.category} />
                  {deletingGoalId === goal.id ? (
                    <div className="p-3" onClick={(e) => e.stopPropagation()}>
                      <p className="mb-2 text-xs text-red-400">Delete &quot;{goal.label}&quot;?</p>
                      <div className="flex gap-1.5">
                        <button onClick={() => { onDeleteGoal(goal.id); setDeletingGoalId(null); }} className="flex-1 bg-red-500 text-white font-semibold py-1.5 rounded-lg text-xs">Delete</button>
                        <button onClick={() => setDeletingGoalId(null)} className="flex-1 text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-lg text-xs" style={{ border: "1px solid rgba(139,92,246,0.12)" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3">
                      <RewardProgress balance={balance} target={goal.targetAmount} availableSkipBankBalance={availableSkipBankBalance} active={isActiveGoal} />
                      {isActiveGoal ? (
                        <div className="mt-3 rounded-lg py-2 text-center text-[10px] font-black uppercase tracking-wide" style={{ background: "rgba(139,92,246,0.23)", color: "#DDD6FE" }}>
                          Active jar
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSkipFor({ type: "goal", id: goal.id })}
                          className="mt-3 w-full rounded-lg py-2 text-[10px] font-black uppercase tracking-wide transition-colors hover:bg-[rgba(139,92,246,0.26)]"
                          style={{ background: "rgba(139,92,246,0.17)", color: "#C4B5FD" }}
                        >
                          Skip for this
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            </>
          )}
        </div>
      )}

      {shopView === "fundraisers" && (
        <div className="mt-6">
          {activeFundraiser && (
            <div className="mb-4 rounded-2xl p-5" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(46,204,113,0.35)", overflow: "visible" }}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "#A7F3D0" }}>My Fundraiser Jar</p>
                  <p className="mt-1 text-3xl font-extrabold leading-none" style={{ color: "#2ECC71" }}>{formatCurrency(activeFundraiserJarBalance)}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {activeFundraiser.groupName ?? activeFundraiser.title}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-3 sm:items-end">
                  <div className="flex gap-2">
                    {activeFundraiser.donationURL && (
                      <a
                        href={activeFundraiser.donationURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold"
                        style={{ background: "#2ECC71", color: "#071B14", textDecoration: "none" }}
                      >
                        Donate Your Savings
                      </a>
                    )}
                    <button
                      onClick={() => setDonatingProject(activeFundraiser)}
                      className="rounded-xl px-4 py-2 text-sm font-bold"
                      style={activeFundraiser.donationURL
                        ? { border: "1px solid rgba(46,204,113,0.4)", color: "#A7F3D0" }
                        : { background: "#2ECC71", color: "#071B14" }}
                    >
                      Record Donation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4 flex items-end justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#2ECC71" }}>Fundraisers</p>
            <button
              onClick={() => router.push("/challenges?create=1")}
              className="shrink-0 rounded-full px-3 py-2 text-xs font-black"
              style={{ background: "white", color: "#0B1A14", border: "none" }}
            >
              + Create
            </button>
          </div>

          {fundraisers.length === 0 ? (
            <div className="rounded-2xl px-4 py-5" style={{ background: "var(--bg-surface-1)", border: "1px dashed rgba(46,204,113,0.32)" }}>
              <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>No active fundraisers yet</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Active fundraisers will show up here as another thing you can skip for.
              </p>
            </div>
          ) : (
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              {fundraisers.map((project) => {
                const isActiveFundraiser = activeSkipTarget?.type === "fundraiser" && activeSkipTarget.id === project.id;
                const groupGoal = project.goalAmount ?? 0;
                const groupRaised = groupProgress[project.id] ?? Math.max(0, project.totalRaised ?? 0);
                const groupPct = groupGoal > 0 ? Math.min(100, Math.round((groupRaised / groupGoal) * 100)) : 0;
                return (
                  <div
                    key={project.id}
                    className="overflow-hidden rounded-2xl transition-all"
                    style={{
                      background: "var(--bg-surface-1)",
                      border: isActiveFundraiser ? "2px solid #2ECC71" : "1px solid rgba(46,204,113,0.3)",
                    }}
                  >
                    <div className="relative aspect-[1.35] overflow-hidden" style={{ background: "linear-gradient(135deg, #064E3B 0%, #0F766E 52%, #2ECC71 140%)" }}>
                      {project.imageURL && (
                        <>
                          <img
                            src={project.imageURL}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{ objectPosition: project.imagePosition ?? "50% 50%" }}
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#071B14]/95 via-[#071B14]/28 to-transparent" />
                        </>
                      )}
                      <div className="relative flex h-full flex-col justify-between p-4">
                        <div className="flex items-start justify-end gap-2">
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full bg-black/25 px-2 py-1 text-xs font-black text-white shadow-sm">
                              {fundraiserGoalBadge(project, groupGoal)}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-lg font-black leading-tight text-white">{project.groupName ?? project.title}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-3">
                      <div className="flex items-center justify-between gap-2">
                        {project.sponsor ? (
                          <p className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#A7F3D0" }}>{project.sponsor}</p>
                        ) : (
                          <span />
                        )}
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
                          style={project.isCustom
                            ? { background: "rgba(237,245,240,0.09)", color: "var(--text-secondary)" }
                            : { background: "rgba(46,204,113,0.16)", color: "#A7F3D0" }}
                        >
                          {fundraiserTrustLabel(project)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {fundraiserHelpCopy(project)}
                      </p>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Unit cost</p>
                        <p className="mt-0.5 text-sm font-black" style={{ color: "var(--text-primary)" }}>
                          {unitCostLabel(project) ?? "Any amount"}
                        </p>
                      </div>

                      <div>
                        <div>
                          <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wide" style={{ color: "#7DD3FC" }}>
                            <span>{formatCurrency(groupRaised)} saved</span>
                            <span>{groupPct}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "rgba(125,211,252,0.12)" }}>
                            <div className="h-full rounded-full" style={{ width: `${groupPct}%`, background: "#2BBAA4" }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSkipFor({ type: "fundraiser", id: project.id })}
                          className="flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: isActiveFundraiser ? "#2ECC71" : "rgba(46,204,113,0.16)", color: isActiveFundraiser ? "#071B14" : "#A7F3D0" }}
                        >
                          {isActiveFundraiser ? "Active jar" : "Skip for this"}
                        </button>
                        <button
                          onClick={() => router.push(`/challenges/${project.id}`)}
                          className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide"
                          style={{ border: "1px solid rgba(46,204,113,0.32)", color: "#A7F3D0" }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Custom goal form */}
      {shopView === "rewards" && showAddForm && (
        <div className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(139,92,246,0.35)" }}>
          <div className="p-4" style={{ background: "linear-gradient(120deg, rgba(139,92,246,0.18), rgba(15,118,110,0.08))" }}>
            <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#C4B5FD" }}>Save a reward</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>What would feel good to say yes to later?</p>
          </div>
          <div className="space-y-3 p-4">
          <input
            type="url"
            placeholder="Shopping link"
            value={addLink}
            onChange={(e) => {
              setAddLink(e.target.value);
              if (addImageSource === "product") {
                setAddImageURL("");
                setAddImageSource(null);
              }
            }}
            onBlur={() => void previewProductImage()}
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid rgba(139,92,246,0.4)", color: "var(--text-primary)" }}
          />
            <input
              type="text"
              placeholder="Reward name, e.g. headphones or a trip"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
          <input
            type="text"
            placeholder="Category (optional), e.g. getaway, books, self-care"
            value={addCategory}
            onChange={(e) => setAddCategory(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[rgba(237,245,240,0.6)]">$</span>
            <input
              type="number"
              placeholder="Skipped amount needed"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full pl-8 rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em]" style={{ color: "#C4B5FD" }}>Inspo pic</p>
            <div
              className="relative flex h-36 select-none items-center justify-center overflow-hidden rounded-xl"
              style={{ background: "var(--bg-surface-2)", border: "1px dashed rgba(139,92,246,0.52)", cursor: addImageURL ? "grab" : "default" }}
              onPointerDown={(event) => {
                if (!addImageURL) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                rewardImageDragStart.current = { clientX: event.clientX, clientY: event.clientY, posX: addImagePosition.x, posY: addImagePosition.y };
              }}
              onPointerMove={(event) => {
                if (!rewardImageDragStart.current) return;
                const dx = event.clientX - rewardImageDragStart.current.clientX;
                const dy = event.clientY - rewardImageDragStart.current.clientY;
                setAddImagePosition({
                  x: Math.min(100, Math.max(0, rewardImageDragStart.current.posX - dx / 2)),
                  y: Math.min(100, Math.max(0, rewardImageDragStart.current.posY - dy / 2)),
                });
              }}
              onPointerUp={() => { rewardImageDragStart.current = null; }}
              onPointerCancel={() => { rewardImageDragStart.current = null; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleRewardImage(event.dataTransfer.files?.[0]);
              }}
            >
              {addImageURL ? (
                <>
                  <img src={addImageURL} alt="Reward preview" className="h-full w-full object-cover" style={{ objectPosition: `${addImagePosition.x}% ${addImagePosition.y}%`, pointerEvents: "none" }} draggable={false} />
                  <div className="absolute inset-x-0 bottom-0 flex justify-center py-1.5" style={{ background: "rgba(0,0,0,0.48)" }}>
                    <span className="text-xs font-bold text-white">Drag to reposition</span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setAddImageURL("");
                      setAddImagePosition({ x: 50, y: 50 });
                      setAddImageSource(null);
                    }}
                    className="absolute right-2 top-2 rounded-full px-2 py-1 text-xs font-bold"
                    style={{ background: "rgba(7,27,20,0.82)", color: "white" }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Add an inspo pic</span>
              )}
            </div>
            <label className="mt-2 inline-flex cursor-pointer items-center rounded-full px-4 py-2 text-sm font-bold" style={{ background: "rgba(139,92,246,0.16)", color: "#C4B5FD" }}>
              Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={(event) => handleRewardImage(event.target.files?.[0])} />
            </label>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {rewardInspoPics.map((pic) => {
                const selected = addImageURL === pic.url;
                return (
                  <button
                    key={pic.label}
                    type="button"
                    onClick={() => {
                      setAddImageURL(pic.url);
                      setAddImagePosition({ x: 50, y: 50 });
                      setAddImageSource("manual");
                      if (!addCategory.trim()) setAddCategory(pic.category);
                    }}
                    className="group w-20 shrink-0 overflow-hidden rounded-xl text-left"
                    style={{
                      border: selected ? "2px solid #C4B5FD" : "1px solid rgba(139,92,246,0.28)",
                      background: "var(--bg-surface-2)",
                    }}
                  >
                    <div className="relative aspect-[1.35] overflow-hidden">
                      <img src={pic.url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#071B14]/82 to-transparent" />
                      <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide text-white">
                        {pic.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {addImageError && <p className="mt-1.5 text-xs text-red-400">{addImageError}</p>}
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>The link opens at the retailer when you are ready. iSkipped does not process the purchase.</p>
          <div className="flex gap-2">
            <button
              onClick={handleAddGoal}
              disabled={saving || !addLabel.trim() || !addAmount}
              className="flex-1 py-3 bg-[#8B5CF6] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save to wishlist"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddLabel(""); setAddAmount(""); setAddCategory(""); setAddLink(""); setAddImageURL(""); setAddImagePosition({ x: 50, y: 50 }); setAddImageSource(null); setAddImageError(""); }}
              className="px-5 py-3 text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm hover:text-[#EDF5F0] transition-colors"
              style={{ border: "1px solid rgba(139,92,246,0.12)" }}
            >
              Cancel
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Spending history */}
      {shopView === "rewards" && <div>
        <p className="text-xs font-semibold text-[rgba(237,245,240,0.85)] uppercase tracking-wide mb-2 mt-2">Purchases</p>
        {spendingHistory.length === 0 ? (
          <div className="rounded-2xl px-4 py-3" style={{ background: "var(--bg-surface-1)", border: "1px dashed rgba(139,92,246,0.25)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>No purchases yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              When you spend your skips, it will show up here as proof your skipped savings turned into something real.
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
      </div>}
    </div>
  );
}
