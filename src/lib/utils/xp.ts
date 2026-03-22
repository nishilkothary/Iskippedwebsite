export function xpForLevel(level: number): number {
  return level * level * 100;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; progress: number } {
  const level = levelForXp(xp);
  const current = xp - xpForLevel(level);
  const needed = xpForLevel(level + 1) - xpForLevel(level);
  return { level, current, needed, progress: current / needed };
}

export function xpForSkip(amount: number): number {
  return Math.floor(amount * 2) + 10;
}
