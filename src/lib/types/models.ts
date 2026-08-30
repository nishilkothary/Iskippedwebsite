import { Timestamp } from "firebase/firestore";

export interface SpendingGoal {
  id: string;
  label: string;
  targetAmount: number;
  /** "splurge" is the legacy persisted value for a personal reward. Do not use it in UI copy. */
  type: "splurge" | "donation";
  category?: string;
  shoppingLink?: string;
  merchant?: string;
  imageURL?: string;
  imagePosition?: string;
  donationURL?: string;
}

export type SkipAllocationTarget =
  | { type: "goal"; id: string }
  | { type: "fundraiser"; id: string };

export type SkipValueSource = SkipAllocationTarget | { type: "skip-bucks" };

export interface SkipSourceAllocation {
  source: SkipValueSource;
  amount: number;
}

export interface SkipLot {
  skipId: string;
  createdAtMs: number;
  originalLocation: string;
  balances: Record<string, number>;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  totalSaved: number;
  totalSkips: number;
  streak: number; // consecutive weeks with at least one skip
  longestStreak: number; // longest weekly streak
  xp: number;
  level: number;
  activeProjectId: string | null;
  activeSkipTarget?: SkipAllocationTarget | null;
  /** Jars intentionally paused by the user while they still hold saved money. */
  parkedSkipTargets?: SkipAllocationTarget[];
  joinedProjectIds?: string[];
  /** Per-challenge permission for organizers to see and email this address. */
  challengeEmailConsents?: Record<string, boolean>;
  savedTowardActiveCause: number;
  totalDonated: number;
  /** Portion of donations funded from saved skips; excludes outside contributions. */
  totalDonatedFromSkips?: number;
  followingCount: number;
  followersCount: number;
  createdAt: Timestamp;
  lastSkipDate: string | null; // YYYY-MM-DD
  lastDonationDate?: string | null; // YYYY-MM-DD
  favoriteCauseIds: string[];
  causeStats?: Record<string, { donated: number }>;
  /** @deprecated use spendingGoals + activeSpendingGoalId */
  spendingGoal?: { label: string; targetAmount: number; shoppingLink?: string } | null;
  spendingGoals?: SpendingGoal[];
  activeSpendingGoalId?: string | null;
  totalSpent?: number;
  causeJarBalances?: Record<string, number>;
  goalJarBalances?: Record<string, number>;
  /** Provenance-aware Skip Bucks lots. Legacy balances are represented by synthetic lots. */
  skipLots?: Record<string, SkipLot>;
  /** Marks a profile that has been through the one-time skip-pot jar migration. */
  jarMigrationVersion?: string;
  causeGoalAmounts?: Record<string, number>; // per-cause personal dollar goal set by user
  /** Donation total already completed when the current personal fundraiser goal was started. */
  causeGoalDonationBaselines?: Record<string, number>;
  causeJarOverflowCounts?: Record<string, number>; // skips taken while a fundraiser jar is at or above its goal
  deletedFundraiserNotices?: Record<string, { title: string; amount: number; deletedAt: Timestamp }>;
  weeklyEmailOptOut?: boolean;
  /** UTC date on which the weekly skip-prompt email was last sent. */
  lastWeeklyEmailSentDate?: string | null;
  emailVerified?: boolean;
  /** null once profile is created for a new user, set to a timestamp when the first-run onboarding flow is completed/skipped. Absent (undefined) on profiles created before onboarding existed. */
  onboardingCompletedAt?: Timestamp | null;
  /** The path a new user chose during first-run onboarding. */
  savingMotivation?: "reward" | "fundraiser" | "save-more" | "decide-later";
  /** uid of the inviter, set once via /api/referrals/attribute on signup. Immutable — server-only write. */
  referredBy?: string | null;
  /** Count of referred users whose first skip reward has been granted ("Friends joined"). Server-only write. */
  referralCount?: number;
  /** Cumulative give-portion dollars pledged by this user's direct invitees. Feeds the Impact Score. Server-only write. */
  referralImpactPoints?: number;
  /** True once the user has explicitly opted in to push notifications via the profile toggle. Server-only write (via /api/push/token). */
  pushOptIn?: boolean;
  /** Whether newly opened skip forms default to sharing in the community feed. Defaults to true. */
  shareSkipsByDefault?: boolean;
  /** Registered FCM device tokens for this user. Server-only write (via /api/push/token). */
  fcmTokens?: string[];
  /** Set when the user snoozes the post-skip setup prompt for home-screen install / weekly reminders. */
  setupPromptDismissedAt?: Timestamp | null;
  /** Set when the user completes the post-skip setup prompt. */
  setupPromptCompletedAt?: Timestamp | null;
  /** Set when an installed user dismisses the one-time weekly reminder opt-in prompt. */
  weeklyReminderPromptDismissedAt?: Timestamp | null;
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
  allocationTarget?: SkipAllocationTarget | null;
  /** Whether this fundraiser skip may appear in the fundraiser group feed. */
  shareWithCommunity?: boolean;
}

