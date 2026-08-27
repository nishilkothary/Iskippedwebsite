"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/utils/currency";
import {
  completeGoal,
  recordPurchase,
  setActiveProject,
  switchCause,
  switchGoal,
  normalizeSpendingGoals,
  updateSpendingGoals,
  setUserCauseGoal,
  setActiveSkipTarget,
  parkSkipTarget,
  deactivateSkipTarget,
  setChallengeEmailConsent,
  allocateSkipBankToJar,
  releaseJarToSkipBank,
  moveJarBalance,
  pinProjectToHomeFromJars,
} from "@/lib/services/firebase/users";
import { getActiveSkipTarget } from "@/lib/utils/skipTargets";
import { addCustomProject, updateCustomProject, deleteCustomProject, isCauseProject, isChallengeProject, isProjectEnded, PARTNER_CHALLENGE_IDS } from "@/lib/services/firebase/projects";
import { formatAggregateImpactUnitsDecimal, formatUnits } from "@/lib/utils/impact";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { getChallengeCausePhrase } from "@/lib/utils/challengeShareCopy";
import { Project, SpendingGoal, DonationEvent, SkipAllocationTarget } from "@/lib/types/models";
import { DonationLogModal } from "@/components/skip/DonationLogModal";

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
  if (/(wedding|honeymoon|marriage|bridal)/.test(normalized)) {
    return "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=900&q=80";
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
    label: "Wedding",
    category: "Wedding",
    url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=900&q=80",
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

type ProductPreview = {
  imageURL?: string | null;
  title?: string | null;
  price?: number | null;
  merchant?: string | null;
};

function rewardSkipEquivalentLine(balance: number, target: number) {
  const remaining = Math.max(0, target - balance);
  if (target <= 0) return "Set a target to track progress";
  if (remaining <= 0) return "Ready to claim";
  if (remaining > 200) {
    const takeouts = Math.max(1, Math.ceil(remaining / 25));
    return `~${takeouts.toLocaleString()} takeout skips`;
  }
  const coffees = Math.max(1, Math.ceil(remaining / 5));
  return `~${coffees.toLocaleString()} coffee skips`;
}

function JarStatusBadge({ status, tone = "green" }: { status: "active" | "paused"; tone?: "green" | "purple" }) {
  const purple = tone === "purple";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white shadow-sm"
      style={{ background: purple ? "rgba(139,92,246,0.86)" : "rgba(7,27,20,0.72)" }}
      aria-label={status === "active" ? "Active jar" : "Paused jar"}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">{status === "active" ? "✓" : "Ⅱ"}</span>
      {status === "active" ? "Active" : "Paused"}
    </span>
  );
}

