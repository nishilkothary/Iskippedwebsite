"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { Project } from "@/lib/types/models";
import { joinProject, normalizeJarSplit, switchCause } from "@/lib/services/firebase/users";
import { addCustomProject, isChallengeProject, updateCustomProject } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";

type ChallengeCard = {
  project: Project;
  title: string;
  beneficiary: string;
  description: string;
  category: "Education" | "Meals" | "Health" | "Community";
  imageURL: string | null;
  fallbackLabel: string;
  impactLine: string | null;
  skipChallengeLine: string | null;
  goalLine: string;
  pledgedLine: string;
  progressPct: number;
  joinedLabel: string;
  trustLabel: "Verified Partner" | "Community";
};


function isVisibleChallenge(project: Project): boolean {
  return isChallengeProject(project);
}

const CATEGORY_OPTIONS = ["All", "Public", "Private", "My Challenges"] as const;
type CreateChallengeCategory =
  | "education"
  | "food"
  | "health"
  | "water"
  | "housing"
  | "emergency"
  | "children"
  | "animals"
  | "environment"
  | "local"
  | "personal";
type ChallengeVisibility = "public" | "private" | "unlisted" | "password";
type ChallengeAccessChoice = "public" | "private";

const CREATE_CATEGORY_OPTIONS: { value: CreateChallengeCategory; label: string }[] = [
  { value: "education", label: "Education & school" },
  { value: "food", label: "Food & hunger" },
  { value: "health", label: "Health & medical" },
  { value: "water", label: "Clean water" },
  { value: "housing", label: "Housing & shelter" },
  { value: "emergency", label: "Emergency relief" },
  { value: "children", label: "Children & families" },
  { value: "animals", label: "Animal welfare" },
  { value: "environment", label: "Environment" },
  { value: "local", label: "Local community" },
  { value: "personal", label: "Personal fundraiser" },
];

const JOINED_BY_CATEGORY: Record<ChallengeCard["category"], string> = {
  Education: "1,240 joined",
  Meals: "890 joined",
  Health: "540 joined",
  Community: "32 joined",
};

function challengeTitle(project: Project): string {
  if (project.isCustom) return project.title;
  if (project.tags?.includes("food")) return "Meals for Families";
  if (project.tags?.includes("health") || project.sponsor === "Malaria Consortium") return "Malaria Prevention Challenge";
  if (project.id === "kc" || project.id === "kc-library") return project.title.replace(/^A /, "").replace(/ for /i, " for ");
  return "School Days Challenge";
}

function challengeCategory(project: Project): ChallengeCard["category"] {
  if (project.tags?.includes("food")) return "Meals";
  if (project.tags?.includes("health")) return "Health";
  if (project.tags?.includes("education")) return "Education";
  return "Community";
}

function fallbackForCategory(category: ChallengeCard["category"]) {
  if (category === "Education") return { imageURL: "/categories/education.png", label: "EDU" };
  if (category === "Meals") return { imageURL: "/categories/meal.png", label: "MEAL" };
  if (category === "Health") return { imageURL: "/categories/health.png", label: "CARE" };
  return { imageURL: null, label: "GIVE" };
}

function getChallengeGoal(project: Project): number {
  return project.goalAmount > 0 ? project.goalAmount : 100;
}

function normalizeChallengeVisibility(visibility?: Project["visibility"] | ChallengeVisibility): ChallengeAccessChoice {
  return visibility === "private" || visibility === "password" || visibility === "unlisted" ? "private" : "public";
}

function isPrivateChallenge(project: Project): boolean {
  return normalizeChallengeVisibility(project.visibility as ChallengeVisibility | undefined) === "private"
    || Boolean(project.tags?.some((tag) => tag === "visibility-private" || tag === "visibility-password" || tag === "visibility-unlisted"));
}

function visibilityTagFor(visibility: ChallengeVisibility) {
  return `visibility-${normalizeChallengeVisibility(visibility)}`;
}

function getSkipChallengeLine(project: Project): string | null {
  const milestones = project.skipMilestones;
  if (!milestones) return null;
  const levels = [milestones.level1, milestones.level2, milestones.level3].filter((value) => Number.isFinite(value) && value > 0);
  if (levels.length === 0) return null;
  return `Level 1: ${levels[0]} ${levels[0] === 1 ? "Skip" : "Skips"}`;
}

function challengeFromProject(project: Project): ChallengeCard {
  const category = challengeCategory(project);
  const fallback = fallbackForCategory(category);
  const goal = getChallengeGoal(project);
  const raised = Math.min(goal, Math.max(project.totalRaised || 0, project.isCustom ? 0 : goal * 0.18));
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  return {
    project,
    title: challengeTitle(project),
    beneficiary: project.location ? `for ${project.location}` : project.sponsor ? `by ${project.sponsor}` : "community challenge",
    description: project.description || "Skip anything. Your small choices help this move.",
    category,
    imageURL: project.imageURL || (project.isCustom ? null : fallback.imageURL),
    fallbackLabel: fallback.label,
    impactLine: project.unitName && project.unitCost
      ? `${formatCurrency(project.unitCost)} = 1 ${project.unitName}`
      : project.goalAmount > 0
        ? `Goal: ${formatCurrency(project.goalAmount)}`
        : null,
    skipChallengeLine: getSkipChallengeLine(project),
    goalLine: `${formatCurrency(raised)} / ${formatCurrency(goal)}`,
    pledgedLine: `${formatCurrency(raised)} pledged so far`,
    progressPct,
    joinedLabel: project.isCustom ? "Community" : JOINED_BY_CATEGORY[category],
    trustLabel: project.isCustom ? "Community" : "Verified Partner",
  };
}


