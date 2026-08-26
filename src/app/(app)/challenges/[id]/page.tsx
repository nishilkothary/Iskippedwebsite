"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useProjects } from "@/hooks/useProjects";
import { Project, SkipAllocationTarget, UserProfile } from "@/lib/types/models";
import { allocateSkipBankToJar, joinProject, pinProjectToHome, setChallengeEmailConsent, setUserCauseGoal } from "@/lib/services/firebase/users";
import { isChallengeProject, getProject } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { appendRefParam, getChallengeSharePath } from "@/lib/utils/share";
import { getChallengeCausePhrase, getDirectChallengeShareText } from "@/lib/utils/challengeShareCopy";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { ShareButton } from "@/components/share/ShareButton";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

type ChallengeCategory = "Education" | "Meals" | "Health" | "Community";

type ChallengeView = {
  project: Project;
  title: string;
  category: ChallengeCategory;
  imageURL: string | null;
  fallbackLabel: string;
  trustLabel: "Verified Partner" | "Community";
  organizerLine: string;
  impactLine: string | null;
  raised: number;
  goal: number;
  progressPct: number;
  joinedLabel: string;
  skipChallengeLine: string | null;
};

type InviteStep = "intro" | "active-choice" | "goal" | "first-skip";


function challengeTitle(project: Project): string {
  if (project.isCustom) return project.title;
  if (project.tags?.includes("food")) return "Meals for Families";
  return project.groupName ?? project.title;
}

function challengeCategory(project: Project): ChallengeCategory {
  if (project.tags?.includes("food")) return "Meals";
  if (project.tags?.includes("health")) return "Health";
  if (project.tags?.includes("education")) return "Education";
  return "Community";
}

function fallbackForCategory(category: ChallengeCategory) {
  if (category === "Education") return { imageURL: "/categories/education.png", label: "EDU" };
  if (category === "Meals") return { imageURL: "/categories/meal.png", label: "MEAL" };
  if (category === "Health") return { imageURL: "/categories/health.png", label: "CARE" };
  return { imageURL: null, label: "GIVE" };
}

function getChallengeGoal(project: Project): number {
  return project.goalAmount > 0 ? project.goalAmount : 0;
}

function getDisplayGoalAmount(project: Project): number {
  if (project.goalAmount > 0) return project.goalAmount;
  if (project.unitCost && project.unitCost > 0) return project.unitCost * 10;
  return 0;
}

function getUnitLabel(project: Project): string {
  return project.unitDisplay ?? project.unitName ?? "units";
}

function formatGroupGoal(project: Project): string {
  const amount = getDisplayGoalAmount(project);
  if (amount <= 0) return "Open group goal";
  if (project.unitCost && project.unitCost > 0 && project.unitName) {
    const units = amount / project.unitCost;
    const rounded = Number.isInteger(units) ? units.toLocaleString() : units.toFixed(1);
    const unitLabel = project.unitDisplay ?? project.unitName;
    return `Group goal: ${formatCurrency(amount)} (${rounded} ${unitLabel})`;
  }
  return `Group goal: ${formatCurrency(amount)}`;
}

function getSkipChallengeLine(project: Project): string | null {
  const milestones = project.skipMilestones;
  if (!milestones) return null;
  const levels = [milestones.level1, milestones.level2, milestones.level3].filter((value) => Number.isFinite(value) && value > 0);
  if (levels.length === 0) return null;
  if (levels.length === 1) return `Complete ${levels[0]} skip`;
  const last = levels[levels.length - 1];
  return `Complete ${levels.slice(0, -1).join(", ")}, and ${last} skips`;
}

function causeHelpDescription(description: string | undefined): string {
  const trimmed = description?.trim();
  if (!trimmed) return "Skip anything. Your small choices help this move.";
  const normalized = trimmed
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can\s+)?(?:help\s+)?fund\s+/i, "")
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can\s+)?(?:help\s+)?provide\s+/i, "")
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can\s+)?(?:help\s+)?/i, "")
    .replace(/^help\s+(?:fund|provide|equip)\s+/i, "")
    .trim();
  const sentence = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  return `Your skips can help fund ${sentence}`;
}

