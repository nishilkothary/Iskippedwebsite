"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { Project } from "@/lib/types/models";
import { switchCause, setUserCauseGoal } from "@/lib/services/firebase/users";
import { addCustomProject, isChallengeProject, isProjectEnded, updateCustomProject, OFFICIAL_PROJECTS, PARTNER_CHALLENGE_IDS } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";
import { appendRefParam } from "@/lib/utils/share";
import { ShareLinksRow } from "@/components/share/ShareLinksRow";

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
  joinedLabel: string | null;
  trustLabel: "Verified Partner" | "Community";
};


function isVisibleChallenge(project: Project): boolean {
  return isChallengeProject(project);
}

const CATEGORY_OPTIONS = ["All", "Public", "My Challenges", "Archived"] as const;
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
type ChallengeVisibility = "public" | "private" | "unlisted";
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


function challengeTitle(project: Project): string {
  if (project.isCustom) return project.title;
  if (project.tags?.includes("food")) return "Meals for Families";
  return project.groupName ?? project.title;
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
  return project.goalAmount > 0 ? project.goalAmount : 0;
}

function normalizeChallengeVisibility(visibility?: Project["visibility"] | ChallengeVisibility): ChallengeAccessChoice {
  return visibility === "private" || visibility === "unlisted" ? "private" : "public";
}

function isPrivateChallenge(project: Project): boolean {
  return normalizeChallengeVisibility(project.visibility as ChallengeVisibility | undefined) === "private"
    || Boolean(project.tags?.some((tag) => tag === "visibility-private" || tag === "visibility-unlisted"));
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
  const raised = Math.min(goal, project.totalRaised || 0);
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
    joinedLabel: (project.memberUids?.length ?? 0) > 0 ? `${project.memberUids!.length} joined` : null,
    trustLabel: project.isCustom ? "Community" : "Verified Partner",
  };
}