export default function ChallengesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { user, profile, updateProfile } = useAuthStore();
  const { projects, refetch } = useProjects();
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("All");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinChoice, setJoinChoice] = useState<ChallengeCard | null>(null);
  const [passwordChoice, setPasswordChoice] = useState<ChallengeCard | null>(null);
  const [challengePassword, setChallengePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeCard | null>(null);
  const [shareChallenge, setShareChallenge] = useState<ChallengeCard | null>(null);
  const [pendingShareId, setPendingShareId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const challenges = useMemo(() => projects.filter(isVisibleChallenge).map(challengeFromProject), [projects]);

  // Open share modal once the newly created challenge appears in the list
  useEffect(() => {
    if (!pendingShareId) return;
    const found = challenges.find((c) => c.project.id === pendingShareId);
    if (found) {
      setShareChallenge(found);
      setPendingShareId(null);
    }
  }, [challenges, pendingShareId]);

  // Open edit wizard when ?edit=id is in the URL (coming back from manage page)
  useEffect(() => {
    if (!editId || challenges.length === 0 || editingChallenge) return;
    const found = challenges.find((c) => c.project.id === editId);
    if (found) setEditingChallenge(found);
  }, [editId, challenges]);
  const activeProject = projects.find((project) => project.id === profile?.activeProjectId) ?? null;
  const activeChallenge = challenges.find((challenge) => challenge.project.id === profile?.activeProjectId) ?? null;
  const joinedProjectIds = useMemo(
    () => new Set([...(profile?.joinedProjectIds ?? []), ...(profile?.activeProjectId ? [profile.activeProjectId] : [])]),
    [profile?.joinedProjectIds, profile?.activeProjectId]
  );
  const filteredChallenges = challenges.filter((challenge) => {
    if (selectedCategory === "All") return true;
    if (selectedCategory === "Public") return !isPrivateChallenge(challenge.project);
    if (selectedCategory === "Private") return isPrivateChallenge(challenge.project);
    if (selectedCategory === "My Challenges") return challenge.project.createdBy === user?.uid;
    return true;
  });
  const visibleListChallenges = filteredChallenges.slice(0, 20);

  const activePledgeBalance = profile?.activeProjectId ? profile?.causeJarBalances?.[profile.activeProjectId] ?? 0 : 0;

  function needsPrivatePassword(challenge: ChallengeCard) {
    return isPrivateChallenge(challenge.project) && !joinedProjectIds.has(challenge.project.id);
  }

  async function beginJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    if (profile?.activeProjectId && profile.activeProjectId !== challenge.project.id) {
      setJoinChoice(challenge);
      return;
    }
    await completeJoin(challenge, true);
  }

  async function handleJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    if (needsPrivatePassword(challenge)) {
      setPasswordChoice(challenge);
      setChallengePassword("");
      setPasswordError("");
      return;
    }
    await beginJoin(challenge);
  }

  async function submitPrivatePassword() {
    const challenge = passwordChoice;
    if (!challenge || !user || joiningId) return;
    const entered = challengePassword.trim();
    const expected = challenge.project.password?.trim();

    if (!entered) {
      setPasswordError("Enter the challenge password.");
      return;
    }
    if (expected && entered !== expected) {
      setPasswordError("That password doesn't match.");
      return;
    }

    setPasswordChoice(null);
    setChallengePassword("");
    setPasswordError("");
    await beginJoin(challenge);
  }

  async function completeJoin(challenge: ChallengeCard, makeActive: boolean, movePledge = false) {
    if (!user || joiningId) return;
    setJoiningId(challenge.project.id);
    try {
      if (makeActive) {
        const balanceTransfer = await switchCause(user.uid, profile?.activeProjectId ?? null, challenge.project.id, movePledge);
        updateProfile({
          activeProjectId: challenge.project.id,
          joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])),
          ...(balanceTransfer
            ? { causeJarBalances: { ...(profile?.causeJarBalances ?? {}), ...balanceTransfer } }
            : {}),
        });
      } else {
        await joinProject(user.uid, challenge.project.id, false);
        updateProfile({ joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])) });
      }
      setJoinChoice(null);
    } finally {
      setJoiningId(null);
    }
  }

  async function handleCreateChallenge(data: {
    title: string;
    organizer: string;
    description: string;
    goalAmount: number;
    donationURL: string;
    imageURL?: string;
    impactUnitName?: string;
    impactUnitCost?: number;
    skipMilestones?: { level1: number; level2: number; level3: number };
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
    password?: string;
    durationDays?: number | null;
    isOrganization?: boolean;
    groupName?: string;
  }) {
    if (!user || creating) return;
    setCreating(true);
    try {
      const visibility = normalizeChallengeVisibility(data.visibility);
      const projectId = await addCustomProject(user.uid, {
        title: data.title,
        projectKind: "challenge",
        sponsor: data.organizer,
        goalAmount: data.goalAmount,
        description: data.description,
        donationURL: data.donationURL,
        imageURL: data.imageURL,
        unitName: data.impactUnitName,
        unitDisplay: data.impactUnitName ? `${data.impactUnitName.toLowerCase()}s` : undefined,
        unitCost: data.impactUnitCost,
        skipMilestones: data.skipMilestones,
        visibility,
        password: visibility === "private" ? data.password : undefined,
        groupName: data.groupName,
        tags: ["custom", "challenge", data.category, visibilityTagFor(data.visibility), ...(visibility === "private" && data.password ? ["password-preview"] : []), ...(data.isOrganization ? ["organization"] : [])],
        durationDays: data.durationDays ?? null,
      });
      await refetch();
      await switchCause(user.uid, profile?.activeProjectId ?? null, projectId, false);
      updateProfile({
        activeProjectId: projectId,
        joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), projectId])),
      });
      setSelectedCategory("My Challenges");
      setShowCreateForm(false);
      setPendingShareId(projectId);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateChallenge(challenge: ChallengeCard, data: {
    title: string;
    organizer: string;
    description: string;
    goalAmount: number;
    donationURL: string;
    imageURL?: string;
    impactUnitName?: string;
    impactUnitCost?: number;
    skipMilestones?: { level1: number; level2: number; level3: number };
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
    password?: string;
    durationDays?: number | null;
    isOrganization?: boolean;
    groupName?: string;
  }) {
    if (!user || creating) return;
    setCreating(true);
    try {
      const visibility = normalizeChallengeVisibility(data.visibility);
      await updateCustomProject(user.uid, challenge.project.id, {
        title: data.title,
        sponsor: data.organizer,
        goalAmount: data.goalAmount,
        description: data.description,
        donationURL: data.donationURL,
        imageURL: data.imageURL,
        unitName: data.impactUnitName,
        unitDisplay: data.impactUnitName ? `${data.impactUnitName.toLowerCase()}s` : undefined,
        unitCost: data.impactUnitCost,
        skipMilestones: data.skipMilestones,
        visibility,
        password: visibility === "private" ? data.password : undefined,
        groupName: data.groupName,
        tags: ["custom", "challenge", data.category, visibilityTagFor(data.visibility), ...(visibility === "private" && data.password ? ["password-preview"] : []), ...(data.isOrganization ? ["organization"] : [])],
      });
      await refetch();
      setEditingChallenge(null);
      router.push(`/challenges/${challenge.project.id}/manage`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-24 md:pb-8">
      <div className="flex md:hidden justify-center mb-5">
        <p className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          i<span style={{ color: "var(--green-primary)" }}>skipped</span>
        </p>
      </div>

      {(() => {
        if (!profile) return null;
        const activeProject = projects.find((p) => p.id === profile.activeProjectId) ?? null;
        if (!activeProject) return null;
        const split = normalizeJarSplit(profile.jarSplit as any);
        const giveTotal = profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100);
        const givingBalance = Math.max(0, giveTotal - (profile.totalDonated ?? 0));
        return (
          <div className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <p className="text-sm min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
              Giving Jar · <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{activeProject.title}</span>
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <p className="text-sm font-extrabold" style={{ color: "#2ECC71" }}>{formatCurrency(givingBalance)}</p>
              {activeProject.donationURL && (
                <a
                  href={activeProject.donationURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "#2ECC71", color: "#0B1A14" }}
                >
                  Donate
                </a>
              )}
            </div>
          </div>
        );
      })()}

      <div className="mt-6 mb-3">
        <p className="text-lg font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>Join a Challenge</p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Pick a challenge, skip with the group, and watch your collective impact grow.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_OPTIONS.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={selectedCategory === category
              ? { background: "#2ECC71", color: "#0B1A14" }
              : { border: "1px solid rgba(46,204,113,0.3)", color: "var(--text-secondary)" }
            }
          >
            {category}
          </button>
        ))}
      </div>

      {challenges.length > 0 && (
        <div className="flex justify-start mt-3 mb-2">
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2.5 rounded-full text-sm font-black shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
            }}
          >
            + Create a Group Challenge
          </button>
        </div>
      )}

      {visibleListChallenges.length > 0 && (
      <section className="mt-6">
        <SectionHeader title={selectedCategory === "All" ? "All Challenges" : selectedCategory === "My Challenges" ? "My Challenges" : `${selectedCategory} Challenges`} />
        <div className="space-y-3">
          {visibleListChallenges.map((challenge) => (
              <ChallengeListCard
                key={challenge.project.id}
                challenge={challenge}
                isActive={challenge.project.id === profile?.activeProjectId}
                isJoined={challenge.project.id === profile?.activeProjectId}
                isJoining={joiningId === challenge.project.id}
                canEdit={challenge.project.createdBy === user?.uid}
                onOpen={() => router.push(`/challenges/${challenge.project.id}`)}
                onEdit={() => router.push(`/challenges/${challenge.project.id}/manage`)}
                onShare={() => setShareChallenge(challenge)}
                onJoin={() => handleJoin(challenge)}
              />
          ))}
        </div>
      </section>
      )}

      {showCreateForm && (
        <CreateChallengeWizard
          creating={creating}
          onClose={() => setShowCreateForm(false)}
          onCreate={handleCreateChallenge}
        />
      )}

      {editingChallenge && (
        <CreateChallengeWizard
          creating={creating}
          initialChallenge={editingChallenge}
          onClose={() => {
            setEditingChallenge(null);
            if (editId) router.push(`/challenges/${editingChallenge.project.id}/manage`);
          }}
          onCreate={(data) => handleUpdateChallenge(editingChallenge, data)}
        />
      )}

      {joinChoice && (
        <JoinChoiceModal
          challenge={joinChoice}
          activeTitle={activeProject?.title ?? "your current jar"}
          pledgeAmount={activePledgeBalance}
          isJoining={joiningId === joinChoice.project.id}
          onClose={() => setJoinChoice(null)}
          onDonateNow={() => {
            if (activeProject?.donationURL) {
              window.open(activeProject.donationURL, "_blank", "noopener,noreferrer");
              return;
            }
            router.push("/jars?tab=cause");
          }}
          onMakeActive={() => completeJoin(joinChoice, true)}
          onMovePledge={() => completeJoin(joinChoice, true, true)}
        />
      )}

      {passwordChoice && (
        <PrivateChallengePasswordModal
          challenge={passwordChoice}
          password={challengePassword}
          error={passwordError}
          isJoining={joiningId === passwordChoice.project.id}
          onPasswordChange={(value) => {
            setChallengePassword(value);
            if (passwordError) setPasswordError("");
          }}
          onClose={() => {
            setPasswordChoice(null);
            setChallengePassword("");
            setPasswordError("");
          }}
          onSubmit={submitPrivatePassword}
        />
      )}

      {shareChallenge && (
        <ShareChallengeModal
          challenge={shareChallenge}
          onClose={() => setShareChallenge(null)}
        />
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{title}</p>
    </div>
  );
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

function accessBadgeLabel(challenge: ChallengeCard) {
  return isPrivateChallenge(challenge.project) ? "Private" : "Public";
}

function ProgressBar({ challenge, className = "" }: { challenge: ChallengeCard; className?: string }) {
  return (
    <div className={className}>
      <div className="flex justify-between gap-3 text-xs font-semibold mb-1.5">
        <span style={{ color: "var(--green-primary)" }}>{challenge.goalLine}</span>
        <span style={{ color: "var(--text-muted)" }}>{challenge.progressPct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${challenge.progressPct}%`,
            background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))",
          }}
        />
      </div>
    </div>
  );
}

function ChallengeImage({ challenge, className }: { challenge: ChallengeCard; className: string }) {
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
        <span className="text-lg font-black" style={{ color: "var(--green-primary)" }}>{challenge.fallbackLabel}</span>
      )}
    </div>
  );
}


function ChallengeListCard({
  challenge,
  isActive,
  isJoined,
  isJoining,
  canEdit,
  onOpen,
  onEdit,
  onShare,
  onJoin,
}: {
  challenge: ChallengeCard;
  isActive: boolean;
  isJoined: boolean;
  isJoining: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onShare: () => void;
  onJoin: () => void;
}) {
  const joinLabel = isActive || isJoined ? "Joined" : isJoining ? "Joining..." : "Join Challenge";
  const showImage = Boolean(challenge.imageURL || !challenge.project.isCustom);

  return (
    <article
      className="rounded-xl p-3 flex gap-3 cursor-pointer"
      style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
      onClick={onOpen}
    >
      {showImage && <ChallengeImage challenge={challenge} className="w-20 h-20 rounded-lg flex-shrink-0" />}
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-black leading-snug" style={{ color: "var(--text-primary)" }}>{challenge.title}</p>
              <Badge>{accessBadgeLabel(challenge)}</Badge>
            </div>
            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{challenge.project.sponsor || challenge.beneficiary}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShare();
              }}
              className="w-8 h-8 rounded-full text-sm font-bold"
              aria-label="Share challenge"
              title="Share challenge"
              style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
            >
              ↗
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                className="w-8 h-8 rounded-full text-sm font-bold"
                aria-label="Manage challenge"
                title="Manage challenge"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                ⚙
              </button>
            )}
          </div>
        </div>
        <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
          {challenge.description}
        </p>
        {challenge.skipChallengeLine && (
          <p className="text-xs mt-1.5 font-bold" style={{ color: "var(--text-secondary)" }}>{challenge.skipChallengeLine}</p>
        )}
        {challenge.impactLine && <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>}
        {!challenge.project.isCustom && <ProgressBar challenge={challenge} className="mt-2" />}
        {challenge.trustLabel !== "Community" && <div className="mt-2"><Badge>{challenge.trustLabel}</Badge></div>}
        <button
          onClick={(event) => {
            event.stopPropagation();
            onJoin();
          }}
          disabled={isActive || isJoined || isJoining}
          className="mt-3 w-full py-2 rounded-xl text-xs font-bold disabled:opacity-70"
          style={isActive || isJoined
            ? { border: "1px solid var(--border-emphasis)", color: "var(--green-primary)", background: isJoined ? "rgba(46,204,113,0.12)" : "transparent" }
            : { background: "#2ECC71", color: "#0B1A14" }
          }
        >
          {joinLabel}
        </button>
      </div>
    </article>
  );
}

function JoinChoiceModal({
  challenge,
  activeTitle,
  pledgeAmount,
  isJoining,
  onClose,
  onDonateNow,
  onMakeActive,
  onMovePledge,
}: {
  challenge: ChallengeCard;
  activeTitle: string;
  pledgeAmount: number;
  isJoining: boolean;
  onClose: () => void;
  onDonateNow: () => void;
  onMakeActive: () => void;
  onMovePledge: () => void;
}) {
  const hasPledge = pledgeAmount > 0;
  const destinationType = isChallengeProject(challenge.project) ? "challenge" : "cause";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md p-5 shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{hasPledge ? "Before you switch" : "Join challenge"}</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.title}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
        </div>

        <div className="rounded-xl p-4 mt-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>Current pledge</p>
          <p className="text-sm font-black mt-1" style={{ color: "var(--text-primary)" }}>{activeTitle}</p>
          {hasPledge && (
            <p className="text-sm font-black mt-2" style={{ color: "var(--coral-primary)" }}>
              {formatCurrency(pledgeAmount)} pledged
            </p>
          )}
        </div>

        {hasPledge ? (
          <p className="text-sm leading-relaxed mt-4" style={{ color: "var(--text-secondary)" }}>
            You have {formatCurrency(pledgeAmount)} saved for {activeTitle}. What would you like to do with it?
          </p>
        ) : (
          <p className="text-sm leading-relaxed mt-4" style={{ color: "var(--text-secondary)" }}>
            Make this your active challenge so your next skips count here by default.
          </p>
        )}

        {hasPledge ? (
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={onDonateNow}
              disabled={isJoining}
              className="w-full py-3 rounded-full text-sm font-black disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                color: "var(--bg-base)",
                boxShadow: "0 4px 18px var(--gold-glow)",
              }}
            >
              Donate {formatCurrency(pledgeAmount)} now
            </button>
            <button
              type="button"
              onClick={onMovePledge}
              disabled={isJoining}
              className="w-full py-2.5 rounded-full text-sm font-bold disabled:opacity-60"
              style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
            >
              Transfer to this {destinationType}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              onClick={onMakeActive}
              disabled={isJoining}
              className="w-full py-3 rounded-full text-sm font-black disabled:opacity-60"
              style={{
                  background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                  color: "var(--bg-base)",
                  boxShadow: "0 4px 18px var(--gold-glow)",
              }}
            >
              {isJoining ? "Joining..." : "Join challenge"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PrivateChallengePasswordModal({
  challenge,
  password,
  error,
  isJoining,
  onPasswordChange,
  onClose,
  onSubmit,
}: {
  challenge: ChallengeCard;
  password: string;
  error: string;
  isJoining: boolean;
  onPasswordChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md p-5 shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Private challenge</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Enter the password to join {challenge.title}. You only need to do this once.
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
        </div>

        <input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
          placeholder="Challenge password"
          className="w-full rounded-xl px-4 py-3 text-sm mt-5 focus:outline-none"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          autoFocus
        />
        {error && <p className="text-xs font-bold mt-2" style={{ color: "var(--coral-primary)" }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-full text-sm font-bold"
            style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isJoining}
            className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
            }}
          >
            {isJoining ? "Joining..." : "Join Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeDetailModal({
  challenge,
  isActive,
  isJoining,
  onClose,
  onJoin,
  onLogSkip,
}: {
  challenge: ChallengeCard;
  isActive: boolean;
  isJoining: boolean;
  onClose: () => void;
  onJoin: () => void;
  onLogSkip: () => void;
}) {
  const skipMilestones = challenge.project.skipMilestones;
  const skipLevels: Array<[string, number]> = skipMilestones
    ? ([
        ["Level 1", skipMilestones.level1],
        ["Level 2", skipMilestones.level2],
        ["Level 3", skipMilestones.level3],
      ] as Array<[string, number]>).filter(([, skips]) => Number.isFinite(skips) && skips > 0)
    : [];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          <ChallengeImage challenge={challenge} className="h-48 rounded-t-2xl" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full text-xl leading-none"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            {challenge.trustLabel !== "Community" && <Badge>{challenge.trustLabel}</Badge>}
            <Badge>{accessBadgeLabel(challenge)}</Badge>
          </div>

          <h2 className="text-2xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>{challenge.title}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {challenge.project.sponsor ? `by ${challenge.project.sponsor}` : challenge.beneficiary}
          </p>

          <ProgressBar challenge={challenge} className="mt-5" />

          {challenge.impactLine && (
            <div className="rounded-xl px-4 py-3 mt-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-xs uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>Impact</p>
              <p className="text-sm font-black mt-1" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>
              <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-muted)" }}>{challenge.pledgedLine}</p>
            </div>
          )}

          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Story</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{challenge.description}</p>
          </div>

          {skipLevels.length > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Skip challenge</p>
              <div className="grid grid-cols-3 gap-2">
                {skipLevels.map(([level, skips]) => (
                  <div key={level} className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <span className="mx-auto mb-2 block h-4 w-4 rounded border" style={{ borderColor: "var(--border-emphasis)" }} />
                    <p className="text-xs font-bold" style={{ color: "var(--green-primary)" }}>{level}</p>
                    <p className="text-sm font-black mt-1" style={{ color: "var(--text-primary)" }}>
                      {skips} {skips === 1 ? "skip" : "skips"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>How to help</p>
            <div className="space-y-2">
              {["Skip anything small", "Log the amount", "Watch the challenge move"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-2)" }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black" style={{ background: "rgba(46,204,113,0.14)", color: "var(--green-primary)" }}>{index + 1}</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={isActive ? onLogSkip : onJoin}
              disabled={isJoining}
              className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                color: "var(--bg-base)",
                boxShadow: "0 4px 18px var(--gold-glow)",
              }}
            >
              {isActive ? "Log a Skip" : isJoining ? "Joining..." : "Join Challenge"}
            </button>
            {challenge.project.donationURL && (
              <a
                href={challenge.project.donationURL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-full text-sm font-bold"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                Donate
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareChallengeModal({
  challenge,
  onClose,
}: {
  challenge: ChallengeCard;
  onClose: () => void;
}) {
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/challenges/${challenge.project.id}`
    : `/challenges/${challenge.project.id}`;
  const [copied, setCopied] = useState(false);
  const isPrivate = challenge.project.visibility === "private" || challenge.project.visibility === "password";
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the input
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({
        title: challenge.title,
        text: `Join my iSkipped challenge: ${challenge.title}`,
        url,
      });
    } catch {
      // dismissed or unsupported
    }
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
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.title}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <span className="text-xs truncate flex-1 font-mono" style={{ color: "var(--text-secondary)" }}>{url}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg text-xs font-black shrink-0"
            style={{ background: copied ? "rgba(46,204,113,0.15)" : "var(--bg-surface-3)", color: copied ? "#2ECC71" : "var(--text-primary)" }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {isPrivate && challenge.project.password && (
          <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(139,92,246,0.9)" }}>Challenge password</p>
            <p className="text-lg font-black tracking-widest" style={{ color: "var(--text-primary)" }}>{challenge.project.password}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Share this with anyone you invite so they can join.</p>
          </div>
        )}

        {canNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="mt-4 w-full py-3 rounded-full text-sm font-black"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
            }}
          >
            Share Challenge
          </button>
        )}
      </div>
    </div>
  );
}

