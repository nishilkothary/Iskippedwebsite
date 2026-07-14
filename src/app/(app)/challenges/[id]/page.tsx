"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { Project } from "@/lib/types/models";
import { switchCause, setUserCauseGoal, normalizeJarSplit } from "@/lib/services/firebase/users";
import { isChallengeProject, getProject } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { appendRefParam } from "@/lib/utils/share";
import { ShareLinksRow } from "@/components/share/ShareLinksRow";

type ChallengeCategory = "Education" | "Meals" | "Health" | "Community";

type ChallengeView = {
  project: Project;
  title: string;
  category: ChallengeCategory;
  imageURL: string | null;
  fallbackLabel: string;
  trustLabel: "Verified Partner" | "Community";
  visibilityLabel: "Public" | "Private";
  organizerLine: string;
  impactLine: string | null;
  raised: number;
  goal: number;
  progressPct: number;
  joinedLabel: string;
  skipChallengeLine: string | null;
};


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

function getSkipChallengeLine(project: Project): string | null {
  const milestones = project.skipMilestones;
  if (!milestones) return null;
  const levels = [milestones.level1, milestones.level2, milestones.level3].filter((value) => Number.isFinite(value) && value > 0);
  if (levels.length === 0) return null;
  if (levels.length === 1) return `Complete ${levels[0]} skip`;
  const last = levels[levels.length - 1];
  return `Complete ${levels.slice(0, -1).join(", ")}, and ${last} skips`;
}

function visibilityLabel(project: Project): ChallengeView["visibilityLabel"] {
  const privateTags = ["visibility-private", "visibility-unlisted"];
  return project.visibility === "private"
    || project.visibility === "unlisted"
    || Boolean(project.tags?.some((tag) => privateTags.includes(tag)))
    ? "Private"
    : "Public";
}

