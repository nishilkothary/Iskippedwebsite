"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { useSkips } from "@/hooks/useSkips";
import { FeedItem, Project } from "@/lib/types/models";
import { joinProject, switchCause } from "@/lib/services/firebase/users";
import { isChallengeProject } from "@/lib/services/firebase/projects";
import { subscribeToCommunityFeed } from "@/lib/services/firebase/social";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";

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

const JOINED_BY_CATEGORY: Record<ChallengeCategory, string> = {
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
  return project.goalAmount || 100;
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
  const privateTags = ["visibility-private", "visibility-password", "visibility-unlisted"];
  return project.visibility === "private"
    || project.visibility === "password"
    || project.visibility === "unlisted"
    || Boolean(project.tags?.some((tag) => privateTags.includes(tag)))
    ? "Private"
    : "Public";
}

function challengeFromProject(project: Project): ChallengeView {
  const category = challengeCategory(project);
  const fallback = fallbackForCategory(category);
  const goal = getChallengeGoal(project);
  const raised = Math.min(goal, Math.max(project.totalRaised || 0, project.isCustom ? 0 : goal * 0.18));
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
    joinedLabel: project.isCustom ? "Community challenge" : JOINED_BY_CATEGORY[category],
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
  const { projects } = useProjects();
  const { recentSkips } = useSkips();
  const [joining, setJoining] = useState(false);
  const [showJoinChoice, setShowJoinChoice] = useState(false);
  const [showPasswordEntry, setShowPasswordEntry] = useState(false);
  const [challengePassword, setChallengePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);
  const [showShare, setShowShare] = useState(false);
  const challengeUrl = typeof window !== "undefined"
    ? `${window.location.origin}/challenges/${challengeId}`
    : `/challenges/${challengeId}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    return subscribeToCommunityFeed(setCommunityFeed);
  }, []);

  const challenge = useMemo(() => {
    const project = projects.find((item) => item.id === challengeId);
    return project && isChallengeProject(project) ? challengeFromProject(project) : null;
  }, [projects, challengeId]);

  const challengeSkips = useMemo(
    () => recentSkips.filter((skip) => skip.projectId === challengeId),
    [recentSkips, challengeId]
  );

  if (!challenge) {
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
  const isJoined = new Set([...(profile?.joinedProjectIds ?? []), ...(profile?.activeProjectId ? [profile.activeProjectId] : [])]).has(challenge.project.id);
  const countdown = getChallengeCountdown(challenge.project);
  const activeChallenge = projects.find((item) => item.id === profile?.activeProjectId);
  const activePledgeBalance = profile?.activeProjectId ? profile?.causeJarBalances?.[profile.activeProjectId] ?? 0 : 0;
  const skipPledgeTotal = challengeSkips.reduce((sum, skip) => sum + skip.amount, 0);
  const profileChallengeBalance = profile?.causeJarBalances?.[challenge.project.id] ?? 0;
  const pledgedAmount = challenge.project.isCustom
    ? Math.max(challenge.project.totalRaised || 0, skipPledgeTotal, profileChallengeBalance)
    : challenge.raised;
  const challengeFeed = communityFeed.filter(
    (item) => item.projectId === challengeId || item.projectTitle === challenge.project.title
  );
  const recentActivity = challengeFeed.length > 0
    ? challengeFeed.slice(0, 5).map((item) => ({
        label: item.skipLabel ? `${item.displayName} skipped ${item.skipLabel}` : item.message,
        amount: item.skipAmount ?? 0,
        emoji: item.skipEmoji,
      }))
    : [];

  async function handleShare() {
    if (!challenge) return;
    if (canNativeShare) {
      try {
        await navigator.share({ title: challenge.title, text: `Join my iSkipped challenge: ${challenge.title}`, url: challengeUrl });
        return;
      } catch { /* dismissed */ }
    }
    setShowShare(true);
  }

  function needsPasswordToJoin() {
    return challenge?.visibilityLabel === "Private" && !isJoined;
  }

  async function handleJoin() {
    if (!user || !challenge || joining) return;
    if (isActive) {
      router.push("/home");
      return;
    }
    if (needsPasswordToJoin()) {
      setShowPasswordEntry(true);
      setChallengePassword("");
      setPasswordError("");
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
    await completeJoin(true);
  }

  async function submitPrivatePassword() {
    if (!challenge || joining) return;
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
    setShowPasswordEntry(false);
    setChallengePassword("");
    setPasswordError("");
    await beginJoin();
  }

  async function completeJoin(makeActive: boolean, movePledge = false) {
    if (!user || !challenge || joining) return;
    setJoining(true);
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
            <ProgressBar challenge={challenge} pledgedAmount={pledgedAmount} />
          </div>

          {challenge.impactLine && (
            <section className="rounded-xl px-4 py-3 mt-5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
              <p className="text-sm font-black" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>
            </section>
          )}

          <SkipChallenge project={challenge.project} />

          <section className="mt-5">
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Recent Activity</p>
            {recentActivity.length > 0 ? (
              <div className="space-y-2">
                {recentActivity.map((activity) => (
                  <div key={`${activity.label}-${activity.amount}`} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-2)" }}>
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {activity.emoji && <span className="mr-1.5">{activity.emoji}</span>}
                      {activity.label}
                    </span>
                    <span className="text-sm font-black" style={{ color: "var(--green-primary)" }}>{formatCurrency(activity.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm rounded-xl px-3 py-3" style={{ color: "var(--text-muted)", background: "var(--bg-surface-2)" }}>
                Be the first to skip for this challenge!
              </p>
            )}
          </section>

          {/* Where donations currently go */}
          <div className="mt-5 rounded-xl px-4 py-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>Your current Giving Jar</p>
            {activeChallenge ? (
              <>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{activeChallenge.title}</p>
                {activeChallenge.id !== challenge.project.id && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Joining will switch your skips to this challenge.</p>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>No active cause — joining will set this one.</p>
            )}
          </div>

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

      {showPasswordEntry && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowPasswordEntry(false)}>
          <div
            className="rounded-2xl w-full max-w-sm p-5 shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Private challenge</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.title}</p>
              </div>
              <button onClick={() => setShowPasswordEntry(false)} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>x</button>
            </div>
            <input
              type="password"
              value={challengePassword}
              onChange={(event) => {
                setChallengePassword(event.target.value);
                if (passwordError) setPasswordError("");
              }}
              placeholder="Enter password"
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none mt-4"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              autoFocus
            />
            {passwordError && <p className="text-xs mt-2" style={{ color: "var(--coral-primary)" }}>{passwordError}</p>}
            <button
              type="button"
              onClick={submitPrivatePassword}
              disabled={joining}
              className="w-full py-3 rounded-full text-sm font-black mt-4 disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                color: "var(--bg-base)",
                boxShadow: "0 4px 18px var(--gold-glow)",
              }}
            >
              {joining ? "Joining..." : "Join Challenge"}
            </button>
          </div>
        </div>
      )}

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
                  onClick={() => completeJoin(true, true)}
                  disabled={joining}
                  className="py-3 rounded-full text-sm font-black disabled:opacity-60"
                  style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
                >
                  Keep pledge and move it here
                </button>
              )}
              <button
                type="button"
                onClick={() => completeJoin(false)}
                disabled={joining}
                className="py-3 rounded-full text-sm font-black disabled:opacity-60"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                Join Only
              </button>
              <button
                type="button"
                onClick={() => completeJoin(true)}
                disabled={joining}
                className="py-3 rounded-full text-sm font-black disabled:opacity-60"
                style={activePledgeBalance > 0
                  ? { border: "1px solid var(--border-default)", color: "var(--text-secondary)" }
                  : {
                      background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                      color: "var(--bg-base)",
                      boxShadow: "0 4px 18px var(--gold-glow)",
                    }
                }
              >
                {joining ? "Joining..." : "Join Challenge"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <ShareDetailModal
          title={challenge.title}
          url={challengeUrl}
          password={challenge.project.visibility === "private" || challenge.project.visibility === "password" ? challenge.project.password ?? null : null}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

function ShareDetailModal({
  title,
  url,
  password,
  onClose,
}: {
  title: string;
  url: string;
  password: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