function CreateChallengeWizard({
  creating,
  initialChallenge,
  onClose,
  onCreate,
}: {
  creating: boolean;
  initialChallenge?: ChallengeCard;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    organizer: string;
    description: string;
    goalAmount: number;
    donationURL: string;
    imageURL?: string;
    impactUnitName?: string;
    impactUnitCost?: number;
    skipMilestones?: { level1: number; level2: number; level3: number };
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
    password?: string;
    durationDays?: number | null;
    isOrganization?: boolean;
    groupName?: string;
  }) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const isEditing = Boolean(initialChallenge);
  const initialProject = initialChallenge?.project;
  const initialCategory = (initialProject?.tags?.find((tag) =>
    ["education", "food", "health", "water", "housing", "emergency", "children", "animals", "environment", "local", "personal"].includes(tag)
  ) as CreateChallengeCategory | undefined) ?? "education";
  const [title, setTitle] = useState(initialProject?.title ?? "");
  const [organizer, setOrganizer] = useState(initialProject?.sponsor ?? "");
  const [description, setDescription] = useState(initialProject?.description ?? "");
  const [goalAmount, setGoalAmount] = useState(initialProject?.goalAmount ? String(initialProject.goalAmount) : "");
  const [donationURL, setDonationURL] = useState(initialProject?.donationURL ?? "");
  const [useImpactUnit, setUseImpactUnit] = useState(Boolean(initialProject?.unitName && initialProject?.unitCost));
  const [impactUnitName, setImpactUnitName] = useState(initialProject?.unitName ?? "");
  const [impactUnitCost, setImpactUnitCost] = useState(initialProject?.unitCost ? String(initialProject.unitCost) : "");
  const [useSkipChallenge, setUseSkipChallenge] = useState(Boolean(initialProject?.skipMilestones));
  const [milestoneLevel1, setMilestoneLevel1] = useState(initialProject?.skipMilestones?.level1 ? String(initialProject.skipMilestones.level1) : "1");
  const [milestoneLevel2, setMilestoneLevel2] = useState(initialProject?.skipMilestones?.level2 ? String(initialProject.skipMilestones.level2) : "3");
  const [milestoneLevel3, setMilestoneLevel3] = useState(initialProject?.skipMilestones?.level3 ? String(initialProject.skipMilestones.level3) : "7");
  const [imageURL, setImageURL] = useState(initialProject?.imageURL ?? "");
  const [imageError, setImageError] = useState("");
  const [category, setCategory] = useState<CreateChallengeCategory>(initialCategory);
  const [visibility, setVisibility] = useState<ChallengeAccessChoice>(
    normalizeChallengeVisibility(initialProject?.visibility as ChallengeVisibility | undefined)
  );
  const [password, setPassword] = useState(initialProject?.password ?? "");
  const [durationDays, setDurationDays] = useState<number | null>(30);
  const [isOrg, setIsOrg] = useState(Boolean(initialProject?.tags?.includes("organization")));
  const [groupName, setGroupName] = useState(initialProject?.groupName ?? "");

  const parsedGoal = parseFloat(goalAmount);
  const parsedImpactUnitCost = parseFloat(impactUnitCost);
  const parsedMilestoneLevel1 = parseInt(milestoneLevel1, 10);
  const parsedMilestoneLevel2 = parseInt(milestoneLevel2, 10);
  const parsedMilestoneLevel3 = parseInt(milestoneLevel3, 10);
  const hasValidSkipChallenge = !useSkipChallenge || [parsedMilestoneLevel1, parsedMilestoneLevel2, parsedMilestoneLevel3].every((value) => Number.isFinite(value) && value > 0);
  const canContinueBasics = title.trim().length > 0 && description.trim().length > 0;
  const canContinueImpact = parsedGoal > 0 && donationURL.trim().length > 0 && (!useImpactUnit || (impactUnitName.trim().length > 0 && parsedImpactUnitCost > 0)) && hasValidSkipChallenge;
  const canCreate = canContinueBasics && canContinueImpact && (visibility !== "private" || password.trim().length >= 4);

  function handleImageFile(file: File | undefined) {
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > 700 * 1024) {
      setImageError("For now, choose an image under 700 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImageURL(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function handleNext() {
    if (step === 1 && canContinueBasics) setStep(2);
    if (step === 2 && canContinueImpact) setStep(3);
  }

  function handleCreate() {
    if (!canCreate) return;
    onCreate({
      title: title.trim(),
      organizer: organizer.trim(),
      description: description.trim(),
      goalAmount: parsedGoal,
      donationURL: donationURL.trim(),
      imageURL: imageURL.trim() || undefined,
      impactUnitName: useImpactUnit ? impactUnitName.trim() : undefined,
      impactUnitCost: useImpactUnit ? parsedImpactUnitCost : undefined,
      skipMilestones: useSkipChallenge
        ? { level1: parsedMilestoneLevel1, level2: parsedMilestoneLevel2, level3: parsedMilestoneLevel3 }
        : undefined,
      category,
      visibility,
      password: visibility === "private" ? password.trim() : undefined,
      durationDays: isEditing ? undefined : durationDays,
      isOrganization: isOrg,
      groupName: groupName.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <button onClick={onClose} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
          <p className="text-xl font-black pr-8" style={{ color: "var(--text-primary)" }}>{isEditing ? "Edit Challenge" : "Create Challenge"}</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Step {step} of 3</p>
          <div className="flex gap-2 mt-4 pr-8">
            {[1, 2, 3].map((value) => (
              <div
                key={value}
                className="h-1.5 rounded-full flex-1"
                style={{ background: value <= step ? "var(--green-primary)" : "var(--bg-surface-3)" }}
              />
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Basics</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Name the outcome, add the story, and choose how it should be grouped.</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Group Name</p>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. The Johnson Family, Marketing Team"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={100}
                  autoFocus
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Skipping For</p>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. School Days Challenge"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={100}
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Who is organizing</p>
                <input
                  type="text"
                  value={organizer}
                  onChange={(event) => setOrganizer(event.target.value)}
                  placeholder="Name, group, or organization"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={100}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOrg}
                  onChange={(event) => setIsOrg(event.target.checked)}
                  className="w-4 h-4 rounded accent-green-500"
                />
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>We are a Corporation or Non-Profit</span>
              </label>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>About this challenge</p>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Tell people what this challenge is all about..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={400}
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Category</p>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as CreateChallengeCategory)}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                >
                  {CREATE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Cover image</p>
                <div className="rounded-xl overflow-hidden mb-2 h-36 flex items-center justify-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  {imageURL ? (
                    <img src={imageURL} alt="Challenge cover preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Add a cover image</span>
                  )}
                </div>
                <div className="flex">
                  <label className="px-4 py-2 rounded-full text-sm font-bold cursor-pointer" style={{ background: "#2ECC71", color: "#0B1A14" }}>
                    Upload photo
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageFile(event.target.files?.[0])} />
                  </label>
                </div>
                {imageError && <p className="text-xs mt-2" style={{ color: "var(--coral-primary)" }}>{imageError}</p>}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Impact</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Set the fundraiser target and where donations should go.</p>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                <input
                  type="number"
                  value={goalAmount}
                  onChange={(event) => setGoalAmount(event.target.value)}
                  placeholder="Challenge goal"
                  className="w-full rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Donation destination</p>
                <input
                  type="url"
                  value={donationURL}
                  onChange={(event) => setDonationURL(event.target.value)}
                  placeholder="Paste a GoFundMe, charity, or donation link"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={500}
                />
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  Users tap Donate on the challenge detail page and go here. Use a GoFundMe, charity page, or payment link.
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useImpactUnit}
                    onChange={(event) => setUseImpactUnit(event.target.checked)}
                    className="mt-1"
                  />
                    <span>
                      <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>Add an impact unit</span>
                      <span className="block text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Optional. Fill it in like a formula: 1 school day = $0.82.
                      </span>
                    </span>
                  </label>
                {useImpactUnit && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black shrink-0" style={{ color: "var(--text-primary)" }}>1</span>
                        <input
                          type="text"
                          value={impactUnitName}
                          onChange={(event) => setImpactUnitName(event.target.value)}
                          placeholder="school day"
                          aria-label="Impact unit name"
                          className="min-w-0 flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none"
                          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                          maxLength={60}
                      />
                      <span className="text-sm font-black shrink-0" style={{ color: "var(--text-primary)" }}>=</span>
                      <div className="relative min-w-0 flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                        <input
                          type="number"
                          value={impactUnitCost}
                          onChange={(event) => setImpactUnitCost(event.target.value)}
                          placeholder="0.82"
                          aria-label="Impact unit cost"
                          className="w-full rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none"
                          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        />
                      </div>
                    </div>
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                      Use dollars or cents. This will show people what one real outcome costs.
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSkipChallenge}
                    onChange={(event) => setUseSkipChallenge(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>Add a skip challenge</span>
                    <span className="block text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Optional. Set skip-count goals users can check off as they participate.
                    </span>
                  </span>
                </label>
                {useSkipChallenge && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                    {[
                      ["Level 1", milestoneLevel1, setMilestoneLevel1],
                      ["Level 2", milestoneLevel2, setMilestoneLevel2],
                      ["Level 3", milestoneLevel3, setMilestoneLevel3],
                    ].map(([level, value, setValue]) => (
                      <label key={level as string} className="rounded-xl p-3" style={{ background: "var(--bg-surface-1)" }}>
                        <span className="block text-xs font-bold mb-2" style={{ color: "var(--green-primary)" }}>{level as string}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={value as string}
                            onChange={(event) => (setValue as (nextValue: string) => void)(event.target.value)}
                            className="min-w-0 w-full rounded-lg px-3 py-2 text-sm font-black focus:outline-none"
                            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                            aria-label={`${level as string} skip count`}
                          />
                          <span className="text-xs font-bold shrink-0" style={{ color: "var(--text-muted)" }}>skips</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {!isEditing && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Challenge duration</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { label: "2 weeks", days: 14 },
                      { label: "1 month", days: 30 },
                      { label: "3 months", days: 90 },
                      { label: "6 months", days: 180 },
                      { label: "Open-ended", days: null },
                    ] as { label: string; days: number | null }[]).map(({ label, days }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setDurationDays(days)}
                        className="px-4 py-2 rounded-full text-xs font-bold"
                        style={
                          durationDays === days
                            ? { background: "rgba(46,204,113,0.18)", border: "1px solid rgba(46,204,113,0.45)", color: "var(--green-primary)" }
                            : { background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {durationDays !== null && (
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                      Challenge ends {new Date(Date.now() + durationDays * 86400_000).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Access and preview</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Choose how people can find this challenge.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ["public", "Public", "Free for anyone to join."],
                  ["private", "Private", "People can see it, but need the password to join."],
                ].map(([value, label, helper]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value as ChallengeAccessChoice)}
                    className="rounded-xl text-left"
                    style={visibility === value
                      ? { background: "rgba(46,204,113,0.18)", border: "1px solid rgba(46,204,113,0.45)", color: "var(--text-primary)", padding: 12 }
                      : { background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", padding: 12 }
                    }
                  >
                    <span className="block text-sm font-black" style={{ color: visibility === value ? "var(--green-primary)" : "var(--text-primary)" }}>{label}</span>
                    <span className="block text-xs mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{helper}</span>
                  </button>
                ))}
              </div>
              {visibility === "private" && (
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={40}
                />
              )}
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                {imageURL && <img src={imageURL} alt="" className="w-full h-28 object-cover" />}
                <div className="p-4">
                  <div className="flex gap-2 mb-2">
                    <Badge>Community</Badge>
                    <Badge>{visibility === "private" ? "Private" : "Public"}</Badge>
                  </div>
                  <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>{title || "Challenge title"}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{organizer || "Organizer"}</p>
                  <p className="text-sm mt-3 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                    {description || "Your challenge story will appear here."}
                  </p>
                  {useImpactUnit && impactUnitName && parsedImpactUnitCost > 0 && (
                    <p className="text-sm mt-3 font-black" style={{ color: "var(--green-primary)" }}>
                      1 {impactUnitName} = {formatCurrency(parsedImpactUnitCost)}
                    </p>
                  )}
                  {useSkipChallenge && hasValidSkipChallenge && (
                    <p className="text-xs mt-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                      Skip challenge: {parsedMilestoneLevel1}, {parsedMilestoneLevel2}, and {parsedMilestoneLevel3} skips
                    </p>
                  )}
                  {parsedGoal > 0 && <p className="text-sm mt-3 font-black" style={{ color: "var(--green-primary)" }}>{formatCurrency(parsedGoal)} goal</p>}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-3 rounded-full text-sm font-bold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={handleNext}
                disabled={(step === 1 && !canContinueBasics) || (step === 2 && !canContinueImpact)}
                className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                  color: "var(--bg-base)",
                  boxShadow: "0 4px 18px var(--gold-glow)",
                }}
              >
                {step === 1 ? "Next: Impact" : "Next: Access"}
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                  color: "var(--bg-base)",
                  boxShadow: "0 4px 18px var(--gold-glow)",
                }}
              >
              {creating ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save Challenge" : "Create Challenge"}
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
