"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/services/firebase/auth";
import { formatCurrency } from "@/lib/utils/currency";
import { updateJarSettings, normalizeJarSplit, recalculateTotals } from "@/lib/services/firebase/users";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, updateProfile } = useAuthStore();
  const [recalcState, setRecalcState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recalcResult, setRecalcResult] = useState<{ totalSkips: number; totalSaved: number } | null>(null);

  if (!profile || !user) return null;

  const currentSplit = normalizeJarSplit(profile.jarSplit as any);

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
            Level {profile.level} · {profile.xp} XP
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
          <span className="text-4xl">✂️</span>
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
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Longest Streak", value: `${profile.longestStreak} days`, emoji: "🏆" },
            { label: "Current Streak", value: `${profile.streak} days`, emoji: "🔥" },
          ].map((s) => (
            <div key={s.label} className="p-4" style={cardStyle}>
              <p className="text-lg mb-1">{s.emoji}</p>
              <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recalculate totals */}
      <div className="p-5 mb-6" style={{ ...cardStyle, borderRadius: 20 }}>
        <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>🔄 Recalculate totals from skip history</p>
        <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
          If your jar balances look wrong, this recomputes your totals from your actual logged skips.
          Donations and purchases are not affected.
        </p>
        {recalcState === "done" && recalcResult && (
          <div
            className="rounded-xl px-4 py-3 mb-3"
            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-emphasis)" }}
          >
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
          style={{
            border: "1px solid var(--border-emphasis)",
            color: "var(--text-secondary)",
            background: "transparent",
          }}
        >
          {recalcState === "loading" ? "Recalculating…" : "Recalculate"}
        </button>
      </div>

      {/* Jar Settings */}
      <JarSettings
        uid={user.uid}
        initialSplit={currentSplit}
        onSave={(split) => updateProfile({ jarSplit: split })}
      />

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
    </div>
  );
}

function JarSettings({
  uid,
  initialSplit,
  onSave,
}: {
  uid: string;
  initialSplit: { give: number; live: number };
  onSave: (split: { give: number; live: number }) => void;
}) {
  const [selected, setSelected] = useState(`${initialSplit.give}:${initialSplit.live}`);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const presets = [
    { label: "50 / 50",  key: "50:50",  g: 50,  l: 50  },
    { label: "75 / 25",  key: "75:25",  g: 75,  l: 25  },
    { label: "25 / 75",  key: "25:75",  g: 25,  l: 75  },
    { label: "100 / 0",  key: "100:0",  g: 100, l: 0   },
  ];

  async function handleSave() {
    const preset = presets.find((p) => p.key === selected);
    if (!preset) return;
    setSaving(true);
    const split = { give: preset.g, live: preset.l };
    await updateJarSettings(uid, split, null);
    onSave(split);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-6 mb-6" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", borderRadius: 20 }}>
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>Preferred Jar Split</h2>
      <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>🤲 Give a Little / 😊 Live a Little</p>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => setSelected(p.key)}
            className="py-3 rounded-xl text-sm font-bold transition-all"
            style={
              selected === p.key
                ? {
                    border: "2px solid var(--green-primary)",
                    background: "var(--bg-surface-2)",
                    color: "var(--green-primary)",
                  }
                : {
                    border: "1px solid var(--border-default)",
                    color: "var(--text-secondary)",
                    background: "transparent",
                  }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
          color: "var(--bg-base)",
        }}
      >
        {saved ? "✓ Saved!" : saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
