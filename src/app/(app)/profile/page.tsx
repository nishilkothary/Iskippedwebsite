"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/services/firebase/auth";
import { formatCurrency } from "@/lib/utils/currency";
import { updateJarSettings, normalizeJarSplit } from "@/lib/services/firebase/users";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, updateProfile } = useAuthStore();

  if (!profile || !user) return null;

  const currentSplit = normalizeJarSplit(profile.jarSplit as any);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-8">Profile</h1>

      {/* Avatar & name */}
      <div className="bg-white rounded-2xl p-8 border border-[#E5E7EB] shadow-sm mb-6 flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-[#E4F0E8] flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden">
          {profile.photoURL ? (
            <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            profile.displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-xl font-bold text-[#111827]">{profile.displayName}</p>
          <p className="text-sm text-[#6B7280]">{profile.email}</p>
          <span className="inline-block mt-2 text-xs bg-[#E4F0E8] text-[#3D8B68] font-semibold px-3 py-1 rounded-full">
            Level {profile.level} · {profile.xp} XP
          </span>
        </div>
      </div>

      {/* Lifetime stats */}
      <div className="mb-6">
        <div className="bg-white rounded-2xl px-5 py-4 border border-[#E5E7EB] shadow-sm mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Total Skipped</p>
            <p className="text-2xl font-bold text-[#111827] mt-0.5">{formatCurrency(profile.totalSaved)}</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">across {profile.totalSkips} skip{profile.totalSkips !== 1 ? "s" : ""}</p>
          </div>
          <span className="text-4xl">✂️</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { emoji: "💚", label: "donated", value: formatCurrency(profile.totalDonated), color: "text-[#3D8B68]" },
            { emoji: "🛍️", label: "spent", value: formatCurrency(profile.totalSpent ?? 0), color: "text-[#8B5CF6]" },
            { emoji: "🫙", label: "in jars", value: formatCurrency(Math.max(0, profile.totalSaved - profile.totalDonated - (profile.totalSpent ?? 0))), color: "text-[#F59E0B]" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-3 border border-[#E5E7EB] shadow-sm text-center">
              <p className="text-base">{s.emoji}</p>
              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[#6B7280]">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Longest Streak", value: `${profile.longestStreak} days`, emoji: "🏆" },
            { label: "Current Streak", value: `${profile.streak} days`, emoji: "🔥" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-[#E5E7EB] shadow-sm">
              <p className="text-lg mb-1">{s.emoji}</p>
              <p className="text-lg font-bold text-[#111827]">{s.value}</p>
              <p className="text-xs text-[#6B7280]">{s.label}</p>
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

      <button
        onClick={async () => {
          await signOut();
          setUser(null);
          setProfile(null);
          router.replace("/sign-in");
        }}
        className="w-full py-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 font-semibold transition-colors"
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
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-6">
      <h2 className="text-base font-bold text-[#111827] mb-1">Preferred Jar Split</h2>
      <p className="text-xs text-[#6B7280] mb-4">🤲 Give a Little / 😊 Live a Little</p>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => setSelected(p.key)}
            className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${
              selected === p.key
                ? "border-[#3D8B68] bg-[#E4F0E8] text-[#3D8B68]"
                : "border-[#E5E7EB] text-[#6B7280] hover:border-[#3D8B68]/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-[#3D8B68] text-white font-semibold rounded-xl text-sm hover:bg-[#2D6A4F] transition-colors disabled:opacity-50"
      >
        {saved ? "✓ Saved!" : saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
