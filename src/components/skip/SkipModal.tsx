"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAuthStore } from "@/store/authStore";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { getActiveSkipTarget } from "@/lib/utils/skipTargets";
import { formatAggregateImpactUnitsDecimal, formatUnits, oneUnitPhrase } from "@/lib/utils/impact";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { appendRefParam, getChallengeSharePath } from "@/lib/utils/share";
import { getChallengeCausePhrase, getPostSkipShareText } from "@/lib/utils/challengeShareCopy";
import { ShareButton } from "@/components/share/ShareButton";
import { SkipSetupPrompt } from "@/components/setup/SkipSetupPrompt";
import type { Project } from "@/lib/types/models";

interface Props {
  onClose: () => void;
}
type SuccessMoment =
  | "personal"
  | "goal-progress"
  | "goal-ready"
  | "fundraiser"
  | "milestone"
  | "skip-bank"
  | "lifetime"
  | "future";

type SuccessButtonAction = "share" | "pick-jar" | "donate";
type VariableReward = {
  id: string;
  rotationKey?: string;
  message: string;
  ctaPrompt: string;
  buttonLabel: string;
  buttonAction: SuccessButtonAction;
  shareMessage: string;
  accent: string;
  effect?: "confetti" | "fireworks";
};

function formatSuccessImpactUnits(
  amount: number,
  unitCost: number,
  unitName: string,
  unitDisplay?: string | null,
  unitIsGoal?: boolean,
): string {
  const displayOverride = unitName ? null : unitDisplay;
  return formatAggregateImpactUnitsDecimal(amount, unitCost, unitName, displayOverride, unitIsGoal).toLowerCase();
}

