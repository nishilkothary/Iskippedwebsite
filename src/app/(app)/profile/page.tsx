"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { resetPassword, signOut } from "@/lib/services/firebase/auth";
import { deleteAccount } from "@/lib/services/firebase/account";
import { formatCurrency } from "@/lib/utils/currency";
import { setChallengeEmailConsent, setShareSkipsByDefault, setWeeklyEmailOptOut } from "@/lib/services/firebase/users";
import { isPushSupported, registerForPush, unregisterPush } from "@/lib/services/firebase/push";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { isChallengeProject } from "@/lib/services/firebase/projects";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, updateProfile } = useAuthStore();
  const { recentSkips } = useSkips();
  const { projects } = useProjects();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const [weeklyEmailBusy, setWeeklyEmailBusy] = useState(false);
  const [challengeEmailBusy, setChallengeEmailBusy] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    isPushSupported().then(setPushSupported);
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.photoURL]);

  async function handleTogglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (profile?.pushOptIn) {
        await unregisterPush();
        updateProfile({ pushOptIn: false });
        toast.success("Push notifications turned off.");
      } else {
        await registerForPush();
        updateProfile({ pushOptIn: true });
        toast.success("Push notifications turned on.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't update push notification settings.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't delete your account. Please try again.");
      throw e;
    }
    toast.success("Your account has been deleted.");
    setShowDeleteModal(false);
    try {
      await signOut();
    } catch {
      // The Auth record is already gone server-side — clear local state regardless.
    }
    setUser(null);
    setProfile(null);
    router.replace("/sign-in");
  }

  if (!profile || !user) return null;

  const skipBalance = getSkipBalanceSummary(profile);
  const registeredEmail = user.email || profile.email;
  const usesGoogle = user.providerData.some((provider) => provider.providerId === "google.com");
  const challengeEmailIds = new Set([
    ...(profile.joinedProjectIds ?? []),
    ...Object.keys(profile.challengeEmailConsents ?? {}),
    ...Object.keys(profile.causeGoalAmounts ?? {}),
  ]);
  const challengeEmailPreferences = projects.filter(
    (project) => challengeEmailIds.has(project.id) && isChallengeProject(project)
  );
  const formatWeeks = (weeks: number) => `${weeks} week${weeks === 1 ? "" : "s"}`;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekSkips = recentSkips.filter((s) => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.date);
    return d >= weekStart;
  });
  const largestSkip = recentSkips.length > 0
    ? recentSkips.reduce((best, skip) => (skip.amount > best.amount ? skip : best), recentSkips[0])
    : null;
  const topCategory = recentSkips.length > 0
    ? (() => {
        const totals: Record<string, { amount: number; emoji: string; label: string }> = {};
        for (const skip of recentSkips) {
          const key = skip.categoryLabel ?? "Other";
          if (!totals[key]) totals[key] = { amount: 0, emoji: skip.categoryEmoji ?? "", label: key };
          totals[key].amount += skip.amount;
        }
        return Object.values(totals).sort((a, b) => b.amount - a.amount)[0];
      })()
    : null;
  const mostSkippedCategory = recentSkips.length > 0
    ? (() => {
        const totals: Record<string, { count: number; emoji: string; label: string }> = {};
        for (const skip of recentSkips) {
          const key = skip.categoryLabel ?? "Other";
          if (!totals[key]) totals[key] = { count: 0, emoji: skip.categoryEmoji ?? "", label: key };
          totals[key].count += 1;
        }
        return Object.values(totals).sort((a, b) => b.count - a.count)[0];
      })()
    : null;

  const cardStyle = {
    background: "var(--bg-surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 16,
  };
  const firstName = profile.displayName.split(" ")[0] || profile.displayName;

  async function handleToggleShareSkipsByDefault() {
    if (!user || !profile) return;
    const shareSkipsByDefault = profile.shareSkipsByDefault === false;
    try {
      await setShareSkipsByDefault(user.uid, shareSkipsByDefault);
      updateProfile({ shareSkipsByDefault });
      toast.success(shareSkipsByDefault ? "Fundraiser skips will be shared by default." : "Fundraiser skips will stay private by default.");
    } catch {
      toast.error("Couldn't update your sharing preference.");
    }
  }

  async function handlePasswordReset() {
    if (!registeredEmail || passwordResetBusy) return;
    setPasswordResetBusy(true);
    try {
      await resetPassword(registeredEmail);
      toast.success(`Password reset link sent to ${registeredEmail}. Check Spam or Junk if needed.`);
    } catch (error: any) {
      toast.error(error?.message || "Couldn't send a password reset link.");
    } finally {
      setPasswordResetBusy(false);
    }
  }

  async function handleToggleWeeklyEmail() {
    if (weeklyEmailBusy || !user || !profile) return;
    const weeklyEmailOptOut = !profile.weeklyEmailOptOut;
    setWeeklyEmailBusy(true);
    try {
      await setWeeklyEmailOptOut(user.uid, weeklyEmailOptOut);
      updateProfile({ weeklyEmailOptOut });
      toast.success(weeklyEmailOptOut ? "Weekly email check-ins turned off." : "Weekly email check-ins turned on.");
    } catch {
      toast.error("Couldn't update your weekly email preference.");
    } finally {
      setWeeklyEmailBusy(false);
    }
  }

  async function handleToggleChallengeEmail(projectId: string) {
    if (challengeEmailBusy || !user || !profile) return;
    const shareEmail = profile.challengeEmailConsents?.[projectId] !== true;
    setChallengeEmailBusy(projectId);
    try {
      await setChallengeEmailConsent(user.uid, projectId, shareEmail);
      updateProfile({
        challengeEmailConsents: { ...(profile.challengeEmailConsents ?? {}), [projectId]: shareEmail },
      });
      toast.success(shareEmail ? "Challenge email updates turned on." : "Challenge email updates turned off.");
    } catch {
      toast.error("Couldn't update this challenge email preference.");
    } finally {
      setChallengeEmailBusy(null);
    }
  }

  return (
    <div className="p-4 md:p-10 max-w-3xl mx-auto pb-28 md:pb-10">
      <div
        className="mb-5 overflow-hidden"
        style={{
          borderRadius: 24,
          background: "linear-gradient(145deg, rgba(46,204,113,0.16), rgba(15,45,32,0.96) 46%, rgba(139,92,246,0.1))",
          border: "1px solid rgba(46,204,113,0.24)",
        }}
      >
        <div className="p-6 md:p-7">
          <div className="flex items-center gap-5 min-w-0">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden"
              style={{ background: "rgba(237,245,240,0.08)", color: "var(--green-primary)", border: "1px solid rgba(237,245,240,0.15)" }}
            >
              {profile.photoURL && !avatarFailed ? (
                <img src={profile.photoURL} alt="" className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
              ) : (
                profile.displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black truncate" style={{ color: "var(--text-primary)" }}>{firstName}</p>
              <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{profile.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: "rgba(46,204,113,0.12)", color: "var(--green-primary)", border: "1px solid rgba(46,204,113,0.28)" }}>
                  Level {profile.level}
                </span>
                <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: "rgba(237,245,240,0.08)", color: "var(--text-primary)", border: "1px solid rgba(237,245,240,0.12)" }}>
                  {profile.totalSkips} skip{profile.totalSkips !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Avatar & name */}
      <div className="hidden" style={{ ...cardStyle, borderRadius: 20 }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden"
          style={{ background: "var(--bg-surface-2)", color: "var(--green-primary)" }}
        >
          {profile.photoURL && !avatarFailed ? (
            <img src={profile.photoURL} alt="" className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
          ) : (
            profile.displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{profile.displayName}</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{profile.email}</p>
          <span
            className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: "var(--bg-surface-2)", color: "var(--green-primary)", border: "1px solid var(--border-default)" }}
          >
            Level {profile.level}
          </span>
        </div>
      </div>

      {/* Lifetime stats */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 mb-4">
          {[
            { label: "Skipped", value: formatCurrency(skipBalance.lifetimeSaved), note: `${profile.totalSkips} no-thanks`, color: "var(--text-primary)" },
            { label: "Spent", value: formatCurrency(skipBalance.spentFromSkips), note: "on goals", color: "#A78BFA" },
            { label: "Donated", value: formatCurrency(skipBalance.donatedFromSkips), note: "to fundraisers", color: "var(--green-primary)" },
          ].map((s, i) => (
            <div key={s.label} className={i === 0 ? "col-span-2 px-4 py-4 md:col-span-1" : "px-4 py-4"} style={{ ...cardStyle, borderRadius: 16 }}>
              <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
              <p className={i === 0 ? "mt-1 text-2xl font-black md:text-xl" : "mt-1 text-lg font-black sm:text-xl"} style={{ color: s.color }}>{s.value}</p>
              <p className="mt-0.5 text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>{s.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-4" style={{ borderTop: "1px solid var(--border-default)" }}>
          {[
            { href: "/dashboard?from=profile", title: "See skip history", helper: "Review and edit your logged skips." },
            { href: "/jar-activity?from=profile", title: "Manage jars", helper: "Review jar balances, purchases, and donations." },
          ].map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between gap-4 py-3 transition-colors"
              style={{
                borderBottom: index === 0 ? "1px solid var(--border-default)" : "none",
                textDecoration: "none",
              }}
            >
              <span>
                <span className="block text-sm font-black" style={{ color: "var(--text-primary)" }}>{item.title}</span>
                <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{item.helper}</span>
              </span>
              <span className="text-lg font-black" style={{ color: "var(--green-primary)" }} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
        {/* Personal records */}
        <div className="mt-4 p-5" style={{ ...cardStyle, borderRadius: 20 }}>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "var(--green-primary)" }}>Personal bests</p>
              <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Your skip records</p>
            </div>
          </div>
          {[
            { label: "Longest streak", value: formatWeeks(profile.longestStreak), color: "var(--text-primary)" },
            { label: "Current streak", value: formatWeeks(profile.streak), color: "var(--text-primary)" },
            { label: "Largest skip", value: largestSkip ? formatCurrency(largestSkip.amount) : "None yet", color: "var(--green-primary)" },
            { label: "Top category", value: topCategory ? `${topCategory.emoji} ${topCategory.label}` : "None yet", color: "#E8924A" },
            { label: "Most skipped category", value: mostSkippedCategory ? `${mostSkippedCategory.emoji} ${mostSkippedCategory.label}` : "None yet", color: "#A78BFA" },
          ].map((row, i, rows) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border-default)" : "none",
            }}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span className="text-sm font-bold" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="mb-8">
        <div className="p-5 mb-4" style={{ ...cardStyle, borderRadius: 20 }}>
          <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "var(--green-primary)" }}>Account</p>
          <p className="mt-1 text-lg font-black" style={{ color: "var(--text-primary)" }}>Sign-in details</p>
          <div className="mt-4 rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <p className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Registered email</p>
            <p className="mt-1 text-sm font-black break-all" style={{ color: "var(--text-primary)" }}>{registeredEmail || "No email on this account"}</p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Password</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {usesGoogle
                  ? "You signed in with Google. Send a reset link if you would also like to use email and password."
                  : "For security, your password is never shown. Send yourself a reset link to create a new one."}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={!registeredEmail || passwordResetBusy}
              className="shrink-0 rounded-full px-3 py-2 text-xs font-black disabled:opacity-50"
              style={{ background: "var(--green-primary)", color: "var(--bg-base)" }}
            >
              {passwordResetBusy ? "Sending…" : "Reset password"}
            </button>
          </div>
        </div>

        <div className="p-5 mb-4" style={{ ...cardStyle, borderRadius: 20 }}>
          <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "var(--green-primary)" }}>Preferences</p>
          <p className="mt-1 text-lg font-black" style={{ color: "var(--text-primary)" }}>Sharing & reminders</p>

          <p className="mt-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sharing</p>
          <div className="mt-2 rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Share fundraiser skips by default</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  When on, new fundraiser skips are shared by default. You can change your default setting at any time before logging a skip. Reward skips stay private.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleShareSkipsByDefault}
                role="switch"
                aria-checked={profile.shareSkipsByDefault !== false}
                aria-label="Toggle sharing fundraiser skips by default"
                className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors"
                style={{
                  background: profile.shareSkipsByDefault !== false ? "var(--green-primary)" : "var(--bg-surface-3)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: "#fff",
                    left: 2,
                    transform: profile.shareSkipsByDefault !== false ? "translateX(20px)" : "translateX(0)",
                  }}
                />
              </button>
            </div>
          </div>

          <p className="mt-5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Reminders</p>
          <div className="mt-2 overflow-hidden rounded-xl" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
            {pushSupported && (
              <div className="p-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>🔔 Allow weekly push reminder</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      A weekly reminder on your phone to help keep your skip momentum going.
                    </p>
                  </div>
                  <button
                    onClick={handleTogglePush}
                    disabled={pushBusy}
                    role="switch"
                    aria-checked={!!profile.pushOptIn}
                    aria-label="Toggle push notifications"
                    className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: profile.pushOptIn ? "var(--green-primary)" : "var(--bg-surface-3)",
                      border: "1px solid var(--border-default)",
                      cursor: pushBusy ? "default" : "pointer",
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                      style={{
                        background: "#fff",
                        left: 2,
                        transform: profile.pushOptIn ? "translateX(20px)" : "translateX(0)",
                      }}
                    />
                  </button>
                </div>
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Weekly email check-in</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>A weekly reminder to log a skip, sent to your registered email.</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleWeeklyEmail}
                  disabled={weeklyEmailBusy}
                  role="switch"
                  aria-checked={!profile.weeklyEmailOptOut}
                  aria-label="Toggle weekly email check-ins"
                  className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50"
                  style={{ background: !profile.weeklyEmailOptOut ? "var(--green-primary)" : "var(--bg-surface-3)", border: "1px solid var(--border-default)" }}
                >
                  <span className="absolute top-0.5 w-5 h-5 rounded-full transition-transform" style={{ background: "#fff", left: 2, transform: !profile.weeklyEmailOptOut ? "translateX(20px)" : "translateX(0)" }} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {challengeEmailPreferences.length > 0 && (
          <div className="p-5 mt-4" style={{ ...cardStyle, borderRadius: 20 }}>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Fundraiser email sharing</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Choose which fundraiser organizers may contact you at your registered email.</p>
            <div className="mt-3" style={{ borderTop: "1px solid var(--border-default)" }}>
              {challengeEmailPreferences.map((project) => {
                const enabled = profile.challengeEmailConsents?.[project.id] === true;
                return (
                  <div key={project.id} className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <span className="min-w-0">
                      <span className="block text-sm font-black truncate" style={{ color: "var(--text-primary)" }}>{project.groupName || project.title}</span>
                      <span className="block mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{enabled ? "Updates allowed" : "Updates off"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleChallengeEmail(project.id)}
                      disabled={challengeEmailBusy === project.id}
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Toggle email updates for ${project.groupName || project.title}`}
                      className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50"
                      style={{ background: enabled ? "var(--green-primary)" : "var(--bg-surface-3)", border: "1px solid var(--border-default)" }}
                    >
                      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-transform" style={{ background: "#fff", left: 2, transform: enabled ? "translateX(20px)" : "translateX(0)" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={async () => {
          await signOut();
          setUser(null);
          setProfile(null);
          router.replace("/sign-in");
        }}
        className="w-full py-3 rounded-xl font-semibold transition-colors hover:bg-red-500/10"
        style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
      >
        Sign Out
      </button>

      <button
        onClick={() => setShowDeleteModal(true)}
        className="w-full mt-3 py-3 rounded-xl font-semibold text-sm transition-colors hover:bg-red-500/10"
        style={{ border: "none", color: "var(--text-muted)" }}
      >
        Delete account
      </button>

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onConfirmed={handleDeleteAccount}
        />
      )}
    </div>
  );
}

