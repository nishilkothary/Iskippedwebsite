import type { Project } from "@/lib/types/models";

export interface ChallengeCountdown {
  isExpired: boolean;
  daysLeft: number | null; // null = open-ended
  label: string;
}

export function getChallengeCountdown(project: Project): ChallengeCountdown {
  if (!project.endDate) return { isExpired: false, daysLeft: null, label: "" };
  const endMs = project.endDate.toMillis();
  const nowMs = Date.now();
  if (endMs <= nowMs) {
    const daysAgo = Math.floor((nowMs - endMs) / 86400_000);
    const label = daysAgo === 0 ? "Ended today" : daysAgo === 1 ? "Ended yesterday" : `Ended ${daysAgo}d ago`;
    return { isExpired: true, daysLeft: 0, label };
  }
  const daysLeft = Math.ceil((endMs - nowMs) / 86400_000);
  let label: string;
  if (daysLeft === 1) label = "1 day left";
  else if (daysLeft < 7) label = `${daysLeft} days left`;
  else if (daysLeft < 14) label = `${daysLeft} days left`;
  else label = `${daysLeft} days left`;
  return { isExpired: false, daysLeft, label };
}

export function parkedJarCount(
  causeJarBalances: Record<string, number> | undefined,
  activeProjectId: string | null | undefined
): number {
  if (!causeJarBalances) return 0;
  return Object.entries(causeJarBalances).filter(
    ([id, bal]) => id !== activeProjectId && bal > 0
  ).length;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/** Date string (YYYY-MM-DD) for Monday of the current week — same local-Date semantics as today()/yesterday() so lastSkipDate comparisons stay consistent. */
export function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d.toISOString().split("T")[0];
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
