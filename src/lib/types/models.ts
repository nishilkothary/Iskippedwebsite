import { Timestamp } from "firebase/firestore";

export interface SpendingGoal {
  id: string;
  label: string;
  targetAmount: number;
  type: "splurge" | "donation";
  shoppingLink?: string;
  donationURL?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  totalSaved: number;
  totalSkips: number;
  streak: number;
  longestStreak: number;
  xp: number;
  level: number;
  activeProjectId: string | null;
  savedTowardActiveCause: number;
  totalDonated: number;
  followingCount: number;
  followersCount: number;
  createdAt: Timestamp;
  lastSkipDate: string | null; // YYYY-MM-DD
  favoriteCauseIds: string[];
  causeStats?: Record<string, { donated: number }>;
  jarSplit?: { give: number; live: number };
  /** @deprecated use spendingGoals + activeSpendingGoalId */
  spendingGoal?: { label: string; targetAmount: number; shoppingLink?: string } | null;
  spendingGoals?: SpendingGoal[];
  activeSpendingGoalId?: string | null;
  totalSpent?: number;
  totalGiveAllocated?: number;
  totalLiveAllocated?: number;
  causeJarBalances?: Record<string, number>;
  goalJarBalances?: Record<string, number>;
  causeGoalAmounts?: Record<string, number>; // per-cause personal dollar goal set by user
}

export interface SkipCategory {
  id: string;
  label: string;
  emoji: string;
  defaultAmount: number;
  color: string;
}

export interface Skip {
  id: string;
  uid: string;
  category: string;
  categoryLabel: string;
  categoryEmoji: string;
  amount: number;
  date: string; // YYYY-MM-DD
  projectId: string | null;
  projectTitle: string | null;
  impactMessage: string;
  createdAt: Timestamp;
  whatSkipped?: string;
  notes?: string;
  jarSplit?: { give: number; live: number };
}

export interface Project {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  goalAmount: number;
  totalRaised: number;
  imageURL: string | null;
  donationURL: string | null;
  learnMoreURL?: string | null;
  isCustom: boolean;
  location?: string;
  unitName?: string;    // singular unit: "Day of Education", "Life-Saving Meal"
  unitDisplay?: string; // short plural for jar SVG: "days", "meals"
  unitCost?: number;    // dollars per unit, e.g. 0.822
  unitIsGoal?: boolean; // true = 1 unit IS the full goal (e.g. Chromebook $250 = 1 unit); shows % mode
  createdBy: string | null; // uid for custom causes
  tags: string[];
  imagePosition?: string; // CSS object-position for the cause image, e.g. "bottom", "center 70%"
}

export interface FeedItem {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
  type: "skip" | "donation";
  skipId?: string;
  skipAmount?: number;
  skipCategory?: string;
  skipEmoji?: string;
  projectTitle?: string;
  projectLocation?: string | null;
  shareName?: boolean;
  skipLabel?: string;
  message: string;
  createdAt: Timestamp;
}

export interface DonationEvent {
  id: string;
  causeId: string;
  causeTitle: string;
  amount: number;
  date?: string; // YYYY-MM-DD, user-specified donation date
  donatedAt: Timestamp;
}

export interface SpendingHistoryEvent {
  id: string;
  goalId?: string;
  label: string;
  targetAmount: number;
  amountSaved: number;
  purchasedAt: Timestamp;
}

export interface GlobalStats {
  totalSaved: number;
  totalSkips: number;
  totalUsers: number;
}
