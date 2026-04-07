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
    const unsubFeed = subscribeToCommunityFeed(setFeed);
    const unsubStats = subscribeToGlobalStats(setStats);
    getCommunityTotalSaved().then(setCommunityTotalSaved);
    return () => {
      unsubFeed();
      unsubStats();
    };
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-2">Community</h1>
      <p className="text-white/50 mb-8">See what everyone is skipping.</p>

      {/* Global stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white/10 rounded-2xl p-5 text-center">
            <p className="text-2xl font-bold text-[#2BBAA4]">{formatCurrencyShort(communityTotalSaved)}</p>
            <p className="text-xs text-white/50 mt-1">Total Skipped</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-5 text-center">
            <p className="text-2xl font-bold text-white">{stats.totalSkips.toLocaleString()}</p>
            <p className="text-xs text-white/50 mt-1">Total Skips</p>
          </div>
        </div>
      )}

      {/* Feed */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        {feed.length === 0 ? (
          <div className="bg-white/10 rounded-2xl p-8 text-center">
            <p className="text-4xl mb-3">🌍</p>
            <p className="text-white/50">No community activity yet. Be the first to skip!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feed.map((item) => {
              const firstName = item.displayName?.split(" ")[0] ?? "Someone";
              return (
                <div key={item.id} className="bg-white/10 rounded-xl px-5 py-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-base flex-shrink-0">
                    {item.skipEmoji || "✅"}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.type === "skip" ? (
                      <p className="text-sm text-white">
                        <span className="font-semibold">{firstName}</span> {item.message}
                        {item.projectTitle && (
                          <span className="text-[#2BBAA4] font-semibold"> for {item.projectTitle}</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-white"><span className="font-semibold">{firstName}</span> {item.message}</p>
                    )}
                    <p className="text-xs text-white/40 mt-1">
                      {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "recently"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
