"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/services/firebase/auth";
import { formatCurrency } from "@/lib/utils/currency";
import { updateJarSettings, normalizeJarSplit, recalculateTotals } from "@/lib/services/firebase/users";

const FAQ_ITEMS = [
  {
    q: "Does any money actually transfer when I log a skip?",
    a: "No — I Skipped is a tracking and motivation tool, not a payment platform. We encourage all users to donate what they've pledged in their jar, but no funds move automatically.",
  },
  {
    q: "My balance doesn't look right. What should I do?",
    a: "Use the Recalculate button at the bottom of the home page. It rebuilds all your totals directly from your logged skip history and should bring everything back in sync.",
  },
  {
    q: "Will more causes be added?",
    a: "Yes! We're currently in beta and actively growing our list of causes. Stay tuned — more options are on the way.",
  },
  {
    q: "Do I have to select a donation jar?",
    a: "While we strongly encourage everyone to pick a cause, it's not required. Your Give a Little jar will keep filling up until you choose one.",
  },
  {
    q: "Can I fund multiple save or give jars at once?",
    a: "No — at this time you can save for one thing at a time. You can transfer funds to a new cause/goal by activating a new jar, or mark as donated/purchased to close out that jar and start a new one.",
  },
  {
    q: "Is there an Iskipped app?",
    a: "We are still in the testing phase so there is no current app. For now we recommend pinning the URL to your phone's homepage for ease of access. Based on your feedback, we hope to bring an app to all our users shortly!",
  },
  {
    q: "Does I Skipped process the donations?",
    a: "No. I Skipped connects you with charitable organizations. Donations are processed directly by each organization. I Skipped does not handle or hold any donation funds.",
  },
  {
    q: "What does the 'Share name and skip with community' toggle do?",
    a: "This shares your first name and what you skipped. Keeping it off will hide your name and only show the category of the skip.",
  },
  {
    q: "I have feedback — where can I share it?",
    a: "We'd love to hear from you! Send us an email at iskippedfor@gmail.com and we'll get back to you.",
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, updateProfile } = useAuthStore();
  const [recalcState, setRecalcState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recalcResult, setRecalcResult] = useState<{ totalSkips: number; totalSaved: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

      {/* Jar Settings */}
      <JarSettings
        uid={user.uid}
        initialSplit={currentSplit}
        onSave={(split) => updateProfile({ jarSplit: split })}
      />

      {/* Help & Feedback */}
      <div className="mb-6">
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--text-primary)" }}>Help &amp; Feedback</h2>

        {/* Recalculate */}
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

        {/* Contact */}
        <div className="p-5 mb-4" style={{ ...cardStyle, borderRadius: 20 }}>
          <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>✉️ Have feedback or questions?</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Reach us at{" "}
            <a href="mailto:iskippedfor@gmail.com" className="underline" style={{ color: "var(--green-primary)" }}>
              iskippedfor@gmail.com
            </a>
          </p>
        </div>

        {/* FAQ */}
        <div style={{ ...cardStyle, borderRadius: 20, overflow: "hidden" }}>
          <p className="px-5 pt-5 pb-3 text-sm font-bold" style={{ color: "var(--text-primary)" }}>FAQ</p>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--border-default)" }}>
              <button
                className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.q}</span>
                <span className="text-lg leading-none flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {openFaq === i ? "−" : "+"}
                </span>
              </button>
              {openFaq === i && (
                <p className="px-5 pb-4 text-sm" style={{ color: "var(--text-secondary)" }}>{item.a}</p>
              )}
            </div>
          ))}
        </div>
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
  const presets = [
    { label: "50 / 50",  g: 50,  l: 50  },
    { label: "75 / 25",  g: 75,  l: 25  },
    { label: "25 / 75",  g: 25,  l: 75  },
    { label: "100 / 0",  g: 100, l: 0   },
  ];

  const matchingPreset = presets.find((p) => p.g === initialSplit.give);
  const [mode, setMode] = useState<"preset" | "custom">(matchingPreset ? "preset" : "custom");
  const [selectedPreset, setSelectedPreset] = useState<{ g: number; l: number }>(matchingPreset ?? presets[0]);
  const [customGive, setCustomGive] = useState(String(initialSplit.give));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function getActiveSplit(): { give: number; live: number } | null {
    if (mode === "preset") return { give: selectedPreset.g, live: selectedPreset.l };
    const g = parseInt(customGive, 10);
    if (isNaN(g) || g < 0 || g > 100) return null;
    return { give: g, live: 100 - g };
  }

  async function handleSave() {
    const split = getActiveSplit();
    if (!split) return;
    setSaving(true);
    await updateJarSettings(uid, split, null);
    onSave(split);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const activeSplit = getActiveSplit();

  return (
    <div className="p-6 mb-6" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", borderRadius: 20 }}>
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>Preferred Jar Split</h2>
      <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>🤲 Give a Little / 😊 Save a Little</p>

      {/* Mode toggle */}
      <div className="flex rounded-xl p-1 mb-4" style={{ background: "var(--bg-surface-2)" }}>
        <button
          onClick={() => setMode("preset")}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition"
          style={mode === "preset" ? { background: "var(--bg-surface-3)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}
        >
          Preset
        </button>
        <button
          onClick={() => setMode("custom")}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition"
          style={mode === "custom" ? { background: "var(--bg-surface-3)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}
        >
          Custom
        </button>
      </div>

      {mode === "preset" ? (
        <div className="grid grid-cols-2 gap-2 mb-5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setSelectedPreset(p)}
              className="py-3 rounded-xl text-sm font-bold transition-all"
              style={
                selectedPreset.g === p.g
                  ? { border: "2px solid var(--green-primary)", background: "var(--bg-surface-2)", color: "var(--green-primary)" }
                  : { border: "1px solid var(--border-default)", color: "var(--text-secondary)", background: "transparent" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-5">
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Enter your Give % (0–100). Save % is calculated automatically.</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--coral-primary)" }}>🤲 Give %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={customGive}
                onChange={(e) => setCustomGive(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="text-lg font-bold" style={{ color: "var(--text-muted)", paddingTop: 20 }}>/</div>
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "#2BBAA4" }}>😊 Save %</label>
              <div
                className="w-full rounded-xl px-3 py-2.5 text-sm font-bold"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
              >
                {activeSplit ? 100 - activeSplit.give : "—"}
              </div>
            </div>
          </div>
          {activeSplit === null && (
            <p className="text-xs mt-1" style={{ color: "var(--coral-primary)" }}>Enter a number between 0 and 100</p>
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !activeSplit}
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
