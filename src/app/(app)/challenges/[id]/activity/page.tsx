"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProjects } from "@/hooks/useProjects";
import { subscribeToChallengeFeed } from "@/lib/services/firebase/social";
import { FeedItem } from "@/lib/types/models";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/dates";

export default function ChallengeActivityPage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === challengeId) ?? null;
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    if (!challengeId) return;
    return subscribeToChallengeFeed(challengeId, setFeed);
  }, [challengeId]);

  const cardStyle = {
    background: "var(--bg-surface-1)",
    border: "1px solid var(--border-default)",
    borderRadius: 16,
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-8">
      <button
        onClick={() => router.back()}
        className="text-sm font-bold mb-5 flex items-center gap-1"
        style={{ color: "var(--green-primary)" }}
      >
        ← Back
      </button>

      <h1 className="text-2xl font-black mb-1" style={{ color: "var(--text-primary)" }}>
        {project?.groupName ?? project?.title ?? "Challenge"}
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Live activity
      </p>

      {feed.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={cardStyle}>
          <p className="text-4xl mb-3">⏳</p>
          <p style={{ color: "var(--text-secondary)" }}>No activity yet. Be the first to skip!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feed.map((item) => {
            const showName = item.shareName !== false;
            const firstName = item.displayName?.split(" ")[0] ?? "A friend";
            return (
              <div key={item.id} className="rounded-xl px-4 py-3 flex items-center gap-3" style={cardStyle}>
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  {item.skipEmoji ?? "✨"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {showName ? (
                      <><span className="font-black">{firstName}</span> {item.message}</>
                    ) : (
                      <>A friend {item.message}</>
                    )}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {item.createdAt?.toDate ? formatRelativeTime(item.createdAt.toDate()) : "just now"}
                  </p>
                </div>
                {(item.giveAmount ?? item.skipAmount) !== undefined && (
                  <p className="text-sm font-black flex-shrink-0" style={{ color: "var(--green-primary)" }}>
                    +{formatCurrency(item.giveAmount ?? item.skipAmount!)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
