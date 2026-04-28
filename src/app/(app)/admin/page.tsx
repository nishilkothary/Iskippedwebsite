"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { subscribeToGlobalStats, deleteOldCommunityFeedItems } from "@/lib/services/firebase/social";
import { getRecentSkips } from "@/lib/services/firebase/skips";
import { UserProfile, Skip, GlobalStats } from "@/lib/types/models";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(ts: any): string {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString();
}

export default function AdminPage() {
  const router = useRouter();
  const { profile, isLoading } = useAuthStore();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"totalSaved" | "totalSkips" | "totalDonated">("totalSaved");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [skipsMap, setSkipsMap] = useState<Record<string, Skip[]>>({});
  const [loadingSkips, setLoadingSkips] = useState<string | null>(null);
  const [clearingFeed, setClearingFeed] = useState(false);
  const [clearFeedMsg, setClearFeedMsg] = useState<string | null>(null);
  const [usersPermissionDenied, setUsersPermissionDenied] = useState(false);

  // Guard: wait for auth, then redirect if not admin
  useEffect(() => {
    if (isLoading) return;
    if (!profile || profile.email !== ADMIN_EMAIL) {
      router.replace("/home");
    }
  }, [profile, isLoading, router]);

  useEffect(() => {
    if (!profile || profile.email !== ADMIN_EMAIL) return;

    fetch("/api/admin/users", { headers: { "x-caller-email": profile.email } })
      .then((r) => r.json())
      .then((data) => { if (data.users) setUsers(data.users); else setUsersPermissionDenied(true); })
      .catch(() => setUsersPermissionDenied(true));

    const unsub = subscribeToGlobalStats(setStats);
    return () => unsub();
  }, [profile]);

  async function handleClearOldFeed() {
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
    setClearingFeed(true);
    setClearFeedMsg(null);
    try {
      const count = await deleteOldCommunityFeedItems(startOfWeek);
      setClearFeedMsg(count > 0 ? `Deleted ${count} old feed item(s).` : "Nothing to delete (all items are from this week).");
    } catch (e: any) {
      setClearFeedMsg(`Error: ${e.message}`);
    } finally {
      setClearingFeed(false);
    }
  }

  async function handleRowClick(uid: string) {
    if (expandedUid === uid) {
      setExpandedUid(null);
      return;
    }
    setExpandedUid(uid);
    if (!skipsMap[uid]) {
      setLoadingSkips(uid);
      try {
        const skips = await getRecentSkips(uid, 10);
        setSkipsMap((prev) => ({ ...prev, [uid]: skips }));
      } catch {
        setSkipsMap((prev) => ({ ...prev, [uid]: [] }));
      } finally {
        setLoadingSkips(null);
      }
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      )
      .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
  }, [users, search, sortKey]);

  if (isLoading || !profile) return null;
  if (profile.email !== ADMIN_EMAIL) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111827] mb-6">Admin Dashboard</h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Users", value: stats?.totalUsers ?? "—" },
          { label: "Total Skips", value: stats?.totalSkips ?? "—" },
          { label: "Total Saved", value: stats ? fmt(stats.totalSaved) : "—" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-[#E5E7EB] p-5">
            <p className="text-sm text-[#6B7280] mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-[#111827]">{String(card.value)}</p>
          </div>
        ))}
      </div>

      {/* Admin actions */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={handleClearOldFeed}
          disabled={clearingFeed}
          className="rounded-lg px-4 py-2 text-sm font-medium bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {clearingFeed ? "Clearing…" : "Clear old community feed (before this week)"}
        </button>
        {clearFeedMsg && <p className="text-sm text-[#6B7280]">{clearFeedMsg}</p>}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B68]"
        >
          <option value="totalSaved">Sort: Total Saved</option>
          <option value="totalSkips">Sort: Total Skips</option>
          <option value="totalDonated">Sort: Total Donated</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <tr>
              {["Name", "Email", "Skips", "Saved", "Donated", "Joined"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <>
                <tr
                  key={u.uid}
                  onClick={() => handleRowClick(u.uid)}
                  className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-[#111827]">{u.displayName}</td>
                  <td className="px-4 py-3 text-[#6B7280]">{u.email}</td>
                  <td className="px-4 py-3 text-[#111827]">{u.totalSkips}</td>
                  <td className="px-4 py-3 text-[#3D8B68] font-medium">{fmt(u.totalSaved)}</td>
                  <td className="px-4 py-3 text-[#111827]">{fmt(u.totalDonated)}</td>
                  <td className="px-4 py-3 text-[#6B7280]">{fmtDate(u.createdAt)}</td>
                </tr>
                {expandedUid === u.uid && (
                  <tr key={`${u.uid}-expanded`} className="bg-[#F9FAFB]">
                    <td colSpan={6} className="px-6 py-4">
                      {loadingSkips === u.uid ? (
                        <p className="text-sm text-[#6B7280]">Loading skips…</p>
                      ) : (skipsMap[u.uid]?.length ?? 0) === 0 ? (
                        <p className="text-sm text-[#6B7280]">No skips yet.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#9CA3AF] uppercase tracking-wide">
                              <th className="text-left pb-2">Category</th>
                              <th className="text-left pb-2">Amount</th>
                              <th className="text-left pb-2">Date</th>
                              <th className="text-left pb-2">Cause</th>
                            </tr>
                          </thead>
                          <tbody>
                            {skipsMap[u.uid].map((s) => (
                              <tr key={s.id} className="border-t border-[#E5E7EB]">
                                <td className="py-1.5">{s.categoryEmoji} {s.categoryLabel}</td>
                                <td className="py-1.5 text-[#3D8B68] font-medium">{fmt(s.amount)}</td>
                                <td className="py-1.5 text-[#6B7280]">{s.date}</td>
                                <td className="py-1.5 text-[#6B7280]">{s.projectTitle ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {usersPermissionDenied && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#9CA3AF]">
                  User listing requires Firebase Admin SDK (server-side). Set up a server API route with a service account to enable this.
                </td>
              </tr>
            )}
            {!usersPermissionDenied && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#9CA3AF]">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[#9CA3AF]">{filtered.length} of {users.length} users shown</p>
    </div>
  );
}
