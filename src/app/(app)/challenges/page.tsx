"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { Project } from "@/lib/types/models";
import { pinProjectToHome, setFavoriteCause } from "@/lib/services/firebase/users";
import { addCustomProject, isChallengeProject, isProjectEnded, updateCustomProject, OFFICIAL_PROJECTS, PARTNER_CHALLENGE_IDS } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";
import { oneUnitPhrase } from "@/lib/utils/impact";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { appendRefParam, getChallengeSharePath } from "@/lib/utils/share";
import { getDirectChallengeShareText } from "@/lib/utils/challengeShareCopy";
import { ShareButton } from "@/components/share/ShareButton";
import { apiRequest } from "@/lib/services/firebase/apiClient";
import { DESIGNATED_ADMIN_EMAIL } from "@/lib/constants/admin";

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
  goalInviteLine: string | null;
  skipHelpLine: string;
  skipHelpDetail: string | null;
  goal: number;
  goalLine: string;
  pledgedLine: string;
  progressPct: number;
  joinedLabel: string | null;
  trustLabel: "Verified Partner" | "Community" | "Private invite";
};


function isVisibleChallenge(project: Project): boolean {
  return isChallengeProject(project);
}

const CATEGORY_OPTIONS = ["All", "My Fundraisers", "Archived"] as const;
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
  if (project.goalAmount > 0) return project.goalAmount;
  if (project.unitCost && project.unitCost > 0) return project.unitCost * 10;
  return 0;
}

