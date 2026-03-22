export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  xpReward: number;
  check: (stats: { totalSkips: number; totalSaved: number; streak: number; level: number }) => boolean;
}

export const BADGE_DEFINITIONS: BadgeDef[] = [
  {
    id: "first_skip",
    title: "First Skip!",
    description: "You logged your very first skip",
    emoji: "🌱",
    xpReward: 50,
    check: ({ totalSkips }) => totalSkips >= 1,
  },
  {
    id: "skip_5",
    title: "Getting Started",
    description: "Logged 5 skips",
    emoji: "⭐",
    xpReward: 100,
    check: ({ totalSkips }) => totalSkips >= 5,
  },
  {
    id: "skip_10",
    title: "Habit Former",
    description: "Logged 10 skips",
    emoji: "🔥",
    xpReward: 150,
    check: ({ totalSkips }) => totalSkips >= 10,
  },
  {
    id: "skip_50",
    title: "Skip Master",
    description: "Logged 50 skips",
    emoji: "🏆",
    xpReward: 500,
    check: ({ totalSkips }) => totalSkips >= 50,
  },
  {
    id: "saved_10",
    title: "First $10",
    description: "Saved your first $10",
    emoji: "💰",
    xpReward: 100,
    check: ({ totalSaved }) => totalSaved >= 10,
  },
  {
    id: "saved_50",
    title: "Fifty Saved",
    description: "Saved $50 total",
    emoji: "💵",
    xpReward: 200,
    check: ({ totalSaved }) => totalSaved >= 50,
  },
  {
    id: "saved_100",
    title: "Century Club",
    description: "Saved $100 total",
    emoji: "💯",
    xpReward: 300,
    check: ({ totalSaved }) => totalSaved >= 100,
  },
  {
    id: "saved_180",
    title: "Education Funder",
    description: "Saved enough to educate a child for a year",
    emoji: "🎓",
    xpReward: 500,
    check: ({ totalSaved }) => totalSaved >= 180,
  },
  {
    id: "streak_3",
    title: "3-Day Streak",
    description: "Skipped 3 days in a row",
    emoji: "🔥",
    xpReward: 100,
    check: ({ streak }) => streak >= 3,
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "Skipped 7 days in a row",
    emoji: "📅",
    xpReward: 200,
    check: ({ streak }) => streak >= 7,
  },
  {
    id: "streak_30",
    title: "Monthly Master",
    description: "Skipped 30 days in a row",
    emoji: "🗓️",
    xpReward: 1000,
    check: ({ streak }) => streak >= 30,
  },
];
