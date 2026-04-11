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

  const cardStyle = {
    background: "var(--bg-surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 16,
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Community</h1>
      <p className="mb-8" style={{ color: "var(--text-secondary)" }}>See what everyone is skipping.</p>

      {/* Global stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-2xl p-5 text-center" style={cardStyle}>
            <p className="text-2xl font-bold" style={{ color: "var(--green-primary)" }}>{formatCurrencyShort(communityTotalSaved)}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Total Skipped</p>
          </div>
          <div className="rounded-2xl p-5 text-center" style={cardStyle}>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{stats.totalSkips.toLocaleString()}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Total Skips</p>
          </div>
        </div>
      )}

      {/* Feed */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Recent Activity</h2>
        {feed.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={cardStyle}>
            <p className="text-4xl mb-3">🌍</p>
            <p style={{ color: "var(--text-secondary)" }}>No community activity yet. Be the first to skip!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feed.map((item) => {
              const firstName = item.displayName?.split(" ")[0] ?? "Someone";
              return (
                <div key={item.id} className="rounded-xl px-5 py-4 flex items-start gap-3" style={cardStyle}>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    {item.skipEmoji || "✅"}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.type === "skip" ? (
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                        <span className="font-semibold">{firstName}</span> {item.message}
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                        <span className="font-semibold">{firstName}</span> {item.message}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
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