function getUnitLabel(project: Project): string {
  return project.unitDisplay ?? project.unitName ?? "units";
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

function defaultUnitDisplay(unitName: string): string {
  const trimmed = unitName.trim();
  if (!trimmed) return "";
  if (/\s/.test(trimmed) && /s$/i.test(trimmed)) return trimmed;
  if (/s$/i.test(trimmed) && !/ss$/i.test(trimmed)) return trimmed;
  if (/(?:ss|x|z|ch|sh)$/i.test(trimmed)) return `${trimmed}es`;
  if (/[^aeiou]y$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ies`;
  return `${trimmed}s`;
}

function normalizeUnitDisplay(unitName: string, unitDisplay: string): string {
  const trimmedName = unitName.trim();
  const trimmedDisplay = unitDisplay.trim();
  if (!trimmedName) return trimmedDisplay;
  if (trimmedName.endsWith("s") && trimmedDisplay.toLowerCase() === `${trimmedName}es`.toLowerCase()) {
    return trimmedName;
  }
  return trimmedDisplay || defaultUnitDisplay(trimmedName);
}

function getSkipChallengeLine(project: Project): string | null {
  const milestones = project.skipMilestones;
  if (!milestones) return null;
  const levels = [milestones.level1, milestones.level2, milestones.level3].filter((value) => Number.isFinite(value) && value > 0);
  if (levels.length === 0) return null;
  return `Level 1: ${levels[0]} ${levels[0] === 1 ? "Skip" : "Skips"}`;
}

function descriptionAfterSkipLead(description: string): string {
  return description
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can\s+)?(?:help\s+)?fund\s+/i, "")
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can\s+)?(?:help\s+)?provide\s+/i, "")
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can\s+)?(?:help\s+)?/i, "")
    .replace(/^help\s+(?:fund|provide|equip)\s+/i, "")
    .trim();
}

function skipHelpDetail(project: Project): string | null {
  if (project.unitIsGoal && (project.unitPhrase || project.unitName)) {
    const phrase = (project.unitPhrase ?? oneUnitPhrase(project.unitName!)).trim();
    const location = project.location?.trim();
    const withLocation = location && !phrase.toLowerCase().includes(location.toLowerCase())
      ? `${phrase} in ${location}`
      : phrase;
    return `${withLocation}.`;
  }
  return null;
}

function sentenceCaseStart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function challengeFromProject(project: Project, reconciledTotal?: number): ChallengeCard {
  const category = challengeCategory(project);
  const fallback = fallbackForCategory(category);
  const goal = getChallengeGoal(project);
  const raised = Math.min(goal, Math.max(0, reconciledTotal ?? ((project.totalRaised ?? 0) + (project.totalDonated ?? 0))));
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const unitCost = project.unitCost ?? 0;
  const hasUnits = unitCost > 0 && goal > 0;
  const unitLabel = getUnitLabel(project);
  const goalUnits = hasUnits ? Math.round(goal / unitCost) : 0;
  const donatedUnits = hasUnits ? Math.floor(raised / unitCost) : 0;
  return {
    project,
    title: challengeTitle(project),
    beneficiary: project.location ? `for ${project.location}` : project.sponsor ? `by ${project.sponsor}` : "community fundraiser",
    description: descriptionAfterSkipLead(project.description || "Skip anything. Your small choices help this move."),
    category,
    imageURL: project.imageURL || (project.isCustom ? null : fallback.imageURL),
    fallbackLabel: fallback.label,
    impactLine: project.unitName && project.unitCost
      ? `${formatCurrency(project.unitCost)} = 1 ${project.unitName}`
      : project.goalAmount > 0
        ? `Goal: ${formatCurrency(project.goalAmount)}`
        : null,
    skipChallengeLine: getSkipChallengeLine(project),
    goalInviteLine: hasUnits
      ? `Help fund ${goalUnits.toLocaleString()} ${unitLabel} with skipped savings.`
      : null,
    skipHelpLine: "Your skips could help fund...",
    skipHelpDetail: skipHelpDetail(project),
    goal,
    goalLine: hasUnits
      ? `${donatedUnits.toLocaleString()} / ${goalUnits.toLocaleString()} ${unitLabel} donated`
      : `${formatCurrency(raised)} / ${formatCurrency(goal)}`,
    pledgedLine: `${formatCurrency(raised)} donated so far`,
    progressPct,
    joinedLabel: (project.memberUids?.length ?? 0) > 0 ? `${project.memberUids!.length} joined` : null,
    trustLabel: project.isCustom
      ? (project.visibility === "private" || project.visibility === "unlisted" || project.tags?.some((tag) => tag === "visibility-private" || tag === "visibility-unlisted")
        ? "Private invite"
        : "Community")
      : "Verified Partner",
  };
}


export default function ChallengesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const createRequested = searchParams.get("create") === "1";
  const { user, profile, updateProfile } = useAuthStore();
  const { projects, refetch } = useProjects();
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("All");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeCard | null>(null);
  const [shareChallenge, setShareChallenge] = useState<ChallengeCard | null>(null);
  const [pendingShareId, setPendingShareId] = useState<string | null>(null);
  const shareAfterJoinId = useRef<string | null>(null);
  const [pendingActivationProjectId, setPendingActivationProjectId] = useState<string | null>(null);
  const [pendingActivationChallenge, setPendingActivationChallenge] = useState<ChallengeCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [reconciledTotals, setReconciledTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (createRequested) setShowCreateForm(true);
  }, [createRequested]);

  const challenges = useMemo(() => projects.filter(isVisibleChallenge).map(challengeFromProject), [projects]);
  const partnerChallenges = useMemo(
    () => OFFICIAL_PROJECTS.filter((p) => PARTNER_CHALLENGE_IDS.includes(p.id)).map(challengeFromProject),
    []
  );
  const allChallenges = useMemo(() => {
    const challengesById = new Map<string, ChallengeCard>();
    [...partnerChallenges, ...challenges].forEach((challenge) => {
      challengesById.set(challenge.project.id, challenge);
    });
    return Array.from(challengesById.values());
  }, [challenges, partnerChallenges]);
  useEffect(() => {
    let cancelled = false;
    const ids = allChallenges.map((challenge) => challenge.project.id);
    void Promise.all(ids.map(async (id) => {
      try {
        const totals = await apiRequest<{ total: number }>(`/api/challenges/${id}/totals`, "GET");
        return [id, totals.total] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      setReconciledTotals(Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => entry !== null)));
    });
    return () => { cancelled = true; };
  }, [allChallenges]);
  const reconciledAllChallenges = useMemo(
    () => allChallenges.map((challenge) => challengeFromProject(challenge.project, reconciledTotals[challenge.project.id])),
    [allChallenges, reconciledTotals],
  );
  const archivedChallenges = useMemo(() => {
    if (!profile) return [];
    const joined = new Set([...(profile.joinedProjectIds ?? []), ...(profile.activeProjectId ? [profile.activeProjectId] : [])]);
    return reconciledAllChallenges.filter((challenge) => (
      joined.has(challenge.project.id) || challenge.project.createdBy === user?.uid
    ) && isProjectEnded(challenge.project));
  }, [reconciledAllChallenges, profile?.joinedProjectIds, profile?.activeProjectId, user?.uid]);

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
  const activeChallenge = reconciledAllChallenges.find(
    (challenge) => challenge.project.id === profile?.activeProjectId
  ) ?? null;
  const skipBalance = getSkipBalanceSummary(profile);
  const joinedProjectIds = useMemo(
    () => new Set([...(profile?.joinedProjectIds ?? []), ...(profile?.activeProjectId ? [profile.activeProjectId] : [])]),
    [profile?.joinedProjectIds, profile?.activeProjectId]
  );
  const favoriteProjectIds = useMemo(
    () => new Set(profile?.favoriteCauseIds ?? []),
    [profile?.favoriteCauseIds]
  );
  const filteredChallenges = reconciledAllChallenges.filter((challenge) => {
    if (challenge.project.status === "ended") return false;
    if (selectedCategory === "All") return !isPrivateChallenge(challenge.project) || joinedProjectIds.has(challenge.project.id);
    if (selectedCategory === "My Fundraisers") return favoriteProjectIds.has(challenge.project.id);
    return true;
  });
  const visibleListChallenges = filteredChallenges.slice(0, 20);
  const canManageChallenge = (challenge: ChallengeCard) => (
    challenge.project.createdBy === user?.uid
    || (profile?.email ?? "").trim().toLowerCase() === DESIGNATED_ADMIN_EMAIL
  );

  async function beginJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    await completeJoin(challenge);
  }

  async function handleJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    await beginJoin(challenge);
  }

  async function completeJoin(challenge: ChallengeCard) {
    if (!user || joiningId) return;
    setJoiningId(challenge.project.id);
    try {
      await pinProjectToHome(user.uid, challenge.project.id);
      updateProfile({
        activeProjectId: challenge.project.id,
        activeSkipTarget: { type: "fundraiser", id: challenge.project.id },
        joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])),
      });
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
    await completeJoin(challenge);
    setPendingShareId(challenge.project.id);
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
    location?: string;
    description: string;
    donationURL: string;
    donationNote?: string;
    learnMoreURL?: string;
    imageURL?: string;
    imagePosition?: string;
    impactUnitName?: string;
    impactUnitDisplay?: string;
    impactUnitCost?: number;
    impactUnitIsGoal?: boolean;
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
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
        location: data.location,
        goalAmount: data.goalAmount ?? 0,
        description: data.description,
        donationURL: data.donationURL,
        donationNote: data.donationNote,
        learnMoreURL: data.learnMoreURL,
        imageURL: data.imageURL,
        imagePosition: data.imagePosition,
        unitName: data.impactUnitName,
        unitDisplay: data.impactUnitDisplay,
        unitCost: data.impactUnitCost,
        unitIsGoal: data.impactUnitIsGoal,
        unitPhrase: data.impactUnitIsGoal && data.impactUnitName ? oneUnitPhrase(data.impactUnitName) : undefined,
        visibility,
        groupName: data.groupName,
        tags: ["custom", "challenge", data.category, visibilityTagFor(data.visibility), ...(data.isOrganization ? ["organization"] : [])],
      });
      await refetch();
      setShowCreateForm(false);
      router.push(`/challenges/${projectId}/manage`);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateChallenge(challenge: ChallengeCard, data: {
    title: string;
    organizer: string;
    location?: string;
    description: string;
    donationURL: string;
    donationNote?: string;
    learnMoreURL?: string;
    imageURL?: string;
    imagePosition?: string;
    impactUnitName?: string;
    impactUnitDisplay?: string;
    impactUnitCost?: number;
    impactUnitIsGoal?: boolean;
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
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
        location: data.location,
        goalAmount: data.goalAmount ?? 0,
        description: data.description,
        donationURL: data.donationURL,
        donationNote: data.donationNote,
        learnMoreURL: data.learnMoreURL,
        imageURL: data.imageURL,
        imagePosition: data.imagePosition,
        unitName: data.impactUnitName,
        unitDisplay: data.impactUnitDisplay,
        unitCost: data.impactUnitCost,
        unitIsGoal: data.impactUnitIsGoal,
        unitPhrase: data.impactUnitIsGoal && data.impactUnitName ? oneUnitPhrase(data.impactUnitName) : undefined,
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
    const url = appendRefParam(`${window.location.origin}${getChallengeSharePath(challenge.project)}`, user?.uid);
    const msg = getDirectChallengeShareText(challenge.project);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: challenge.title, text: msg, url });
        return;
      } catch { /* dismissed */ }
    }
    setShareChallenge(challenge);
  }

  async function handleToggleFavorite(challenge: ChallengeCard) {
    if (!user || !profile) return;
    const projectId = challenge.project.id;
    const currentFavorites = profile.favoriteCauseIds ?? [];
    const isFavorite = currentFavorites.includes(projectId);
    const nextFavorites = isFavorite
      ? currentFavorites.filter((id) => id !== projectId)
      : Array.from(new Set([...currentFavorites, projectId]));

    updateProfile({ favoriteCauseIds: nextFavorites });
    try {
      await setFavoriteCause(user.uid, projectId, !isFavorite);
    } catch (err) {
      console.error("setFavoriteCause failed:", err);
      updateProfile({ favoriteCauseIds: currentFavorites });
    }
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
        <p className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Fundraisers</p>
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

      <div
        className="mb-7 rounded-2xl p-5"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--green-primary)" }}>
              Available skipped savings
            </p>
            <p className="mt-1 text-3xl font-black leading-none" style={{ color: "var(--green-primary)" }}>
              {formatCurrency(skipBalance.availableFromSkips)}
            </p>
            <p className="mt-1 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>available to contribute</p>
          </div>
          {activeChallenge ? (
            <div className="max-w-[58%] text-right">
              <button
                type="button"
              onClick={() => router.push(`/challenges/${activeChallenge.project.id}`)}
              className="text-right"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                  Current fundraiser
                </p>
                <p className="mt-1 text-sm font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                  {activeChallenge.title} <span style={{ color: "var(--green-primary)" }}>→</span>
                </p>
              </button>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/home?contribute=log")}
                  className="rounded-lg px-3 py-2 text-xs font-black"
                  style={{ border: "1px solid rgba(46,204,113,0.38)", color: "var(--green-primary)" }}
                >
                  Log donation
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/home?contribute=1")}
                  className="rounded-lg px-3 py-2 text-xs font-black"
                  style={{ background: "var(--green-primary)", color: "#0B1A14" }}
                >
                  Contribute
                </button>
              </div>
            </div>
          ) : (
            <p className="max-w-[52%] text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
              Join a fundraiser to skip together.
            </p>
          )}
        </div>
      </div>

      <section className="mt-8">
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
              const remaining = Math.max(0, profile?.causeJarBalances?.[challenge.project.id] ?? 0);
              return (
                <div key={challenge.project.id}>
                  <ChallengeListCard
                    challenge={challenge}
                    isActive={false}
                    isJoining={false}
                    canEdit={canManageChallenge(challenge)}
                    isFavorite={favoriteProjectIds.has(challenge.project.id)}
                    onOpen={() => router.push(`/challenges/${challenge.project.id}`)}
                    onEdit={() => router.push(`/challenges/${challenge.project.id}/manage`)}
                    onShare={() => {}}
                    onToggleFavorite={() => handleToggleFavorite(challenge)}
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
            <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>No archived fundraisers yet.</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Fundraisers you participated in will appear here after they end.</p>
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
              canEdit={canManageChallenge(challenge)}
              isFavorite={favoriteProjectIds.has(challenge.project.id)}
              onOpen={() => router.push(`/challenges/${challenge.project.id}`)}
              onEdit={() => router.push(`/challenges/${challenge.project.id}/manage`)}
              onShare={() => handleShareChallenge(challenge)}
              onToggleFavorite={() => handleToggleFavorite(challenge)}
              onJoin={() => handleJoin(challenge)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl py-8 text-center" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
            {selectedCategory === "My Fundraisers" ? "No saved fundraisers yet." : "No fundraisers match this filter yet."}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {selectedCategory === "My Fundraisers" ? "Tap a heart to save a fundraiser for later." : "Try another filter or create a fundraiser."}
          </p>
        </div>
      )}
      </section>


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

      {shareChallenge && (
        <ShareChallengeModal
          challenge={shareChallenge}
          inviterUid={user?.uid ?? null}
          onClose={() => setShareChallenge(null)}
        />
      )}

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

function Badge({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <span
      className={`${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} rounded-full font-bold`}
      style={{ background: "rgba(46,204,113,0.12)", color: "var(--green-primary)", border: "1px solid rgba(46,204,113,0.18)" }}
    >
      {children}
    </span>
  );
}

function accessBadgeLabel(challenge: ChallengeCard) {
  return isPrivateChallenge(challenge.project) ? "Private" : "Public";
}

function ProgressBar({ challenge, className = "", showLabels = true }: { challenge: ChallengeCard; className?: string; showLabels?: boolean }) {
  return (
    <div className={className}>
      {showLabels && (
        <div className="flex justify-between gap-3 text-xs font-semibold mb-1.5">
          <span style={{ color: "var(--green-primary)" }}>{challenge.goalLine}</span>
          <span style={{ color: "var(--text-muted)" }}>{challenge.progressPct}%</span>
        </div>
      )}
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
  isFavorite,
  onOpen,
  onEdit,
  onShare,
  onToggleFavorite,
  onJoin,
}: {
  challenge: ChallengeCard;
  isActive: boolean;
  isJoining: boolean;
  canEdit: boolean;
  isFavorite: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  onJoin: () => void;
}) {
  const endDateMs = challenge.project.endDate?.toMillis?.();
  const isExpired = challenge.project.status === "ended" || (endDateMs ? endDateMs < Date.now() : false);
  const joinLabel = isActive ? "Skipping for this" : isJoining ? "Choosing..." : "Skip for this";
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
            </div>
            <div className="mt-0.5 flex items-center gap-2 min-w-0 flex-wrap">
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{challenge.project.sponsor || challenge.beneficiary}</p>
                <Badge compact>{challenge.trustLabel}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite();
              }}
              className="w-8 h-8 rounded-full text-base font-bold transition-transform active:scale-95"
              aria-label={isFavorite ? "Unsave fundraiser" : "Save fundraiser"}
              aria-pressed={isFavorite}
              title={isFavorite ? "Unsave fundraiser" : "Save fundraiser"}
              style={{
                border: isFavorite ? "1px solid rgba(244,63,94,0.42)" : "1px solid var(--border-emphasis)",
                color: isFavorite ? "#F43F5E" : "var(--text-muted)",
                background: isFavorite ? "rgba(244,63,94,0.12)" : "transparent",
              }}
            >
              {isFavorite ? "♥" : "♡"}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShare();
              }}
              className="w-8 h-8 rounded-full text-sm font-bold"
              aria-label="Share fundraiser"
              title="Share fundraiser"
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
                aria-label="Manage fundraiser"
                title="Manage fundraiser"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                ⚙
              </button>
            )}
          </div>
        </div>
        <p className="text-xs mt-2 leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>{challenge.skipHelpLine}</span>{" "}
          {challenge.skipHelpDetail ? `${challenge.skipHelpDetail} ` : ""}
          {challenge.skipHelpDetail ? sentenceCaseStart(challenge.description) : challenge.description}
        </p>
        {challenge.skipChallengeLine && (
          <p className="text-xs mt-1.5 font-bold" style={{ color: "var(--text-secondary)" }}>{challenge.skipChallengeLine}</p>
        )}
        {challenge.impactLine && <p className="text-xs mt-2 font-semibold" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>}
        {challenge.goal > 0
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
              Fundraiser ended · Donate →
            </a>
          ) : (
            <p className="mt-3 text-xs font-semibold text-center" style={{ color: "var(--text-muted)" }}>
              Fundraiser ended
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
          <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Skip for this fundraiser?</p>
          <p className="text-sm mt-1 font-bold" style={{ color: "var(--green-primary)" }}>{name}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Future skips you log will track toward <strong>{name}</strong> by default.
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
            Skip for this
          </button>
          <button
            type="button"
            onClick={onNo}
            className="text-xs font-bold underline"
            style={{ color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            Not now
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
            aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 rounded-full text-xl leading-none"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
              <Badge>{challenge.trustLabel}</Badge>
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
              <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Fundraiser progress</p>
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
              {["Skip anything small", "Log the amount", "Watch the fundraiser move"].map((step, index) => (
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
              {isActive ? "Log a Skip" : isJoining ? "Choosing..." : "Skip for this"}
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
      ? `${window.location.origin}${getChallengeSharePath(challenge.project)}`
      : getChallengeSharePath(challenge.project),
    inviterUid
  );
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const groupNameForMsg = challenge.project.groupName ?? challenge.title;
  const shareIntentText = getDirectChallengeShareText(challenge.project);
  const shareMessage = `${shareIntentText} ${url}`;

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
          <ShareButton url={url} text={shareIntentText} title={groupNameForMsg} />
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
    location?: string;
    description: string;
    donationURL: string;
    donationNote?: string;
    learnMoreURL?: string;
    imageURL?: string;
    imagePosition?: string;
    impactUnitName?: string;
    impactUnitDisplay?: string;
    impactUnitCost?: number;
    impactUnitIsGoal?: boolean;
    category: CreateChallengeCategory;
    visibility: ChallengeAccessChoice;
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
  const [location, setLocation] = useState(initialProject?.location ?? "");
  const [description, setDescription] = useState(initialProject?.description ?? "");
  const [donationURL, setDonationURL] = useState(initialProject?.donationURL ?? "");
  const [learnMoreURL, setLearnMoreURL] = useState(initialProject?.learnMoreURL ?? "");
  const [useImpactUnit, setUseImpactUnit] = useState(isEditing ? Boolean(initialProject?.unitName && initialProject?.unitCost) : true);
  const [impactUnitName, setImpactUnitName] = useState(initialProject?.unitName ?? "");
  const [impactUnitDisplay, setImpactUnitDisplay] = useState(initialProject?.unitDisplay ?? "");
  const [impactUnitCost, setImpactUnitCost] = useState(initialProject?.unitCost ? String(initialProject.unitCost) : "");
  const [imageURL, setImageURL] = useState(initialProject?.imageURL ?? "");
  const [imgPos, setImgPos] = useState(() => {
    const match = initialProject?.imagePosition?.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 50, y: 50 };
  });
  const [imageError, setImageError] = useState("");
  const dragStart = useRef<{ clientX: number; clientY: number; posX: number; posY: number } | null>(null);
  const category: CreateChallengeCategory = initialCategory;
  const [visibility, setVisibility] = useState<ChallengeAccessChoice>(
    normalizeChallengeVisibility(initialProject?.visibility as ChallengeVisibility | undefined)
  );
  const [isOrg, setIsOrg] = useState(Boolean(initialProject?.tags?.includes("organization")));
  const [groupName, setGroupName] = useState(initialProject?.groupName ?? "");
  const [goalAmountStr, setGoalAmountStr] = useState(initialProject?.goalAmount ? String(initialProject.goalAmount) : "");
  // Preserve the existing donation mode while editing. A fundraiser with no
  // link should not become a required-link form just because its note is empty.
  const [noDonationLink, setNoDonationLink] = useState(
    isEditing ? !initialProject?.donationURL : false,
  );
  const [donationNote, setDonationNote] = useState(initialProject?.donationNote ?? "");

  const parsedImpactUnitCost = parseFloat(impactUnitCost);
  const parsedGoalAmount = parseFloat(goalAmountStr);
  const resolvedImpactUnitDisplay = normalizeUnitDisplay(impactUnitName, impactUnitDisplay);
  const previewGoalAmount = parsedGoalAmount;
  const previewGoalUnits = useImpactUnit && parsedImpactUnitCost > 0 && previewGoalAmount > 0
    ? Math.round(previewGoalAmount / parsedImpactUnitCost)
    : 0;
  const previewGoalLine = useImpactUnit && previewGoalUnits > 0
    ? `0 / ${previewGoalUnits.toLocaleString()} ${resolvedImpactUnitDisplay} donated`
    : previewGoalAmount > 0
      ? `${formatCurrency(0)} / ${formatCurrency(previewGoalAmount)}`
      : null;
  const sharePreviewProject = {
    id: initialProject?.id ?? "preview",
    title: title.trim() || groupName.trim() || "this fundraiser",
    groupName: groupName.trim() || undefined,
    sponsor: organizer.trim(),
    description: description.trim(),
    goalAmount: previewGoalAmount > 0 ? previewGoalAmount : 0,
    totalRaised: 0,
    imageURL: imageURL.trim() || null,
    donationURL: noDonationLink ? null : donationURL.trim() || null,
    learnMoreURL: learnMoreURL.trim() || null,
    isCustom: true,
    location: location.trim() || undefined,
    unitName: useImpactUnit ? impactUnitName.trim() || undefined : undefined,
    unitDisplay: useImpactUnit ? resolvedImpactUnitDisplay || undefined : undefined,
    unitCost: useImpactUnit && parsedImpactUnitCost > 0 ? parsedImpactUnitCost : undefined,
    unitIsGoal: false,
    unitPhrase: undefined,
    createdBy: null,
    tags: ["challenge", category],
    visibility: normalizeChallengeVisibility(visibility),
  } satisfies Project;
  const sharePreviewText = getDirectChallengeShareText(sharePreviewProject);
  const canContinueBasics = groupName.trim().length > 0;
  const canContinueImpact = description.trim().length > 0 && (!useImpactUnit || (impactUnitName.trim().length > 0 && parsedImpactUnitCost > 0));
  const canContinueSetup = (noDonationLink || donationURL.trim().length > 0);
  const canCreate = canContinueBasics && canContinueImpact && canContinueSetup;

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
    if (step === 3 && canContinueSetup) setStep(4);
  }

  function handleCreate() {
    if (step !== 4) return;
    if (!canCreate) return;
    onCreate({
      title: title.trim() || groupName.trim(),
      organizer: organizer.trim(),
      location: location.trim() || undefined,
      description: description.trim(),
      donationURL: noDonationLink ? "" : donationURL.trim(),
      donationNote: noDonationLink ? donationNote.trim() || undefined : undefined,
      learnMoreURL: learnMoreURL.trim() || undefined,
      imageURL: imageURL.trim() || undefined,
      imagePosition: imageURL.trim() ? `${imgPos.x}% ${imgPos.y}%` : undefined,
      impactUnitName: useImpactUnit ? impactUnitName.trim() : undefined,
      impactUnitDisplay: useImpactUnit ? resolvedImpactUnitDisplay : undefined,
      impactUnitCost: useImpactUnit ? parsedImpactUnitCost : undefined,
      impactUnitIsGoal: useImpactUnit ? false : undefined,
      category,
      visibility,
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
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
          <p className="text-xl font-black pr-8" style={{ color: "var(--text-primary)" }}>{isEditing ? "Edit Fundraiser" : "Create Fundraiser"}</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Step {step} of 4</p>
          <div className="flex gap-2 mt-4 pr-8">
            {[1, 2, 3, 4].map((value) => (
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
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Fundraiser Name</p>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. Books for Students in Kenya"
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
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Location / region</p>
                <input
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Kenya"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={120}
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Cover image</p>
                <div
                  className="relative rounded-xl overflow-hidden mb-2 h-36 flex items-center justify-center select-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", cursor: imageURL ? "grab" : "default", touchAction: imageURL ? "none" : "auto" }}
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
                        alt="Fundraiser cover preview"
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
                {imageURL && (
                  <div className="space-y-2 rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <p className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Fine-tune the crop</p>
                    <label className="flex items-center gap-3 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                      <span className="w-12">Left / right</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={imgPos.x}
                        onChange={(event) => setImgPos((position) => ({ ...position, x: Number(event.target.value) }))}
                        className="min-w-0 flex-1 accent-[var(--green-primary)]"
                        aria-label="Adjust image left or right"
                      />
                    </label>
                    <label className="flex items-center gap-3 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                      <span className="w-12">Up / down</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={imgPos.y}
                        onChange={(event) => setImgPos((position) => ({ ...position, y: Number(event.target.value) }))}
                        className="min-w-0 flex-1 accent-[var(--green-primary)]"
                        aria-label="Adjust image up or down"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setImgPos({ x: 50, y: 50 })}
                      className="text-xs font-bold"
                      style={{ color: "var(--green-primary)" }}
                    >
                      Reset crop
                    </button>
                  </div>
                )}
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
              <div className="rounded-xl p-3" style={{ background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.2)" }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--green-primary)" }}>Skips will help fund...</p>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. book kits for students in Kenya"
                  rows={2}
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                  style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={140}
                  autoFocus
                />
                <p className="mt-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  Example: book kits for students in Kenya
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Unit cost</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Optional, but helps people understand impact.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={!useImpactUnit}
                      onChange={(event) => setUseImpactUnit(!event.target.checked)}
                      className="w-3.5 h-3.5 accent-green-500"
                    />
                    <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      No unit
                    </span>
                  </label>
                </div>
                {useImpactUnit && (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black shrink-0" style={{ color: "var(--text-primary)" }}>1</span>
                      <input
                        type="text"
                        value={impactUnitName}
                        onChange={(event) => {
                          const previousDefault = defaultUnitDisplay(impactUnitName);
                          const previousBadDefault = impactUnitName.trim().endsWith("s") ? `${impactUnitName.trim()}es` : "";
                          setImpactUnitName(event.target.value);
                          if (!impactUnitDisplay.trim() || impactUnitDisplay === previousDefault || impactUnitDisplay === previousBadDefault) {
                            setImpactUnitDisplay(defaultUnitDisplay(event.target.value));
                          }
                        }}
                        placeholder="book kit"
                        aria-label="Impact unit name"
                        className="min-w-0 flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        maxLength={60}
                      />
                      <span className="text-sm font-black shrink-0" style={{ color: "var(--text-primary)" }}>=</span>
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                        <input
                          type="number"
                          value={impactUnitCost}
                          onChange={(event) => setImpactUnitCost(event.target.value)}
                          placeholder="25.00"
                          aria-label="Impact unit cost"
                          className="w-full rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none"
                          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {!useImpactUnit && (
                  <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                    This fundraiser will show dollars raised instead of funded units.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                  Group goal
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="number"
                    value={goalAmountStr}
                    onChange={(event) => setGoalAmountStr(event.target.value)}
                    placeholder="e.g. 3750"
                    className="w-full rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    min="0"
                  />
                </div>
                {useImpactUnit && previewGoalUnits > 0 && (
                  <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>
                    About <span style={{ color: "var(--color-primary)" }}>{previewGoalUnits.toLocaleString()} {resolvedImpactUnitDisplay}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Setup</p>
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
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Learn more link</p>
                <input
                  type="url"
                  value={learnMoreURL}
                  onChange={(event) => setLearnMoreURL(event.target.value)}
                  placeholder="Optional: charity, campaign, or info page"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  maxLength={500}
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Access</p>
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
              </div>
            </div>
          )}

          {step === 4 && (
            <>
              <div>
                <p className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>Review</p>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                {imageURL && <img src={imageURL} alt="" className="w-full h-28 object-cover" />}
                <div className="p-4">
                  <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>{groupName || title || "Group name"}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{organizer || "Organizer"}</p>
                  {location.trim() && (
                    <p className="text-xs mt-1 font-semibold" style={{ color: "var(--green-primary)" }}>{location.trim()}</p>
                  )}
                  <p className="text-sm mt-3 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>Your skips could help fund...</span>{" "}
                    {description ? sentenceCaseStart(description) : "The impact you choose."}
                  </p>
                  {useImpactUnit && impactUnitName && parsedImpactUnitCost > 0 && (
                    <p className="text-sm mt-3 font-black" style={{ color: "var(--green-primary)" }}>
                      {formatCurrency(parsedImpactUnitCost)} = 1 {impactUnitName}
                    </p>
                  )}
                  {previewGoalLine && (
                    <div className="mt-3">
                      <div className="flex justify-between gap-3 text-xs font-semibold mb-1.5">
                        <span style={{ color: "var(--green-primary)" }}>{previewGoalLine}</span>
                        <span style={{ color: "var(--text-muted)" }}>0%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
                        <div className="h-full rounded-full" style={{ width: "0%", background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))" }} />
                      </div>
                    </div>
                  )}
                  {noDonationLink && (
                    <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)" }}>
                      <p className="text-xs font-bold" style={{ color: "#F59E0B" }}>No external donation link</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {donationNote.trim() || "Members should verify where to send donations before doing so."}
                      </p>
                    </div>
                  )}
                  {learnMoreURL.trim() && (
                    <p className="text-xs mt-3 font-bold" style={{ color: "var(--green-primary)" }}>
                      Learn more: {learnMoreURL.trim()}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.2)" }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--green-primary)" }}>Share message preview</p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{sharePreviewText}</p>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-4 py-3 rounded-full text-sm font-bold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={(step === 1 && !canContinueBasics) || (step === 2 && !canContinueImpact) || (step === 3 && !canContinueSetup)}
                className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                  color: "var(--bg-base)",
                  boxShadow: "0 4px 18px var(--gold-glow)",
                }}
              >
                {step === 1 ? "Next: Impact" : step === 2 ? "Next: Setup" : "Next: Review"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="flex-1 py-3 rounded-full text-sm font-black disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                  color: "var(--bg-base)",
                  boxShadow: "0 4px 18px var(--gold-glow)",
                }}
              >
              {creating ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save Fundraiser" : "Create Fundraiser"}
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