function challengeFromProject(project: Project): ChallengeView {
  const category = challengeCategory(project);
  const fallback = fallbackForCategory(category);
  const goal = getDisplayGoalAmount(project);
  const raised = Math.min(goal, project.totalRaised || 0);
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return {
    project,
    title: challengeTitle(project),
    category,
    imageURL: project.imageURL || (project.isCustom ? null : fallback.imageURL),
    fallbackLabel: fallback.label,
    trustLabel: project.isCustom ? "Community" : "Verified Partner",
    organizerLine: project.sponsor ? `by ${project.sponsor}` : project.location ? `for ${project.location}` : "community challenge",
    impactLine: project.unitName && project.unitCost ? `1 ${project.unitName} = ${formatCurrency(project.unitCost)}` : null,
    raised,
    goal,
    progressPct,
    joinedLabel: (project.memberUids?.length ?? 0) > 0
      ? `${project.memberUids!.length} joined`
      : project.isCustom ? "Community challenge" : "Open challenge",
    skipChallengeLine: getSkipChallengeLine(project),
  };
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ background: "rgba(46,204,113,0.12)", color: "var(--green-primary)", border: "1px solid rgba(46,204,113,0.18)" }}
    >
      {children}
    </span>
  );
}

function ChallengeImage({ challenge, className }: { challenge: ChallengeView; className: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden ${className}`} style={{ background: "var(--bg-surface-2)" }}>
      {challenge.imageURL ? (
        <img
          src={challenge.imageURL}
          alt={challenge.title}
          className="w-full h-full object-cover"
          style={{ objectPosition: challenge.project.imagePosition ?? "center" }}
        />
      ) : (
        <span className="text-2xl font-black" style={{ color: "var(--green-primary)" }}>{challenge.fallbackLabel}</span>
      )}
    </div>
  );
}

function ProgressBar({ challenge, pledgedAmount = challenge.raised }: { challenge: ChallengeView; pledgedAmount?: number }) {
  const progressPct = challenge.goal > 0 ? Math.min(100, Math.round((pledgedAmount / challenge.goal) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm font-black mb-2">
        <span style={{ color: "var(--green-primary)" }}>Skipped {formatCurrency(pledgedAmount)}</span>
        <span style={{ color: "var(--text-muted)" }}>{progressPct}%</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))",
          }}
        />
      </div>
      <p className="text-xs font-semibold mt-2 text-right" style={{ color: "var(--text-muted)" }}>
        Goal {formatCurrency(challenge.goal)}
      </p>
    </div>
  );
}

function donationHost(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getActiveJarLabel(target: SkipAllocationTarget | null | undefined, profile: UserProfile | null, projects: Project[]) {
  if (!target || !profile) return "your current jar";
  if (target.type === "fundraiser") {
    const project = projects.find((item) => item.id === target.id);
    return project?.groupName ?? project?.title ?? "your current fundraiser";
  }
  const goal = profile.spendingGoals?.find((item) => item.id === target.id);
  return goal?.label ?? "your current reward";
}

function toastJoinedInactive(title: string) {
  toast.success(`${title} was added to your jars. Future skips will keep going to your current jar.`);
}

function DetailTile({ label, value, accent = "var(--text-primary)", href }: { label: string; value: string; accent?: string; href?: string | null }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }}>
      <p className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-sm font-black leading-snug"
          style={{ color: accent, textDecoration: "none" }}
        >
          {value}
        </a>
      ) : (
        <p className="mt-1 text-sm font-black leading-snug" style={{ color: accent }}>{value}</p>
      )}
    </div>
  );
}

function SkipChallenge({ project }: { project: Project }) {
  const milestones = project.skipMilestones;
  if (!milestones) return null;
  const levels: Array<[string, number]> = ([
    ["Level 1", milestones.level1],
    ["Level 2", milestones.level2],
    ["Level 3", milestones.level3],
  ] as Array<[string, number]>).filter(([, skips]) => Number.isFinite(skips) && skips > 0);

  if (levels.length === 0) return null;

  return (
    <section className="mt-5">
      <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Community Skip Challenge</p>
      <div className="grid grid-cols-3 gap-2">
        {levels.map(([level, skips]) => (
          <div key={level} className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <span className="mx-auto mb-2 block h-4 w-4 rounded border" style={{ borderColor: "var(--border-emphasis)" }} />
            <p className="text-xs font-bold" style={{ color: "var(--green-primary)" }}>{level}</p>
            <p className="text-sm font-black mt-1" style={{ color: "var(--text-primary)" }}>
              {skips} {skips === 1 ? "skip" : "skips"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ChallengeDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const challengeId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
  const { user, profile, updateProfile } = useAuthStore();
  const { setShowSkipPicker } = useUIStore();
  const { projects, loading: projectsLoading } = useProjects();
  const [joining, setJoining] = useState(false);
  const [showEmailConsent, setShowEmailConsent] = useState(false);
  const [shareEmailOnJoin, setShareEmailOnJoin] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [inviteStep, setInviteStep] = useState<InviteStep | null>(null);
  const [inviteFlowSeenFor, setInviteFlowSeenFor] = useState("");
  const [inviteMakeActive, setInviteMakeActive] = useState(true);
  const [personalGoalInput, setPersonalGoalInput] = useState("");
  const [skipBucksInput, setSkipBucksInput] = useState("");
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // The projects list comes from a whole-collection snapshot that fires from
  // the local cache first (without a just-created challenge) and only later
  // from the server. To avoid flashing "Challenge not found" for a freshly
  // shared link, fall back to a direct single-doc lookup for this exact id and
  // hold judgement until that definitive lookup has completed.
  const listedProject = useMemo(
    () => projects.find((item) => item.id === challengeId) ?? null,
    [projects, challengeId],
  );
  const [fallbackProject, setFallbackProject] = useState<Project | null>(null);
  const [fallbackChecked, setFallbackChecked] = useState(false);

  useEffect(() => {
    if (!challengeId || listedProject) {
      setFallbackChecked(Boolean(listedProject));
      return;
    }
    let cancelled = false;
    setFallbackChecked(false);
    getProject(challengeId)
      .then((project) => { if (!cancelled) setFallbackProject(project); })
      .catch(() => { if (!cancelled) setFallbackProject(null); })
      .finally(() => { if (!cancelled) setFallbackChecked(true); });
    return () => { cancelled = true; };
  }, [challengeId, listedProject]);

  const challenge = useMemo(() => {
    const project = listedProject ?? fallbackProject;
    return project && (isChallengeProject(project) || !project.isCustom) ? challengeFromProject(project) : null;
  }, [listedProject, fallbackProject]);

  useEffect(() => {
    if (!user || !challenge || searchParams.get("invite") !== "1" || inviteFlowSeenFor === challenge.project.id) return;
    setInviteFlowSeenFor(challenge.project.id);
    const savedGoal = profile?.causeGoalAmounts?.[challenge.project.id];
    setPersonalGoalInput(savedGoal && savedGoal > 0 ? String(Math.round(savedGoal)) : "");
    setSkipBucksInput("");
    setInviteStep("intro");
  }, [user, challenge, searchParams, inviteFlowSeenFor, profile?.causeGoalAmounts]);

  if (!challenge) {
    if (projectsLoading || !fallbackChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--green-primary)", borderTopColor: "transparent" }} />
        </div>
      );
    }
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24 md:pb-8">
        <button onClick={() => router.push("/jars?tab=fundraisers")} className="text-sm font-bold mb-5" style={{ color: "var(--green-primary)" }}>
          Back to fundraisers
        </button>
        <div className="rounded-xl p-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Challenge not found</p>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>This challenge may have been removed or is still loading.</p>
        </div>
      </div>
    );
  }

  const isActive = challenge.project.id === profile?.activeProjectId;
  const activeInviteTarget = profile?.activeSkipTarget === undefined
    ? profile?.activeSpendingGoalId
      ? { type: "goal" as const, id: profile.activeSpendingGoalId }
      : profile?.activeProjectId
        ? { type: "fundraiser" as const, id: profile.activeProjectId }
        : null
    : profile.activeSkipTarget;
  const hasDifferentActiveJar = Boolean(
    activeInviteTarget && !(activeInviteTarget.type === "fundraiser" && activeInviteTarget.id === challenge.project.id)
  );
  const activeJarLabel = getActiveJarLabel(activeInviteTarget, profile, projects);
  const challengeOrganizerName = challenge.project.sponsor?.trim() || challenge.project.groupName?.trim() || "the organizer";
  const countdown = getChallengeCountdown(challenge.project);
  const canManageChallenge = challenge.project.createdBy === user?.uid || profile?.email === ADMIN_EMAIL;
  const profileChallengeBalance = Math.max(0, profile?.causeJarBalances?.[challenge.project.id] ?? 0);
  const pledgedAmount = Math.max(0, (challenge.project.totalDonated ?? 0) + profileChallengeBalance);
  const challengeUrl = appendRefParam(
    typeof window !== "undefined" ? `${window.location.origin}${getChallengeSharePath(challenge.project)}` : getChallengeSharePath(challenge.project),
    user?.uid
  );

  async function handleShare() {
    if (!challenge) return;
    if (canNativeShare) {
      try {
        const groupName = challenge.project.groupName ?? challenge.title;
        await navigator.share({ title: groupName, text: getDirectChallengeShareText(challenge.project), url: challengeUrl });
        return;
      } catch { /* dismissed */ }
    }
    setShowShare(true);
  }

  function handleClose() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/jars?tab=cause");
  }

  async function handleJoin() {
    if (!user || !challenge || joining) return;
    if (isActive) {
      setShowSkipPicker(true);
      return;
    }
    if (profile?.challengeEmailConsents?.[challenge.project.id] === undefined) {
      setShareEmailOnJoin(true);
      setShowEmailConsent(true);
      return;
    }
    await beginJoin();
  }

  async function chooseEmailConsent(shareEmail: boolean) {
    if (!user || !challenge) return;
    try {
      await setChallengeEmailConsent(user.uid, challenge.project.id, shareEmail);
    } catch {
      return;
    }
    updateProfile({ challengeEmailConsents: { ...(profile?.challengeEmailConsents ?? {}), [challenge.project.id]: shareEmail } });
    setShowEmailConsent(false);
    await beginJoin();
  }

  async function beginJoin() {
    if (!user || !challenge || joining) return;
    await completeJoin();
  }

  async function completeJoin() {
    if (!user || !challenge || joining) return;
    setJoining(true);
    try {
      await pinProjectToHome(user.uid, challenge.project.id);
      updateProfile({
        activeProjectId: challenge.project.id,
        activeSkipTarget: { type: "fundraiser", id: challenge.project.id },
        joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])),
      });
    } finally {
      setJoining(false);
    }
  }

  async function completeInviteGoal() {
    if (!user || !challenge || joining) return;
    const amount = Number(personalGoalInput);
    const skipBucksAmount = Number(skipBucksInput);
    const hasPersonalGoal = Number.isFinite(amount) && amount > 0;
    const hasSkipBucksAmount = Number.isFinite(skipBucksAmount) && skipBucksAmount > 0;
    const availableSkipBucks = getSkipBalanceSummary(profile).unassignedSkipBank;
    if (personalGoalInput.trim() && !hasPersonalGoal) return;
    if (hasSkipBucksAmount && skipBucksAmount > availableSkipBucks) return;
    setJoining(true);
    try {
      await Promise.all([
        inviteMakeActive ? pinProjectToHome(user.uid, challenge.project.id) : joinProject(user.uid, challenge.project.id, false),
        ...(hasPersonalGoal ? [setUserCauseGoal(user.uid, challenge.project.id, amount)] : []),
        profile?.challengeEmailConsents?.[challenge.project.id] === undefined
          ? setChallengeEmailConsent(user.uid, challenge.project.id, shareEmailOnJoin)
          : Promise.resolve(),
      ]);
      if (hasSkipBucksAmount) {
        const target: SkipAllocationTarget = { type: "fundraiser", id: challenge.project.id };
        const appliedAmount = await allocateSkipBankToJar(user.uid, target, skipBucksAmount);
        updateProfile({
          causeJarBalances: {
            ...(profile?.causeJarBalances ?? {}),
            [challenge.project.id]: Math.max(0, profile?.causeJarBalances?.[challenge.project.id] ?? 0) + appliedAmount,
          },
        });
      }
      updateProfile({
        ...(inviteMakeActive
          ? {
              activeProjectId: challenge.project.id,
              activeSkipTarget: { type: "fundraiser", id: challenge.project.id },
            }
          : {}),
        joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])),
        ...(hasPersonalGoal ? { causeGoalAmounts: { ...(profile?.causeGoalAmounts ?? {}), [challenge.project.id]: amount } } : {}),
        challengeEmailConsents: profile?.challengeEmailConsents?.[challenge.project.id] === undefined
          ? { ...(profile?.challengeEmailConsents ?? {}), [challenge.project.id]: shareEmailOnJoin }
          : profile?.challengeEmailConsents,
      });
      if (inviteMakeActive) {
        setInviteStep("first-skip");
      } else {
        setInviteStep(null);
        toastJoinedInactive(challenge.title);
        router.push("/jar-activity");
      }
    } finally {
      setJoining(false);
    }
  }

  function startInviteJoin() {
    if (hasDifferentActiveJar) {
      setInviteStep("active-choice");
      return;
    }
    setInviteMakeActive(true);
    setInviteStep("goal");
  }

  function chooseInviteActivity(makeActive: boolean) {
    setInviteMakeActive(makeActive);
    setInviteStep("goal");
  }

  function finishInvite(openSkipPicker: boolean) {
    setInviteStep(null);
    if (openSkipPicker) setShowSkipPicker(true);
    router.push("/home");
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-28 md:pb-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push("/jars?tab=fundraisers")} className="text-sm font-bold" style={{ color: "var(--green-primary)" }}>
          ← Back to fundraisers
        </button>
        <div className="flex items-center gap-2">
          {canManageChallenge && (
            <button
              type="button"
              onClick={() => router.push(`/challenges/${challenge.project.id}/manage`)}
              className="px-3 py-1.5 rounded-full text-xs font-black"
              style={{ background: "rgba(46,204,113,0.14)", border: "1px solid rgba(46,204,113,0.34)", color: "var(--green-primary)" }}
            >
              Manage
            </button>
          )}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share challenge"
            title="Share challenge"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-black"
            style={{ border: "1px solid rgba(46,204,113,0.3)", color: "var(--green-primary)" }}
          >
            ↗
          </button>
        </div>
      </div>

      <article className="relative rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(46,204,113,0.28)" }}>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close challenge details"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full text-sm font-black"
          style={{ background: "rgba(7,27,20,0.72)", border: "1px solid rgba(237,245,240,0.22)", color: "var(--text-primary)", backdropFilter: "blur(8px)" }}
        >
          x
        </button>
        {challenge.imageURL && <ChallengeImage challenge={challenge} className="h-64 md:h-96" />}
        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge>{challenge.trustLabel}</Badge>
            {countdown.isExpired && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
                Ended
              </span>
            )}
          </div>
          {countdown.isExpired && (
            <div className="rounded-xl px-4 py-3 mb-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                {countdown.label}. Donations are still open.
              </p>
            </div>
          )}

          <h1 className="text-3xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>{challenge.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.organizerLine}</p>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailTile label="Country / region" value={challenge.project.location || "Not specified"} accent="#A7F3D0" />
            <DetailTile label="Unit goal" value={challenge.goal > 0 ? formatCurrency(challenge.goal) : "Open goal"} />
            <DetailTile
              label="Unit cost"
              value={challenge.project.unitCost
                ? `${formatCurrency(challenge.project.unitCost)} / ${challenge.project.unitName ?? getUnitLabel(challenge.project)}`
                : "Any amount"}
              accent="var(--gold-cta)"
            />
            <DetailTile
              label="Donate through"
              value={donationHost(challenge.project.donationURL) ?? challenge.project.sponsor ?? "Organizer"}
              href={challenge.project.donationURL}
              accent="#7DD3FC"
            />
          </section>

          <section className="mt-4">
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>About this cause</p>
            <p className="text-base leading-relaxed whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
              {causeHelpDescription(challenge.project.description)}
            </p>
          </section>

          <div className="mt-5">
            {challenge.goal > 0 ? (
              <section className="rounded-xl px-4 py-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                <ProgressBar challenge={challenge} pledgedAmount={profile !== null ? pledgedAmount : 0} />
              </section>
            ) : (
              /* Partner / open-ended challenge — show aggregate stats instead of a progress bar */
              (() => {
                const totalSkips = challenge.project.totalSkips ?? 0;
                const unitCost = challenge.project.unitCost ?? 0;
                const hasUnits = unitCost > 0;
                const unitsPluralLabel = hasUnits && challenge.project.unitName
                  ? (challenge.project.unitDisplay
                    ? challenge.project.unitDisplay + " funded"
                    : challenge.project.unitName.split(" ").slice(-1)[0].toLowerCase() + "s funded")
                  : "units funded";
                // Wait for profile so pledgedAmount includes jar balance (not just totalRaised)
                const statsReady = profile !== null;
                const unitsCount = hasUnits && statsReady ? Math.floor(pledgedAmount / unitCost) : 0;
                return (
                  <div className={`grid gap-3 rounded-xl p-4 ${hasUnits ? "grid-cols-3" : "grid-cols-2"}`} style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <div className="text-center">
                      <p className="text-xl font-black" style={{ color: "var(--green-primary)" }}>{totalSkips.toLocaleString()}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>skips</p>
                    </div>
                    {hasUnits && (
                      <div className="text-center">
                        <p className="text-xl font-black" style={{ color: "var(--gold-cta)" }}>{statsReady ? unitsCount.toLocaleString() : "—"}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{unitsPluralLabel}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xl font-black" style={{ color: "var(--coral-primary)" }}>{statsReady ? formatCurrency(pledgedAmount) : "—"}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>raised</p>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          <SkipChallenge project={challenge.project} />

          {challenge.project.learnMoreURL && (
            <a
              href={challenge.project.learnMoreURL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center justify-center rounded-xl px-4 py-3 text-sm font-black"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--green-primary)", textDecoration: "none" }}
            >
              Learn more about this cause →
            </a>
          )}

          <div className="flex gap-2 mt-4">
            {!countdown.isExpired && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-70"
                style={{
                  background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                  color: "var(--bg-base)",
                  boxShadow: "0 4px 18px var(--gold-glow)",
                }}
              >
                {isActive ? (profileChallengeBalance > 0 ? "Log a Skip" : "Log your first skip") : joining ? "Choosing..." : "Skip for this"}
              </button>
            )}
            {challenge.project.donationURL && (
              <a
                href={challenge.project.donationURL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-full text-sm font-black"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                Donate
              </a>
            )}
          </div>
        </div>
      </article>

      {showShare && (
        <ShareDetailModal
          title={challenge.project.groupName ?? challenge.title}
          project={challenge.project}
          url={challengeUrl}
          password={challenge.project.visibility === "private" || challenge.project.visibility === "password" ? challenge.project.password ?? null : null}
          onClose={() => setShowShare(false)}
        />
      )}

      {showEmailConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.62)" }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}>
            <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Join {challengeOrganizerName}&apos;s challenge?</p>
            <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
              This adds the challenge to your jars and sends future skips here by default. You can change your active jar anytime.
            </p>
            <label
              className="mt-4 flex items-start gap-3 rounded-xl p-3 cursor-pointer"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
            >
              <input
                type="checkbox"
                checked={shareEmailOnJoin}
                onChange={(event) => setShareEmailOnJoin(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--green-primary)]"
              />
              <span>
                <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>Allow {challengeOrganizerName} to send challenge updates by email</span>
                <span className="block text-xs leading-relaxed mt-1" style={{ color: "var(--text-muted)" }}>
                  Only for this challenge. You can turn this off anytime.
                </span>
              </span>
            </label>
            <div className="grid gap-2 mt-5">
              <button
                type="button"
                onClick={() => chooseEmailConsent(shareEmailOnJoin)}
                className="py-3 rounded-full text-sm font-black"
                style={{ background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))", color: "var(--bg-base)" }}
              >
                Join challenge
              </button>
              <button
                type="button"
                onClick={() => setShowEmailConsent(false)}
                className="py-2 text-xs font-bold"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteStep && (
        <InviteFlowModal
          step={inviteStep}
          challenge={challenge}
          goalValue={personalGoalInput}
          skipBucksValue={skipBucksInput}
          availableSkipBucks={getSkipBalanceSummary(profile).unassignedSkipBank}
          joining={joining}
          onClose={() => setInviteStep(null)}
          onStart={startInviteJoin}
          activeJarLabel={activeJarLabel}
          onChooseActivity={chooseInviteActivity}
          onGoalChange={setPersonalGoalInput}
          onSkipBucksChange={setSkipBucksInput}
          shareEmailOnJoin={shareEmailOnJoin}
          onShareEmailChange={setShareEmailOnJoin}
          onSubmitGoal={completeInviteGoal}
          onLogSkip={() => finishInvite(true)}
          onLater={() => finishInvite(false)}
        />
      )}

    </div>
  );
}

function InviteFlowModal({
  step,
  challenge,
  goalValue,
  skipBucksValue,
  availableSkipBucks,
  joining,
  onClose,
  onStart,
  activeJarLabel,
  onChooseActivity,
  onGoalChange,
  onSkipBucksChange,
  shareEmailOnJoin,
  onShareEmailChange,
  onSubmitGoal,
  onLogSkip,
  onLater,
}: {
  step: InviteStep;
  challenge: ChallengeView;
  goalValue: string;
  skipBucksValue: string;
  availableSkipBucks: number;
  joining: boolean;
  onClose: () => void;
  onStart: () => void;
  activeJarLabel: string;
  onChooseActivity: (makeActive: boolean) => void;
  onGoalChange: (value: string) => void;
  onSkipBucksChange: (value: string) => void;
  shareEmailOnJoin: boolean;
  onShareEmailChange: (value: boolean) => void;
  onSubmitGoal: () => void;
  onLogSkip: () => void;
  onLater: () => void;
}) {
  const amount = Number(goalValue);
  const validGoal = !goalValue.trim() || (Number.isFinite(amount) && amount > 0);
  const skipBucksAmount = Number(skipBucksValue);
  const validSkipBucks = !skipBucksValue.trim() || (Number.isFinite(skipBucksAmount) && skipBucksAmount > 0 && skipBucksAmount <= availableSkipBucks);
  const unitCount = challenge.project.unitCost && validGoal ? amount / challenge.project.unitCost : null;
  const unitLabel = challenge.project.unitDisplay ?? challenge.project.unitName ?? "units";
  const causePhrase = getChallengeCausePhrase(challenge.project);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.68)" }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}>
        <div className="relative px-5 py-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-[0.14em] font-black mb-1" style={{ color: "var(--green-primary)" }}>
            Fundraiser invite
          </p>
          <p className="text-xl font-black leading-tight pr-8" style={{ color: "var(--text-primary)" }}>
            {step === "intro"
              ? `You were invited to skip for ${challenge.title}`
              : step === "active-choice"
                ? `You are currently skipping for ${activeJarLabel}`
                : step === "goal"
                  ? `Join ${challenge.title}`
                  : "Have you skipped anything recently?"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close invite"
            className="absolute right-4 top-4 text-lg font-black"
            style={{ color: "var(--text-muted)" }}
          >
            x
          </button>
        </div>

        <div className="space-y-4 p-5">
          {step === "intro" && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Instead of asking you to donate upfront, this fundraiser asks you to skip everyday expenses and save those dollars for {causePhrase}.
              </p>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                <p className="text-xs uppercase tracking-wide font-black mb-1" style={{ color: "var(--text-muted)" }}>Group goal</p>
                <p className="text-sm font-black" style={{ color: "var(--green-primary)" }}>{formatGroupGoal(challenge.project)}</p>
              </div>
              <button
                type="button"
                onClick={onStart}
                className="w-full rounded-full py-3 text-sm font-black"
                style={{ background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))", color: "var(--bg-base)" }}
              >
                Yes, join this fundraiser
              </button>
            </>
          )}

          {step === "active-choice" && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Joining {challenge.title} can make future skips go to this fundraiser. Your saved balance for {activeJarLabel} will stay parked.
              </p>
              <button
                type="button"
                onClick={() => onChooseActivity(true)}
                className="w-full rounded-full py-3 text-sm font-black"
                style={{ background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))", color: "var(--bg-base)" }}
              >
                Make this my active jar
              </button>
              <button
                type="button"
                onClick={() => onChooseActivity(false)}
                className="w-full rounded-full py-3 text-sm font-black"
                style={{ background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Keep my current jar
              </button>
            </>
          )}

          {step === "goal" && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Add a personal savings goal if you want one. It is separate from the group goal and is optional.
              </p>
              <p className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                {formatGroupGoal(challenge.project)}
              </p>
              <label className="block">
                <span className="text-xs uppercase tracking-wide font-black" style={{ color: "var(--green-primary)" }}>Personal savings goal (optional)</span>
                <div className="mt-2 flex items-center rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  <span className="text-sm font-black mr-2" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    min="1"
                    value={goalValue}
                    onChange={(event) => onGoalChange(event.target.value)}
                    className="w-full bg-transparent outline-none text-base font-black"
                    style={{ color: "var(--text-primary)" }}
                  />
                </div>
              </label>
              {unitCount !== null && (
                <p className="text-xs font-bold" style={{ color: "var(--green-primary)" }}>
                  About {unitCount < 10 ? unitCount.toFixed(1) : Math.round(unitCount).toLocaleString()} {unitLabel}.
                </p>
              )}
              {availableSkipBucks > 0 && (
                <label className="block rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  <span className="block text-xs font-black" style={{ color: "var(--text-primary)" }}>Use existing Skip Bucks (optional)</span>
                  <span className="mt-1 block text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    You have {formatCurrency(availableSkipBucks)} available. Move any amount into this fundraiser now.
                  </span>
                  <div className="mt-2 flex items-center rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
                    <span className="text-sm font-black mr-2" style={{ color: "var(--text-muted)" }}>$</span>
                    <input
                      type="number"
                      min="0"
                      max={availableSkipBucks}
                      value={skipBucksValue}
                      onChange={(event) => onSkipBucksChange(event.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent outline-none text-base font-black"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>
                </label>
              )}
              <label
                className="flex items-start gap-3 rounded-xl p-3 cursor-pointer"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
              >
                <input
                  type="checkbox"
                  checked={shareEmailOnJoin}
                  onChange={(event) => onShareEmailChange(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--green-primary)]"
                />
                <span>
                  <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>Allow challenge updates by email</span>
                  <span className="block text-xs leading-relaxed mt-1" style={{ color: "var(--text-muted)" }}>
                    From {challenge.project.sponsor?.trim() || challenge.project.groupName?.trim() || "the organizer"}, for this challenge only.
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={onSubmitGoal}
                disabled={!validGoal || !validSkipBucks || joining}
                className="w-full rounded-full py-3 text-sm font-black disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))", color: "var(--bg-base)" }}
              >
                {joining ? "Joining..." : "Join fundraiser"}
              </button>
            </>
          )}

          {step === "first-skip" && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                If there is an expense you already skipped, log it now and save that amount toward this cause.
              </p>
              <button
                type="button"
                onClick={onLogSkip}
                className="w-full rounded-full py-3 text-sm font-black"
                style={{ background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))", color: "var(--bg-base)" }}
              >
                Log a skipped expense
              </button>
              <button
                type="button"
                onClick={onLater}
                className="w-full py-2 text-sm font-black"
                style={{ color: "var(--text-muted)" }}
              >
                I&apos;ll do this later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareDetailModal({
  title,
  project,
  url,
  password,
  onClose,
}: {
  title: string;
  project: Project;
  url: string;
  password: string | null;
  onClose: () => void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const shareIntentText = getDirectChallengeShareText(project);
  const shareMessage = `${shareIntentText} ${url}`;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* ignore */ }
  }

  async function handleCopyMessage() {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md p-5 shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Invite friends</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="rounded-xl p-3 mb-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Message</p>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>{shareMessage}</p>
          <button
            type="button"
            onClick={handleCopyMessage}
            className="w-full py-2 rounded-lg text-xs font-black"
            style={{ background: copiedMsg ? "rgba(46,204,113,0.15)" : "var(--bg-surface-3)", color: copiedMsg ? "#2ECC71" : "var(--text-primary)" }}
          >
            {copiedMsg ? "Copied!" : "Copy message"}
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <span className="text-xs truncate flex-1 font-mono" style={{ color: "var(--text-secondary)" }}>{url}</span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-lg text-xs font-black shrink-0"
            style={{ background: copiedLink ? "rgba(46,204,113,0.15)" : "var(--bg-surface-3)", color: copiedLink ? "#2ECC71" : "var(--text-primary)" }}
          >
            {copiedLink ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div className="mt-3">
          <ShareButton url={url} text={shareIntentText} title={title} />
        </div>

        {password && (
          <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(139,92,246,0.9)" }}>Challenge password</p>
            <p className="text-lg font-black tracking-widest" style={{ color: "var(--text-primary)" }}>{password}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Share this with anyone you invite so they can join.</p>
          </div>
        )}
      </div>
    </div>
  );
}
