"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/services/firebase/auth";
import { formatCurrency } from "@/lib/utils/currency";
import { xpProgress } from "@/lib/utils/xp";
import { updateJarSettings } from "@/lib/services/firebase/users";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, updateProfile } = useAuthStore();

  if (!profile || !user) return null;

  const xp = xpProgress(profile.xp);
  const currentSplit = profile.jarSplit ?? { giving: 34, spending: 33, savings: 33 };
  const currentGoal = profile.spendingGoal ?? null;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-[#111827] mb-8">Profile</h1>

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

      {/* XP progress */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-[#111827]">XP Progress</span>
          <span className="text-sm text-[#6B7280]">{xp.current} / {xp.needed}</span>
        </div>
        <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3D8B68] rounded-full"
            style={{ width: `${Math.round(xp.progress * 100)}%` }}
          />
        </div>
        <p className="text-xs text-[#6B7280] mt-2">
          {xp.needed - xp.current} XP until Level {profile.level + 1}
        </p>
      </div>

      {/* Jar Settings */}
      <JarSettings
        uid={user.uid}
        initialSplit={currentSplit}
        initialGoal={currentGoal}
        onSave={(split, goal) => updateProfile({ jarSplit: split, spendingGoal: goal })}
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
  initialGoal,
  onSave,
}: {
  uid: string;
  initialSplit: { giving: number; spending: number; savings: number };
  initialGoal: { label: string; targetAmount: number } | null;
  onSave: (split: { giving: number; spending: number; savings: number }, goal: { label: string; targetAmount: number } | null) => void;
}) {
  const [giving, setGiving] = useState(String(initialSplit.giving));
  const [spending, setSpending] = useState(String(initialSplit.spending));
  const [savings, setSavings] = useState(String(initialSplit.savings));
  const [goalLabel, setGoalLabel] = useState(initialGoal?.label ?? "");
  const [goalAmount, setGoalAmount] = useState(initialGoal ? String(initialGoal.targetAmount) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const total = (parseInt(giving) || 0) + (parseInt(spending) || 0) + (parseInt(savings) || 0);
  const valid = total === 100;

  const presets = [
    { label: "Equal", g: 34, sp: 33, sa: 33 },
    { label: "50/25/25", g: 50, sp: 25, sa: 25 },
    { label: "All Giving", g: 100, sp: 0, sa: 0 },
  ];

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    const split = { giving: parseInt(giving), spending: parseInt(spending), savings: parseInt(savings) };
    const goal = goalLabel && goalAmount
      ? { label: goalLabel, targetAmount: parseFloat(goalAmount) }
      : null;
    await updateJarSettings(uid, split, goal);
    onSave(split, goal);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-6">
      <h2 className="text-base font-bold text-[#111827] mb-5">Your Jars</h2>

      {/* Spending goal */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-[#111827] mb-2">🛍️ Spending Goal</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="What are you saving for? (e.g. AirPods)"
            value={goalLabel}
            onChange={(e) => setGoalLabel(e.target.value)}
            className="flex-1 border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
          />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
            <input
              type="number"
              placeholder="0"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              className="w-24 pl-6 border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
            />
          </div>
        </div>
      </div>

      {/* Split */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-[#111827] mb-2">Jar Split <span className="font-normal text-[#6B7280]">(must total 100%)</span></p>

        {/* Presets */}
        <div className="flex gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => { setGiving(String(p.g)); setSpending(String(p.sp)); setSavings(String(p.sa)); }}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:border-[#3D8B68]/50 hover:text-[#3D8B68] transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "🌍 Giving", value: giving, set: setGiving },
            { label: "🛍️ Spending", value: spending, set: setSpending },
            { label: "💰 Savings", value: savings, set: setSavings },
          ].map((row) => (
            <div key={row.label} className="text-center">
              <p className="text-xs text-[#6B7280] mb-1">{row.label}</p>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={row.value}
                  onChange={(e) => row.set(e.target.value)}
                  className="w-full border border-[#E5E7EB] rounded-xl px-2 py-2 text-sm text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">%</span>
              </div>
            </div>
          ))}
        </div>

        {!valid && (
          <p className="text-xs text-red-500 mt-2 text-center">Total is {total}% — must equal 100%</p>
        )}
        {valid && (
          <p className="text-xs text-[#3D8B68] mt-2 text-center">✓ Looks good</p>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={!valid || saving}
        className="w-full py-3 bg-[#3D8B68] text-white font-semibold rounded-xl text-sm hover:bg-[#2D6A4F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Jar Settings"}
      </button>
    </div>
  );
}
