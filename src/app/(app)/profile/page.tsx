"use client";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/services/firebase/auth";
import { formatCurrency } from "@/lib/utils/currency";
import { xpProgress } from "@/lib/utils/xp";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, setUser, setProfile } = useAuthStore();

  if (!profile || !user) return null;

  const xp = xpProgress(profile.xp);

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setProfile(null);
    router.replace("/sign-in");
  }

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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label: "Total Skipped", value: formatCurrency(profile.totalSaved), emoji: "💰" },
          { label: "Total Skips", value: String(profile.totalSkips), emoji: "✅" },
          { label: "Total Donated", value: formatCurrency(profile.totalDonated), emoji: "💚" },
          { label: "Longest Streak", value: `${profile.longestStreak} days`, emoji: "🏆" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 border border-[#E5E7EB] shadow-sm">
            <p className="text-lg mb-1">{s.emoji}</p>
            <p className="text-lg font-bold text-[#111827]">{s.value}</p>
            <p className="text-xs text-[#6B7280]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* XP progress */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm mb-8">
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

      <button
        onClick={handleSignOut}
        className="w-full py-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 font-semibold transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
