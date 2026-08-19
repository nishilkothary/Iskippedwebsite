"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useProjects } from "@/hooks/useProjects";
import { Project } from "@/lib/types/models";
import { pinProjectToHome, normalizeJarSplit, setChallengeEmailConsent } from "@/lib/services/firebase/users";
import { isChallengeProject, getProject } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { appendRefParam, getChallengeSharePath } from "@/lib/utils/share";
import { getDirectChallengeShareText } from "@/lib/utils/challengeShareCopy";
import { ShareButton } from "@/components/share/ShareButton";

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

function getDisplayGoalAmount(project: Project): number {
  if (project.goalAmount > 0) return project.goalAmount;
  if (project.unitCost && project.unitCost > 0) return project.unitCost * 10;
  return 0;
}

function getUnitLabel(project: Project): string {
  return project.unitDisplay ?? project.unitName ?? "units";
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
        <span style={{ color: "var(--green-primary)" }}>Raised {formatCurrency(pledgedAmount)}</span>
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

function DetailTile({ label, value, accent = "var(--text-primary)" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(237,245,240,0.045)", border: "1px solid rgba(237,245,240,0.08)" }}>
      <p className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-sm font-black leading-snug" style={{ color: accent }}>{value}</p>
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
  const { setShowSkipPicker } = useUIStore();
  const { projects, loading: projectsLoading } = useProjects();
  const [joining, setJoining] = useState(false);
  const [showEmailConsent, setShowEmailConsent] = useState(false);
  const [shareEmailOnJoin, setShareEmailOnJoin] = useState(true);
  const [showShare, setShowShare] = useState(false);
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
  const countdown = getChallengeCountdown(challenge.project);
  const split = normalizeJarSplit(profile?.jarSplit as any);
  const giveTotal = profile ? (profile.totalGiveAllocated ?? profile.totalSaved * (split.give / 100)) : 0;
  const profileChallengeBalance = profile?.causeJarBalances?.[challenge.project.id] ?? 0;
  const pledgedAmount = Math.max(challenge.project.totalRaised || 0, profileChallengeBalance);
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

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-28 md:pb-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push("/jars?tab=fundraisers")} className="text-sm font-bold" style={{ color: "var(--green-primary)" }}>
          ← Back to fundraisers
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

      <article className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface-1)", border: "1px solid rgba(46,204,113,0.28)" }}>
        {challenge.imageURL && <ChallengeImage challenge={challenge} className="h-64 md:h-96" />}
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
                {countdown.label}. Donations are still open.
              </p>
            </div>
          )}

          <h1 className="text-3xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>{challenge.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{challenge.organizerLine}</p>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailTile label="Country / region" value={challenge.project.location || "Not specified"} accent="#A7F3D0" />
            <DetailTile label="Donation goal" value={challenge.goal > 0 ? formatCurrency(challenge.goal) : "Open goal"} />
            <DetailTile
              label="Unit cost"
              value={challenge.project.unitCost
                ? `${formatCurrency(challenge.project.unitCost)} / ${challenge.project.unitName ?? getUnitLabel(challenge.project)}`
                : "Any amount"}
              accent="var(--gold-cta)"
            />
            <DetailTile label="Donate through" value={donationHost(challenge.project.donationURL) ?? challenge.project.sponsor ?? "Organizer"} accent="#7DD3FC" />
          </section>

          <section className="mt-4">
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>About this cause</p>
            <p className="text-base leading-relaxed whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
              {challenge.project.description || "Skip anything. Your small choices help this move."}
            </p>
          </section>

          <div className="mt-5">
            {challenge.goal > 0 ? (
              (() => {
                const unitCost = challenge.project.unitCost ?? 0;
                const hasUnits = unitCost > 0;
                const statsReady = profile !== null;
                const unitLabel = getUnitLabel(challenge.project);
                const goalUnits = hasUnits ? Math.round(challenge.goal / unitCost) : 0;
                const donatedUnits = hasUnits && statsReady ? Math.floor(pledgedAmount / unitCost) : 0;
                return (
                  <div className="grid grid-cols-2 gap-3 rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                    <div className="text-center">
                      <p className="text-xl font-black" style={{ color: "var(--green-primary)" }}>
                        {hasUnits ? goalUnits.toLocaleString() : formatCurrency(challenge.goal)}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {hasUnits ? `${unitLabel} goal` : "goal"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-black" style={{ color: "var(--gold-cta)" }}>
                        {hasUnits ? (statsReady ? donatedUnits.toLocaleString() : "-") : (statsReady ? formatCurrency(pledgedAmount) : "-")}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {hasUnits ? `${unitLabel} donated` : "donated"}
                      </p>
                    </div>
                  </div>
                );
              })()
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
          <div className="mt-5 rounded-xl px-4 py-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: "var(--text-muted)" }}>Where your donation goes</p>
            <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
              {challenge.project.sponsor || challenge.title}
            </p>
            {challenge.project.donationURL ? (
              <a
                href={challenge.project.donationURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mt-0.5 block hover:underline"
                style={{ color: "var(--green-primary)" }}
              >
                {donationHost(challenge.project.donationURL)}
              </a>
            ) : (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>No donation link has been added yet.</p>
            )}
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
            <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Pin this fundraiser?</p>
            <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
              This puts the fundraiser on Home and makes future skips track toward it by default. Organizers can see donations logged for this fundraiser and recent skip activity.
            </p>
            <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
              Your email is shared by default for fundraiser updates or reminders, but you can uncheck this and still pin it.
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
                <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>Share my email with the organizer</span>
                <span className="block text-xs leading-relaxed mt-1" style={{ color: "var(--text-muted)" }}>
                  They may use it to contact you about this challenge only.
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
                Skip for this
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
