"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/services/firebase/auth";
import { deleteAccount } from "@/lib/services/firebase/account";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeJarSplit, recalculateTotals } from "@/lib/services/firebase/users";
import { isPushSupported, registerForPush, unregisterPush, getPushUnsupportedReason } from "@/lib/services/firebase/push";
import { useSkips } from "@/hooks/useSkips";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, updateProfile } = useAuthStore();
  const { recentSkips } = useSkips();
  const [recalcState, setRecalcState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recalcResult, setRecalcResult] = useState<{ totalSkips: number; totalSaved: number } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushUnsupportedReason, setPushUnsupportedReason] = useState<string | null>(null);

  useEffect(() => {
    isPushSupported().then(setPushSupported);
    getPushUnsupportedReason().then(setPushUnsupportedReason);
  }, []);

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

  const currentSplit = normalizeJarSplit(profile.jarSplit as any);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekSkips = recentSkips.filter((s) => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.date);
    return d >= weekStart;
  });
  const weekGive = weekSkips.reduce((sum, s) => sum + (s.amount * (s.jarSplit?.give ?? currentSplit.give) / 100), 0);
  const weekLive = weekSkips.reduce((sum, s) => sum + (s.amount * (s.jarSplit?.live ?? currentSplit.live) / 100), 0);
  const topCat = weekSkips.length > 0
    ? (() => {
        const totals: Record<string, { amount: number; emoji: string; label: string }> = {};
        for (const s of weekSkips) {
          const key = s.categoryLabel ?? "Other";
          if (!totals[key]) totals[key] = { amount: 0, emoji: s.categoryEmoji ?? "", label: key };
          totals[key].amount += s.amount;
        }
        return Object.values(totals).sort((a, b) => b.amount - a.amount)[0];
      })()
    : null;

  const cardStyle = {
    background: "var(--bg-surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 16,
  };

  async function handleRecalculate() {
    setRecalcState("loading");
    setRecalcResult(null);
    try {
      const result = await recalculateTotals(user!.uid, currentSplit);
      updateProfile(result);
      setRecalcResult({ totalSkips: result.totalSkips, totalSaved: result.totalSaved });
      setRecalcState("done");
    } catch {
      setRecalcState("error");
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold mb-8" style={{ color: "var(--text-primary)" }}>Profile</h1>

      {/* Avatar & name */}
      <div className="p-8 mb-6 flex items-center gap-6" style={{ ...cardStyle, borderRadius: 20 }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden"
          style={{ background: "var(--bg-surface-2)", color: "var(--green-primary)" }}
        >
          {profile.photoURL ? (
            <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
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
      <div className="mb-6">
        <div className="px-5 py-4 mb-3 flex items-center justify-between" style={{ ...cardStyle, borderRadius: 20 }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Total Skipped</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{formatCurrency(profile.totalSaved)}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>across {profile.totalSkips} skip{profile.totalSkips !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { emoji: "💚", label: "donated", value: formatCurrency(profile.totalDonated), color: "var(--green-primary)" },
            { emoji: "🛍️", label: "spent", value: formatCurrency(profile.totalSpent ?? 0), color: "#8B5CF6" },
            { emoji: "🫙", label: "in jars", value: formatCurrency(Math.max(0, profile.totalSaved - profile.totalDonated - (profile.totalSpent ?? 0))), color: "#F59E0B" },
          ].map((s) => (
            <div key={s.label} className="p-3 text-center" style={cardStyle}>
              <p className="text-base">{s.emoji}</p>
              <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Longest Streak", value: `${profile.longestStreak} days`, emoji: "🏆" },
            { label: "Current Streak", value: `${profile.streak} days`, emoji: "🔥" },
            { label: "Friends Joined", value: String(profile.referralCount ?? 0), emoji: "🤝" },
          ].map((s) => (
            <div key={s.label} className="p-4" style={cardStyle}>
              <p className="text-lg mb-1">{s.emoji}</p>
              <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* This Week */}
        <div className="mt-3 p-5" style={{ ...cardStyle, borderRadius: 20 }}>
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)", letterSpacing: 0.5 }}>This Week</p>
          {[
            { label: "Skips logged", value: String(weekSkips.length), color: "var(--green-primary)" },
            { label: "Give jar", value: formatCurrency(weekGive), color: "#2BBAA4" },
            { label: "Reward jar", value: formatCurrency(weekLive), color: "#8B5CF6" },
            { label: "Top category", value: topCat ? `${topCat.emoji} ${topCat.label}` : "—", color: "#E8924A" },
          ].map((row, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0",
              borderBottom: i < 3 ? "1px solid var(--border-default)" : "none",
            }}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span className="text-sm font-bold" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recalculate */}
      <div className="mb-6">
        <div className="p-5 mb-4" style={{ ...cardStyle, borderRadius: 20 }}>
          <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>🔄 Recalculate totals</p>
          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
            If your jar balances look off, this recomputes your totals from your actual logged skips. Donations and purchases are not affected.
          </p>
          {recalcState === "done" && recalcResult && (
            <div className="rounded-xl px-4 py-3 mb-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-emphasis)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--green-primary)" }}>
                Done — {recalcResult.totalSkips} skip{recalcResult.totalSkips !== 1 ? "s" : ""} found,{" "}
                {formatCurrency(recalcResult.totalSaved)} total saved
              </p>
            </div>
          )}
          {recalcState === "error" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
            </div>
          )}
          <button
            onClick={handleRecalculate}
            disabled={recalcState === "loading"}
            className="w-full py-2.5 font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ border: "1px solid var(--border-emphasis)", color: "var(--text-secondary)", background: "transparent" }}
          >
            {recalcState === "loading" ? "Recalculating…" : "Recalculate"}
          </button>
        </div>

        {pushSupported && (
          <div className="p-5" style={{ ...cardStyle, borderRadius: 20 }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>🔔 Push notifications</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  Streak reminders and challenge activity, sent to this device.
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

        {!pushSupported && pushUnsupportedReason && (
          <p className="text-[11px] mt-3 text-center" style={{ color: "var(--text-muted)" }}>
            (debug: push hidden — {pushUnsupportedReason})
          </p>
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

