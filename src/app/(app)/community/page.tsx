"use client";
import { useEffect, useState } from "react";
import { subscribeToCommunityFeed, subscribeToGlobalStats, getCommunityTotalSaved } from "@/lib/services/firebase/social";
import { FeedItem, GlobalStats } from "@/lib/types/models";
import { formatCurrencyShort, formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";

export default function CommunityPage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [communityTotalSaved, setCommunityTotalSaved] = useState<number>(0);

  useEffect(() => {
    const unsubFeed = subscribeToCommunityFeed((items) => {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      setFeed(shuffled);
    });
    const unsubStats = subscribeToGlobalStats(setStats);
    getCommunityTotalSaved().then(setCommunityTotalSaved);
    return () => {
      unsubFeed();
      unsubStats();
    };
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-[#111827] mb-2">Community</h1>
      <p className="text-[#6B7280] mb-8">See what everyone is skipping.</p>

      {/* Global stats */}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB] text-center">
              <p className="text-2xl font-bold text-[#3D8B68]">{formatCurrencyShort(communityTotalSaved)}</p>
              <p className="text-xs text-[#6B7280] mt-1">Total Skipped</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E7EB] text-center">
              <p className="text-2xl font-bold text-[#111827]">{stats.totalSkips.toLocaleString()}</p>
              <p className="text-xs text-[#6B7280] mt-1">Total Skips</p>
            </div>
          </div>
          <div className="bg-[#3D8B68] rounded-2xl p-5 mb-8 text-white flex items-center gap-4">
            <span className="text-4xl">🎓</span>
            <div>
              <p className="text-2xl font-bold">{(communityTotalSaved / 300).toFixed(1)}</p>
              <p className="text-[#B7D9C6] text-sm mt-0.5">years of education that could be funded by community skips</p>
            </div>
          </div>
        </>
      )}

      {/* Feed */}
      <div>
        <h2 className="text-lg font-semibold text-[#111827] mb-4">Recent Activity</h2>
        {feed.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-[#E5E7EB]">
            <p className="text-4xl mb-3">🌍</p>
            <p className="text-[#6B7280]">No community activity yet. Be the first to skip!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feed.map((item) => (
              <div key={item.id} className="bg-white rounded-xl px-5 py-4 border border-[#E5E7EB] flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#E4F0E8] flex items-center justify-center text-base flex-shrink-0">
                  {item.skipEmoji || "✅"}
                </div>
                <div className="flex-1 min-w-0">
                  {item.type === "skip" ? (
                    <p className="text-sm text-[#111827]">
                      {item.message}
                      {item.projectTitle && (
                        <span className="text-[#3D8B68] font-semibold"> for {item.projectTitle}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-[#111827]">{item.message}</p>
                  )}
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "recently"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