export interface Project {
  id: string;
  editedDetailFields?: string[];
  previousTitles?: string[];
  projectKind?: "cause" | "challenge";
  parentProjectId?: string | null;
  title: string;
  sponsor: string;
  groupName?: string;
  description: string;
  goalAmount: number;
  totalRaised: number;
  totalDonated?: number;
  totalSkips?: number;
  status?: "active" | "ended";
  imageURL: string | null;
  donationURL: string | null;
  donationNote?: string | null; // shown when no donationURL — e.g. "Send via Venmo @username"
  learnMoreURL?: string | null;
  isCustom: boolean;
  location?: string;
  unitName?: string;    // singular unit: "Day of Education", "Life-Saving Meal"
  unitDisplay?: string; // short plural for jar SVG: "days", "meals"
  unitCost?: number;    // dollars per unit, e.g. 0.822
  unitIsGoal?: boolean; // true = 1 unit IS the full goal (e.g. Chromebook $250 = 1 unit); shows % mode
  unitPhrase?: string;  // unitIsGoal only — one unit written out for "88% of ___" copy, e.g. "a Chromebook for a student". Defaults to oneUnitPhrase(unitName).
  skipMilestones?: { level1: number; level2: number; level3: number };
  visibility?: "public" | "private" | "unlisted" | "password";
  password?: string | null;
  createdBy: string | null; // uid for custom causes
  tags: string[];
  imagePosition?: string; // CSS object-position for the cause image, e.g. "bottom", "center 70%"
  startDate?: Timestamp | null;
  endDate?: Timestamp | null;
  memberUids?: string[];
}

export interface FeedItem {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
  type: "skip" | "donation";
  skipId?: string;
  skipAmount?: number;
  giveAmount?: number;
  skipCategory?: string;
  skipEmoji?: string;
  projectId?: string | null;
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
  /** Amount funded from this fundraiser jar. */
  jarDecrease?: number;
  /** Amount funded from unassigned Skip Bucks. */
  skipBucksDecrease?: number;
  /** Amount donated outside iSkipped (does not reduce saved skips). */
  outsideContribution?: number;
  /** Total of jarDecrease + skipBucksDecrease. */
  amountFromSkips?: number;
  date?: string; // YYYY-MM-DD, user-specified donation date
  ledgerConsumption?: Record<string, Record<string, number>>;
  donatedAt: Timestamp;
}

export interface SpendingHistoryEvent {
  id: string;
  goalId?: string;
  label: string;
  targetAmount: number;
  amountSaved: number;
  /** Full purchase amount, including any outside contribution. */
  totalAmount?: number;
  jarDecrease?: number;
  skipBucksDecrease?: number;
  outsideContribution?: number;
  ledgerConsumption?: Record<string, Record<string, number>>;
  purchasedAt: Timestamp;
}

export interface GlobalStats {
  totalSaved: number;
  totalSkips: number;
  totalUsers: number;
}
