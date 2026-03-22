export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export function calculateStreak(lastSkipDate: string | null, currentStreak: number): number {
  if (!lastSkipDate) return 0;
  const todayStr = today();
  const yesterdayStr = yesterday();
  if (lastSkipDate === todayStr || lastSkipDate === yesterdayStr) {
    return currentStreak;
  }
  return 0;
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