function RewardArtwork({ label, amount, link, imageURL, imagePosition, category: categoryLabel, featured = false, status }: { label: string; amount?: number; link?: string; imageURL?: string; imagePosition?: string; category?: string; featured?: boolean; status?: "active" | "paused" }) {
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
        <div className="relative flex items-start justify-end gap-2">
          {status && (
            <div className="absolute left-0 top-0">
              <JarStatusBadge status={status} tone="purple" />
            </div>
          )}
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
  active,
}: {
  balance: number;
  target: number;
  active?: boolean;
}) {
  const { percent, remaining } = goalCoverage(balance, target);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>
        <span>{formatCurrency(balance)} saved</span>
        <span>{percent}%</span>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full" style={{ background: "rgba(139,92,246,0.15)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${percent}%`, background: "#8B5CF6" }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-bold leading-snug" style={{ color: "var(--text-secondary)" }}>
        <span>{rewardSkipEquivalentLine(balance, target)}</span>
        <span>{remaining > 0 ? `${formatCurrency(remaining)} left` : "Ready"}</span>
      </div>
    </div>
  );
}

function JarsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const autoOpenDonationLog = searchParams.get("donate") === "1";
  const autoOpenFundraiserForm = rawTab !== "live" && searchParams.get("create") === "1";
  const autoOpenRewardForm = rawTab === "live" && searchParams.get("add") === "reward";
  const autoOpenRewardSkip = searchParams.get("skip") === "1";
  const autoOpenRewardLabel = searchParams.get("label") ?? "";
  const autoOpenRewardAmount = searchParams.get("amount") ?? "";
  const autoOpenRewardCategory = searchParams.get("category") ?? "";
  const { user, profile, updateProfile } = useAuthStore();
  const { donate, editDonation, deleteDonation, donations } = useSkips();
  const { projects, refetch } = useProjects();
  const [groupProgress, setGroupProgress] = useState<Record<string, number>>({});
  useEffect(() => {
    // Project totals are maintained when skips and donations are recorded. Do
    // not fan out one historical-progress scan per card whenever Jars loads.
    setGroupProgress(Object.fromEntries(
      projects
        .filter((project) => !isProjectEnded(project))
        .map((project) => [project.id, Math.max(0, (project.totalRaised ?? 0) + (project.totalDonated ?? 0))]),
    ));
  }, [projects]);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editPurchaseAmountStr, setEditPurchaseAmountStr] = useState("");
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);
  const [purchaseWorking, setPurchaseWorking] = useState(false);
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

  const skipBalanceSummary = getSkipBalanceSummary(profile);
  // Skip Bucks are the unassigned part of lifetime skipped savings. Jars hold money
  // already picked for a specific reward or fundraiser.
  const skipBankBalance = skipBalanceSummary.unassignedSkipBank;

  const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;

  const completedChallenges = (profile.joinedProjectIds ?? [])
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p && isChallengeProject(p) && isProjectEnded(p))
    .filter((p) => Math.max(0, profile.causeJarBalances?.[p.id] ?? 0) > 0)
    .map((p) => ({
      project: p,
      balance: Math.max(0, profile.causeJarBalances?.[p.id] ?? 0),
      donated: donations.filter((d) => d.causeId === p.id).reduce((sum, d) => sum + d.amount, 0),
    }));

  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile);
  const activeGoal = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;
  const activeSkipTarget = getActiveSkipTarget(profile);

  const givingBalance = activeProject ? Math.max(0, profile.causeJarBalances?.[activeProject.id] ?? 0) : 0;
  const spendingBalance = activeGoal ? Math.max(0, profile.goalJarBalances?.[activeGoal.id] ?? 0) : 0;

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
          Object.entries({ ...currentBalances, ...transfer }).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
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
          Object.entries({ ...currentBalances, ...transfer }).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
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

  const jarBrowserProps = {
    spendingBalance,
    totalSpent: profile.totalSpent ?? 0,
    goals: spendingGoals,
    projects,
    activeGoalId: activeSpendingGoalId,
    activeGoal,
    activeProject,
    activeSkipTarget,
    parkedSkipTargets: profile.parkedSkipTargets ?? [],
    skipBankBalance,
    availableSkipBankBalance: skipBalanceSummary.unassignedSkipBank,
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
    onPurchase: async (amount: number) => {
      if (!activeSpendingGoalId || !activeGoal) return false;
      let purchaseResult: { amountFromSkips: number; jarDecrease: number };
      try {
        purchaseResult = await recordPurchase(user.uid, activeSpendingGoalId, activeGoal.label, activeGoal.targetAmount, amount);
      } catch (err) {
        console.error("recordPurchase failed", err);
        toast.error("Couldn't log your purchase — check your connection and try again.");
        return false;
      }
      updateProfile({
        totalSpent: (profile.totalSpent ?? 0) + purchaseResult.amountFromSkips,
        goalJarBalances: { ...(profile.goalJarBalances ?? {}), [activeSpendingGoalId]: Math.max(0, (profile.goalJarBalances?.[activeSpendingGoalId] ?? 0) - purchaseResult.jarDecrease) },
      });
      toast.success("Purchase logged.");
      return true;
    },
    onSetSkipTarget: async (target: SkipAllocationTarget | null) => {
      if (!target) {
        const activeBalance = activeSkipTarget
          ? activeSkipTarget.type === "goal"
            ? Math.max(0, profile.goalJarBalances?.[activeSkipTarget.id] ?? 0)
            : Math.max(0, profile.causeJarBalances?.[activeSkipTarget.id] ?? 0)
          : 0;
        if (activeSkipTarget && activeBalance > 0) {
          await parkSkipTarget(user.uid, activeSkipTarget);
        } else {
          if (activeSkipTarget) await deactivateSkipTarget(user.uid, activeSkipTarget);
        }
        updateProfile({
          activeSkipTarget: null,
          parkedSkipTargets: activeSkipTarget && activeBalance > 0
            ? [...(profile.parkedSkipTargets ?? []).filter((parked) => parked.type !== activeSkipTarget.type || parked.id !== activeSkipTarget.id), activeSkipTarget]
            : (profile.parkedSkipTargets ?? []).filter((parked) => parked.type !== activeSkipTarget?.type || parked.id !== activeSkipTarget?.id),
          ...(activeSkipTarget?.type === "goal" ? { activeSpendingGoalId: null, spendingGoal: null } : {}),
          ...(activeSkipTarget?.type === "fundraiser" ? { activeProjectId: null } : {}),
        });
        return;
      }
      if (target?.type === "fundraiser") {
        await pinProjectToHomeFromJars(user.uid, target.id);
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
    onAddCause: handleAddCause,
    onSetFundraiserGoal: handleSetCauseGoal,
    onApplySkipBank: async (target: SkipAllocationTarget, amount: number) => {
      const appliedAmount = await allocateSkipBankToJar(user.uid, target, amount);
      if (appliedAmount > 0) {
        if (target.type === "goal") {
          updateProfile({
            goalJarBalances: {
              ...(profile.goalJarBalances ?? {}),
              [target.id]: Math.max(0, profile.goalJarBalances?.[target.id] ?? 0) + appliedAmount,
            },
            activeSkipTarget: target,
          });
        } else {
          updateProfile({
            causeJarBalances: {
              ...(profile.causeJarBalances ?? {}),
              [target.id]: Math.max(0, profile.causeJarBalances?.[target.id] ?? 0) + appliedAmount,
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
    onMoveJarBalance: async (source: SkipAllocationTarget, destination: SkipAllocationTarget, amount: number) => {
      const movedAmount = await moveJarBalance(user.uid, source, destination, amount);
      if (movedAmount > 0) {
        const nextGoalBalances = { ...(profile.goalJarBalances ?? {}) };
        const nextCauseBalances = { ...(profile.causeJarBalances ?? {}) };
        const applyDelta = (target: SkipAllocationTarget, delta: number) => {
          if (target.type === "goal") {
            nextGoalBalances[target.id] = Math.max(0, (nextGoalBalances[target.id] ?? 0) + delta);
          } else {
            nextCauseBalances[target.id] = Math.max(0, (nextCauseBalances[target.id] ?? 0) + delta);
          }
        };
        applyDelta(source, -movedAmount);
        applyDelta(destination, movedAmount);
        updateProfile({ goalJarBalances: nextGoalBalances, causeJarBalances: nextCauseBalances });
      }
      return movedAmount;
    },
    autoOpenRewardForm,
    autoOpenRewardSkip,
    autoOpenRewardLabel,
    autoOpenRewardAmount,
    autoOpenRewardCategory,
    autoOpenFundraiserForm,
  };

  return (
    <div className="jars-page-shell p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <div className="jars-page-header mb-5 flex items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="jars-page-title hidden text-2xl font-black tracking-tight md:block md:text-3xl" style={{ color: "var(--text-primary)" }}>
            Skip for something
          </h1>
          <p className="jars-page-subtitle mt-2 hidden text-sm md:block" style={{ color: "var(--text-secondary)" }}>
            Pick a personal goal, or a group fundraiser, and make your skips count.
          </p>
        </div>
        <Link
          href="/jar-activity"
          className="jars-activity-link inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-black"
          style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)", textDecoration: "none" }}
        >
          Manage jars
        </Link>
      </div>
      <JarBrowser {...jarBrowserProps} />
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

/* ── Retired legacy fundraiser browser (kept temporarily for data compatibility) ── */
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
          <div className="grid grid-cols-2 gap-3 mb-4">
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
  totalSaved,
  totalSpent,
  activeGoal,
  onPurchase,
  onManageRewards,
}: {
  spendingBalance: number;
  totalSaved: number;
  totalSpent: number;
  activeGoal: SpendingGoal | null;
  onPurchase: (amount: number) => Promise<boolean>;
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
          <p className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalSaved)}</p>
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

/* ── Skip Jar Browser ── */
function JarBrowser({
  spendingBalance,
  totalSpent,
  goals,
  projects,
  activeGoalId,
  activeGoal: activeGoalProp,
  activeProject,
  activeSkipTarget,
  parkedSkipTargets,
  skipBankBalance,
  availableSkipBankBalance,
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
  onPurchase,
  onSetSkipTarget,
  onAddCause,
  onSetFundraiserGoal,
  onApplySkipBank,
  onReleaseJar,
  onMoveJarBalance,
  autoOpenRewardForm = false,
  autoOpenRewardSkip = false,
  autoOpenRewardLabel = "",
  autoOpenRewardAmount = "",
  autoOpenRewardCategory = "",
  autoOpenFundraiserForm = false,
}: {
  spendingBalance: number;
  totalSpent: number;
  goals: SpendingGoal[];
  projects: Project[];
  activeGoalId: string | null;
  activeGoal: SpendingGoal | null;
  activeProject: Project | null;
  activeSkipTarget: SkipAllocationTarget | null;
  parkedSkipTargets: SkipAllocationTarget[];
  skipBankBalance: number;
  availableSkipBankBalance: number;
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
  onPurchase: (amount: number) => Promise<boolean>;
  onSetSkipTarget: (target: SkipAllocationTarget | null) => Promise<void>;
  onAddCause: (title: string, sponsor: string, location: string | undefined, goalAmount: number, donationURL?: string, description?: string, tags?: string[]) => Promise<void>;
  onSetFundraiserGoal: (fundraiserId: string, amount: number) => Promise<void>;
  onApplySkipBank: (target: SkipAllocationTarget, amount: number) => Promise<number>;
  onReleaseJar: (target: SkipAllocationTarget) => Promise<number>;
  onMoveJarBalance: (source: SkipAllocationTarget, destination: SkipAllocationTarget, amount: number) => Promise<number>;
  autoOpenRewardForm?: boolean;
  autoOpenRewardSkip?: boolean;
  autoOpenRewardLabel?: string;
  autoOpenRewardAmount?: string;
  autoOpenRewardCategory?: string;
  autoOpenFundraiserForm?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, updateProfile } = useAuthStore();
  const [shopView, setShopView] = useState<"rewards" | "fundraisers">(
    searchParams.get("tab") === "live" || activeSkipTarget?.type === "goal" ? "rewards" : "fundraisers"
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addLink, setAddLink] = useState("");
  const [addNoShoppingLink, setAddNoShoppingLink] = useState(false);
  const [addMerchant, setAddMerchant] = useState("");
  const [addImageURL, setAddImageURL] = useState("");
  const [addImagePosition, setAddImagePosition] = useState({ x: 50, y: 50 });
  const [addImageSource, setAddImageSource] = useState<"manual" | "product" | null>(null);
  const [productPreviewStatus, setProductPreviewStatus] = useState<"idle" | "loading" | "filled" | "partial" | "failed">("idle");
  const [addImageError, setAddImageError] = useState("");
  const [addAndSkipForThis, setAddAndSkipForThis] = useState(false);
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

  const [switchTarget, setSwitchTarget] = useState<SpendingGoal | null>(null);

  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseAmountStr, setPurchaseAmountStr] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState<"logged" | "emptied" | null>(null);
  const [deactivatingGoal, setDeactivatingGoal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [fundingTarget, setFundingTarget] = useState<SkipAllocationTarget | null>(null);
  const [fundingAmountStr, setFundingAmountStr] = useState("");
  const [fundingWorking, setFundingWorking] = useState(false);
  const [showFundraiserForm, setShowFundraiserForm] = useState(false);
  const [fundraiserTitle, setFundraiserTitle] = useState("");
  const [fundraiserOrganizer, setFundraiserOrganizer] = useState("");
  const [fundraiserGoalAmount, setFundraiserGoalAmount] = useState("");
  const [fundraiserDonationLink, setFundraiserDonationLink] = useState("");
  const [fundraiserDescription, setFundraiserDescription] = useState("");
  const [creatingFundraiser, setCreatingFundraiser] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<{ previous: SkipAllocationTarget; next: SkipAllocationTarget; balance: number; reactivate?: boolean } | null>(null);
  const [deactivatePrompt, setDeactivatePrompt] = useState<{ target: SkipAllocationTarget; balance: number } | null>(null);
  const [showSwitchMoreOptions, setShowSwitchMoreOptions] = useState(false);
  const [switchConfirmAction, setSwitchConfirmAction] = useState<"move" | "release" | null>(null);
  const [jarDecisionWorking, setJarDecisionWorking] = useState<"switch" | "move" | "release" | "deactivate-park" | "deactivate-release" | null>(null);
  const [fundraiserSetup, setFundraiserSetup] = useState<Project | null>(null);
  const [donatingProject, setDonatingProject] = useState<Project | null>(null);
  const [fundraiserGoalStr, setFundraiserGoalStr] = useState("");
  const [fundraiserSetupWorking, setFundraiserSetupWorking] = useState(false);
  const [fundraiserShareEmail, setFundraiserShareEmail] = useState(true);
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
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("iskipped.dismissedRewardStarters");
      setDismissedStarterIds(stored ? JSON.parse(stored) as string[] : []);
    } catch {
      setDismissedStarterIds([]);
    }
  }, []);

  useEffect(() => {
    if (!fundingTarget) {
      setFundingAmountStr("");
    }
  }, [fundingTarget]);

  useEffect(() => {
    if (!fundraiserSetup) {
      setFundraiserGoalStr("");
    }
  }, [fundraiserSetup]);

  useEffect(() => {
    if (!switchPrompt) {
      setShowSwitchMoreOptions(false);
      setSwitchConfirmAction(null);
    }
  }, [switchPrompt]);

  useEffect(() => {
    if (!autoOpenRewardForm) return;
    setShopView("rewards");
    setShowAddForm(true);
    setAddAndSkipForThis(autoOpenRewardSkip);
    setAddLabel(autoOpenRewardLabel);
    setAddAmount(autoOpenRewardAmount);
    setAddCategory(autoOpenRewardCategory);
    setAddLink("");
    setAddNoShoppingLink(false);
    setAddMerchant("");
    const image = rewardDefaultImage(autoOpenRewardLabel, autoOpenRewardCategory);
    setAddImageURL(image ?? "");
    setAddImagePosition({ x: 50, y: 50 });
    setAddImageSource(image ? "manual" : null);
    setProductPreviewStatus("idle");
    setAddImageError("");
    router.replace("/jars?tab=live");
  }, [autoOpenRewardAmount, autoOpenRewardCategory, autoOpenRewardForm, autoOpenRewardLabel, autoOpenRewardSkip, router]);

  useEffect(() => {
    if (!autoOpenFundraiserForm) return;
    router.replace("/challenges?create=1");
  }, [autoOpenFundraiserForm, router]);

  const activeGoal = activeGoalProp;
  const activeFundraiser = activeSkipTarget?.type === "fundraiser"
    ? projects.find((project) => project.id === activeSkipTarget.id) ?? activeProject
    : null;
  const activeFundraiserJarBalance = activeFundraiser ? fundraiserJar(activeFundraiser) : 0;
  const rewardPresets = [
    { id: "concert-tickets", label: "Concert Tickets", amount: 180, category: "Experience" },
    { id: "flight-abroad", label: "Flight Abroad", amount: 900, category: "Travel" },
    { id: "spa-day", label: "Spa Day", amount: 150, category: "Self-care" },
  ];
  const rewardPresetKey = (label: string, amount: number) => `${label.trim().toLowerCase()}-${amount}`;
  const presetRewardKeys = new Set(rewardPresets.map((preset) => rewardPresetKey(preset.label, preset.amount)));
  const dismissedStarterSet = new Set(dismissedStarterIds);
  const savedPresetRewardKeys = new Set(
    goals
      .map((goal) => rewardPresetKey(goal.label, goal.targetAmount))
      .filter((key) => presetRewardKeys.has(key))
  );
  const suggestedRewards = rewardPresets.filter((preset) =>
    !dismissedStarterSet.has(preset.id)
    || savedPresetRewardKeys.has(rewardPresetKey(preset.label, preset.amount))
  );
  const visibleSavedRewards = goals.filter((goal) => !presetRewardKeys.has(rewardPresetKey(goal.label, goal.targetAmount)));
  const activeGoalJarBalance = activeGoal ? Math.max(0, goalJarBalances?.[activeGoal.id] ?? 0) : 0;
  const joinedProjectIds = new Set(profile?.joinedProjectIds ?? []);
  const canSeeFundraiser = (project: Project) => {
    const restricted = project.visibility === "private"
      || project.visibility === "unlisted"
      || project.visibility === "password"
      || project.tags?.some((tag) => tag === "visibility-private" || tag === "visibility-unlisted");
    return !restricted || project.createdBy === profile?.uid || joinedProjectIds.has(project.id);
  };
  const fundraisers = projects
    .filter((project) =>
      !isProjectEnded(project)
      && canSeeFundraiser(project)
      && (isChallengeProject(project) || PARTNER_CHALLENGE_IDS.includes(project.id))
    );

  function fundraiserGoal(project: Project) {
    return causeGoalAmounts?.[project.id] ?? project.goalAmount ?? 0;
  }

  function fundraiserJar(project: Project) {
    return Math.max(0, causeJarBalances?.[project.id] ?? 0);
  }

  const endedFundraisers = (profile?.joinedProjectIds ?? [])
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is Project => !!project && isProjectEnded(project))
    .filter((project) => fundraiserJar(project) > 0);

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

  function fundraiserGroupGoalLine(project: Project) {
    const groupGoal = project.goalAmount ?? 0;
    if (groupGoal <= 0) return "Group goal: Open";
    if (project.unitCost && project.unitCost > 0 && project.unitName) {
      return `Group goal: ${formatCurrency(groupGoal)} (${formatUnits(groupGoal, project.unitCost, project.unitName, project.unitDisplay)})`;
    }
    return `Group goal: ${formatCurrency(groupGoal)}`;
  }

  function fundraiserHelpCopy(project: Project) {
    const causePhrase = getChallengeCausePhrase(project);
    if (!causePhrase) return "Your skips will help fund this fundraiser.";
    return `Your skips will help fund ${causePhrase}`;
  }

  function fundraiserTrustLabel(project: Project) {
    if (project.isCustom && (project.visibility === "private" || project.visibility === "unlisted" || project.tags?.some((tag) => tag === "visibility-private" || tag === "visibility-unlisted"))) {
      return "Private invite";
    }
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

  function isPausedTarget(target: SkipAllocationTarget) {
    // Balances created before parkedSkipTargets was introduced are still
    // paused in practice when they are not the active destination.
    return parkedSkipTargets.some((parked) => parked.type === target.type && parked.id === target.id)
      || targetBalance(target) > 0;
  }

  async function reactivateTarget(target: SkipAllocationTarget) {
    await onSetSkipTarget(target);
    toast.success(`${targetLabel(target)} is active again.`);
  }

  async function handleSkipFor(target: SkipAllocationTarget) {
    const isCurrentTarget = activeSkipTarget?.type === target.type && activeSkipTarget.id === target.id;
    if (isCurrentTarget) {
      setDeactivatePrompt({ target, balance: targetBalance(target) });
      return;
    }
    if (
      activeSkipTarget
      && (activeSkipTarget.type !== target.type || activeSkipTarget.id !== target.id)
      && targetBalance(activeSkipTarget) > 0
    ) {
      setSwitchPrompt({ previous: activeSkipTarget, next: target, balance: targetBalance(activeSkipTarget), reactivate: isPausedTarget(target) });
      return;
    }
    if (isPausedTarget(target)) {
      await reactivateTarget(target);
      return;
    }
    await proceedToTarget(target);
  }

  async function confirmSwitchKeepParked() {
    if (!switchPrompt) return;
    const next = switchPrompt.next;
    setJarDecisionWorking("switch");
    setSwitchPrompt(null);
    try {
      if (switchPrompt.reactivate) {
        await reactivateTarget(next);
      } else {
        await proceedToTarget(next);
      }
      setSwitchPrompt(null);
    } finally {
      setJarDecisionWorking(null);
    }
  }

  async function confirmSwitchMoveBalance() {
    if (!switchPrompt) return;
    const prompt = switchPrompt;
    setJarDecisionWorking("move");
    try {
      const movedAmount = await onMoveJarBalance(prompt.previous, prompt.next, prompt.balance);
      setSwitchPrompt(null);
      await proceedToTarget(prompt.next);
      if (movedAmount > 0) toast.success(`${formatCurrency(movedAmount)} moved to ${targetLabel(prompt.next)}.`);
    } catch (err) {
      console.error("move jar balance failed", err);
      toast.error("Couldn't move that balance — check your connection and try again.");
    } finally {
      setJarDecisionWorking(null);
    }
  }

  async function confirmSwitchReleaseBalance() {
    if (!switchPrompt) return;
    const prompt = switchPrompt;
    setJarDecisionWorking("release");
    try {
      const releasedAmount = await onReleaseJar(prompt.previous);
      setSwitchPrompt(null);
      await proceedToTarget(prompt.next);
      if (releasedAmount > 0) toast.success(`${formatCurrency(releasedAmount)} moved back to Skip Bucks.`);
    } catch (err) {
      console.error("release jar balance failed", err);
      toast.error("Couldn't release that balance — check your connection and try again.");
    } finally {
      setJarDecisionWorking(null);
    }
  }

  async function confirmDeactivateActiveJar(releaseBalance = false) {
    if (!deactivatePrompt) return;
    setJarDecisionWorking(releaseBalance ? "deactivate-release" : "deactivate-park");
    setDeactivating(true);
    try {
      const releasedAmount = releaseBalance ? await onReleaseJar(deactivatePrompt.target) : 0;
      await onSetSkipTarget(null);
      setDeactivatePrompt(null);
      toast.success(
        releaseBalance && releasedAmount > 0
          ? `${formatCurrency(releasedAmount)} moved back to Skip Bucks. Future skips will be unassigned.`
          : "Future skips will go to Skip Bucks."
      );
    } catch (err) {
      console.error("deactivate jar failed", err);
      toast.error("Couldn't update that jar — check your connection and try again.");
    } finally {
      setDeactivating(false);
      setJarDecisionWorking(null);
    }
  }

  async function proceedToTarget(target: SkipAllocationTarget) {
    if (target.type === "fundraiser") {
      const project = projects.find((candidate) => candidate.id === target.id);
      if (project) {
        setFundraiserSetup(project);
        setFundraiserGoalStr("");
        setFundraiserShareEmail(profile?.challengeEmailConsents?.[project.id] ?? true);
        return;
      }
    }
    setFundingTarget(target);
    setFundingAmountStr("");
  }

  async function confirmFundraiserSetup() {
    if (!fundraiserSetup) return;
    const target: SkipAllocationTarget = { type: "fundraiser", id: fundraiserSetup.id };
    const goalAmount = parseFloat(fundraiserGoalStr);
    if (!goalAmount || goalAmount <= 0) return;
    setFundraiserSetupWorking(true);
    try {
      // Activate the fundraiser first. Optional profile writes must not block
      // the existing Jars-page join from completing.
      await onSetSkipTarget(target);
      setFundraiserSetup(null);
      // A balance transfer is always an explicit choice; never carry a prior amount into this prompt.
      setFundingAmountStr("");
      if (availableSkipBankBalance > 0) {
        setFundingTarget(target);
      } else {
        router.push("/home");
      }

      // Persist the optional setup details after the join succeeds.
      void Promise.all([
        onSetFundraiserGoal(fundraiserSetup.id, goalAmount),
        ...(user && profile?.challengeEmailConsents?.[fundraiserSetup.id] !== fundraiserShareEmail
          ? [setChallengeEmailConsent(user.uid, fundraiserSetup.id, fundraiserShareEmail)]
          : []),
      ]).then(() => {
        if (user && profile?.challengeEmailConsents?.[fundraiserSetup.id] !== fundraiserShareEmail) {
          updateProfile({
            challengeEmailConsents: {
              ...(profile?.challengeEmailConsents ?? {}),
              [fundraiserSetup.id]: fundraiserShareEmail,
            },
          });
        }
      }).catch((error) => {
        console.error("optional fundraiser setup save failed", error);
      });
    } catch {
      toast.error("Couldn't join this fundraiser. Please try again.");
    } finally {
      setFundraiserSetupWorking(false);
    }
  }

  function resetFundraiserForm() {
    setFundraiserTitle("");
    setFundraiserOrganizer("");
    setFundraiserGoalAmount("");
    setFundraiserDonationLink("");
    setFundraiserDescription("");
  }

  async function handleCreateFundraiser() {
    const goal = parseFloat(fundraiserGoalAmount);
    if (!fundraiserTitle.trim() || !goal || goal <= 0) return;
    setCreatingFundraiser(true);
    try {
      await onAddCause(
        fundraiserTitle.trim(),
        fundraiserOrganizer.trim() || "Community fundraiser",
        undefined,
        goal,
        fundraiserDonationLink.trim() ? normalizeExternalLink(fundraiserDonationLink) : undefined,
        fundraiserDescription.trim() || undefined,
        ["custom", "challenge"]
      );
      toast.success("Fundraiser created.");
      setShowFundraiserForm(false);
      resetFundraiserForm();
    } catch (err) {
      console.error("create fundraiser failed", err);
      toast.error("Couldn't create that fundraiser — check your connection and try again.");
    } finally {
      setCreatingFundraiser(false);
    }
  }

  async function confirmSkipBankFunding() {
    if (!fundingTarget) return;
    const amount = parseFloat(fundingAmountStr);
    if (!amount || amount <= 0) return;
    if (amount > availableSkipBankBalance) {
      toast.error(`You only have ${formatCurrency(availableSkipBankBalance)} in Skip Bucks.`);
      return;
    }
    setFundingWorking(true);
    try {
      await onSetSkipTarget(fundingTarget);
      const appliedAmount = await onApplySkipBank(fundingTarget, amount);
      setFundingTarget(null);
      if (appliedAmount > 0) toast.success(`${formatCurrency(appliedAmount)} moved from Skip Bucks into the jar.`, { duration: 1800 });
      router.push("/home");
    } catch (err) {
      console.error("apply Skip Bucks failed", err);
      toast.error("Couldn't activate this jar. Please try again.");
    } finally {
      setFundingWorking(false);
    }
  }

  async function confirmSkipBankDecline() {
    if (!fundingTarget) return;
    setFundingWorking(true);
    try {
      await onSetSkipTarget(fundingTarget);
      setFundingTarget(null);
      router.push("/home");
    } catch (err) {
      console.error("activate jar failed", err);
      toast.error("Couldn't activate this jar. Please try again.");
    } finally {
      setFundingWorking(false);
    }
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

  function skipFundingGoalAmount(target: SkipAllocationTarget | null) {
    if (target?.type === "goal") {
      return goals.find((goal) => goal.id === target.id)?.targetAmount ?? null;
    }
    if (target?.type === "fundraiser") {
      return causeGoalAmounts?.[target.id]
        ?? projects.find((project) => project.id === target.id)?.goalAmount
        ?? null;
    }
    return null;
  }

  function skipFundingPreview(target: SkipAllocationTarget | null, amountStr: string) {
    const amount = parseFloat(amountStr);
    if (!target || !amount || amount <= 0) return null;
    const appliedAmount = Math.min(amount, availableSkipBankBalance);
    if (target.type === "goal") {
      const goal = goals.find((candidate) => candidate.id === target.id);
      if (!goal?.targetAmount) return null;
      const currentBalance = Math.max(0, goalJarBalances?.[goal.id] ?? 0);
      const nextBalance = currentBalance + appliedAmount;
      const percent = Math.min(100, Math.round((nextBalance / goal.targetAmount) * 100));
      return `${formatCurrency(nextBalance)} in this jar - about ${percent}% of your ${formatCurrency(goal.targetAmount)} goal.`;
    }
    const project = projects.find((candidate) => candidate.id === target.id);
    const goalAmount = skipFundingGoalAmount(target);
    if (goalAmount && goalAmount > 0) {
      const currentBalance = Math.max(0, causeJarBalances?.[target.id] ?? 0);
      const nextBalance = currentBalance + appliedAmount;
      const percent = Math.min(100, Math.round((nextBalance / goalAmount) * 100));
      return `${formatCurrency(nextBalance)} in this jar - about ${percent}% of your ${formatCurrency(goalAmount)} goal.`;
    }
    if (project?.unitCost && project.unitCost > 0) {
      return `That is about ${formatAggregateImpactUnitsDecimal(
        appliedAmount,
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
      const preview = await response.json() as ProductPreview;
      const updates: Partial<SpendingGoal> = {};
      if (preview.imageURL) updates.imageURL = preview.imageURL;
      if (preview.merchant) updates.merchant = preview.merchant;
      if (Object.keys(updates).length > 0) await onEditGoal(goalId, updates);
    } catch {
      // Retailers may block preview requests; the artwork fallback remains visible.
    }
  }

  async function previewProductImage() {
    if (!addLink.trim()) return;
    if (addNoShoppingLink) return;
    setProductPreviewStatus("loading");
    try {
      const response = await fetch(`/api/product-preview?url=${encodeURIComponent(normalizeExternalLink(addLink))}`);
      if (!response.ok) {
        setProductPreviewStatus("failed");
        return;
      }
      const preview = await response.json() as ProductPreview;
      let filled = 0;
      let missing = 0;
      if (preview.title && !addLabel.trim()) {
        setAddLabel(preview.title);
        filled += 1;
      } else if (!addLabel.trim()) {
        missing += 1;
      }
      if (preview.price && !addAmount.trim()) {
        setAddAmount(preview.price.toFixed(2));
        filled += 1;
      } else if (!addAmount.trim()) {
        missing += 1;
      }
      if (preview.merchant && !addMerchant.trim()) {
        setAddMerchant(preview.merchant);
        filled += 1;
      } else if (!addMerchant.trim()) {
        missing += 1;
      }
      if (preview.imageURL && addImageSource !== "manual") {
        setAddImageURL(preview.imageURL);
        setAddImagePosition({ x: 50, y: 50 });
        setAddImageSource("product");
        filled += 1;
      } else if (!addImageURL && addImageSource !== "manual") {
        missing += 1;
      }
      setProductPreviewStatus(filled > 0 && missing === 0 ? "filled" : filled > 0 ? "partial" : "failed");
    } catch {
      setProductPreviewStatus("failed");
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
    if (!addNoShoppingLink && addLink.trim()) goal.shoppingLink = normalizeExternalLink(addLink);
    if (addMerchant.trim()) goal.merchant = addMerchant.trim();
    if (addImageURL) {
      goal.imageURL = addImageURL;
      goal.imagePosition = `${addImagePosition.x}% ${addImagePosition.y}%`;
    }
    const shouldSkipForThis = addAndSkipForThis;
    const goalId = await onAddGoal(goal);
    if (goal.shoppingLink && !goal.imageURL) void enrichGoalImage(goalId, goal.shoppingLink);
    setAddLabel("");
    setAddAmount("");
    setAddCategory("");
    setAddLink("");
    setAddNoShoppingLink(false);
    setAddMerchant("");
    setAddImageURL("");
    setAddImagePosition({ x: 50, y: 50 });
    setAddImageSource(null);
    setProductPreviewStatus("idle");
    setAddImageError("");
    setAddAndSkipForThis(false);
    setShowAddForm(false);
    setSaving(false);
    if (shouldSkipForThis) {
      await handleSkipFor({ type: "goal", id: goalId });
      return;
    }
    toast.success("Reward added to your list.");
  }

  function dismissStarterIdea(presetId: string) {
    setDismissedStarterIds((current) => {
      if (current.includes(presetId)) return current;
      const next = [...current, presetId];
      window.localStorage.setItem("iskipped.dismissedRewardStarters", JSON.stringify(next));
      return next;
    });
  }

  function startAddPresetGoal(label: string, amount: number, category?: string, skipForThis = false) {
    const image = rewardDefaultImage(label, category);
    setAddLabel(label);
    setAddAmount(String(amount));
    setAddCategory(category ?? rewardCategory(label).tag);
    setAddLink("");
    setAddNoShoppingLink(false);
    setAddMerchant("");
    setAddImageURL(image ?? "");
    setAddImagePosition({ x: 50, y: 50 });
    setAddImageSource(image ? "manual" : null);
    setProductPreviewStatus("idle");
    setAddImageError("");
    setAddAndSkipForThis(skipForThis);
    setShowAddForm(true);
  }

  function startEditGoal(goal: SpendingGoal) {
    setEditingGoalId(goal.id);
    setEditLabel(goal.label);
    setEditAmount(String(goal.targetAmount));
    setEditCategory(goal.category ?? "");
    setEditLink(goal.shoppingLink ?? goal.donationURL ?? "");
  }

  function closePurchaseModal() {
    setPurchasingId(null);
    setPurchaseAmountStr("");
    setPurchaseDone(null);
    setPurchasing(false);
  }

  async function handlePurchaseLog(goal: SpendingGoal, balance: number) {
    const amount = parseFloat(purchaseAmountStr);
    if (!amount || amount <= 0) return;
    const totalAvailable = balance + availableSkipBankBalance;
    if (amount > totalAvailable) return;
    setPurchasing(true);
    const ok = await onPurchase(amount);
    setPurchasing(false);
    if (!ok) return;
    if (balance > 0 && amount >= balance) {
      setPurchaseDone("emptied");
    } else {
      setPurchaseDone("logged");
      window.setTimeout(closePurchaseModal, 1400);
    }
  }

  async function handleEditGoalSave(goalId: string, storedGoalType: "splurge" | "donation") {
    const amount = parseFloat(editAmount);
    if (!editLabel.trim() || !amount || amount <= 0) return;
    setEditWorking(true);
    const updates: Partial<SpendingGoal> = { label: editLabel.trim(), targetAmount: amount, category: editCategory.trim() || undefined };
    let shoppingLink = "";
    if (editLink.trim()) {
      if (storedGoalType === "splurge") {
        shoppingLink = normalizeExternalLink(editLink);
        updates.shoppingLink = shoppingLink;
        updates.imageURL = undefined;
      }
      else updates.donationURL = normalizeExternalLink(editLink);
    } else {
      updates.shoppingLink = undefined;
      updates.donationURL = undefined;
      if (storedGoalType === "splurge") updates.imageURL = undefined;
    }
    await onEditGoal(goalId, updates);
    if (storedGoalType === "splurge" && shoppingLink) void enrichGoalImage(goalId, shoppingLink);
    setEditingGoalId(null);
    setEditWorking(false);
  }

  return (
    <div className="space-y-4">
      {switchPrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwitchPrompt(null)}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            {switchConfirmAction ? (
              <>
                <div className="relative px-5 pt-5 pb-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                    Are you sure?
                  </p>
                  <button
                    type="button"
                    onClick={() => setSwitchConfirmAction(null)}
                    aria-label="Go back to jar switch options"
                    className="absolute right-4 top-4 text-xl font-black leading-none"
                    style={{ color: "var(--text-muted)" }}
                  >
                    x
                  </button>
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {switchConfirmAction === "move"
                      ? `This will move ${formatCurrency(switchPrompt.balance)} from ${targetLabel(switchPrompt.previous)} to ${targetLabel(switchPrompt.next)}.`
                      : `This will move ${formatCurrency(switchPrompt.balance)} from ${targetLabel(switchPrompt.previous)} to Skip Bucks.`}
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  <button
                    type="button"
                    onClick={switchConfirmAction === "move" ? confirmSwitchMoveBalance : confirmSwitchReleaseBalance}
                    disabled={jarDecisionWorking !== null}
                    className="w-full rounded-xl px-4 py-3 text-left disabled:opacity-45"
                    style={{ background: "#2ECC71", color: "#071B14" }}
                  >
                    <span className="block text-sm font-black">
                      {switchConfirmAction === "move"
                        ? (jarDecisionWorking === "move" ? "Moving balance..." : "Yes, move balance")
                        : (jarDecisionWorking === "release" ? "Moving to Skip Bucks..." : "Yes, move to Skip Bucks")}
                    </span>
                    <span className="mt-0.5 block text-xs font-bold opacity-80">
                      Then future skips will go to {targetLabel(switchPrompt.next)}.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwitchConfirmAction(null)}
                    disabled={jarDecisionWorking !== null}
                    className="w-full py-1 text-sm font-bold disabled:opacity-45"
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}
                  >
                    Go back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="relative px-5 pt-5 pb-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                    Change your active jar?
                  </p>
                  <button
                    type="button"
                    onClick={() => setSwitchPrompt(null)}
                    aria-label="Close jar switch options"
                    className="absolute right-4 top-4 text-xl font-black leading-none"
                    style={{ color: "var(--text-muted)" }}
                  >
                    x
                  </button>
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    You have {formatCurrency(switchPrompt.balance)} saved in {targetLabel(switchPrompt.previous)}. Choose where your future skips should go.
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  <button
                    type="button"
                    onClick={confirmSwitchKeepParked}
                    disabled={jarDecisionWorking !== null}
                    className="w-full rounded-xl px-4 py-3 text-left disabled:opacity-45"
                    style={{ background: "#2ECC71", color: "#071B14" }}
                  >
                    <span className="block text-sm font-black">
                      {jarDecisionWorking === "switch" ? "Changing jar..." : `Pause this jar and start skipping for ${targetLabel(switchPrompt.next)}`}
                    </span>
                    <span className="mt-0.5 block text-xs font-bold opacity-80">
                      Your {formatCurrency(switchPrompt.balance)} will stay saved in {targetLabel(switchPrompt.previous)}. Future skips will go to {targetLabel(switchPrompt.next)}.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwitchPrompt(null)}
                    disabled={jarDecisionWorking !== null}
                    className="w-full rounded-xl px-4 py-3 text-left text-sm disabled:opacity-45"
                    style={{ background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-primary)" }}
                  >
                    <span className="block text-sm font-black">
                      Keep {targetLabel(switchPrompt.previous)} as your active jar
                    </span>
                    <span className="mt-0.5 block text-xs font-bold opacity-70">
                      Future skips will continue going there.
                    </span>
                  </button>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowSwitchMoreOptions((value) => !value)}
                      disabled={jarDecisionWorking !== null}
                      aria-expanded={showSwitchMoreOptions}
                      className="flex w-full items-center justify-between py-1 text-sm font-bold disabled:opacity-45"
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}
                    >
                      <span>More options</span>
                      <span aria-hidden="true">{showSwitchMoreOptions ? "▲" : "▼"}</span>
                    </button>
                    {showSwitchMoreOptions && (
                      <div className="mt-2 space-y-2 rounded-xl p-3" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }}>
                        <button
                          type="button"
                          onClick={() => setSwitchConfirmAction("move")}
                          disabled={jarDecisionWorking !== null}
                          className="w-full rounded-lg px-3 py-2.5 text-left disabled:opacity-45"
                          style={{ background: "rgba(46,204,113,0.1)", color: "var(--text-primary)" }}
                        >
                          <span className="block text-sm font-black">
                            Move balance to new jar
                          </span>
                          <span className="mt-0.5 block text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                            Put the {formatCurrency(switchPrompt.balance)} into {targetLabel(switchPrompt.next)}.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSwitchConfirmAction("release")}
                          disabled={jarDecisionWorking !== null}
                          className="w-full rounded-lg px-3 py-2.5 text-left disabled:opacity-45"
                          style={{ background: "rgba(237,245,240,0.04)", color: "var(--text-primary)" }}
                        >
                          <span className="block text-sm font-black">
                            Move balance to Skip Bucks
                          </span>
                          <span className="mt-0.5 block text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                            Free it up to use later, then change your active jar.
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deactivatePrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setDeactivatePrompt(null)}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="relative px-5 pt-5 pb-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                {deactivatePrompt.balance > 0 ? "Pause this active jar?" : "Deactivate this jar?"}
              </p>
              <button
                type="button"
                onClick={() => setDeactivatePrompt(null)}
                aria-label="Close deactivate jar confirmation"
                className="absolute right-4 top-4 text-xl font-black leading-none"
                style={{ color: "var(--text-muted)" }}
              >
                x
              </button>
            </div>
            <div className="space-y-3 p-5">
              {deactivatePrompt.balance > 0 ? (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  You have {formatCurrency(deactivatePrompt.balance)} in {targetLabel(deactivatePrompt.target)}.
                </p>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  This jar has no saved Skip Bucks. Future skips will no longer go toward it.
                </p>
              )}
              <button
                type="button"
                onClick={() => confirmDeactivateActiveJar(false)}
                disabled={deactivating}
                className="w-full rounded-xl px-4 py-3 text-left disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                <span className="block text-sm font-black">
                  {jarDecisionWorking === "deactivate-park"
                    ? deactivatePrompt.balance > 0 ? "Pausing jar..." : "Deactivating jar..."
                    : deactivatePrompt.balance > 0 ? "Pause jar, keep balance parked" : "Deactivate jar"}
                </span>
                <span className="mt-0.5 block text-xs font-bold opacity-80">
                  {deactivatePrompt.balance > 0
                    ? "Your saved money stays in this jar for later."
                    : "Future skips will go to Skip Bucks until you pick a jar."}
                </span>
              </button>
              {deactivatePrompt.balance > 0 && (
                <button
                  type="button"
                  onClick={() => confirmDeactivateActiveJar(true)}
                  disabled={deactivating}
                  className="w-full rounded-xl px-4 py-3 text-left disabled:opacity-50"
                  style={{ background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-primary)" }}
                >
                  <span className="block text-sm font-black">
                    {jarDecisionWorking === "deactivate-release" ? "Moving balance..." : "Move balance to Skip Bucks"}
                  </span>
                  <span className="mt-0.5 block text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                    Free up the {formatCurrency(deactivatePrompt.balance)} to use anywhere.
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeactivatePrompt(null)}
                disabled={deactivating}
                className="w-full py-1 text-sm font-bold disabled:opacity-45"
                style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}
              >
                {deactivatePrompt.balance > 0 ? "Keep skipping for this" : "Keep active"}
              </button>
            </div>
          </div>
        </div>
      )}

      {donatingProject && (
        <DonationLogModal
          projectId={donatingProject.id}
          projectTitle={donatingProject.groupName ?? donatingProject.title}
          initialAmount={fundraiserJar(donatingProject)}
          donationURL={donatingProject.donationURL ?? undefined}
          donationRecipient={donatingProject.sponsor || donatingProject.groupName || donatingProject.title}
          unassignedSkipBucks={availableSkipBankBalance}
          onClose={() => setDonatingProject(null)}
        />
      )}

      {purchasingId && (() => {
        const goal = goals.find((candidate) => candidate.id === purchasingId);
        if (!goal) return null;
        const balance = Math.max(0, goalJarBalances?.[goal.id] ?? 0);
        const parsedAmount = parseFloat(purchaseAmountStr);
        const cleanAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
        const totalAvailable = balance + availableSkipBankBalance;
        const amountOverAvailable = cleanAmount > totalAvailable;
        const extraFromSkipBucks = Math.max(0, cleanAmount - balance);
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closePurchaseModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="purchase-log-title"
              className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl"
              style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
                <h2 id="purchase-log-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  {purchaseDone === "emptied" ? "Jar emptied" : "Spend my skips"}
                </h2>
                <button onClick={closePurchaseModal} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
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
                        You used everything saved in {goal.label}.
                      </p>
                    </div>
                    <p className="text-sm font-bold leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Keep this as your active jar for future skips?
                    </p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={closePurchaseModal}
                        className="w-full rounded-xl py-3 text-sm font-black"
                        style={{ background: "#8B5CF6", color: "white" }}
                      >
                        Keep this active
                      </button>
                      <button
                        type="button"
                        onClick={closePurchaseModal}
                        className="w-full rounded-xl py-3 text-sm font-black"
                        style={{ background: "rgba(237,245,240,0.05)", border: "1px solid rgba(237,245,240,0.1)", color: "var(--text-secondary)" }}
                      >
                        Pick a new jar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)" }}>
                      <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Step 1</p>
                      <p className="mt-1 text-sm font-black" style={{ color: "var(--text-primary)" }}>Buy {goal.label}</p>
                      {goal.shoppingLink ? (
                        <a
                          href={goal.shoppingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex w-full items-center justify-center rounded-xl py-3 text-sm font-black"
                          style={{ background: "#8B5CF6", color: "white", textDecoration: "none" }}
                        >
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
                      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                        After buying, log the amount here.
                      </p>
                    </div>
                    <div className="space-y-3 mb-5">
                      <div>
                        <label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: "var(--text-muted)" }}>Amount</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium" style={{ color: "var(--text-secondary)" }}>$</span>
                          <input
                            type="number"
                            min="1"
                            max={totalAvailable || undefined}
                            value={purchaseAmountStr}
                            onChange={(event) => setPurchaseAmountStr(event.target.value)}
                            placeholder="0"
                            className="w-full rounded-xl pl-8 pr-4 py-3 text-lg font-semibold focus:outline-none"
                            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                            autoFocus
                          />
                        </div>
                        <p className="mt-2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                          {formatCurrency(balance)} saved in this jar.
                        </p>
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
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePurchaseLog(goal, balance)}
                      disabled={purchasing || !purchaseAmountStr || cleanAmount < 1 || amountOverAvailable}
                      className="w-full font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ background: "#8B5CF6", color: "white" }}
                    >
                      {purchasing ? "Logging..." : "I spent this amount"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {fundraiserSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setFundraiserSetup(null)}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="relative px-5 pt-5 pb-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Skip for {fundraiserSetup.groupName ?? fundraiserSetup.title}?
              </p>
              <p className="mt-1 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                {fundraiserGroupGoalLine(fundraiserSetup)}
              </p>
              <button
                type="button"
                onClick={() => setFundraiserSetup(null)}
                className="absolute right-4 top-4 text-xl font-black leading-none"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close fundraiser setup"
              >
                x
              </button>
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

              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={fundraiserShareEmail}
                  onChange={(event) => setFundraiserShareEmail(event.target.checked)}
                  className="mt-0.5 h-3 w-3 accent-[var(--green-primary)]"
                />
                <span className="text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  Allow {fundraiserSetup.sponsor?.trim() || fundraiserSetup.groupName?.trim() || "the organizer"} to email me challenge updates. You can change this anytime.
                </span>
              </label>
              <button
                onClick={confirmFundraiserSetup}
                disabled={fundraiserSetupWorking || !fundraiserGoalStr || parseFloat(fundraiserGoalStr) <= 0}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                {fundraiserSetupWorking ? "Setting up..." : "Set goal and skip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fundingTarget && (() => {
        const fundingAccent = fundingTarget.type === "fundraiser" ? "#2ECC71" : "#8B5CF6";
        const fundingTextColor = fundingTarget.type === "fundraiser" ? "#071B14" : "white";
        const fundingMutedColor = fundingTarget.type === "fundraiser" ? "var(--green-primary)" : "#C4B5FD";
        const hasSkipBank = availableSkipBankBalance > 0;
        const fundingGoal = fundingTarget.type === "goal"
          ? goals.find((goal) => goal.id === fundingTarget.id) ?? null
          : null;
        const fundingGoalAmount = skipFundingGoalAmount(fundingTarget);
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setFundingTarget(null)}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setFundingTarget(null)} aria-label="Close" className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
              <p className="text-lg font-black leading-tight pr-6" style={{ color: "var(--text-primary)" }}>
                {hasSkipBank ? "Use existing Skip Bucks?" : fundingGoal ? `Skip for ${fundingGoal.label}?` : `Start skipping for ${skipFundingPromptLabel(fundingTarget)}?`}
              </p>
              {hasSkipBank && (
                <p className="mt-1 text-xs font-bold leading-snug" style={{ color: "var(--text-muted)" }}>
                  You have {formatCurrency(availableSkipBankBalance)} in Skip Bucks. Do you want to use any to help fill {fundingGoalAmount ? `this goal of ${formatCurrency(fundingGoalAmount)}` : skipFundingPromptLabel(fundingTarget)}?
                </p>
              )}
            </div>
            <div className="space-y-3 p-5">
              {fundingGoal && !hasSkipBank && (
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.22)" }}>
                  <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>Reward goal</p>
                  <p className="mt-1 text-sm font-black" style={{ color: "var(--text-primary)" }}>
                    {formatCurrency(fundingGoal.targetAmount)} in jar
                  </p>
                </div>
              )}
              {hasSkipBank && (
                <div className="rounded-xl p-4" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }}>
                  <p className="mb-3 text-xs font-bold leading-snug" style={{ color: "var(--text-muted)" }}>
                    Enter an amount to use.
                  </p>
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
                    <p className="text-xs font-bold leading-relaxed mt-3" style={{ color: fundingMutedColor }}>
                      {skipFundingPreview(fundingTarget, fundingAmountStr)}
                    </p>
                  )}
                  {parseFloat(fundingAmountStr) > availableSkipBankBalance && (
                    <p className="text-xs font-bold leading-relaxed mt-3" style={{ color: "#EF4444" }}>
                      That is more than your Skip Bucks. Lower the amount to {formatCurrency(availableSkipBankBalance)} or less.
                    </p>
                  )}
                  <button
                    onClick={confirmSkipBankFunding}
                    disabled={fundingWorking || !fundingAmountStr || parseFloat(fundingAmountStr) <= 0 || parseFloat(fundingAmountStr) > availableSkipBankBalance}
                    className="mt-3 w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                    style={{ background: fundingTarget.type === "fundraiser" ? "rgba(46,204,113,0.18)" : "rgba(139,92,246,0.2)", color: fundingMutedColor }}
                  >
                    {fundingWorking ? "Moving..." : "Use"}
                  </button>
                </div>
              )}
              <button
                onClick={confirmSkipBankDecline}
                disabled={fundingWorking}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={hasSkipBank
                  ? { background: "var(--bg-surface-3)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
                  : { background: fundingAccent, color: fundingTextColor }}
              >
                {fundingWorking ? "Activating..." : hasSkipBank ? "Don't use old skips" : fundingGoal ? "Skip for this reward" : "Start skipping for this"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Switch modal */}
      {switchTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwitchTarget(null)}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
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
                onClick={() => {
                  setSwitchTarget(null);
                  setShopView("rewards");
                  setShowAddForm(false);
                  setEditingGoalId(null);
                  if (activeGoalId) {
                    setPurchasingId(activeGoalId);
                    setPurchaseDone(null);
                    setPurchaseAmountStr(String(spendingBalance));
                  }
                }}
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
                Deactivating will keep your {formatCurrency(spendingBalance)} in Skip Bucks until you pick a new goal.
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

      <div className="jars-shop-tabs grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
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
          Group Fundraisers
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
              onClick={() => {
                setAddAndSkipForThis(false);
                setShowAddForm(true);
              }}
              className="shrink-0 rounded-full px-3 py-2 text-xs font-black"
              style={{ background: "white", color: "#0B1A14", border: "none" }}
            >
              + Create
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
              const isPaused = !!matchingGoal && !isActive && isPausedTarget({ type: "goal", id: matchingGoal.id });
              const balance = matchingGoal ? Math.max(0, goalJarBalances?.[matchingGoal.id] ?? 0) : 0;
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
                  <RewardArtwork label={preset.label} amount={preset.amount} category={preset.category} status={isActive ? "active" : isPaused ? "paused" : undefined} />
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>{preset.category}</div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => matchingGoal ? startEditGoal(matchingGoal) : startAddPresetGoal(preset.label, preset.amount, preset.category)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-[#8B5CF6]"
                          style={{ background: "rgba(139,92,246,0.13)", border: "1px solid rgba(139,92,246,0.36)", color: "#C4B5FD" }}
                          title={matchingGoal ? "Edit reward" : "Edit starter idea"}
                          aria-label={matchingGoal ? "Edit reward" : "Edit starter idea"}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => matchingGoal ? setDeletingGoalId(matchingGoal.id) : dismissStarterIdea(preset.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-red-500"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(248,113,113,0.32)", color: "#FCA5A5" }}
                          title={matchingGoal ? "Delete reward" : "Remove starter idea"}
                          aria-label={matchingGoal ? "Delete reward" : "Remove starter idea"}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {matchingGoal && deletingGoalId === matchingGoal.id ? (
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <p className="mb-2 text-xs text-red-400">Delete &quot;{matchingGoal.label}&quot;?</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => { onDeleteGoal(matchingGoal.id); setDeletingGoalId(null); }} className="flex-1 bg-red-500 text-white font-semibold py-1.5 rounded-lg text-xs">Delete</button>
                          <button onClick={() => setDeletingGoalId(null)} className="flex-1 text-[rgba(237,245,240,0.6)] font-semibold py-1.5 rounded-lg text-xs" style={{ border: "1px solid rgba(139,92,246,0.12)" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <RewardProgress balance={balance} target={preset.amount} active={isActive} />
                        <button
                          type="button"
                          onClick={() => matchingGoal ? handleSkipFor({ type: "goal", id: matchingGoal.id }) : startAddPresetGoal(preset.label, preset.amount, preset.category, true)}
                          disabled={saving}
                          className="mt-3 w-full rounded-lg py-2 text-center text-[10px] font-black uppercase tracking-wide disabled:opacity-60"
                          style={{ background: isActive ? "rgba(139,92,246,0.23)" : "rgba(139,92,246,0.2)", color: "#DDD6FE" }}
                        >
                          {isActive ? "Deactivate" : isPaused ? "Reactivate" : "Skip for this"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
              </div>
            </>
          )}
          {visibleSavedRewards.length > 0 && (
            <>
              {suggestedRewards.length > 0 && (
                <p className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                  Saved rewards
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {visibleSavedRewards.map((goal) => {
              const isActiveGoal = activeSkipTarget?.type === "goal" && goal.id === activeSkipTarget.id;
              const isPausedGoal = !isActiveGoal && isPausedTarget({ type: "goal", id: goal.id });
              const balance = Math.max(0, goalJarBalances?.[goal.id] ?? 0);
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
                  <RewardArtwork label={goal.label} amount={goal.targetAmount} link={goal.shoppingLink} imageURL={goal.imageURL} imagePosition={goal.imagePosition} category={goal.category} status={isActiveGoal ? "active" : isPausedGoal ? "paused" : undefined} />
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
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[10px] font-black uppercase tracking-wide" style={{ color: "#C4B5FD" }}>
                          {goal.category || "Personal reward"}
                        </p>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => { startEditGoal(goal); setDeletingGoalId(null); }}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-[#8B5CF6]"
                            style={{ background: "rgba(139,92,246,0.13)", border: "1px solid rgba(139,92,246,0.36)", color: "#C4B5FD" }}
                            title="Edit reward"
                            aria-label="Edit reward"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => setDeletingGoalId(goal.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-red-500"
                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(248,113,113,0.32)", color: "#FCA5A5" }}
                            title="Delete reward"
                            aria-label="Delete reward"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <RewardProgress balance={balance} target={goal.targetAmount} active={isActiveGoal} />
                      <div className="mt-3 flex gap-2">
                        {isActiveGoal ? (
                          <button
                            type="button"
                            onClick={() => handleSkipFor({ type: "goal", id: goal.id })}
                            className="jars-card-action flex-1 rounded-lg py-2 text-center text-[10px] font-black uppercase tracking-wide transition-colors hover:bg-[rgba(139,92,246,0.3)]"
                            style={{ background: "rgba(139,92,246,0.23)", color: "#DDD6FE" }}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSkipFor({ type: "goal", id: goal.id })}
                            className="jars-card-action flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide transition-colors hover:bg-[rgba(139,92,246,0.26)]"
                            style={{ background: "rgba(139,92,246,0.17)", color: "#C4B5FD" }}
                          >
                            {isPausedGoal ? "Reactivate" : "Skip for this"}
                          </button>
                        )}
                        {balance > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPurchasingId(goal.id);
                              setPurchaseDone(null);
                              setPurchaseAmountStr(String(balance));
                            }}
                            className="jars-card-action flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide"
                            style={{ background: "rgba(237,245,240,0.06)", border: "1px solid rgba(139,92,246,0.38)", color: "#C4B5FD" }}
                          >
                            Spend my skips
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            </>
          )}

          {endedFundraisers.length > 0 && (
            <div className="mt-6 rounded-2xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(245,158,11,0.32)" }}>
              <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#F59E0B" }}>Ended fundraisers</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Choose whether to donate your saved balance or return it to Skip Bucks.
              </p>
              <div className="mt-4 space-y-4">
                {endedFundraisers.map((project) => {
                  const balance = fundraiserJar(project);
                  return (
                    <div key={project.id} className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{project.groupName ?? project.title}</p>
                          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{formatCurrency(balance)} saved · fundraiser ended</p>
                        </div>
                        <span className="rounded-full px-2 py-1 text-[10px] font-black uppercase" style={{ background: "rgba(245,158,11,0.14)", color: "#F59E0B" }}>Ended</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDonatingProject(project)}
                          className="flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: "#F59E0B", color: "#0B1A14" }}
                        >Donate my skips</button>
                        <button
                          type="button"
                          disabled={jarDecisionWorking !== null}
                          onClick={async () => {
                            setJarDecisionWorking("release");
                            try {
                              const releasedAmount = await onReleaseJar({ type: "fundraiser", id: project.id });
                              if (releasedAmount > 0) toast.success(`${formatCurrency(releasedAmount)} moved back to Skip Bucks.`);
                            } catch (err) {
                              console.error("release ended fundraiser failed", err);
                              toast.error("Couldn’t move that balance — check your connection and try again.");
                            } finally {
                              setJarDecisionWorking(null);
                            }
                          }}
                          className="flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide disabled:opacity-50"
                          style={{ border: "1px solid rgba(245,158,11,0.4)", color: "#F59E0B" }}
                        >{jarDecisionWorking === "release" ? "Moving…" : "Move to Skip Bucks"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {shopView === "fundraisers" && (
        <div className="mt-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#2ECC71" }}>Group Fundraisers</p>
            <button
              type="button"
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
                const isPausedFundraiser = !isActiveFundraiser && isPausedTarget({ type: "fundraiser", id: project.id });
                const groupGoal = project.goalAmount ?? 0;
                const ownJarBalance = Math.max(0, causeJarBalances?.[project.id] ?? 0);
                const groupRaised = groupProgress[project.id] ?? Math.max(0, (project.totalDonated ?? 0) + ownJarBalance);
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
                        <div className="relative flex items-start justify-end gap-2">
                          {(isActiveFundraiser || isPausedFundraiser) && (
                            <div className="absolute left-0 top-0">
                              <JarStatusBadge status={isActiveFundraiser ? "active" : "paused"} />
                            </div>
                          )}
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

                      {unitCostLabel(project) && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Unit cost</p>
                          <p className="mt-0.5 text-sm font-black" style={{ color: "var(--text-primary)" }}>
                            {unitCostLabel(project)}
                          </p>
                        </div>
                      )}

                      <div>
                        <div>
                          <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wide" style={{ color: "#7DD3FC" }}>
                            <span>{formatCurrency(groupRaised)} saved</span>
                            <span>
                              {groupGoal > 0
                                ? `${formatCurrency(groupGoal)} goal`
                                : `${groupPct}%`}
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "rgba(125,211,252,0.12)" }}>
                            <div className="h-full rounded-full" style={{ width: `${groupPct}%`, background: "#2BBAA4" }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSkipFor({ type: "fundraiser", id: project.id })}
                          className="jars-card-action flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: isActiveFundraiser ? "#2ECC71" : "rgba(46,204,113,0.16)", color: isActiveFundraiser ? "#071B14" : "#A7F3D0" }}
                        >
                          {isActiveFundraiser ? "Deactivate" : isPausedFundraiser ? "Reactivate" : "Skip for this"}
                        </button>
                        {ownJarBalance > 0 && (
                          <button
                            type="button"
                            onClick={() => setDonatingProject(project)}
                            className="jars-card-action flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wide"
                            style={{ background: "rgba(237,245,240,0.06)", border: "1px solid rgba(46,204,113,0.32)", color: "#A7F3D0" }}
                          >
                            Donate my skips
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/challenges/${project.id}`)}
                          className="jars-card-action rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide"
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

      {shopView === "fundraisers" && showFundraiserForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => { setShowFundraiserForm(false); resetFundraiserForm(); }}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(46,204,113,0.34)" }} onClick={(event) => event.stopPropagation()}>
            <div className="relative px-5 py-4 pr-12" style={{ borderBottom: "1px solid var(--border-default)" }}>
              <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>Create a fundraiser</p>
              <p className="mt-1 text-xs font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Add the basics now. You can share or manage details after it is created.
              </p>
              <button
                type="button"
                onClick={() => { setShowFundraiserForm(false); resetFundraiserForm(); }}
                className="absolute right-4 top-4 text-xl font-black leading-none"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close create fundraiser"
              >
                x
              </button>
            </div>
            <div className="space-y-3 p-5">
              <input
                type="text"
                placeholder="Fundraiser name"
                value={fundraiserTitle}
                onChange={(event) => setFundraiserTitle(event.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                autoFocus
              />
              <input
                type="text"
                placeholder="Organizer or charity"
                value={fundraiserOrganizer}
                onChange={(event) => setFundraiserOrganizer(event.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                <input
                  type="number"
                  min="1"
                  placeholder="Fundraiser goal"
                  value={fundraiserGoalAmount}
                  onChange={(event) => setFundraiserGoalAmount(event.target.value)}
                  className="w-full rounded-xl py-3 pl-8 pr-4 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
              </div>
              <input
                type="url"
                placeholder="Donation link (optional)"
                value={fundraiserDonationLink}
                onChange={(event) => setFundraiserDonationLink(event.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
              <textarea
                placeholder="What will this support? (optional)"
                value={fundraiserDescription}
                onChange={(event) => setFundraiserDescription(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
              <p className="text-[10px] font-bold leading-relaxed" style={{ color: "var(--text-muted)" }}>
                iSkipped helps track motivation and saved skips. Donations happen outside iSkipped.
              </p>
              <button
                type="button"
                onClick={() => void handleCreateFundraiser()}
                disabled={creatingFundraiser || !fundraiserTitle.trim() || !fundraiserGoalAmount || parseFloat(fundraiserGoalAmount) <= 0}
                className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                {creatingFundraiser ? "Creating..." : "Create fundraiser"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom goal form */}
      {shopView === "rewards" && showAddForm && (
        <div className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(139,92,246,0.35)" }}>
          <div className="p-4" style={{ background: "linear-gradient(120deg, rgba(139,92,246,0.18), rgba(15,118,110,0.08))" }}>
            <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#C4B5FD" }}>Save a reward</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {addAndSkipForThis ? "Customize this idea before making it your active jar." : "What would feel good to say yes to later?"}
            </p>
          </div>
          <div className="space-y-3 p-4">
          <div>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="Paste product link"
                value={addLink}
                disabled={addNoShoppingLink}
                onChange={(e) => {
                  setAddLink(e.target.value);
                  setProductPreviewStatus("idle");
                  if (addImageSource === "product") {
                    setAddImageURL("");
                    setAddImageSource(null);
                  }
                }}
                onBlur={() => void previewProductImage()}
                className="min-w-0 flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none disabled:opacity-50" style={{ background: "var(--bg-surface-2)", border: "1px solid rgba(139,92,246,0.4)", color: "var(--text-primary)" }}
              />
              <button
                type="button"
                onClick={() => void previewProductImage()}
                disabled={addNoShoppingLink || !addLink.trim() || productPreviewStatus === "loading"}
                className="rounded-xl px-4 py-3 text-sm font-black disabled:opacity-50"
                style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.35)", color: "#DDD6FE" }}
              >
                {productPreviewStatus === "loading" ? "Checking..." : "Autofill"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !addNoShoppingLink;
                setAddNoShoppingLink(next);
                setProductPreviewStatus("idle");
                if (next) {
                  setAddLink("");
                  if (addImageSource === "product") {
                    setAddImageURL("");
                    setAddImageSource(null);
                  }
                }
              }}
              className="mt-2 text-xs font-black"
              style={{ color: addNoShoppingLink ? "#C4B5FD" : "var(--text-muted)" }}
            >
              {addNoShoppingLink ? "No shopping link selected" : "No shopping link"}
            </button>
            {productPreviewStatus === "loading" && (
              <p className="mt-2 text-xs font-bold" style={{ color: "#C4B5FD" }}>
                Product loading... we&apos;ll fill what we can.
              </p>
            )}
            {productPreviewStatus === "filled" && (
              <p className="mt-2 text-xs font-bold" style={{ color: "#A7F3D0" }}>
                Autofilled from the link. You can edit anything before saving.
              </p>
            )}
            {productPreviewStatus === "partial" && (
              <p className="mt-2 text-xs font-bold" style={{ color: "#FBBF24" }}>
                We found some details from this link. Add anything missing below.
              </p>
            )}
            {productPreviewStatus === "failed" && (
              <p className="mt-2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                We couldn&apos;t autofill this link. Fill in the reward details below.
              </p>
            )}
          </div>
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
          <input
            type="text"
            placeholder="Merchant (optional), e.g. Target"
            value={addMerchant}
            onChange={(e) => setAddMerchant(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em]" style={{ color: "#C4B5FD" }}>Inspo pic</p>
            <div
              className="relative flex aspect-[1.35] w-full max-w-md select-none items-center justify-center overflow-hidden rounded-xl"
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
              {saving ? "Saving..." : addAndSkipForThis ? "Save and skip for this" : "Save to wishlist"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddLabel(""); setAddAmount(""); setAddCategory(""); setAddLink(""); setAddNoShoppingLink(false); setAddMerchant(""); setAddImageURL(""); setAddImagePosition({ x: 50, y: 50 }); setAddImageSource(null); setProductPreviewStatus("idle"); setAddImageError(""); setAddAndSkipForThis(false); }}
              className="px-5 py-3 text-[rgba(237,245,240,0.6)] font-semibold rounded-xl text-sm hover:text-[#EDF5F0] transition-colors"
              style={{ border: "1px solid rgba(139,92,246,0.12)" }}
            >
              Cancel
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