export default function ChallengesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { user, profile, updateProfile } = useAuthStore();
  const { projects, refetch } = useProjects();
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("My Challenges");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinChoice, setJoinChoice] = useState<ChallengeCard | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeCard | null>(null);
  const [shareChallenge, setShareChallenge] = useState<ChallengeCard | null>(null);
  const [pendingShareId, setPendingShareId] = useState<string | null>(null);
  const shareAfterJoinId = useRef<string | null>(null);
  const [pendingActivationProjectId, setPendingActivationProjectId] = useState<string | null>(null);
  const [pendingActivationChallenge, setPendingActivationChallenge] = useState<ChallengeCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [goalPickerProjectId, setGoalPickerProjectId] = useState<string | null>(null);

  const challenges = useMemo(() => projects.filter(isVisibleChallenge).map(challengeFromProject), [projects]);
  const partnerChallenges = useMemo(
    () => OFFICIAL_PROJECTS.filter((p) => PARTNER_CHALLENGE_IDS.includes(p.id)).map(challengeFromProject),
    []
  );
  const archivedChallenges = useMemo(() => {
    if (!profile) return [];
    const joined = new Set([...(profile.joinedProjectIds ?? []), ...(profile.activeProjectId ? [profile.activeProjectId] : [])]);
    return [...challenges, ...partnerChallenges]
      .filter((c, i, arr) => arr.findIndex((x) => x.project.id === c.project.id) === i) // dedupe
      .filter((c) => joined.has(c.project.id) && isProjectEnded(c.project));
  }, [challenges, partnerChallenges, profile?.joinedProjectIds, profile?.activeProjectId]);

  // Open share modal once the newly created challenge appears in the list
  useEffect(() => {
    if (!pendingShareId) return;
    const found = challenges.find((c) => c.project.id === pendingShareId);
    if (found) {
      setShareChallenge(found);
      setPendingShareId(null);
    }
  }, [challenges, pendingShareId]);

  // Open activation prompt once the newly created challenge appears in the list
  useEffect(() => {
    if (!pendingActivationProjectId) return;
    const found = challenges.find((c) => c.project.id === pendingActivationProjectId);
    if (found) {
      setPendingActivationChallenge(found);
      setPendingActivationProjectId(null);
    }
  }, [challenges, pendingActivationProjectId]);

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
    if (challenge.project.status === "ended") return false;
    if (selectedCategory === "All") return !isPrivateChallenge(challenge.project) || joinedProjectIds.has(challenge.project.id);
    if (selectedCategory === "Public") return !isPrivateChallenge(challenge.project);
    if (selectedCategory === "My Challenges") return challenge.project.createdBy === user?.uid || joinedProjectIds.has(challenge.project.id);
    return true;
  });
  const visibleListChallenges = filteredChallenges.slice(0, 20);

  const givingBalance = Math.max(0, (profile?.totalGiveAllocated ?? 0) - (profile?.totalDonated ?? 0));

  async function beginJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    if (activeProject && profile?.activeProjectId !== challenge.project.id && givingBalance > 0) {
      setJoinChoice(challenge);
      return;
    }
    await completeJoin(challenge);
  }

  async function handleJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    await beginJoin(challenge);
  }

  async function completeJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    // Close any choice modal immediately so the user gets instant feedback
    setJoinChoice(null);
    setJoiningId(challenge.project.id);
    try {
      const balanceTransfer = await switchCause(user.uid, profile?.activeProjectId ?? null, challenge.project.id);
      const causeJarBalances = balanceTransfer
        ? { ...(profile?.causeJarBalances ?? {}), ...balanceTransfer }
        : profile?.causeJarBalances;
      updateProfile({
        activeProjectId: challenge.project.id,
        joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])),
        ...(causeJarBalances ? { causeJarBalances } : {}),
      });
      setGoalPickerProjectId(challenge.project.id);
    } catch (err) {
      console.error("completeJoin failed:", err);
    } finally {
      setJoiningId(null);
      if (shareAfterJoinId.current === challenge.project.id) {
        setPendingShareId(shareAfterJoinId.current);
        shareAfterJoinId.current = null;
      }
    }
  }

  async function handleActivateNewChallenge() {
    if (!pendingActivationChallenge) return;
    const challenge = pendingActivationChallenge;
    setPendingActivationChallenge(null);
    if (activeProject && givingBalance > 0) {
      // Show switch-warning modal first; share fires after that flow completes via shareAfterJoinId
      setJoinChoice(challenge);
      shareAfterJoinId.current = challenge.project.id;
    } else {
      await completeJoin(challenge);
      setPendingShareId(challenge.project.id);
    }
  }

  function handleSkipActivation() {
    if (!pendingActivationChallenge) return;
    const id = pendingActivationChallenge.project.id;
    setPendingActivationChallenge(null);
    setPendingShareId(id);
  }

  async function handleCreateChallenge(data: {
    title: string;
    organizer: string;
    description: string;
    donationURL: string;
    donationNote?: string;
    imageURL?: string;
    imagePosition?: string;
    impactUnitName?: string;
    impactUnitCost?: number;
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
    durationDays?: number | null;
    isOrganization?: boolean;
    groupName?: string;
    goalAmount?: number;
  }) {
    if (!user || creating) return;
    setCreating(true);
    try {
      const visibility = normalizeChallengeVisibility(data.visibility);
      const projectId = await addCustomProject(user.uid, {
        title: data.title,
        projectKind: "challenge",
        sponsor: data.organizer,
        goalAmount: data.goalAmount ?? 0,
        description: data.description,
        donationURL: data.donationURL,
        donationNote: data.donationNote,
        imageURL: data.imageURL,
        imagePosition: data.imagePosition,
        unitName: data.impactUnitName,
        unitDisplay: data.impactUnitName ? `${data.impactUnitName.toLowerCase()}s` : undefined,
        unitCost: data.impactUnitCost,
        visibility,
        groupName: data.groupName,
        tags: ["custom", "challenge", data.category, visibilityTagFor(data.visibility), ...(data.isOrganization ? ["organization"] : [])],
        durationDays: data.durationDays ?? null,
      });
      await refetch();
      setSelectedCategory("My Challenges");
      setShowCreateForm(false);
      setPendingActivationProjectId(projectId);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateChallenge(challenge: ChallengeCard, data: {
    title: string;
    organizer: string;
    description: string;
    donationURL: string;
    imageURL?: string;
    imagePosition?: string;
    impactUnitName?: string;
    impactUnitCost?: number;
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
    durationDays?: number | null;
    isOrganization?: boolean;
    groupName?: string;
    goalAmount?: number;
  }) {
    if (!user || creating) return;
    setCreating(true);
    try {
      const visibility = normalizeChallengeVisibility(data.visibility);
      await updateCustomProject(user.uid, challenge.project.id, {
        title: data.title,
        sponsor: data.organizer,
        goalAmount: data.goalAmount ?? 0,
        description: data.description,
        donationURL: data.donationURL,
        imageURL: data.imageURL,
        imagePosition: data.imagePosition,
        unitName: data.impactUnitName,
        unitDisplay: data.impactUnitName ? `${data.impactUnitName.toLowerCase()}s` : undefined,
        unitCost: data.impactUnitCost,
        visibility,
        groupName: data.groupName,
        tags: ["custom", "challenge", data.category, visibilityTagFor(data.visibility), ...(data.isOrganization ? ["organization"] : [])],
      });
      await refetch();
      setEditingChallenge(null);
      router.push(`/challenges/${challenge.project.id}/manage`);
    } finally {
      setCreating(false);
    }
  }

  async function handleShareChallenge(challenge: ChallengeCard) {
    const url = appendRefParam(`${window.location.origin}/join/${challenge.project.id}`, user?.uid);
    const groupName = challenge.project.groupName ?? challenge.title;
    const msg = `Join My iSkipped Group, ${groupName}, to help raise funds for ${challenge.project.title}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause!`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: challenge.title, text: msg, url });
        return;
      } catch { /* dismissed */ }
    }
    setShareChallenge(challenge);
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-24 md:pb-8">
      <div className="flex md:hidden items-center justify-between mb-5">
        <p className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          i<span style={{ color: "var(--green-primary)" }}>skipped</span>
        </p>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2.5 rounded-full text-sm font-black"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          + Create
        </button>
      </div>

      <div className="hidden md:flex items-center justify-between mb-6">
        <p className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Challenges</p>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2.5 rounded-full text-sm font-black"
          style={{
            background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
            color: "var(--bg-base)",
            boxShadow: "0 4px 18px var(--gold-glow)",
          }}
        >
          + Create
        </button>
      </div>

      {selectedCategory !== "Archived" && <section className="mt-6">
        <SectionHeader title="Partner Challenges" subtitle="Challenges created with verified charities" />
        <div className="space-y-3">
          {partnerChallenges.map((challenge) => (
            <ChallengeListCard
              key={challenge.project.id}
              challenge={challenge}
              isActive={challenge.project.id === profile?.activeProjectId}
              isJoining={joiningId === challenge.project.id}
              canEdit={false}
              onOpen={() => router.push(`/challenges/${challenge.project.id}`)}
              onEdit={() => {}}
              onShare={() => handleShareChallenge(challenge)}
              onJoin={() => handleJoin(challenge)}
            />
          ))}
        </div>
      </section>}

      <div className="mt-8 mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>Community Challenges</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Started by people like you.</p>
        </div>
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
          + Create
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_OPTIONS.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className="flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={selectedCategory === category
              ? { background: "#2ECC71", color: "#0B1A14" }
              : { border: "1px solid rgba(46,204,113,0.3)", color: "var(--text-secondary)" }
            }
          >
            {category}
          </button>
        ))}
      </div>

      {selectedCategory === "Archived" ? (
        archivedChallenges.length > 0 ? (
          <div className="mt-3 space-y-3">
            {archivedChallenges.map((challenge) => {
              const remaining = profile?.causeJarBalances?.[challenge.project.id] ?? 0;
              return (
                <div key={challenge.project.id}>
                  <ChallengeListCard
                    challenge={challenge}
                    isActive={false}
                    isJoining={false}
                    canEdit={false}
                    onOpen={() => router.push(`/challenges/${challenge.project.id}`)}
                    onEdit={() => {}}
                    onShare={() => {}}
                    onJoin={() => {}}
                  />
                  {remaining > 0 && (
                    <div className="mx-0.5 -mt-1 rounded-b-2xl px-4 pb-3 pt-4 flex gap-2" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", borderTop: "none" }}>
                      <span className="text-xs font-semibold" style={{ color: "#F59E0B" }}>{formatCurrency(remaining)} remaining</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
                      <button
                        onClick={() => router.push("/jars?tab=cause")}
                        className="text-xs font-bold"
                        style={{ color: "#F59E0B" }}
                      >Log Donation →</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-xl py-8 text-center" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>No archived challenges yet.</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Challenges you participated in will appear here after they end.</p>
          </div>
        )
      ) : visibleListChallenges.length > 0 ? (
        <div className="mt-3 space-y-3">
          {visibleListChallenges.map((challenge) => (
            <ChallengeListCard
              key={challenge.project.id}
              challenge={challenge}
              isActive={challenge.project.id === profile?.activeProjectId}
              isJoining={joiningId === challenge.project.id}
              canEdit={challenge.project.createdBy === user?.uid}
              onOpen={() => router.push(`/challenges/${challenge.project.id}`)}
              onEdit={() => router.push(`/challenges/${challenge.project.id}/manage`)}
              onShare={() => handleShareChallenge(challenge)}
              onJoin={() => handleJoin(challenge)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl py-8 text-center" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>No community challenges yet.</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Be the first to start one.</p>
        </div>
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

      {pendingActivationChallenge && (
        <MakeActivePromptModal
          challenge={pendingActivationChallenge}
          onYes={handleActivateNewChallenge}
          onNo={handleSkipActivation}
        />
      )}

      {joinChoice && (
        <JoinChoiceModal
          challenge={joinChoice}
          activeTitle={activeProject?.groupName ?? activeProject?.title ?? "your current jar"}
          pledgeAmount={givingBalance}
          isJoining={joiningId === joinChoice.project.id}
          onClose={() => setJoinChoice(null)}
          onDonateNow={() => router.push("/jars?tab=cause")}

          onMovePledge={() => completeJoin(joinChoice)}
        />
      )}

      {shareChallenge && (
        <ShareChallengeModal
          challenge={shareChallenge}
          inviterUid={user?.uid ?? null}
          onClose={() => setShareChallenge(null)}
        />
      )}

      {goalPickerProjectId && (
        <PersonalGoalPickerModal
          onClose={() => setGoalPickerProjectId(null)}
          onSet={async (amount) => {
            if (!user) return;
            await setUserCauseGoal(user.uid, goalPickerProjectId, amount);
            updateProfile({ causeGoalAmounts: { ...(profile?.causeGoalAmounts ?? {}), [goalPickerProjectId]: amount } });
            setGoalPickerProjectId(null);
          }}
        />
      )}
    </div>
  );
}

function PersonalGoalPickerModal({
  onClose,
  onSet,
}: {
  onClose: () => void;
  onSet: (amount: number) => Promise<void>;
}) {
  const PRESETS = [25, 50, 100, 200];
  const [custom, setCustom] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSet(amount: number) {
    if (saving || amount <= 0) return;
    setSaving(true);
    try { await onSet(amount); } finally { setSaving(false); }
  }

  const parsedCustom = parseFloat(custom);
  const customValid = !isNaN(parsedCustom) && parsedCustom > 0;
  const saveAmount = customValid ? parsedCustom : selected;
  const canSave = saveAmount !== null && saveAmount > 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md p-5 shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>You&apos;re in! 🙌</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Set a personal savings goal for this challenge. Your jar will show your progress toward it.</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {PRESETS.map((amount) => {
            const isSelected = selected === amount && !customValid;
            return (
              <button
                key={amount}
                type="button"
                onClick={() => { setSelected(amount); setCustom(""); }}
                disabled={saving}
                className="py-3 rounded-xl text-sm font-black disabled:opacity-50"
                style={{
                  background: isSelected ? "#2ECC71" : "var(--bg-surface-2)",
                  border: isSelected ? "1px solid #2ECC71" : "1px solid var(--border-default)",
                  color: isSelected ? "#0B1A14" : "var(--text-primary)",
                }}
              >
                ${amount}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
          <input
            type="number"
            min={1}
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
            placeholder="Custom amount"
            className="w-full rounded-xl pl-7 pr-4 py-3 text-sm focus:outline-none"
            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
        </div>

        <button
          type="button"
          onClick={() => canSave && handleSet(saveAmount!)}
          disabled={saving || !canSave}
          className="mt-3 w-full py-3 rounded-xl text-sm font-black disabled:opacity-40"
          style={{ background: "#2ECC71", color: "#0B1A14" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{title}</p>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
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
  isJoining,
  canEdit,
  onOpen,
  onEdit,
  onShare,
  onJoin,
}: {
  challenge: ChallengeCard;
  isActive: boolean;
  isJoining: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onShare: () => void;
  onJoin: () => void;
}) {
  const endDateMs = challenge.project.endDate?.toMillis?.();
  const isExpired = challenge.project.status === "ended" || (endDateMs ? endDateMs < Date.now() : false);
  const joinLabel = isActive ? "Active" : isJoining ? "Joining..." : "Join Challenge";
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
              <p className="text-sm font-black leading-snug" style={{ color: "var(--text-primary)" }}>
                {challenge.project.groupName ?? challenge.title}
              </p>
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
        {challenge.project.groupName && (
          <p className="text-xs mt-1.5 font-semibold truncate" style={{ color: "var(--green-primary)" }}>
            Skipping for: {challenge.project.title}
          </p>
        )}
        {challenge.impactLine && <p className="text-xs mt-1 font-semibold" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>}
        {(challenge.project.goalAmount ?? 0) > 0
          ? <ProgressBar challenge={challenge} className="mt-2" />
          : (challenge.project.totalRaised ?? 0) > 0 || (challenge.project.totalSkips ?? 0) > 0
            ? (
              <p className="text-xs mt-2 font-semibold" style={{ color: "var(--text-muted)" }}>
                {formatCurrency(challenge.project.totalRaised ?? 0)} raised
                {(challenge.project.totalSkips ?? 0) > 0 ? ` · ${(challenge.project.totalSkips ?? 0).toLocaleString()} skips` : ""}
              </p>
            )
            : null
        }
        {challenge.trustLabel !== "Community" && <div className="mt-2"><Badge>{challenge.trustLabel}</Badge></div>}
        {!challenge.project.donationURL && (
          <p className="text-xs mt-2 font-semibold" style={{ color: "#F59E0B" }}>
            ⚠ No external donation link — verify where to send funds before joining
          </p>
        )}
        {isExpired ? (
          challenge.project.donationURL ? (
            <a
              href={challenge.project.donationURL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-center block"
              style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              onClick={(e) => e.stopPropagation()}
            >
              Challenge ended · Donate →
            </a>
          ) : (
            <p className="mt-3 text-xs font-semibold text-center" style={{ color: "var(--text-muted)" }}>
              Challenge ended
            </p>
          )
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onJoin();
            }}
            disabled={isActive || isJoining}
            className="mt-3 w-full py-2 rounded-xl text-xs font-bold disabled:opacity-70"
            style={isActive
              ? { border: "1px solid var(--border-emphasis)", color: "var(--green-primary)", background: "rgba(46,204,113,0.12)" }
              : { background: "#2ECC71", color: "#0B1A14" }
            }
          >
            {joinLabel}
          </button>
        )}
      </div>
    </article>
  );
}

function MakeActivePromptModal({
  challenge,
  onYes,
  onNo,
}: {
  challenge: ChallengeCard;
  onYes: () => void;
  onNo: () => void;
}) {
  const name = challenge.project.groupName ?? challenge.title;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="rounded-2xl w-full max-w-md shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}
      >
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Make this your active jar?</p>
          <p className="text-sm mt-1 font-bold" style={{ color: "var(--green-primary)" }}>{name}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Would you like skips you log to go toward <strong>{name}</strong>?
          </p>
        </div>
        <div className="px-5 pb-5 space-y-3 text-center">
          <button
            type="button"
            onClick={onYes}
            className="block w-full py-3 rounded-full text-sm font-black"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
            }}
          >
            Yes, make it active
          </button>
          <button
            type="button"
            onClick={onNo}
            className="text-xs font-bold underline"
            style={{ color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            No, keep my current jar
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinChoiceModal({
  challenge,
  activeTitle,
  pledgeAmount,
  isJoining,
  onClose,
  onDonateNow,
  onMovePledge,
}: {
  challenge: ChallengeCard;
  activeTitle: string;
  pledgeAmount: number;
  isJoining: boolean;
  onClose: () => void;
  onDonateNow: () => void;
  onMovePledge: () => void;
}) {
  const destinationType = isChallengeProject(challenge.project) ? "challenge" : "cause";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md shadow-2xl"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 relative" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <button onClick={onClose} className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
          <p className="text-2xl font-black pr-6" style={{ color: "var(--text-primary)" }}>Before you switch to:</p>
          <p className="text-sm mt-1 font-bold" style={{ color: "var(--green-primary)" }}>{challenge.project.groupName ?? challenge.title}</p>
        </div>

        <div className="px-5 pt-4">
          <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-base font-black" style={{ color: "var(--coral-primary)" }}>{formatCurrency(pledgeAmount)} pledged to {activeTitle}</p>
          </div>
          <p className="text-sm leading-relaxed mt-4" style={{ color: "var(--text-secondary)" }}>
            You have {formatCurrency(pledgeAmount)} pledged to {activeTitle}. We recommend donating before switching to a new {destinationType}.
          </p>
        </div>

        <div className="px-5 py-4 space-y-3 text-center">
          <button
            type="button"
            onClick={onDonateNow}
            disabled={isJoining}
            className="block w-full py-3 rounded-full text-sm font-black disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
            }}
          >
            Donate funds
          </button>
          <button
            type="button"
            onClick={onMovePledge}
            disabled={isJoining}
            className="text-xs font-bold underline disabled:opacity-60"
            style={{ color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            Move balance to this {destinationType}
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

          {!challenge.project.donationURL && (
            <div className="mt-5 rounded-xl px-4 py-3" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)" }}>
              <p className="text-sm font-bold" style={{ color: "#F59E0B" }}>No external donation link</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {challenge.project.donationNote || "Make sure you validate who and where you are sending your donations before doing so."}
              </p>
            </div>
          )}

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
  inviterUid,
  onClose,
}: {
  challenge: ChallengeCard;
  inviterUid: string | null;
  onClose: () => void;
}) {
  const url = appendRefParam(
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${challenge.project.id}`
      : `/join/${challenge.project.id}`,
    inviterUid
  );
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const groupNameForMsg = challenge.project.groupName ?? challenge.title;
  const shareMessage = `Join My iSkipped Group, ${groupNameForMsg}, to help raise funds for ${challenge.project.title}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause! ${url}`;
  const shareIntentText = `Join My iSkipped Group, ${groupNameForMsg}, to help raise funds for ${challenge.project.title}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause!`;

  async function handleCopyMessage() {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {}
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
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
          <ShareLinksRow url={url} text={shareIntentText} />
        </div>
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
    donationURL: string;
    donationNote?: string;
    imageURL?: string;
    imagePosition?: string;
    impactUnitName?: string;
    impactUnitCost?: number;
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
    durationDays?: number | null;
    isOrganization?: boolean;
    groupName?: string;
    goalAmount?: number;
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
  const [donationURL, setDonationURL] = useState(initialProject?.donationURL ?? "");
  const [useImpactUnit, setUseImpactUnit] = useState(Boolean(initialProject?.unitName && initialProject?.unitCost));
  const [impactUnitName, setImpactUnitName] = useState(initialProject?.unitName ?? "");
  const [impactUnitCost, setImpactUnitCost] = useState(initialProject?.unitCost ? String(initialProject.unitCost) : "");
  const [imageURL, setImageURL] = useState(initialProject?.imageURL ?? "");
  const [imgPos, setImgPos] = useState({ x: 50, y: 50 });
  const [imageError, setImageError] = useState("");
  const dragStart = useRef<{ clientX: number; clientY: number; posX: number; posY: number } | null>(null);
  const [category, setCategory] = useState<CreateChallengeCategory>(initialCategory);
  const [visibility, setVisibility] = useState<ChallengeAccessChoice>(
    normalizeChallengeVisibility(initialProject?.visibility as ChallengeVisibility | undefined)
  );
  const [durationDays, setDurationDays] = useState<number | null | "custom">(30);
  const [customDateStr, setCustomDateStr] = useState("");
  const [isOrg, setIsOrg] = useState(Boolean(initialProject?.tags?.includes("organization")));
  const [groupName, setGroupName] = useState(initialProject?.groupName ?? "");
  const [goalAmountStr, setGoalAmountStr] = useState(initialProject?.goalAmount ? String(initialProject.goalAmount) : "");
  const [noDonationLink, setNoDonationLink] = useState(!initialProject?.donationURL && Boolean(initialProject?.donationNote));
  const [donationNote, setDonationNote] = useState(initialProject?.donationNote ?? "");

  const parsedImpactUnitCost = parseFloat(impactUnitCost);
  const canContinueBasics = groupName.trim().length > 0;
  const canContinueImpact = title.trim().length > 0 && (noDonationLink || donationURL.trim().length > 0) && (!useImpactUnit || (impactUnitName.trim().length > 0 && parsedImpactUnitCost > 0));
  const canCreate = canContinueBasics && canContinueImpact;

  function handleImageFile(file: File | undefined) {
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    const objectURL = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectURL);
      const MAX_WIDTH = 900;
      const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setImageURL(canvas.toDataURL("image/jpeg", 0.8));
      setImgPos({ x: 50, y: 50 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectURL);
      setImageError("Could not read that image. Try another file.");
    };
    img.src = objectURL;
  }

  function handleNext() {
    if (step === 1 && canContinueBasics) setStep(2);
    if (step === 2 && canContinueImpact) setStep(3);
  }

  function handleCreate() {
    if (!canCreate) return;
    const parsedGoalAmount = parseFloat(goalAmountStr);
    onCreate({
      title: title.trim(),
      organizer: organizer.trim(),
      description: description.trim(),
      donationURL: noDonationLink ? "" : donationURL.trim(),
      donationNote: noDonationLink ? donationNote.trim() || undefined : undefined,
      imageURL: imageURL.trim() || undefined,
      imagePosition: imageURL.trim() ? `${imgPos.x}% ${imgPos.y}%` : undefined,
      impactUnitName: useImpactUnit ? impactUnitName.trim() : undefined,
      impactUnitCost: useImpactUnit ? parsedImpactUnitCost : undefined,
      category,
      visibility,
      durationDays: isEditing ? undefined : (durationDays === "custom"
        ? (customDateStr ? Math.max(1, Math.ceil((new Date(customDateStr).getTime() - Date.now()) / 86400_000)) : null)
        : durationDays),
      isOrganization: isOrg,
      groupName: groupName.trim() || undefined,
      goalAmount: parsedGoalAmount > 0 ? parsedGoalAmount : 0,
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
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Group Name</p>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. The Coffee Skipping Club"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={100}
                  autoFocus
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
                <div
                  className="relative rounded-xl overflow-hidden mb-2 h-36 flex items-center justify-center select-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", cursor: imageURL ? "grab" : "default" }}
                  onPointerDown={(e) => {
                    if (!imageURL) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragStart.current = { clientX: e.clientX, clientY: e.clientY, posX: imgPos.x, posY: imgPos.y };
                  }}
                  onPointerMove={(e) => {
                    if (!dragStart.current) return;
                    const dx = e.clientX - dragStart.current.clientX;
                    const dy = e.clientY - dragStart.current.clientY;
                    setImgPos({
                      x: Math.min(100, Math.max(0, dragStart.current.posX - dx / 2)),
                      y: Math.min(100, Math.max(0, dragStart.current.posY - dy / 2)),
                    });
                  }}
                  onPointerUp={() => { dragStart.current = null; }}
                  onPointerCancel={() => { dragStart.current = null; }}
                >
                  {imageURL ? (
                    <>
                      <img
                        src={imageURL}
                        alt="Challenge cover preview"
                        className="w-full h-full object-cover"
                        style={{ objectPosition: `${imgPos.x}% ${imgPos.y}%`, pointerEvents: "none" }}
                        draggable={false}
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center py-1.5" style={{ background: "rgba(0,0,0,0.45)" }}>
                        <span className="text-xs font-bold text-white">Drag to reposition</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setImageURL(""); }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 14, lineHeight: 1 }}
                      >
                        🗑
                      </button>
                    </>
                  ) : (
                    <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Add a cover image</span>
                  )}
                </div>
                <div className="flex">
                  <label className="px-5 py-3 rounded-full text-sm font-bold cursor-pointer select-none" style={{ background: "#2ECC71", color: "#0B1A14", touchAction: "manipulation", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
                    Upload photo
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageFile(event.target.files?.[0])} />
                  </label>
                </div>
                {imageError && <p className="text-xs mt-2" style={{ color: "var(--coral-primary)" }}>{imageError}</p>}
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Impact</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>A Skip Helps Fund...</p>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. A Child's Education"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={100}
                  autoFocus
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Group Fundraising Target</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    value={goalAmountStr}
                    onChange={(event) => setGoalAmountStr(event.target.value)}
                    placeholder="e.g. 500"
                    className="w-full rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    min="0"
                  />
                </div>
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
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                  {noDonationLink ? "Instructions to Send Donation" : "Donation Destination"}
                </p>
                {!noDonationLink && (
                  <a
                    href={donationURL || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    onClick={(e) => e.preventDefault()}
                    tabIndex={-1}
                    style={{ pointerEvents: "none" }}
                  >
                    <input
                      type="url"
                      value={donationURL}
                      onChange={(event) => setDonationURL(event.target.value)}
                      placeholder="Paste a GoFundMe, charity, or donation link"
                      className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                      style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)", pointerEvents: "auto" }}
                      maxLength={500}
                    />
                  </a>
                )}
                {noDonationLink && (
                  <textarea
                    value={donationNote}
                    onChange={(e) => setDonationNote(e.target.value)}
                    placeholder="e.g. Send via Venmo @username, or Zelle to family@email.com"
                    rows={2}
                    className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    maxLength={200}
                  />
                )}
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noDonationLink}
                    onChange={(e) => { setNoDonationLink(e.target.checked); if (e.target.checked) setDonationURL(""); }}
                    className="w-4 h-4 rounded accent-green-500"
                  />
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>I don&apos;t have a donation link</span>
                </label>
              </div>
              {!isEditing && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Challenge duration</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { label: "2 weeks", days: 14 as number | null | "custom" },
                      { label: "1 month", days: 30 as number | null | "custom" },
                      { label: "2 months", days: 60 as number | null | "custom" },
                      { label: "Pick a date", days: "custom" as number | null | "custom" },
                      { label: "Open-ended", days: null as number | null | "custom" },
                    ]).map(({ label, days }) => (
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
                  {durationDays === "custom" && (
                    <input
                      type="date"
                      value={customDateStr}
                      min={new Date(Date.now() + 86400_000).toISOString().split("T")[0]}
                      onChange={(e) => setCustomDateStr(e.target.value)}
                      className="mt-3 w-full rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                  )}
                  {durationDays !== null && durationDays !== "custom" && (
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                      Challenge ends {new Date(Date.now() + durationDays * 86400_000).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                    </p>
                  )}
                  {durationDays === "custom" && customDateStr && (
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                      Challenge ends {new Date(customDateStr).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <>
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Access and preview</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ["public", "Public", "Free for anyone to join."],
                  ["private", "Invite Only", "Only people with your link can join."],
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
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                {imageURL && <img src={imageURL} alt="" className="w-full h-28 object-cover" />}
                <div className="p-4">
                  <div className="flex gap-2 mb-2">
                    <Badge>Community</Badge>
                    <Badge>{visibility === "private" ? "Invite Only" : "Public"}</Badge>
                  </div>
                  <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>{groupName || title || "Group name"}</p>
                  {groupName && title && (
                    <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--green-primary)" }}>Skipping for: {title}</p>
                  )}
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{organizer || "Organizer"}</p>
                  <p className="text-sm mt-3 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                    {description || "Your challenge story will appear here."}
                  </p>
                  {useImpactUnit && impactUnitName && parsedImpactUnitCost > 0 && (
                    <p className="text-sm mt-3 font-black" style={{ color: "var(--green-primary)" }}>
                      1 {impactUnitName} = {formatCurrency(parsedImpactUnitCost)}
                    </p>
                  )}
                  {noDonationLink && (
                    <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)" }}>
                      <p className="text-xs font-bold" style={{ color: "#F59E0B" }}>No external donation link</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {donationNote.trim() || "Members should verify where to send donations before doing so."}
                      </p>
                    </div>
                  )}
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
