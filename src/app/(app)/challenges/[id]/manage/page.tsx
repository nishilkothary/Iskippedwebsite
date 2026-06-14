"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { deleteCustomProject, setChallengeDeadline } from "@/lib/services/firebase/projects";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";

export default function ManageChallengePage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { user } = useAuthStore();
  const { projects } = useProjects();

  const challenge = projects.find((p) => p.id === challengeId) ?? null;

  const [ending, setEnding] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showDeadlineEdit, setShowDeadlineEdit] = useState(false);
  const [newDeadlineDays, setNewDeadlineDays] = useState<number | null | "custom">(30);
  const [customDateStr, setCustomDateStr] = useState("");
  const [settingDeadline, setSettingDeadline] = useState(false);
  const [deadlineSuccess, setDeadlineSuccess] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<{ uid: string; displayName: string; photoURL: string | null }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

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

  const challengeUrl = typeof window !== "undefined"
    ? `${window.location.origin}/challenges/${challengeId}`
    : `/challenges/${challengeId}`;

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const progressPct = challenge.goalAmount > 0
    ? Math.min(100, Math.round((challenge.totalRaised / challenge.goalAmount) * 100))
    : 0;

  const groupLabel = challenge.groupName ? `Group - ${challenge.groupName}` : challenge.title;
  const nudgeMessage = `I'm creating an iSkipped challenge ${groupLabel}. Every time we skip a purchase we save toward this goal together: ${challenge.title}\nJoin me: ${challengeUrl}`;

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
    if (members.length > 0) { setShowMembers((v) => !v); return; }
    setShowMembers(true);
    setLoadingMembers(true);
    const uids: string[] = challenge.memberUids ?? [];
    try {
      const profiles = await Promise.all(
        uids.slice(0, 50).map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          const data = snap.data();
          return { uid, displayName: data?.displayName ?? "Member", photoURL: data?.photoURL ?? null };
        })
      );
      setMembers(profiles);
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
        text: `Join my iSkipped challenge: ${challenge.title}`,
        url: challengeUrl,
      });
    } catch {}
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
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
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-2xl font-black" style={{ color: "var(--green-primary)" }}>
              {formatCurrency(challenge.totalRaised)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>pledged so far</p>
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
              {challenge.memberUids?.length ?? 0}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>members</p>
          </div>
        </div>
        {(challenge.memberUids?.length ?? 0) > 0 && (
          <>
            <button
              onClick={handleViewMembers}
              className="text-xs font-semibold"
              style={{ color: "var(--green-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {showMembers ? "Hide members" : `View all ${challenge.memberUids!.length} members →`}
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
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{m.displayName}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </section>

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
          {(challenge.visibility === "private" || challenge.visibility === "password") && challenge.password && (
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,183,0,0.08)", border: "1px solid rgba(255,183,0,0.2)" }}>
              <p className="text-[10px] font-bold mb-0.5" style={{ color: "var(--gold-cta)" }}>Password</p>
              <p className="text-sm font-black tracking-wide" style={{ color: "var(--text-primary)" }}>
                {challenge.password}
              </p>
            </div>
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
              <p className="text-sm font-bold mb-1" style={{ color: "#EF4444" }}>Are you sure?</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                This permanently deletes the challenge. Users will no longer see it and it cannot be undone.
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
                {ending ? "Deleting..." : "Yes, Delete"}
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