function challengeFromProject(project: Project): ChallengeView {
  const category = challengeCategory(project);
  const fallback = fallbackForCategory(category);
  const goal = getChallengeGoal(project);
  const raised = Math.min(goal, project.totalRaised || 0);
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return {
    project,
    title: challengeTitle(project),
    category,
    imageURL: project.imageURL || (project.isCustom ? null : fallback.imageURL),
    fallbackLabel: fallback.label,
    trustLabel: project.isCustom ? "Community" : "Verified Partner",
    visibilityLabel: visibilityLabel(project),
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
        <span style={{ color: "var(--green-primary)" }}>Pledged {formatCurrency(pledgedAmount)}</span>
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
  const params = useParams();
  const challengeId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
  const { user, profile, updateProfile } = useAuthStore();
  const { projects, loading: projectsLoading } = useProjects();
  const [joining, setJoining] = useState(false);
  const [showJoinChoice, setShowJoinChoice] = useState(false);
  const [goalPickerProjectId, setGoalPickerProjectId] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const challengeUrl = appendRefParam(
    typeof window !== "undefined" ? `${window.location.origin}/join/${challengeId}` : `/join/${challengeId}`,
    user?.uid
  );
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

  if (!challenge) {
    if (projectsLoading || !fallbackChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--green-primary)", borderTopColor: "transparent" }} />
        </div>
      );
    }
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-8">
        <button onClick={() => router.push("/challenges")} className="text-sm font-bold mb-5" style={{ color: "var(--green-primary)" }}>
          Back to challenges
        </button>
        <div className="rounded-xl p-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Challenge not found</p>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>This challenge may have been removed or is still loading.</p>
        </div>
      </div>
    );
  }

  const isActive = challenge.project.id === profile?.activeProjectId;
  const countdown = getChallengeCountdown(challenge.project);
  const activeChallenge = projects.find((item) => item.id === profile?.activeProjectId);
  const activePledgeBalance = profile?.activeProjectId ? profile?.causeJarBalances?.[profile.activeProjectId] ?? 0 : 0;
  const split = normalizeJarSplit(profile?.jarSplit as any);
  const giveTotal = profile ? (profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100)) : 0;
  const globalGivingBalance = profile ? Math.max(0, giveTotal - (profile.totalDonated ?? 0)) : 0;
  const profileChallengeBalance = profile?.causeJarBalances?.[challenge.project.id] ?? 0;
  const pledgedAmount = Math.max(challenge.project.totalRaised || 0, profileChallengeBalance);

  async function handleShare() {
    if (!challenge) return;
    if (canNativeShare) {
      try {
        const groupName = challenge.project.groupName ?? challenge.title;
        await navigator.share({ title: groupName, text: `Join My iSkipped Group, ${groupName}, to help raise funds for ${challenge.project.title}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause!`, url: challengeUrl });
        return;
      } catch { /* dismissed */ }
    }
    setShowShare(true);
  }

  async function handleJoin() {
    if (!user || !challenge || joining) return;
    if (isActive) {
      router.push("/home");
      return;
    }
    await beginJoin();
  }

  async function beginJoin() {
    if (!user || !challenge || joining) return;
    if (profile?.activeProjectId && profile.activeProjectId !== challenge.project.id) {
      setShowJoinChoice(true);
      return;
    }
    await completeJoin();
  }

  async function completeJoin() {
    if (!user || !challenge || joining) return;
    setJoining(true);
    try {
      const balanceTransfer = await switchCause(user.uid, profile?.activeProjectId ?? null, challenge.project.id);
      updateProfile({
        activeProjectId: challenge.project.id,
        joinedProjectIds: Array.from(new Set([...(profile?.joinedProjectIds ?? []), challenge.project.id])),
        ...(balanceTransfer
          ? { causeJarBalances: { ...(profile?.causeJarBalances ?? {}), ...balanceTransfer } }
          : {}),
      });
      setGoalPickerProjectId(challenge.project.id);
      setShowJoinChoice(false);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-28 md:pb-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push("/challenges")} className="text-sm font-bold" style={{ color: "var(--green-primary)" }}>
          ← Back
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="px-3 py-1.5 rounded-full text-xs font-black"
          style={{ border: "1px solid rgba(46,204,113,0.3)", color: "var(--green-primary)" }}
        >
          ↗ Share
        </button>
      </div>

      <article className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
        {challenge.imageURL && <ChallengeImage challenge={challenge} className="h-56 md:h-72" />}
        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge>{challenge.trustLabel}</Badge>
            <Badge>{challenge.category}</Badge>
            <Badge>{challenge.visibilityLabel}</Badge>
            {countdown.isExpired && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
                Ended
              </span>
            )}
            {!countdown.isExpired && countdown.daysLeft !== null && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{
                  background: countdown.daysLeft < 3 ? "rgba(239,68,68,0.1)" : countdown.daysLeft < 7 ? "rgba(255,183,0,0.12)" : "rgba(46,204,113,0.1)",
                  color: countdown.daysLeft < 3 ? "#EF4444" : countdown.daysLeft < 7 ? "var(--gold-cta)" : "var(--green-primary)",
                }}
              >
                {countdown.label}
              </span>
            )}
          </div>
          {countdown.isExpired && (
            <div className="rounded-xl px-4 py-3 mb-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                {countdown.label}. Donations are still open — any pledge you made counts.
              </p>
            </div>
          )}

          <h1 className="text-3xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>{challenge.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.organizerLine}</p>

          <section className="mt-4">
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>About this cause</p>
            <p className="text-base leading-relaxed whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
              {challenge.project.description || "Skip anything. Your small choices help this move."}
            </p>
          </section>

          <div className="mt-5">
            {challenge.goal > 0 ? (
              pledgedAmount > 0 ? (
                <ProgressBar challenge={challenge} pledgedAmount={pledgedAmount} />
              ) : (
                <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  Goal: {formatCurrency(challenge.goal)}
                </p>
              )
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

          {challenge.impactLine && (
            <section className="rounded-xl px-4 py-3 mt-5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-sm font-black" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>
            </section>
          )}

          <SkipChallenge project={challenge.project} />

          {/* Where donations go */}
          {challenge.project.donationURL && (
            <div className="mt-5 rounded-xl px-4 py-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Where your donation goes</p>
              <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
                {challenge.project.sponsor || challenge.title}
              </p>
              <a
                href={challenge.project.donationURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mt-0.5 block hover:underline"
                style={{ color: "var(--green-primary)" }}
              >
                {(() => { try { return new URL(challenge.project.donationURL).hostname.replace("www.", ""); } catch { return challenge.project.donationURL; } })()}
              </a>
              {challenge.project.learnMoreURL && (
                <a
                  href={challenge.project.learnMoreURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs mt-1 block hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Learn more →
                </a>
              )}
              <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                iSkipped doesn&apos;t process payments. When you tap Donate, you go directly to {challenge.project.sponsor || "the organizer"} to complete your gift.
              </p>
            </div>
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
                {isActive ? "Log a Skip" : joining ? "Joining..." : "Join Challenge"}
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

      {showJoinChoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowJoinChoice(false)}>
          <div
            className="rounded-2xl w-full max-w-md p-5 shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
              <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{activePledgeBalance > 0 ? "Before you switch" : "Join challenge"}</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.title}</p>
              </div>
              <button onClick={() => setShowJoinChoice(false)} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
            </div>

            <div className="rounded-xl p-4 mt-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-xs uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>Your skips currently go to</p>
              <p className="text-sm font-black mt-1" style={{ color: "var(--text-primary)" }}>{activeChallenge ? challengeTitle(activeChallenge) : "your current challenge"}</p>
              {activePledgeBalance > 0 && (
                <p className="text-sm font-black mt-2" style={{ color: "var(--coral-primary)" }}>
                  {formatCurrency(activePledgeBalance)} pledged
                </p>
              )}
            </div>

            <p className="text-sm leading-relaxed mt-4" style={{ color: "var(--text-secondary)" }}>
              {activePledgeBalance > 0
                ? "We recommend donating what you've pledged before making a new challenge active. You can also keep that pledge and move it into the new jar."
                : "Join this challenge to follow it, or make it active so your next skip goes here by default."}
            </p>

            <div className="grid grid-cols-1 gap-2 mt-5">
              {activePledgeBalance > 0 && (
                <button
                  type="button"
                  onClick={() => router.push("/jars?tab=cause")}
                  disabled={joining}
                  className="py-3 rounded-full text-sm font-black disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                    color: "var(--bg-base)",
                    boxShadow: "0 4px 18px var(--gold-glow)",
                  }}
                >
                  Review pledge first
                </button>
              )}
              {activePledgeBalance > 0 && (
                <button
                  type="button"
                  onClick={() => completeJoin()}
                  disabled={joining}
                  className="py-3 rounded-full text-sm font-black disabled:opacity-60"
                  style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
                >
                  Keep pledge and move it here
                </button>
              )}
              {activePledgeBalance === 0 && (
                <button
                  type="button"
                  onClick={() => completeJoin()}
                  disabled={joining}
                  className="py-3 rounded-full text-sm font-black disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                    color: "var(--bg-base)",
                    boxShadow: "0 4px 18px var(--gold-glow)",
                  }}
                >
                  {joining ? "Joining..." : "Join Challenge"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <ShareDetailModal
          title={challenge.project.groupName ?? challenge.title}
          projectTitle={challenge.project.title}
          url={challengeUrl}
          password={challenge.project.visibility === "private" || challenge.project.visibility === "password" ? challenge.project.password ?? null : null}
          onClose={() => setShowShare(false)}
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
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Set a personal savings goal. Your jar will show your progress toward it.</p>
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

function ShareDetailModal({
  title,
  projectTitle,
  url,
  password,
  onClose,
}: {
  title: string;
  projectTitle: string;
  url: string;
  password: string | null;
  onClose: () => void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const shareMessage = `Join My iSkipped Group, ${title}, to help raise funds for ${projectTitle}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause! ${url}`;
  const shareIntentText = `Join My iSkipped Group, ${title}, to help raise funds for ${projectTitle}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause!`;

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