export function SkipModal({ onClose }: Props) {
  const router = useRouter();
  const { log, isLogging, recentSkips } = useSkips();
  const { projects } = useProjects();
  const { profile } = useAuthStore();

  const defaultCat = SKIP_CATEGORIES[0];
  const [selectedCat, setSelectedCat] = useState(defaultCat);
  const [amount, setAmount] = useState(0);
  const [amountStr, setAmountStr] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [whatSkipped, setWhatSkipped] = useState("");
  const [shareWithCommunity, setShareWithCommunity] = useState(profile?.shareSkipsByDefault !== false);
  const shareToggleTouchedRef = useRef(false);
  const resolvedActiveTarget = profile ? getActiveSkipTarget(profile) : null;
  const selectedFundraiserId = resolvedActiveTarget?.type === "fundraiser"
    ? resolvedActiveTarget.id
    : resolvedActiveTarget?.type === "goal"
      ? null
      : profile?.activeProjectId ?? null;
  const projectId = selectedFundraiserId;
  const [success, setSuccess] = useState(false);
  const [successProject, setSuccessProject] = useState<Project | null>(null);
  const [successProjectUnitName, setSuccessProjectUnitName] = useState<string | null>(null);
  const [successProjectUnitDisplay, setSuccessProjectUnitDisplay] = useState<string | null>(null);
  const [successProjectUnitCost, setSuccessProjectUnitCost] = useState<number | null>(null);
  const [successOverflowCount, setSuccessOverflowCount] = useState<number | undefined>(undefined);
  const [successJarBalance, setSuccessJarBalance] = useState(0);
  const [successSkipBank, setSuccessSkipBank] = useState(0);
  const [successLifetimeSaved, setSuccessLifetimeSaved] = useState(0);
  const [successGroupTotal, setSuccessGroupTotal] = useState(0);
  const [successLargestSkip, setSuccessLargestSkip] = useState(0);
  const [successMoment, setSuccessMoment] = useState<SuccessMoment>("personal");
  const [successStreak, setSuccessStreak] = useState(0);
  const [successSkipCount, setSuccessSkipCount] = useState(0);
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);
  const dialogRef = useModalA11y(onClose);
  const selectedVariableRewardRef = useRef<{ skipCount: number; reward: VariableReward } | null>(null);
  const activeProjectForSkip = projects.find((p) => p.id === projectId) ?? null;
  const skipAllocationTarget = resolvedActiveTarget
    ?? (activeProjectForSkip ? { type: "fundraiser" as const, id: activeProjectForSkip.id } : null);
  const isFundraiserSkip = skipAllocationTarget?.type === "fundraiser" && !!activeProjectForSkip;
  // If the active project has expired, don't credit this skip to its jar
  const effectiveProjectId = activeProjectForSkip && getChallengeCountdown(activeProjectForSkip).isExpired
    ? null
    : projectId;

  useEffect(() => {
    if (!shareToggleTouchedRef.current) {
      setShareWithCommunity(profile?.shareSkipsByDefault !== false);
    }
  }, [profile?.shareSkipsByDefault]);

  function handleCatSelect(cat: typeof defaultCat) {
    setSelectedCat(cat);
    setCustomLabel("");
  }

  async function handleSubmit() {
    const selectedProject = projects.find((p) => p.id === projectId);
    const { goals: availableGoals, activeId: activeGoalId } = normalizeSpendingGoals(profile ?? {} as any);
    const activeGoal = availableGoals.find((goal) => goal.id === activeGoalId) ?? null;
    const skipBankBefore = Math.max(
      0,
      (profile?.totalSaved ?? 0) - (profile?.totalSpent ?? 0) - (profile?.totalDonated ?? 0)
    );
    const projectedSkipBank = Math.max(
      0,
      skipBankBefore + amount
    );

    // Pre-compute jar-full state synchronously using same formula as jars page
    const activeTarget = skipAllocationTarget;
    const personalGoal = activeTarget?.type === "goal"
      ? availableGoals.find((goal) => goal.id === activeTarget.id)?.targetAmount ?? 0
      : 0;
    const currentJarBal = activeTarget?.type === "fundraiser"
      ? profile?.causeJarBalances?.[activeTarget.id] ?? 0
      : activeTarget?.type === "goal"
        ? profile?.goalJarBalances?.[activeTarget.id] ?? 0
        : 0;
    const expectedJarBal = Math.max(0, currentJarBal) + amount;
    const willBeFull = activeTarget?.type === "goal" && personalGoal > 0
      && expectedJarBal >= personalGoal;
    const nextOverflowCount = willBeFull
      ? (profile?.causeJarOverflowCounts?.[activeTarget.id] ?? 0) + 1
      : 0;

    const result = await log({
      category: selectedCat.id,
      categoryLabel: customLabel || selectedCat.label,
      categoryEmoji: selectedCat.emoji,
      amount,
      projectId: effectiveProjectId,
      projectTitle: selectedProject?.title ?? null,
      projectLocation: selectedProject?.location ?? null,
      projectUnitName: selectedProject?.unitName ?? null,
      projectUnitCost: selectedProject?.unitCost ?? null,
      projectUnitDisplay: selectedProject?.unitDisplay ?? null,
      projectUnitIsGoal: selectedProject?.unitIsGoal ?? null,
      shareWithCommunity: isFundraiserSkip && shareWithCommunity,
      whatSkipped: whatSkipped || undefined,
      causeGoalAmount: personalGoal,
      allocationTarget: skipAllocationTarget,
    });
    if (result) {
      setSuccessStreak(result.newStreak ?? profile?.streak ?? 0);
      setSuccessProject(effectiveProjectId ? selectedProject ?? null : null);
      setSuccessProjectUnitName(selectedProject?.unitName ?? null);
      setSuccessProjectUnitDisplay(selectedProject?.unitDisplay ?? null);
      setSuccessProjectUnitCost(selectedProject?.unitCost ?? null);
      setSuccessJarBalance(expectedJarBal);
      setSuccessGroupTotal(selectedProject
        ? Math.max(
            0,
            (selectedProject.totalDonated ?? 0) +
              (profile?.causeJarBalances?.[selectedProject.id] ?? 0) +
              amount
          )
        : 0);
      setSuccessLargestSkip(Math.max(amount, ...recentSkips.filter((skip) => skip.projectId === effectiveProjectId).map((skip) => skip.amount)));
      setSuccessSkipBank(projectedSkipBank);
      setSuccessLifetimeSaved((profile?.totalSaved ?? 0) + amount);
      const nextSkipCount = (profile?.totalSkips ?? 0) + 1;
      setSuccessSkipCount(nextSkipCount);
      const goalTarget = activeGoal?.targetAmount ?? 0;
      const goalJustReached = goalTarget > 0
        && skipBankBefore < goalTarget
        && projectedSkipBank >= goalTarget;
      const goalCoverageBefore = goalTarget > 0 ? (skipBankBefore / goalTarget) * 100 : 0;
      const goalCoverageAfter = goalTarget > 0 ? (projectedSkipBank / goalTarget) * 100 : 0;
      const goalProgressMilestoneHit = [25, 50, 75].some((threshold) =>
        goalCoverageBefore < threshold && goalCoverageAfter >= threshold
      );
      const hasFundraiser = Boolean(
        selectedProject?.unitCost && selectedProject.unitCost > 0
      );
      const rotatingMoments: SuccessMoment[] = [
        "fundraiser",
        "skip-bank",
        "future",
        "lifetime",
        "personal",
      ];
      const eligibleMoments = rotatingMoments.filter((moment) =>
        moment !== "fundraiser" || hasFundraiser
      );
      const rotatingMoment =
        eligibleMoments[(nextSkipCount - 1) % eligibleMoments.length] ?? "personal";

      if (goalJustReached) {
        setSuccessMoment("goal-ready");
      } else if (goalProgressMilestoneHit) {
        setSuccessMoment("goal-progress");
      } else if (nextSkipCount % 5 === 0) {
        setSuccessMoment("milestone");
      } else {
        setSuccessMoment(rotatingMoment);
      }
      if (willBeFull) {
        setSuccessOverflowCount(nextOverflowCount);
      }
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([12, 28, 18]);
      }
      setSuccess(true);
    }
  }

  if (success) {
    const successActiveProject = successProject
      ?? projects.find((p) => p.id === selectedFundraiserId)
      ?? projects.find((p) => p.id === profile?.activeProjectId)
      ?? null;
    const postLogSkipCount = successSkipCount || (profile?.totalSkips ?? 0);

    function dismissSuccess() {
      if (postLogSkipCount === 1) {
        setShowSetupPrompt(true);
        return;
      }
      onClose();
    }

    if (showSetupPrompt) {
      return <SkipSetupPrompt mode="modal" onClose={onClose} />;
    }

    // Build the success hero around the concrete transformation this skip becomes.
    const itemLabel = whatSkipped || customLabel || selectedCat.label.toLowerCase();
    const { goals: successGoals, activeId: successActiveGoalId } = normalizeSpendingGoals(profile ?? {} as any);
    const activeGoal = successGoals.find((goal) => goal.id === successActiveGoalId) ?? null;
    const recentLargestSkip = Math.max(
      0,
      ...recentSkips.filter((skip) => skip.projectId === (successActiveProject?.id ?? null)).map((skip) => skip.amount)
    );
    const successHighlight = successMoment === "milestone" && successStreak > 1
      ? "streak"
      : amount > recentLargestSkip && amount > 0
        ? "largest"
        : postLogSkipCount % 10 === 0
          ? "skip-number"
          : null;
    const shareURL = successActiveProject
      ? appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}${getChallengeSharePath(successActiveProject)}`, profile?.uid)
      : "https://iskipped.com";

    // Show the jar-full celebration when a fundraiser jar hits/exceeds its goal.
    const overflowCount = successOverflowCount ?? 0;
    const showJarFull = successActiveProject != null && overflowCount >= 1 && (overflowCount === 1 || (overflowCount - 1) % 3 === 0);

    if (showJarFull && successActiveProject) {
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={dismissSuccess}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-jarfull-title"
            tabIndex={-1}
            className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={dismissSuccess} aria-label="Close" className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            <div className="text-6xl mb-3">🫙</div>
            <p id="skip-jarfull-title" className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Fundraiser Jar Full!</p>
            <p className="font-bold text-lg mt-1" style={{ color: "#2ECC71" }}>Congratulations!</p>
            <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
              You&apos;ve pledged 100% of your <strong style={{ color: "var(--text-primary)" }}>{successActiveProject.title}</strong>{" "}fundraiser jar.
              It&apos;s time to empty your jar and send it over!
            </p>
            <p className="text-sm mt-2 font-semibold" style={{ color: "#2ECC71" }}>
              {formatCurrency(successJarBalance)} ready to donate
            </p>
            <button
              onClick={() => { onClose(); router.push("/jars?tab=cause"); }}
              className="mt-5 w-full font-bold py-3 rounded-xl text-sm"
              style={{ background: "#2ECC71", color: "#0B1A14", border: "none", cursor: "pointer", fontSize: 15 }}
            >
              Donate Now →
            </button>
            <button
              onClick={dismissSuccess}
              className="mt-2 w-full py-2 text-sm"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      );
    }

    // Retained for compatibility with the old nudge flow; it is intentionally disabled.
    const showCauseNudge = false;

    if (showCauseNudge) {
      const nudgeCfc = projects.find((p) => p.id === "cfc");
      const nudgePalestine = projects.find((p) => p.id === "stm-palestine");
      const nudgeUkraine = projects.find((p) => p.id === "stm-ukraine");
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={dismissSuccess}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-nudge-title"
            tabIndex={-1}
            className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={dismissSuccess} aria-label="Close" className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            <div className="text-6xl mb-3">🌍</div>
            <p id="skip-nudge-title" className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Your skips can change lives</p>
            <p className="font-bold text-lg mt-1" style={{ color: "var(--green-primary)" }}>{formatCurrency(amount)} saved</p>
            <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
              You could pledge {formatCurrency(amount)} from this skip toward:
            </p>
            <ul className="text-left mt-2 space-y-1" style={{ color: "var(--text-secondary)", fontSize: 13, paddingLeft: 20 }}>
              {nudgeCfc?.unitCost && <li>{formatUnits(amount, nudgeCfc.unitCost, nudgeCfc.unitName!)} in {nudgeCfc.location}</li>}
              {nudgePalestine?.unitCost && <li>{formatUnits(amount, nudgePalestine.unitCost, nudgePalestine.unitName!)} in Palestine</li>}
              {nudgeUkraine?.unitCost && <li>{formatUnits(amount, nudgeUkraine.unitCost, nudgeUkraine.unitName!)} in Ukraine</li>}
            </ul>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>...amongst many other things.</p>
            <button
              onClick={() => { onClose(); router.push("/jars?tab=cause"); }}
              className="mt-5 w-full font-bold py-3 rounded-xl text-sm"
              style={{ background: "#2BBAA4", color: "#fff", border: "none", cursor: "pointer", fontSize: 15 }}
            >
              Pick a cause →
            </button>
            <button
              onClick={dismissSuccess}
              className="mt-2 w-full py-2 text-sm"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      );
    }

    function ordinal(value: number) {
      const mod100 = value % 100;
      if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
      switch (value % 10) {
        case 1: return `${value}st`;
        case 2: return `${value}nd`;
        case 3: return `${value}rd`;
        default: return `${value}th`;
      }
    }

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfWeekIso = startOfWeek.toISOString().slice(0, 10);
    const weeklySkipCount = 1 + recentSkips.filter((skip) => skip.date >= startOfWeekIso).length;
    const isFirstSkip = postLogSkipCount === 1;
    const milestoneNumbers = new Set([5, 10, 15, 25, 30, 40, 50]);
    const isSkipMilestone = milestoneNumbers.has(postLogSkipCount) || (postLogSkipCount > 50 && postLogSkipCount % 10 === 0);
    const isLargeSkip = amount > 50;

    const goalTarget = activeGoal?.targetAmount ?? 0;
    const rewardCoverage = goalTarget > 0 ? Math.min(100, Math.round((successJarBalance / goalTarget) * 100)) : 0;
    const rewardCoverageBefore = goalTarget > 0 ? Math.min(100, Math.round((Math.max(0, successJarBalance - amount) / goalTarget) * 100)) : 0;
    const rewardRemaining = Math.max(0, goalTarget - successJarBalance);
    const hasGoalMoment = goalTarget > 0 && activeGoal != null;
    const hasFundraiserMoment = successActiveProject != null;
    const momentType = successActiveProject
      ? "fundraiser"
      : (successMoment === "goal-progress" || successMoment === "goal-ready") && !hasGoalMoment
      ? "personal"
        : successMoment === "fundraiser" && !hasFundraiserMoment
        ? "personal"
        : successMoment;
    const fundraiserShareName = successActiveProject
      ? `${(successActiveProject.groupName ?? successActiveProject.title).replace(/[.!?]+$/g, "").trim()} fundraiser`
      : "this fundraiser";
    const fundraiserPersonalGoal = successActiveProject
      ? profile?.causeGoalAmounts?.[successActiveProject.id] ?? successActiveProject.goalAmount ?? 0
      : 0;
    const fundraiserPersonalCoverage = fundraiserPersonalGoal > 0
      ? Math.min(100, Math.round((successJarBalance / fundraiserPersonalGoal) * 100))
      : 0;
    const fundraiserGroupGoal = successActiveProject?.goalAmount ?? 0;
    const fundraiserGroupCoverage = fundraiserGroupGoal > 0
      ? Math.min(100, Math.round((successGroupTotal / fundraiserGroupGoal) * 100))
      : 0;
    const unitLabel = successProjectUnitName || successProjectUnitDisplay || "unit";
    const unitShare = successProjectUnitCost ? amount / successProjectUnitCost : 0;
    const unitPercent = successProjectUnitCost ? Math.max(1, Math.round(unitShare * 100)) : 0;
    const unitPhrase = successProjectUnitCost
      ? formatSuccessImpactUnits(
          amount,
          successProjectUnitCost,
          unitLabel,
          successProjectUnitDisplay,
          successActiveProject?.unitIsGoal
        )
      : "impact";
    const rewardShareCopy = activeGoal
      ? `I skipped ${itemLabel} and put ${formatCurrency(amount)} toward ${activeGoal.label}. Join me on iSkipped and start saving for your own goal.`
      : `I skipped ${itemLabel} and saved ${formatCurrency(amount)}. Want to see what you can save? Join me on iSkipped!`;
    const causeShareCopy = successActiveProject
      ? getPostSkipShareText(successActiveProject, itemLabel, amount)
      : `I skipped ${itemLabel} and saved ${formatCurrency(amount)}. Want to see what you can save? Join me on iSkipped!`;

    function chooseVariableReward(candidates: VariableReward[], fallback: VariableReward): VariableReward {
      const pool = [fallback, ...candidates];
      if (selectedVariableRewardRef.current?.skipCount === postLogSkipCount) {
        return selectedVariableRewardRef.current.reward;
      }
      const legacyLastId = typeof window !== "undefined"
        ? window.localStorage.getItem("iskip:last-variable-reward-id")
        : null;
      const legacyLastKey = legacyLastId?.includes("weekly-success") ? "weekly-success" : legacyLastId;
      let recentKeys: string[] = [];
      if (typeof window !== "undefined") {
        try {
          const parsedRecentKeys = JSON.parse(window.localStorage.getItem("iskip:recent-variable-reward-keys") || "[]");
          recentKeys = Array.isArray(parsedRecentKeys) ? parsedRecentKeys.filter((key) => typeof key === "string") : [];
        } catch {
          recentKeys = [];
        }
      }
      if (recentKeys.length === 0 && legacyLastKey) {
        recentKeys = [legacyLastKey];
      }
      const nonRecentPool = pool.filter((candidate) => !recentKeys.includes(candidate.rotationKey ?? candidate.id));
      const lastKey = recentKeys[0] ?? null;
      const nonLastPool = lastKey
        ? pool.filter((candidate) => (candidate.rotationKey ?? candidate.id) !== lastKey)
        : pool;
      const selectedPool = nonRecentPool.length > 0
        ? nonRecentPool
        : nonLastPool.length > 0
          ? nonLastPool
          : pool;
      const reward = selectedPool[Math.floor(Math.random() * selectedPool.length)] ?? fallback;
      selectedVariableRewardRef.current = { skipCount: postLogSkipCount, reward };
      if (typeof window !== "undefined") {
        const rewardKey = reward.rotationKey ?? reward.id;
        const nextRecentKeys = [rewardKey, ...recentKeys.filter((key) => key !== rewardKey)].slice(0, 2);
        window.localStorage.setItem("iskip:last-variable-reward-id", reward.id);
        window.localStorage.setItem("iskip:recent-variable-reward-keys", JSON.stringify(nextRecentKeys));
      }
      return reward;
    }

    function buildVariableReward(): VariableReward {
      if (momentType === "fundraiser" && successActiveProject) {
        if (fundraiserPersonalGoal > 0 && fundraiserPersonalCoverage >= 100) {
          return {
            id: "cause-personal-goal-hit",
            message: "You hit your savings goal. Time to turn those skips into real-world impact.",
            ctaPrompt: "Turn your skips into real-world impact",
            buttonLabel: "Donate",
            buttonAction: "donate",
            shareMessage: "",
            accent: "var(--green-primary)",
            effect: "confetti",
          };
        }
        if (fundraiserGroupGoal > 0 && fundraiserGroupCoverage >= 100) {
          return {
            id: "cause-group-goal-hit",
            message: "The group hit the goal. Time to turn these saved skips into real-world impact.",
            ctaPrompt: "Turn your skips into real-world impact",
            buttonLabel: "Donate",
            buttonAction: "donate",
            shareMessage: "",
            accent: "var(--green-primary)",
            effect: "confetti",
          };
        }
        if (isFirstSkip) {
          return {
            id: "all-first-skip",
            message: `First one in. You passed on ${itemLabel} and gave this cause momentum.`,
            ctaPrompt: "Share your first win",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: `I just skipped ${itemLabel} and saved ${formatCurrency(amount)}. Join me on iSkipped to see how much we can save.`,
            accent: "var(--green-primary)",
            effect: "confetti",
          };
        }
        if (isSkipMilestone) {
          return {
            id: "all-skip-milestone",
            message: `That's your ${ordinal(postLogSkipCount)} skip. You're turning ordinary expenses into something more meaningful.`,
            ctaPrompt: "Share your milestone",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: `I just hit ${postLogSkipCount} skips on iSkipped. Small choices are adding up.`,
            accent: "#F59E0B",
            effect: "fireworks",
          };
        }
        const candidates: VariableReward[] = [];
        if (isLargeSkip) {
          candidates.push({
            id: "cause-large-skip",
            message: successProjectUnitCost
              ? `That was a big skip. Your savings are now moving toward ${successActiveProject.title}.`
              : `One skip saved ${formatCurrency(amount)} for ${successActiveProject.title}. That's a huge win.`,
            ctaPrompt: "Share your big win",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: successProjectUnitCost
              ? `I skipped ${itemLabel} and saved enough to fund ${unitPhrase}. Want to skip with the ${fundraiserShareName}?`
              : causeShareCopy,
            accent: "#F59E0B",
            effect: "fireworks",
          });
        }
        if (fundraiserGroupGoal > 0 && fundraiserGroupCoverage >= 85) {
          candidates.push({
            id: "cause-group-finish-line",
            message: `The group is ${fundraiserGroupCoverage}% of the way there. A few more skips can finish this.`,
            ctaPrompt: "Rally others to help finish it",
            buttonLabel: "Invite Friends",
            buttonAction: "share",
            shareMessage: `Our group is almost at the goal for the ${fundraiserShareName}. Join us on iSkipped and help finish it.`,
            accent: "var(--green-primary)",
          });
        }
        if (fundraiserPersonalGoal > 0 && fundraiserPersonalCoverage >= 85) {
          candidates.push({
            id: "cause-personal-finish-line",
            message: `You're ${fundraiserPersonalCoverage}% of the way to your goal. Let's cross the finish line.`,
            ctaPrompt: "Share your progress",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: `I've skipped over ${formatCurrency(successJarBalance)} of expenses and I'm almost at my savings goal for the ${fundraiserShareName}. Join me on iSkipped.`,
            accent: "var(--green-primary)",
          });
        }
        if (weeklySkipCount >= 2) {
          candidates.push({
            id: "cause-weekly-success",
            rotationKey: "weekly-success",
            message: `You're on a roll. That's your ${ordinal(weeklySkipCount)} skip this week.`,
            ctaPrompt: "Invite others to skip for this cause",
            buttonLabel: "Invite Friends",
            buttonAction: "share",
            shareMessage: `I'm skipping expenses I no longer need for the ${fundraiserShareName}. Want to join me?`,
            accent: "var(--green-primary)",
          });
        }
        if (successProjectUnitCost) {
          candidates.push({
            id: unitShare >= 1 ? "cause-small-unit-impact" : "cause-unit-impact",
            message: `Your skipped expense now has a job: ${successActiveProject.title}.`,
            ctaPrompt: "Share your impact",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: causeShareCopy,
            accent: "var(--green-primary)",
          });
        }
        return chooseVariableReward(candidates, {
          id: "cause-progress",
          message: successProjectUnitCost
            ? `Your skipped expense now has a job: ${successActiveProject.title}.`
            : `Your skip is now saved for ${successActiveProject.title}.`,
          ctaPrompt: "Invite others to skip for this cause",
          buttonLabel: "Invite Friends",
          buttonAction: "share",
          shareMessage: `I'm skipping expenses I no longer need for the ${fundraiserShareName}. Want to join me?`,
          accent: "var(--green-primary)",
        });
      }

      if (hasGoalMoment && activeGoal) {
        if (rewardCoverage >= 100 && rewardCoverageBefore < 100) {
          return {
            id: "reward-ready-to-claim",
            message: `You did it. ${activeGoal.label} is fully funded from your skips.`,
            ctaPrompt: "Share your success",
            buttonLabel: "Invite Friends",
            buttonAction: "share",
            shareMessage: `I skipped expenses I didn't need and saved enough for ${activeGoal.label}. You can do the same for your own goals on iSkipped.`,
            accent: "#A78BFA",
            effect: "confetti",
          };
        }
        if (isFirstSkip) {
          return {
            id: "all-first-skip",
            message: `First one in. You passed on ${itemLabel} and gave your goal a start.`,
            ctaPrompt: "Share your first win",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: `I just skipped ${itemLabel} and saved ${formatCurrency(amount)}. Join me on iSkipped to see how much we can save.`,
            accent: "#A78BFA",
            effect: "confetti",
          };
        }
        if (isSkipMilestone) {
          return {
            id: "all-skip-milestone",
            message: `That's your ${ordinal(postLogSkipCount)} skip. You're turning ordinary expenses into something more meaningful.`,
            ctaPrompt: "Share your milestone",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: `I just hit ${postLogSkipCount} skips on iSkipped. Small choices are adding up.`,
            accent: "#F59E0B",
            effect: "fireworks",
          };
        }
        const candidates: VariableReward[] = [];
        if (isLargeSkip) {
          candidates.push({
            id: "reward-large-skip",
            message: `That was a big skip. ${activeGoal.label} feels a lot closer.`,
            ctaPrompt: "Share your big win",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: rewardShareCopy,
            accent: "#F59E0B",
            effect: "fireworks",
          });
        }
        if (rewardCoverage >= 85) {
          candidates.push({
            id: "reward-finish-line",
            message: `${activeGoal.label} is getting close. You're just a few skips away.`,
            ctaPrompt: "Share your progress",
            buttonLabel: "Share",
            buttonAction: "share",
            shareMessage: `I'm almost done saving for ${activeGoal.label} by skipping expenses I don't need. Join me on iSkipped.`,
            accent: "#A78BFA",
          });
        }
        if (weeklySkipCount >= 2) {
          candidates.push({
            id: "reward-weekly-success",
            rotationKey: "weekly-success",
            message: `Powerful week. That's your ${ordinal(weeklySkipCount)} skip this week for ${activeGoal.label}.`,
            ctaPrompt: "Invite others to skip",
            buttonLabel: "Challenge Friends",
            buttonAction: "share",
            shareMessage: `I'm skipping expenses I no longer need and saving for ${activeGoal.label}. Want to join me?`,
            accent: "#A78BFA",
          });
        }
        if (momentType === "future" && rewardRemaining > 0) {
          candidates.push({
            id: "reward-stat",
            message: `At this pace, you could reach ${activeGoal.label} in about ${Math.max(1, Math.ceil(rewardRemaining / Math.max(amount, 1)))} weeks.`,
            ctaPrompt: "Invite others to skip",
            buttonLabel: "Challenge Friends",
            buttonAction: "share",
            shareMessage: `I'm skipping expenses I no longer need and saving for ${activeGoal.label}. Join me on iSkipped.`,
            accent: "#A78BFA",
          });
        }
        if (momentType === "lifetime") {
          candidates.push({
            id: "reward-remaining-amount",
            message: `Nice work. Just ${formatCurrency(rewardRemaining)} left until ${activeGoal.label} is fully saved.`,
            ctaPrompt: "Invite others to skip",
            buttonLabel: "Challenge Friends",
            buttonAction: "share",
            shareMessage: `I'm skipping expenses I no longer need and saving for ${activeGoal.label}. Want to join me?`,
            accent: "#A78BFA",
          });
        }
        return chooseVariableReward(candidates, {
          id: "reward-progress",
          message: `Your skipped expense is now working toward ${activeGoal.label}.`,
          ctaPrompt: "Invite others to skip",
          buttonLabel: "Challenge Friends",
          buttonAction: "share",
          shareMessage: rewardShareCopy,
          accent: "#A78BFA",
        });
      }

      if (isFirstSkip) {
        return {
          id: "all-first-skip",
          message: `First one in. You passed on ${itemLabel} and started building your Skip Bucks.`,
          ctaPrompt: "Share your first win",
          buttonLabel: "Share",
          buttonAction: "share",
          shareMessage: `I just skipped ${itemLabel} and saved ${formatCurrency(amount)}. Join me on iSkipped to see how much we can save.`,
          accent: "var(--green-primary)",
          effect: "confetti",
        };
      }
      if (isSkipMilestone) {
        return {
          id: "all-skip-milestone",
          message: `That's your ${ordinal(postLogSkipCount)} skip. You're turning ordinary expenses into something more meaningful.`,
          ctaPrompt: "Share your milestone",
          buttonLabel: "Share",
          buttonAction: "share",
          shareMessage: `I just hit ${postLogSkipCount} skips on iSkipped. Small choices are adding up.`,
          accent: "#F59E0B",
          effect: "fireworks",
        };
      }
      const candidates: VariableReward[] = [];
      if (isLargeSkip) {
        candidates.push({
          id: "nothing-large-skip",
          message: "That was a big skip. Your future self gets the win.",
          ctaPrompt: "Share your big win",
          buttonLabel: "Share",
          buttonAction: "share",
          shareMessage: `I skipped ${itemLabel} and saved ${formatCurrency(amount)}. Want to see what you can save? Join me on iSkipped!`,
          accent: "#F59E0B",
          effect: "fireworks",
        });
      }
      if (weeklySkipCount >= 2) {
        candidates.push({
          id: "nothing-weekly-success",
          rotationKey: "weekly-success",
          message: `You're on a roll. That's your ${ordinal(weeklySkipCount)} skip this week.`,
          ctaPrompt: "Invite others to skip",
          buttonLabel: "Challenge Friends",
          buttonAction: "share",
          shareMessage: "I've been skipping expenses I no longer need to see how much I can save. I challenge you to do the same. Join me on iSkipped!",
          accent: "var(--green-primary)",
        });
      }
      if (momentType === "lifetime" && postLogSkipCount >= 5) {
        candidates.push({
          id: "nothing-momentum",
          message: `Nice skip. Your lifetime savings are now ${formatCurrency(successLifetimeSaved)} from choosing to be intentional with your money.`,
          ctaPrompt: "Invite others to skip",
          buttonLabel: "Challenge Friends",
          buttonAction: "share",
          shareMessage: `I've been skipping expenses I no longer need and have saved over ${formatCurrency(successLifetimeSaved)}. I challenge you to do the same. Join me on iSkipped!`,
          accent: "#A78BFA",
        });
      }
      if (momentType === "future") {
        candidates.push({
          id: "nothing-stat",
          message: `If you skipped this every week, you'd save ${formatCurrency(amount * 52)} this year.`,
          ctaPrompt: "Invite others to skip",
          buttonLabel: "Challenge Friends",
          buttonAction: "share",
          shareMessage: "I've been skipping expenses I no longer need to see how much I can save. I challenge you to do the same. Join me on iSkipped!",
          accent: "#F59E0B",
        });
      }
      if (momentType === "personal") {
        [
          ["nothing-motivational", "Every skip makes your hard-earned money more intentional. Keep going."],
          ["nothing-small-choice", "Small choice. Real money saved."],
          ["nothing-that-counts", "That skip counts. Keep going."],
          ["nothing-autopilot", "One less autopilot spend."],
          ["nothing-intentional-choice", "You made the intentional choice."],
        ].forEach(([id, message]) => {
          candidates.push({
            id,
            rotationKey: "personal-motivational",
            message,
            ctaPrompt: "Invite others to skip",
            buttonLabel: "Invite",
            buttonAction: "share",
            shareMessage: "I've been skipping expenses I no longer need to see how much I can save. Want to join me?",
            accent: "#A78BFA",
          });
        });
      }
      return chooseVariableReward(candidates, {
        id: "nothing-skip-bucks-gain",
        message: "Your Skip Bucks are ready when you find the right reason.",
        ctaPrompt: "Ready to give your skips a purpose?",
        buttonLabel: "Pick a Jar",
        buttonAction: "pick-jar",
        shareMessage: "",
        accent: "var(--green-primary)",
      });
    }

    const variableReward = buildVariableReward();
    function titleCaseSkipItem(value: string) {
      return value
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "")
        .join(" ");
    }

    function actionHeadline() {
      if (selectedCat.id === "custom") {
        const customSkip = titleCaseSkipItem(whatSkipped || customLabel);
        return customSkip ? `${customSkip} Skipped` : "Nice Skip";
      }

      switch (selectedCat.id) {
        case "coffee":
          return "Coffee Dodged";
        case "food":
          return "Takeout Skipped";
        case "drinks":
          return "Round Resisted";
        case "streaming":
          return "Stream Passed";
        case "shopping":
          return "Cart Resisted";
        case "uber":
          return "Ride Skipped";
        case "entertainment":
          return "Night Out Banked";
        default:
          return `${selectedCat.label} Skipped`;
      }
    }
    const successAccent = variableReward.accent || (successActiveProject ? "var(--green-primary)" : "#A78BFA");
    const destinationName = successActiveProject?.title ?? activeGoal?.label ?? "Skip Bucks";
    const jarBalanceBefore = Math.max(0, successJarBalance - amount);
    const progressTarget = successActiveProject
      ? fundraiserPersonalGoal
      : activeGoal?.targetAmount ?? 0;
    const beforeCoverage = progressTarget > 0 ? Math.min(100, Math.round((jarBalanceBefore / progressTarget) * 100)) : 0;
    const afterCoverage = progressTarget > 0 ? Math.min(100, Math.round((successJarBalance / progressTarget) * 100)) : 0;
    const meterBeforeAmount = progressTarget > 0 ? jarBalanceBefore : Math.max(0, successSkipBank - amount);
    const meterAfterAmount = progressTarget > 0 ? successJarBalance : successSkipBank;
    const hasImpactProgress = Boolean(successActiveProject && successProjectUnitCost);
    const impactProgressLabel = hasImpactProgress
      ? formatSuccessImpactUnits(
          successJarBalance,
          successProjectUnitCost!,
          unitLabel,
          successProjectUnitDisplay,
          successActiveProject?.unitIsGoal
        )
      : "";
    const impactAddedLabel = hasImpactProgress
      ? `+${formatSuccessImpactUnits(
          amount,
          successProjectUnitCost!,
          unitLabel,
          successProjectUnitDisplay,
          successActiveProject?.unitIsGoal
        )}`
      : "";
    const impactAddedValue = hasImpactProgress
      ? formatSuccessImpactUnits(
          amount,
          successProjectUnitCost!,
          unitLabel,
          successProjectUnitDisplay,
          successActiveProject?.unitIsGoal
        )
      : "";
    const progressLabel = progressTarget > 0
      ? hasImpactProgress
        ? impactProgressLabel
        : `${beforeCoverage}% -> ${afterCoverage}%`
      : formatCurrency(successSkipBank);
    const impactProof = successActiveProject && successProjectUnitCost
      ? `About ${unitPhrase}`
      : activeGoal && progressTarget > 0
        ? `${formatCurrency(Math.max(0, progressTarget - successJarBalance))} left`
        : "available now";
    const celebrationPieces = variableReward.effect
      ? [
          { x: "-138px", y: "-118px", color: "#2ECC71", delay: "0ms" },
          { x: "132px", y: "-112px", color: "#A78BFA", delay: "55ms" },
          { x: "-116px", y: "70px", color: "#F59E0B", delay: "100ms" },
          { x: "112px", y: "76px", color: "#7DD3FC", delay: "145ms" },
          { x: "-38px", y: "-138px", color: "#EDFFF5", delay: "190ms" },
          { x: "42px", y: "118px", color: "#2ECC71", delay: "235ms" },
        ]
      : [];
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={dismissSuccess}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-success-title"
          tabIndex={-1}
          className="iskip-pop-in rounded-2xl overflow-hidden text-center max-w-sm w-full shadow-2xl relative"
          style={{
            background: "radial-gradient(circle at 50% -18%, rgba(46,204,113,0.22), transparent 34%), var(--bg-surface-1)",
            border: "1px solid var(--border-default)",
            outline: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {celebrationPieces.map((piece, index) => (
            <span
              key={`${piece.x}-${piece.y}`}
              className="iskip-burst-piece z-0"
              style={{
                "--bx": piece.x,
                "--by": piece.y,
                animationDelay: piece.delay,
                background: piece.color,
                borderRadius: variableReward.effect === "confetti" && index % 2 === 0 ? "2px" : "999px",
                height: variableReward.effect === "confetti" && index % 2 === 0 ? 10 : 7,
                width: variableReward.effect === "confetti" && index % 2 === 0 ? 5 : 7,
              } as CSSProperties}
            />
          ))}
          <button
            onClick={dismissSuccess}
            aria-label="Close"
            className="absolute top-3 right-3 z-30 flex h-10 w-10 items-center justify-center text-2xl leading-none"
            style={{ color: "var(--text-muted)" }}
          >
            ×
          </button>
          <div className="relative z-10 px-5 pb-5 pt-5">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl shadow-lg iskip-success-badge" style={{ background: successAccent, color: "#06130E" }}>
              {selectedCat.emoji}
            </div>
            <h2 id="skip-success-title" className="mt-4 text-3xl font-black leading-none" style={{ color: "var(--text-primary)", letterSpacing: 0 }}>
              {actionHeadline()}
            </h2>

            <div className="mt-5 rounded-2xl p-4 text-left iskip-success-meter" style={{ border: `1px solid color-mix(in srgb, ${successAccent} 52%, transparent)`, background: "rgba(237,255,245,0.055)" }}>
              {hasImpactProgress ? (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                    This skip can help fund
                  </p>
                  <p className="mt-1 text-[1.35rem] font-black leading-tight" style={{ color: successAccent }}>
                    {impactAddedValue}
                  </p>
                  <p className="mt-2 text-xs font-bold leading-snug" style={{ color: "var(--text-muted)" }}>
                    {progressLabel} saved in this jar.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                      {progressTarget > 0 ? "Jar progress" : "Skip Bank"}
                    </p>
                    <p className="mt-1 text-xl font-black" style={{ color: "var(--text-primary)" }}>
                      {progressLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                      Added
                    </p>
                    <p className="mt-1 text-2xl font-black" style={{ color: successAccent }}>
                      +{formatCurrency(amount)}
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-3 h-3 overflow-hidden rounded-full" style={{ background: "rgba(237,245,240,0.1)" }}>
                <div
                  className="h-full rounded-full iskip-success-fill"
                  style={{
                    "--fill-from": `${progressTarget > 0 ? beforeCoverage : 0}%`,
                    "--fill-to": `${progressTarget > 0 ? afterCoverage : 100}%`,
                    background: successAccent,
                  } as CSSProperties}
                />
              </div>
            </div>

            {successHighlight === "largest" && (
              <div className="mt-3 rounded-xl px-3 py-2 text-left" style={{ background: "var(--bg-surface-2)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Largest skip</p>
                <p className="mt-0.5 text-sm font-black" style={{ color: "var(--text-primary)" }}>{formatCurrency(amount)}</p>
              </div>
            )}
            {successHighlight === "skip-number" && (
              <div className="mt-3 rounded-xl px-3 py-2 text-left" style={{ background: "var(--bg-surface-2)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Skip milestone</p>
                <p className="mt-0.5 text-sm font-black" style={{ color: "var(--text-primary)" }}>#{postLogSkipCount}</p>
              </div>
            )}
            <div className="mt-4 rounded-2xl px-4 py-3 text-left" style={{ background: "var(--bg-surface-2)" }}>
              <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                Today's win
              </p>
              <p className="mt-1 text-[1rem] font-bold leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {variableReward.message}
              </p>
            </div>
            <StreakCheckHero streak={successStreak} />

            <p className="mb-2 mt-5 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
              {variableReward.ctaPrompt}
            </p>
            {variableReward.buttonAction === "share" ? (
              <div className="mx-auto max-w-[280px]">
                <ShareButton
                  variant="block"
                  tone="primary"
                  label={variableReward.buttonLabel}
                  url={shareURL}
                  text={variableReward.shareMessage}
                  title={successActiveProject?.title ?? "iSkipped"}
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  onClose();
                  router.push(variableReward.buttonAction === "donate" ? "/jars?tab=cause" : "/jars");
                }}
                className="mx-auto block w-full max-w-[280px] rounded-xl py-3 text-sm font-black"
                style={{ background: "#2ECC71", color: "#071B14" }}
              >
                {variableReward.buttonLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const skipAmountLive = amount;
  const activeTargetLive = profile ? getActiveSkipTarget(profile) : null;
  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile ?? {} as any);
  const activeProjectLive = activeTargetLive?.type === "fundraiser"
    ? projects.find((p) => p.id === activeTargetLive.id) ?? null
    : activeTargetLive
      ? null
      : projects.find((p) => p.id === profile?.activeProjectId) ?? null;
  const activeGoalLive = activeTargetLive?.type === "goal"
    ? spendingGoals.find((g) => g.id === activeTargetLive.id) ?? null
    : activeTargetLive
      ? null
      : spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;
  const spendingGoalLabelLive = activeGoalLive?.label ?? "Reward Jar";
  const fundraiserGoalAmountLive = activeProjectLive?.goalAmount ?? 0;
  const fundraiserContributionPctLive = fundraiserGoalAmountLive > 0 ? (skipAmountLive / fundraiserGoalAmountLive) * 100 : 0;
  const rewardGoalAmountLive = activeGoalLive?.targetAmount ?? 0;
  const rewardContributionPctLive = rewardGoalAmountLive > 0 ? (skipAmountLive / rewardGoalAmountLive) * 100 : 0;
  const liveImpactText = activeGoalLive
    ? rewardGoalAmountLive > 0
      ? `${Math.max(1, Math.round((skipAmountLive / rewardGoalAmountLive) * 100))}% toward ${spendingGoalLabelLive}`
      : `${formatCurrency(skipAmountLive)} toward ${spendingGoalLabelLive}`
    : activeProjectLive?.unitCost && !activeProjectLive.unitIsGoal
      ? `${formatUnits(skipAmountLive, activeProjectLive.unitCost, activeProjectLive.unitName!)}${activeProjectLive.location ? ` in ${activeProjectLive.location}` : ""}`
      : activeProjectLive?.unitCost && activeProjectLive.unitIsGoal
        ? `${Math.max(1, Math.round((skipAmountLive / activeProjectLive.unitCost) * 100))}% of ${activeProjectLive.unitPhrase ?? (activeProjectLive.unitName ? oneUnitPhrase(activeProjectLive.unitName) : "a unit")} funded${activeProjectLive.location ? ` in ${activeProjectLive.location}` : ""}`
        : activeProjectLive && fundraiserGoalAmountLive > 0
          ? `${formatCurrency(skipAmountLive)} toward ${activeProjectLive.title}`
          : activeProjectLive
            ? `${formatCurrency(skipAmountLive)} toward ${activeProjectLive.title}`
            : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skip-form-title"
        tabIndex={-1}
        className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 id="skip-form-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Log a Skip</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* What did you skip */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>What did you skip?</label>
            <input
              type="text"
              value={whatSkipped}
              onChange={(e) => setWhatSkipped(e.target.value)}
              placeholder={`e.g. "morning latte at Starbucks"`}
              maxLength={100}
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
                value={amountStr}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                    setAmountStr(raw);
                    const v = parseFloat(raw);
                    if (!isNaN(v) && v > 0) setAmount(v);
                  }
                }}
                onBlur={() => {
                  if (!amountStr || parseFloat(amountStr) <= 0) {
                    setAmount(0.01);
                    setAmountStr("0.01");
                  }
                }}
                className="w-28 text-2xl font-bold border-b-2 focus:outline-none bg-transparent"
                style={{ color: "var(--green-primary)", borderColor: "var(--green-primary)" }}
              />
            </div>
          </div>

          {/* This Skip's Impact */}
          {amount > 0 && liveImpactText && (
            <div style={{ display: "block" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                {activeProjectLive ? "This skip could help fund" : "This skip could move you"}
              </p>
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: "var(--coral-primary)" }}>
                  🤲 {liveImpactText}
                </p>
                <p className="text-sm font-semibold" style={{ color: "#2BBAA4", display: "none" }}>
                  😊 {rewardGoalAmountLive > 0 ? `${rewardContributionPctLive.toFixed(1)}% toward ${spendingGoalLabelLive}` : formatCurrency(skipAmountLive)}
                </p>
              </div>
            </div>
          )}

          {/* Categories */}
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
                maxLength={50}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none mt-2"
                style={{
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
            )}
          </div>

          {/* Share toggle */}
          {isFundraiserSkip && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                shareToggleTouchedRef.current = true;
                setShareWithCommunity((v) => !v);
              }}
              role="switch"
              aria-checked={shareWithCommunity}
              aria-label="Share this fundraiser skip with the group"
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{ background: shareWithCommunity ? "var(--green-primary)" : "var(--bg-surface-3)" }}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${shareWithCommunity ? "translate-x-5" : ""}`}
              />
            </button>
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>Share this skip with the fundraiser group</span>
            <button
              type="button"
              onClick={() => { onClose(); router.push("/profile"); }}
              aria-label="Change fundraiser skip sharing in Profile"
              title="You can change this default on your Profile."
              className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black"
              style={{ border: "1px solid var(--text-muted)", color: "var(--text-muted)" }}
            >
              i
            </button>
          </div>
          )}
        </div>

        {/* Submit */}
        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={isLogging || amount <= 0}
            className="w-full font-bold py-4 rounded-xl text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: amount > 0 ? "0 4px 18px var(--gold-glow)" : "none",
            }}
          >
            {isLogging ? "Saving…" : amount > 0 ? `Skip ${formatCurrency(amount)}` : "Enter an amount"}
          </button>
        </div>
      </div>
    </div>
  );
}
/** Duolingo-style weekly streak checkoff for the post-skip success state. */
function StreakCheckHero({ streak }: { streak: number }) {
  const currentStreak = Math.max(1, streak || 1);
  const startWeek = Math.max(1, currentStreak - 2);
  const weeks = [1, 2, 3, 4, 5].map((weekNumber) => ({
    weekNumber: startWeek + weekNumber - 1,
    isChecked: startWeek + weekNumber - 1 <= currentStreak,
    isCurrent: startWeek + weekNumber - 1 === currentStreak,
  }));

  return (
    <div className="mt-4">
      <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Weekly skip streak
      </p>
      <div className="iskip-streak-row mt-1.5" aria-label={`${currentStreak} week skip streak`}>
        {weeks.map((week) => (
          <div key={week.weekNumber} className="iskip-streak-slot">
            <span
              className={`iskip-week-dot ${week.isChecked ? "is-checked" : ""} ${week.isCurrent ? "is-current" : ""}`}
              aria-label={`Streak week ${week.weekNumber}${week.isCurrent ? ", current week" : ""}${week.isChecked ? ", checked" : ""}`}
            >
              {week.isChecked ? "\u2713" : ""}
            </span>
            <span className="iskip-week-label">W{week.weekNumber}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
