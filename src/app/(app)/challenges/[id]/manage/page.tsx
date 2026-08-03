"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { deleteCustomProject, endChallenge, setChallengeDeadline, subscribeToProject } from "@/lib/services/firebase/projects";
import { subscribeToCommunityFeed } from "@/lib/services/firebase/social";
import { formatCurrency } from "@/lib/utils/currency";
import { formatAggregateImpactUnits } from "@/lib/utils/impact";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { Project, FeedItem } from "@/lib/types/models";
import { appendRefParam } from "@/lib/utils/share";
import { getDirectChallengeShareText } from "@/lib/utils/challengeShareCopy";
import { ShareButton } from "@/components/share/ShareButton";
import { apiRequest } from "@/lib/services/firebase/apiClient";

type ChallengeMember = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  emailVerified: boolean | null;
  pledged: number;
  joinedChallenge: boolean;
  joinedAt: string | null;
};

type ChallengeMembersResponse = {
  members: ChallengeMember[];
  totalMembers: number;
  emailableMembers: number;
};

export default function ManageChallengePage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { user, profile } = useAuthStore();
  const { projects } = useProjects();

  const challenge = projects.find((p) => p.id === challengeId) ?? null;
  const isSiteAdmin = Boolean(profile?.email && profile.email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? ""));

  const [ending, setEnding] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showDeadlineEdit, setShowDeadlineEdit] = useState(false);
  const [newDeadlineDays, setNewDeadlineDays] = useState<number | null | "custom">(30);
  const [customDateStr, setCustomDateStr] = useState("");
  const [settingDeadline, setSettingDeadline] = useState(false);
  const [deadlineSuccess, setDeadlineSuccess] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<ChallengeMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [liveProject, setLiveProject] = useState<Project | null>(null);
  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);

  // Live project subscription for real-time stats
  useEffect(() => {
    if (!challengeId) return;
    return subscribeToProject(challengeId, setLiveProject);
  }, [challengeId]);

  // Activity feed subscription filtered to this challenge
  useEffect(() => {
    return subscribeToCommunityFeed(setCommunityFeed);
  }, []);

  useEffect(() => {
    if (challenge && challenge.createdBy !== user?.uid && !isSiteAdmin) {
      router.replace(`/challenges/${challengeId}`);
    }
  }, [challenge, user, isSiteAdmin, challengeId, router]);

  if (!challenge) {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
      </main>
    );
  }

  if (challenge.createdBy !== user?.uid && !isSiteAdmin) return null;

  // Merge live stats over static challenge data
  const totalRaised = liveProject?.totalRaised ?? challenge.totalRaised;
  const totalDonated = liveProject?.totalDonated ?? 0;
  const totalSkips = liveProject?.totalSkips ?? challenge.totalSkips ?? 0;
  const memberUids = liveProject?.memberUids ?? challenge.memberUids ?? [];

  const allChallengeFeed = communityFeed
    .filter((item) => item.projectId === challengeId || item.projectTitle === challenge.title);
  const challengeFeed = showAllActivity ? allChallengeFeed : allChallengeFeed.slice(0, 3);
  const displayedMemberCount = membersTotal || memberUids.length;

  const challengeUrl = appendRefParam(
    typeof window !== "undefined" ? `${window.location.origin}/challenges/${challengeId}` : `/challenges/${challengeId}`,
    user?.uid
  );

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const progressPct = challenge.goalAmount > 0
    ? Math.min(100, Math.round((totalRaised / challenge.goalAmount) * 100))
    : 0;

  const shareIntentText = getDirectChallengeShareText(challenge);
  const endDateMs = challenge.endDate?.toMillis?.();
  const endDateLabel = endDateMs
    ? new Date(endDateMs).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "the end of the challenge";
  const challengeCauseName = (challenge.groupName ?? challenge.title).replace(/[.!?]+$/, "");
  const nudgeGoalLine = challenge.goalAmount > 0
    ? `Our goal is to raise at least ${formatCurrency(challenge.goalAmount)}${endDateMs ? ` by ${endDateLabel}` : ""}.`
    : `We're aiming to raise as much as we can by ${endDateLabel}.`;
  const nudgeMessage = `Join me in skipping at least one expense a week to help fund ${challengeCauseName}. ${nudgeGoalLine}\n\n${challengeUrl}`;
  const progressUpdateText = buildProgressUpdate({
    title: challenge.groupName ?? challenge.title,
    raised: totalRaised,
    goalAmount: challenge.goalAmount,
    progressPct,
    totalSkips,
    unitName: challenge.unitName,
    unitDisplay: challenge.unitDisplay,
    unitCost: challenge.unitCost,
    unitIsGoal: challenge.unitIsGoal,
  });

  async function handleArchive() {
    if (!challenge || !user) return;
    setArchiving(true);
    try {
      await endChallenge(user.uid, challengeId);
      router.push("/challenges");
    } catch {
      setArchiving(false);
      setArchiveConfirm(false);
    }
  }

  async function handleEnd() {
    if (!challenge || !user) return;
    setEnding(true);
    try {
      await deleteCustomProject(user.uid, challengeId);
      router.push("/challenges");
    } catch {
      setEnding(false);
      setEndConfirm(false);
    }
  }

  async function handleSetDeadline() {
    if (!user || settingDeadline) return;
    let endDate: Date | null = null;
    if (newDeadlineDays === "custom") {
      endDate = customDateStr ? new Date(customDateStr) : null;
    } else if (newDeadlineDays !== null) {
      endDate = new Date(Date.now() + newDeadlineDays * 86400_000);
    }
    setSettingDeadline(true);
    try {
      await setChallengeDeadline(user.uid, challengeId, endDate);
      setDeadlineSuccess(true);
      setShowDeadlineEdit(false);
      setTimeout(() => setDeadlineSuccess(false), 3000);
    } finally {
      setSettingDeadline(false);
    }
  }

  async function loadMembers() {
    if (!challenge || loadingMembers) return;
    setLoadingMembers(true);
    setMembersError(null);
    try {
      const data = await apiRequest<ChallengeMembersResponse>(`/api/challenges/${challengeId}/members`, "GET");
      setMembers(data.members);
      setMembersTotal(data.totalMembers);
    } catch (error: any) {
      setMembersError(error?.message || "Could not load members.");
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleViewMembers() {
    if (!challenge) return;
    if (members.length > 0 || membersError) {
      setShowMembers((v) => !v);
      return;
    }
    setShowMembers(true);
    await loadMembers();
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(challengeUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {}
  }

  async function handleNativeShare() {
    if (!challenge) return;
    try {
      await navigator.share({
        title: challenge.title,
        text: shareIntentText,
        url: challengeUrl,
      });
    } catch {}
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/challenges")}
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>
            Manage Challenge
          </p>
          <p className="text-lg font-black leading-tight truncate" style={{ color: "var(--text-primary)" }}>
            {challenge.title}
          </p>
        </div>
      </div>

      {/* Stats */}
      <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs uppercase tracking-wide font-bold mb-3" style={{ color: "var(--text-muted)" }}>
          Challenge Stats
        </p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-2xl font-black" style={{ color: "var(--green-primary)" }}>
              {formatCurrency(totalRaised)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {challenge.goalAmount > 0 ? `of ${formatCurrency(challenge.goalAmount)} goal` : "pledged"}
            </p>
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: "var(--coral-primary)" }}>
              {formatCurrency(totalDonated)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>donated</p>
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
              {displayedMemberCount}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>members</p>
          </div>
        </div>
        {challenge.goalAmount > 0 && (
          <div className="mb-4">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, background: "var(--green-primary)" }}
              />
            </div>
            <p className="text-xs mt-1 text-right" style={{ color: "var(--text-muted)" }}>{progressPct}%</p>
          </div>
        )}
        {memberUids.length > 0 && (
          <>
            <button
              onClick={handleViewMembers}
              className="text-xs font-semibold"
              style={{ color: "var(--green-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {showMembers ? "Hide members" : `View all ${memberUids.length} members →`}
            </button>
            {showMembers && (
              <div className="mt-3 space-y-2">
                {loadingMembers ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading...</p>
                ) : membersError ? (
                  <p className="text-xs" style={{ color: "#EF8844" }}>{membersError}</p>
                ) : members.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>No member profiles found yet.</p>
                ) : (
                  members.map((m) => (
                    <div key={m.uid} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black overflow-hidden shrink-0"
                        style={{ background: "rgba(46,204,113,0.15)", color: "var(--green-primary)" }}>
                        {m.photoURL
                          ? <img src={m.photoURL} alt={m.displayName} className="w-full h-full object-cover" />
                          : m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{m.displayName}</p>
                        {m.email && <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{m.email}</p>}
                      </div>
                      {m.pledged > 0 && (
                        <p className="text-sm font-black shrink-0" style={{ color: "var(--green-primary)" }}>{formatCurrency(m.pledged)}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Recent Activity */}
      {challengeFeed.length > 0 && (
        <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs uppercase tracking-wide font-bold" style={{ color: "var(--text-muted)" }}>
              Recent Activity
            </p>
            {allChallengeFeed.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllActivity((value) => !value)}
                className="text-xs font-semibold"
                style={{ color: "var(--green-primary)" }}
              >
                {showAllActivity ? "Show less" : "See all"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {challengeFeed.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5"
                  style={{ background: "rgba(46,204,113,0.12)", color: "var(--green-primary)" }}>
                  {item.displayName?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {item.displayName ?? "A member"}{" "}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      skipped {item.message ?? "a purchase"} and saved{" "}
                    </span>
                    <span style={{ color: "var(--green-primary)", fontWeight: 700 }}>
                      {formatCurrency(item.skipAmount ?? 0)}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <SocialStatsSharePanel
        title={challenge.groupName ?? challenge.title}
        shareText={progressUpdateText}
        url={challengeUrl}
        raised={totalRaised}
        goalAmount={challenge.goalAmount}
        progressPct={progressPct}
        totalSkips={totalSkips}
        unitName={challenge.unitName}
        unitDisplay={challenge.unitDisplay}
        unitCost={challenge.unitCost}
        unitIsGoal={challenge.unitIsGoal}
      />

      {/* Share with the group */}
      <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs uppercase tracking-wide font-bold mb-3" style={{ color: "var(--text-muted)" }}>
          Share with Your Group
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          Invite someone new or remind your group to skip one expense this week.
        </p>
        <div
          className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-line mb-3"
          style={{ background: "var(--bg-surface-3)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
        >
          {nudgeMessage}
        </div>
        <div className="space-y-2">
          <NudgeCopyButton message={nudgeMessage} />
          <div className="flex gap-2">
            <input
              readOnly
              value={challengeUrl}
              className="flex-1 rounded-xl px-3 py-2 text-xs truncate"
              style={{ background: "var(--bg-surface-3)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-xl text-xs font-bold shrink-0"
              style={{ background: "var(--green-primary)", color: "#0B1A14" }}
            >
              {linkCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              className="w-full py-2 rounded-xl text-xs font-semibold"
              style={{ display: "none", border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
            >
              ↗ Share via...
            </button>
          )}
          <ShareButton url={challengeUrl} text={shareIntentText} title={challenge.groupName ?? challenge.title} label="Share Challenge" />
        </div>
      </section>

      <MemberEmailOutreach
        challengeTitle={challenge.groupName ?? challenge.title}
        challengeUrl={challengeUrl}
        progressMessage={progressUpdateText}
        donationUrl={challenge.donationURL}
        members={members}
        loadingMembers={loadingMembers}
        membersError={membersError}
        memberCount={displayedMemberCount}
        onLoadMembers={loadMembers}
      />

      {/* Edit Details */}
      <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>
          Edit Details
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          Update your challenge name, goal, impact unit, image, access settings, and more.
        </p>
        <button
          onClick={() => router.push(`/challenges?edit=${challengeId}`)}
          className="w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))", color: "var(--bg-base)", boxShadow: "0 4px 18px var(--gold-glow)" }}
        >
          Edit Challenge Details
        </button>
      </section>

      {/* Deadline */}
      <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>
          Deadline
        </p>
        {(() => {
          const countdown = getChallengeCountdown(challenge);
          const endDateMs = challenge.endDate?.toMillis();
          const endLabel = endDateMs
            ? new Date(endDateMs).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
            : null;
          return (
            <>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                {endLabel
                  ? countdown.isExpired
                    ? `This challenge ended on ${endLabel}.`
                    : `This challenge ends in ${countdown.label} (${endLabel}).`
                  : "This challenge has no deadline."}
              </p>
              {deadlineSuccess && (
                <p className="text-xs mb-2 font-semibold" style={{ color: "var(--green-primary)" }}>Deadline updated!</p>
              )}
              {!showDeadlineEdit ? (
                <button
                  onClick={() => setShowDeadlineEdit(true)}
                  className="text-xs font-semibold mt-1"
                  style={{ color: "var(--green-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  Change deadline
                </button>
              ) : (
                <div className="mt-3 space-y-3">
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
                        onClick={() => setNewDeadlineDays(days)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold"
                        style={
                          newDeadlineDays === days
                            ? { background: "rgba(46,204,113,0.18)", border: "1px solid rgba(46,204,113,0.45)", color: "var(--green-primary)" }
                            : { background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {newDeadlineDays === "custom" && (
                    <input
                      type="date"
                      value={customDateStr}
                      min={new Date(Date.now() + 86400_000).toISOString().split("T")[0]}
                      onChange={(e) => setCustomDateStr(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                  )}
                  {newDeadlineDays !== null && newDeadlineDays !== "custom" && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      New deadline: {new Date(Date.now() + newDeadlineDays * 86400_000).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeadlineEdit(false)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold"
                      style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetDeadline}
                      disabled={settingDeadline || (newDeadlineDays === "custom" && !customDateStr)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                      style={{ background: "var(--green-primary)", color: "#0B1A14" }}
                    >
                      {settingDeadline ? "Saving..." : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* End Challenge (archive) */}
      <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        {!archiveConfirm ? (
          <div>
            <button
              onClick={() => setArchiveConfirm(true)}
              className="w-full py-2.5 rounded-xl text-sm font-bold"
              style={{ border: "1px solid rgba(239,136,68,0.4)", color: "#EF8844" }}
            >
              End Challenge
            </button>
            <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>
              Members can still access it to donate. Nothing is deleted.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl p-3" style={{ background: "rgba(239,136,68,0.08)", border: "1px solid rgba(239,136,68,0.2)" }}>
              <p className="text-sm font-bold mb-1" style={{ color: "#EF8844" }}>End this challenge?</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                The challenge will be archived. Members keep their jar balances and can still donate. You can always come back here to delete it permanently.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setArchiveConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: "#EF8844", color: "white" }}
              >
                {archiving ? "Ending..." : "Yes, End It"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Delete Challenge */}
      <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        {!endConfirm ? (
          <button
            onClick={() => setEndConfirm(true)}
            className="w-full py-2.5 rounded-xl text-sm font-bold"
            style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444" }}
          >
            Delete Challenge
          </button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-sm font-bold mb-1" style={{ color: "#EF4444" }}>Permanently delete this challenge?</p>
              <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                Members who saved toward this challenge <span className="font-bold" style={{ color: "#EF4444" }}>will not be able to donate</span> to the cause — their contribution link will be broken.
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                If you just want to close it out, go back and choose <span className="font-semibold" style={{ color: "#EF8844" }}>End Challenge</span> instead — that preserves the donation flow for all members.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEndConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleEnd}
                disabled={ending}
                className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: "#EF4444", color: "white" }}
              >
                {ending ? "Deleting..." : "Yes, Delete Permanently"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function NudgeCopyButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button
      onClick={handleCopy}
      className="w-full py-2 rounded-xl text-xs font-bold"
      style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
    >
      {copied ? "✓ Copied to clipboard!" : "Copy Message"}
    </button>
  );
}

function SocialStatsSharePanel({
  title,
  shareText,
  url,
  raised,
  goalAmount,
  progressPct,
  totalSkips,
  unitName,
  unitDisplay,
  unitCost,
  unitIsGoal,
}: {
  title: string;
  shareText: string;
  url: string;
  raised: number;
  goalAmount: number;
  progressPct: number;
  totalSkips: number;
  unitName?: string;
  unitDisplay?: string;
  unitCost?: number;
  unitIsGoal?: boolean;
}) {
  const impactStat = unitName && unitCost && unitCost > 0
    ? formatAggregateImpactUnits(raised, unitCost, unitName, unitDisplay, unitIsGoal)
    : "In progress";
  const cardImage = buildSocialCardImage({
    title,
    raised,
    goalAmount,
    progressPct,
    totalSkips,
    impactStat,
    url,
  });

  return (
    <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>
            Share Your Impact
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Turn the latest challenge stats into a social post.
          </p>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden mb-3" style={{ background: "#F4F7F2", border: "1px solid var(--border-default)" }}>
        <div className="p-4" style={{ background: "#123B2A", color: "#F4F7F2" }}>
          <p className="text-[10px] uppercase tracking-[0.18em] font-black" style={{ color: "#8BE0AA" }}>iSkipped</p>
          <p className="text-lg font-black leading-tight mt-2">{title}</p>
          <p className="text-xs mt-1" style={{ color: "#C5D8CC" }}>A little change can fund a lot of impact.</p>
        </div>
        <div className="p-4" style={{ color: "#123B2A" }}>
          <div className="grid grid-cols-3 gap-3 items-start">
            <SocialCardMetric value={totalSkips.toLocaleString()} label="skips" />
            <SocialCardMetric value={formatCurrency(raised)} label={goalAmount > 0 ? "pledged" : "raised"} />
            <SocialCardMetric value={impactStat} label="impact" />
          </div>
          {goalAmount > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] font-black mb-1">
                <span>{progressPct}% of goal</span>
                <span>{formatCurrency(goalAmount)}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#D8E6DC" }}>
                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: "#2E8B57" }} />
              </div>
            </div>
          )}
          <p className="text-[10px] mt-4 truncate" style={{ color: "#527262" }}>{url}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={cardImage}
          download="iskipped-impact.svg"
          className="py-2 rounded-xl text-xs font-bold"
          style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)", textAlign: "center" }}
        >
          Download Image
        </a>
        <ShareButton url={url} text={shareText} title={`${title} progress`} imageUrl={cardImage} label="Share Image" />
      </div>
    </section>
  );
}

function SocialCardMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-xl font-black leading-tight break-words" style={{ color: "#123B2A" }}>{value}</p>
      <p className="text-[10px] mt-1 uppercase tracking-[0.12em] font-black" style={{ color: "#527262" }}>{label}</p>
    </div>
  );
}

function buildSocialCardImage({
  title,
  raised,
  goalAmount,
  progressPct,
  totalSkips,
  impactStat,
  url,
}: {
  title: string;
  raised: number;
  goalAmount: number;
  progressPct: number;
  totalSkips: number;
  impactStat: string;
  url: string;
}) {
  const escape = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const goalText = goalAmount > 0 ? `${progressPct}% of ${formatCurrency(goalAmount)} goal` : "Every skip helps fund the cause";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#F4F7F2"/>
    <rect width="1200" height="220" fill="#123B2A"/>
    <text x="70" y="72" fill="#8BE0AA" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="5">ISKIPPED</text>
    <text x="70" y="142" fill="#F4F7F2" font-family="Arial, sans-serif" font-size="42" font-weight="700">${escape(title)}</text>
    <text x="70" y="182" fill="#C5D8CC" font-family="Arial, sans-serif" font-size="22">A little change can fund a lot of impact.</text>
    <text x="70" y="290" fill="#123B2A" font-family="Arial, sans-serif" font-size="48" font-weight="700">${totalSkips.toLocaleString()}</text>
    <text x="70" y="325" fill="#527262" font-family="Arial, sans-serif" font-size="20">skips</text>
    <text x="380" y="290" fill="#123B2A" font-family="Arial, sans-serif" font-size="48" font-weight="700">${escape(formatCurrency(raised))}</text>
    <text x="380" y="325" fill="#527262" font-family="Arial, sans-serif" font-size="20">${escape(goalAmount > 0 ? "pledged" : "raised")}</text>
    <text x="760" y="290" fill="#123B2A" font-family="Arial, sans-serif" font-size="38" font-weight="700">${escape(impactStat)}</text>
    <text x="760" y="325" fill="#527262" font-family="Arial, sans-serif" font-size="20">impact</text>
    <text x="70" y="405" fill="#123B2A" font-family="Arial, sans-serif" font-size="22" font-weight="700">${escape(goalText)}</text>
    <rect x="70" y="430" width="1060" height="18" rx="9" fill="#D8E6DC"/>
    <rect x="70" y="430" width="${Math.max(0, Math.min(1060, Math.round(1060 * progressPct / 100)))}" height="18" rx="9" fill="#2E8B57"/>
    <text x="70" y="560" fill="#527262" font-family="Arial, sans-serif" font-size="18">Join the challenge: ${escape(url)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildProgressUpdate({
  title,
  raised,
  goalAmount,
  progressPct,
  totalSkips,
  unitName,
  unitDisplay,
  unitCost,
  unitIsGoal,
}: {
  title: string;
  raised: number;
  goalAmount: number;
  progressPct: number;
  totalSkips: number;
  unitName?: string;
  unitDisplay?: string;
  unitCost?: number;
  unitIsGoal?: boolean;
}) {
  const cleanTitle = title.replace(/[.!?]+$/, "");
  const lines = [`${cleanTitle} Progress Update!`, ""];

  if (goalAmount > 0) {
    lines.push(`${totalSkips.toLocaleString()} ${totalSkips === 1 ? "skip has" : "skips have"} been logged.`, "", `${formatCurrency(raised)} pledged toward our ${formatCurrency(goalAmount)} goal (${progressPct}%).`);
  } else {
    lines.push(`${totalSkips.toLocaleString()} ${totalSkips === 1 ? "skip has" : "skips have"} been logged.`, "", `${formatCurrency(raised)} pledged so far.`);
  }

  if (unitCost && unitCost > 0 && raised > 0 && (unitDisplay || unitName)) {
    lines.push("", `That represents about ${formatAggregateImpactUnits(raised, unitCost, unitName || unitDisplay || "impact", unitDisplay, unitIsGoal)}.`);
  }

  lines.push("", "Thanks for keeping the momentum going and making a difference with your skipped expenses.");
  return lines.join("\n");
}

type EmailTemplate = "progress" | "thanks" | "donation";

function getEmailTemplate({
  template,
  challengeTitle,
  challengeUrl,
  progressMessage,
  donationUrl,
}: {
  template: EmailTemplate;
  challengeTitle: string;
  challengeUrl: string;
  progressMessage: string;
  donationUrl?: string | null;
}) {
  const readableTitle = challengeTitle.replace(/[.!?]+$/, "");
  const donationLink = donationUrl || challengeUrl;

  if (template === "progress") {
    return {
      subject: `A progress update for ${challengeTitle}`,
      body: `Hi {name},\n\n${progressMessage}\n\nThanks for being part of ${readableTitle}.\n\n${challengeUrl}`,
    };
  }

  if (template === "donation") {
    return {
      subject: `Could you help fund ${challengeTitle}?`,
      body: `Hi {name},\n\nThanks for skipping with the ${readableTitle} group. If you are able to at this time, please consider making a donation to help turn your skips into real-world impact.\n\nYou can learn more or donate here:\n${donationLink}`,
    };
  }

  return {
    subject: `Thanks for being part of ${challengeTitle}`,
    body: `Hi {name},\n\nThanks for being part of ${readableTitle} group. Skipping just one expense a week can help grow this group's impact.\n\nWhen you get a moment, log one skip this week and invite someone who might want to join the cause!\n\n${challengeUrl}`,
  };
}

function MemberEmailOutreach({
  challengeTitle,
  challengeUrl,
  progressMessage,
  donationUrl,
  members,
  loadingMembers,
  membersError,
  memberCount,
  onLoadMembers,
}: {
  challengeTitle: string;
  challengeUrl: string;
  progressMessage: string;
  donationUrl?: string | null;
  members: ChallengeMember[];
  loadingMembers: boolean;
  membersError: string | null;
  memberCount: number;
  onLoadMembers: () => Promise<void>;
}) {
  const [template, setTemplate] = useState<EmailTemplate>("thanks");
  const initialTemplate = getEmailTemplate({ template: "thanks", challengeTitle, challengeUrl, progressMessage, donationUrl });
  const [subject, setSubject] = useState(initialTemplate.subject);
  const [body, setBody] = useState(initialTemplate.body);
  const [selectedUid, setSelectedUid] = useState("");
  const [copied, setCopied] = useState<"emails" | "draft" | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const emailableMembers = members.filter((member) => member.email);
  const selectedMember = emailableMembers.find((member) => member.uid === selectedUid) ?? emailableMembers[0] ?? null;
  const emailList = emailableMembers.map((member) => member.email).join(", ");
  const personalBody = selectedMember ? personalizeMessage(body, selectedMember) : body;
  const groupBody = body.replaceAll("{name}", "there").replaceAll("{pledged}", "your pledge");
  const personalMailto = selectedMember
    ? buildMailto({ to: selectedMember.email, subject, body: personalBody })
    : "";
  const groupMailto = emailableMembers.length > 0
    ? buildMailto({ bcc: emailList, subject, body: groupBody })
    : "";
  const personalFallback = selectedMember
    ? `To: ${selectedMember.email}\nSubject: ${subject}\n\n${personalBody}`
    : "";
  const groupFallback = emailList
    ? `BCC: ${emailList}\nSubject: ${subject}\n\n${groupBody}`
    : "";

  function handleTemplateChange(nextTemplate: EmailTemplate) {
    const next = getEmailTemplate({ template: nextTemplate, challengeTitle, challengeUrl, progressMessage, donationUrl });
    setTemplate(nextTemplate);
    setSubject(next.subject);
    setBody(next.body);
  }

  async function handleCopyEmails() {
    if (!emailList) return;
    try {
      await navigator.clipboard.writeText(emailList);
      setCopied("emails");
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  async function handleCopyDraft() {
    try {
      await navigator.clipboard.writeText(personalBody);
      setCopied("draft");
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  async function handleOpenEmail(mailto: string, fallbackDraft: string) {
    if (!mailto || !fallbackDraft) return;
    setEmailNotice("Opening your email app...");
    window.location.href = mailto;
    window.setTimeout(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await navigator.clipboard.writeText(fallbackDraft);
        setEmailNotice("No email app opened, so the draft was copied to your clipboard.");
      } catch {
        setEmailNotice("No email app opened. Use Copy Draft or Copy Emails instead.");
      }
    }, 900);
  }

  return (
    <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>
            Member Emails
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {emailableMembers.length > 0
              ? `${emailableMembers.length} email ${emailableMembers.length === 1 ? "address" : "addresses"} ready`
              : memberCount > 0
                ? `${memberCount} ${memberCount === 1 ? "member" : "members"} in this challenge`
                : "No members yet"}
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadMembers}
          disabled={loadingMembers}
          className="px-3 py-2 rounded-xl text-xs font-bold shrink-0 disabled:opacity-50"
          style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
        >
          {loadingMembers ? "Loading..." : members.length > 0 ? "Refresh" : "Load"}
        </button>
      </div>

      {membersError && (
        <p className="text-xs mb-3" style={{ color: "#EF8844" }}>{membersError}</p>
      )}
      {emailNotice && (
        <p className="text-xs mb-3" style={{ color: "var(--green-primary)" }}>{emailNotice}</p>
      )}

      <div className="space-y-3">
        <select
          value={template}
          onChange={(event) => handleTemplateChange(event.target.value as EmailTemplate)}
          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          <option value="progress">Share Progress</option>
          <option value="thanks">Say Thanks</option>
          <option value="donation">Ask for a Donation</option>
        </select>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={7}
          className="w-full rounded-xl px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none"
          style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />

        {emailableMembers.length > 0 && (
          <select
            value={selectedMember?.uid ?? ""}
            onChange={(event) => setSelectedUid(event.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
            style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          >
            {emailableMembers.map((member) => (
              <option key={member.uid} value={member.uid}>
                {member.displayName} - {member.email}
              </option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleOpenEmail(personalMailto, personalFallback)}
            disabled={!selectedMember}
            className="py-2 rounded-xl text-xs font-bold text-center disabled:opacity-50"
            style={{
              background: selectedMember ? "var(--green-primary)" : "var(--bg-surface-3)",
              color: selectedMember ? "#0B1A14" : "var(--text-muted)",
            }}
          >
            Email One Member
          </button>
          <button
            type="button"
            onClick={() => handleOpenEmail(groupMailto, groupFallback)}
            disabled={emailableMembers.length === 0}
            className="py-2 rounded-xl text-xs font-bold text-center disabled:opacity-50"
            style={{
              border: "1px solid var(--border-emphasis)",
              color: emailableMembers.length > 0 ? "var(--green-primary)" : "var(--text-muted)",
            }}
          >
            Email All Members
          </button>
          <button
            type="button"
            onClick={handleCopyDraft}
            disabled={!selectedMember}
            className="py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
          >
            {copied === "draft" ? "Copied!" : "Copy Draft"}
          </button>
          <button
            type="button"
            onClick={handleCopyEmails}
            disabled={emailableMembers.length === 0}
            className="py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
          >
            {copied === "emails" ? "Copied!" : "Copy Emails"}
          </button>
        </div>
      </div>
    </section>
  );
}

function personalizeMessage(template: string, member: ChallengeMember): string {
  const firstName = member.displayName.trim().split(/\s+/)[0] || "there";
  return template
    .replaceAll("{name}", firstName)
    .replaceAll("{pledged}", member.pledged > 0 ? formatCurrency(member.pledged) : "your pledge");
}

function buildMailto({
  to = "",
  bcc = "",
  subject,
  body,
}: {
  to?: string;
  bcc?: string;
  subject: string;
  body: string;
}) {
  const params = new URLSearchParams();
  if (bcc) params.set("bcc", bcc);
  params.set("subject", subject);
  params.set("body", body);
  return `mailto:${to}?${params.toString()}`;
}
