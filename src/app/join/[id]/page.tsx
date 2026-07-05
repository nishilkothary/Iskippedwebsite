"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { OFFICIAL_PROJECTS } from "@/lib/services/firebase/projects";
import { useAuthStore } from "@/store/authStore";
import { Project } from "@/lib/types/models";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import Link from "next/link";

// ── Local helpers (mirror of challenges/[id]/page.tsx) ──────────────────────

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
  const goal = project.goalAmount > 0 ? project.goalAmount : 0;
  const raised = Math.min(goal > 0 ? goal : Infinity, project.totalRaised || 0);
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
    skipChallengeLine: (() => {
      const m = project.skipMilestones;
      if (!m) return null;
      const levels = [m.level1, m.level2, m.level3].filter((v) => Number.isFinite(v) && v > 0);
      if (levels.length === 0) return null;
      if (levels.length === 1) return `Complete ${levels[0]} skip`;
      return `Complete ${levels.slice(0, -1).join(", ")}, and ${levels[levels.length - 1]} skips`;
    })(),
  };
}

// ── Shared sub-components (same styles as authenticated page) ────────────────

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

function ProgressBar({ challenge }: { challenge: ChallengeView }) {
  const pct = challenge.goal > 0 ? Math.min(100, Math.round((challenge.raised / challenge.goal) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm font-black mb-2">
        <span style={{ color: "var(--green-primary)" }}>Pledged {formatCurrency(challenge.raised)}</span>
        <span style={{ color: "var(--text-muted)" }}>{pct}%</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "linear-gradient(135deg, var(--green-primary), var(--green-grad-end))" }}
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JoinChallengePage() {
  const router = useRouter();
  const params = useParams();
  const challengeId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const { user, isLoading: authLoading } = useAuthStore();
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Redirect signed-in users to the real authenticated challenge page
  useEffect(() => {
    if (!authLoading && user) router.replace(`/challenges/${challengeId}`);
  }, [user, authLoading, challengeId, router]);

  useEffect(() => {
    if (!challengeId) { setNotFound(true); setLoading(false); return; }
    // Official projects live in code (OFFICIAL_PROJECTS); their Firestore doc
    // may not exist yet or may be a bare seed missing title/description/image.
    // Merge the static official entry with whatever Firestore has (Firestore
    // wins for live fields like totalRaised) so shared links to official causes
    // resolve instead of showing "Challenge not found".
    const official = OFFICIAL_PROJECTS.find((p) => p.id === challengeId) ?? null;
    getDoc(doc(db, "projects", challengeId))
      .then((snap) => {
        const fsData = snap.exists() ? snap.data() : null;
        if (official || fsData) {
          setProjectData({ ...(official ?? {}), ...(fsData ?? {}), id: challengeId } as Project);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (official) setProjectData({ ...official, id: challengeId } as Project);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [challengeId]);

  const challenge = useMemo(() => projectData ? challengeFromProject(projectData) : null, [projectData]);

  const signUpHref = `/sign-in?mode=signup&redirect=/challenges/${challengeId}`;
  const signInHref = `/sign-in?mode=signin&redirect=/challenges/${challengeId}`;

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--green-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (notFound || !challenge) {
    return (
      <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto" style={{ background: "var(--bg-base)" }}>
        <Link href="/sign-in" className="text-sm font-bold mb-5 block" style={{ color: "var(--green-primary)" }}>
          ← iSkipped
        </Link>
        <div className="rounded-xl p-5" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Challenge not found</p>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>This challenge may have been removed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const countdown = getChallengeCountdown(challenge.project);
  const totalSkips = challenge.project.totalSkips ?? 0;
  const displayedRaised = challenge.raised; // already Math.min(goal, totalRaised) from challengeFromProject
  const unitCost = challenge.project.unitCost ?? 0;
  const hasUnits = unitCost > 0;
  const unitsCount = hasUnits ? Math.floor(displayedRaised / unitCost) : 0;
  const unitsPluralLabel = hasUnits && challenge.project.unitName
    ? challenge.project.unitName.split(" ").slice(-1)[0].toLowerCase() + "s funded"
    : "units funded";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="p-4 md:p-8 max-w-3xl mx-auto pb-28 md:pb-8">
        {/* Header nav */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/sign-in" className="text-sm font-bold" style={{ color: "var(--green-primary)" }}>
            i<span style={{ color: "var(--green-primary)" }}>Skipped</span>
          </Link>
          <Link
            href={signInHref}
            className="px-3 py-1.5 rounded-full text-xs font-black"
            style={{ border: "1px solid rgba(46,204,113,0.3)", color: "var(--green-primary)" }}
          >
            Sign In
          </Link>
        </div>

        <article className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          {challenge.imageURL && <ChallengeImage challenge={challenge} className="h-56 md:h-72" />}
          <div className="p-5">
            {/* Badges */}
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
                  {countdown.label}. Donations are still open — any pledge you make counts.
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
                <ProgressBar challenge={challenge} />
              ) : (
                <div className={`grid gap-3 rounded-xl p-4 ${hasUnits ? "grid-cols-3" : "grid-cols-2"}`} style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                  <div className="text-center">
                    <p className="text-xl font-black" style={{ color: "var(--green-primary)" }}>{totalSkips.toLocaleString()}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>skips</p>
                  </div>
                  {hasUnits && (
                    <div className="text-center">
                      <p className="text-xl font-black" style={{ color: "var(--gold-cta)" }}>{unitsCount.toLocaleString()}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{unitsPluralLabel}</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-xl font-black" style={{ color: "var(--coral-primary)" }}>{formatCurrency(displayedRaised)}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>raised</p>
                  </div>
                </div>
              )}
            </div>

            {challenge.impactLine && (
              <section className="rounded-xl px-4 py-3 mt-5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
                <p className="text-sm font-black" style={{ color: "var(--green-primary)" }}>{challenge.impactLine}</p>
              </section>
            )}

            <SkipChallenge project={challenge.project} />

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

            {/* CTAs for unauthenticated visitors */}
            <div className="flex gap-2 mt-4">
              {!countdown.isExpired && (
                <Link
                  href={signUpHref}
                  className="flex-1 py-3 rounded-full text-sm font-black text-center"
                  style={{
                    background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                    color: "var(--bg-base)",
                    boxShadow: "0 4px 18px var(--gold-glow)",
                  }}
                >
                  Join Challenge
                </Link>
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

            <p className="text-center text-xs mt-4" style={{ color: "var(--text-muted)" }}>
              Already on iSkipped?{" "}
              <Link href={signInHref} className="font-semibold hover:underline" style={{ color: "var(--green-primary)" }}>
                Sign in
              </Link>
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
