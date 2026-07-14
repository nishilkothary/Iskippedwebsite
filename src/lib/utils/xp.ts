export function xpForLevel(level: number): number {
  return level * level * 100;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function xpForSkip(amount: number): number {
  return Math.floor(amount * 2) + 10;
}

/** Flat XP bonus awarded to both referrer and referee when the referee logs their first skip. */
export const REFERRAL_BONUS_XP = 100;
