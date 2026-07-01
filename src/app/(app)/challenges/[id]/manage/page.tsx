"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { deleteCustomProject, endChallenge, setChallengeDeadline, subscribeToProject } from "@/lib/services/firebase/projects";
import { subscribeToCommunityFeed } from "@/lib/services/firebase/social";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { Project, FeedItem } from "@/lib/types/models";

export default function ManageChallengePage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { user } = useAuthStore();
  const { projects } = useProjects();

  const challenge = projects.find((p) => p.id === challengeId) ?? null;

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
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<{ uid: string; displayName: string; photoURL: string | null; pledged: number }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
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
    if (challenge && challenge.createdBy !== user?.uid) {
      router.replace(`/challenges/${challengeId}`);
    }
  }, [challenge, user, challengeId, router]);

  if (!challenge) {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
      </main>
    );
  }

  if (challenge.createdBy !== user?.uid) return null;

  // Merge live stats over static challenge data
  const totalRaised = liveProject?.totalRaised ?? challenge.totalRaised;
  const totalDonated = liveProject?.totalDonated ?? 0;
  const memberUids = liveProject?.memberUids ?? challenge.memberUids ?? [];

  const challengeFeed = communityFeed
    .filter((item) => item.projectId === challengeId || item.projectTitle === challenge.title)
    .slice(0, 10);

  const challengeUrl = typeof window !== "undefined"
    ? `${window.location.origin}/challenges/${challengeId}`
    : `/challenges/${challengeId}`;

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const progressPct = challenge.goalAmount > 0
    ? Math.min(100, Math.round((totalRaised / challenge.goalAmount) * 100))
    : 0;

  const groupLabel = challenge.groupName ? `Group - ${challenge.groupName}` : challenge.title;
  const nudgeMessage = `I'm creating an iSkipped challenge ${groupLabel}. Every time we skip a purchase we save toward this goal together: ${challenge.title}\nJoin me: ${challengeUrl}`;

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

  async function handleViewMembers() {
    if (!challenge) return;
    if (members.length > 0) { setShowMembers((v) => !v); return; }
    setShowMembers(true);
    setLoadingMembers(true);
    const uids: string[] = memberUids;
    try {
      const profiles = await Promise.all(
        uids.slice(0, 50).map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          const data = snap.data();
          return {
            uid,
            displayName: data?.displayName ?? "Member",
            photoURL: data?.photoURL ?? null,
            pledged: (data?.causeJarBalances?.[challengeId] ?? 0) as number,
          };
        })
      );
      // Sort by pledged amount descending
      setMembers(profiles.sort((a, b) => b.pledged - a.pledged));
    } finally {
      setLoadingMembers(false);
    }
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
        text: `Join My iSkipped Group, ${challenge.groupName ?? challenge.title}, to help raise funds for ${challenge.title}. The challenge is simple, skip expenses in your daily life, and pledge some of your savings to this cause!`,
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
              {memberUids.length}
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
          <p className="text-xs uppercase tracking-wide font-bold mb-3" style={{ color: "var(--text-muted)" }}>
            Recent Activity
          </p>
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

      {/* Invite Friends */}
      <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs uppercase tracking-wide font-bold mb-3" style={{ color: "var(--text-muted)" }}>
          Invite Friends
        </p>
        <div className="space-y-2">
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
              style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
            >
              ↗ Share via...
            </button>
          )}
        </div>
      </section>

      {/* Send a Nudge */}
      <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
        <p className="text-xs uppercase tracking-wide font-bold mb-1" style={{ color: "var(--text-muted)" }}>
          Send a Nudge
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          Copy this to your group chat to motivate your members.
        </p>
        <div
          className="rounded-xl p-3 text-xs leading-relaxed mb-3"
          style={{ background: "var(--bg-surface-3)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
        >
          {nudgeMessage}
        </div>
        <NudgeCopyButton message={nudgeMessage} />
      </section>

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
