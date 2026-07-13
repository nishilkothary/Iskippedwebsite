import { UserProfile, SpendingGoal } from "@/lib/types/models";
import { ApiError } from "@/lib/services/apiAuth";

// Server-side mirrors of the pure helpers in firebase/users.ts (kept dependency-free
// so API routes never bundle the client Firebase SDK). Keep behavior identical.

export function normalizeJarSplitServer(
  raw: { give?: number; live?: number; giving?: number; spending?: number } | undefined
): { give: number; live: number } {
  if (!raw) return { give: 50, live: 50 };
  if (raw.give !== undefined && raw.live !== undefined) return { give: raw.give, live: raw.live };
  return { give: raw.giving ?? 50, live: raw.spending ?? 50 };
}

export function normalizeSpendingGoalsServer(profile: Partial<UserProfile>): {
  goals: SpendingGoal[];
  activeId: string | null;
} {
  if (profile.spendingGoals && profile.spendingGoals.length > 0) {
    return {
      goals: profile.spendingGoals,
      activeId: profile.activeSpendingGoalId !== undefined
        ? profile.activeSpendingGoalId
        : profile.spendingGoals[0]?.id ?? null,
    };
  }
  if (profile.spendingGoal) {
    const goal: SpendingGoal = {
      id: "legacy",
      label: profile.spendingGoal.label,
      targetAmount: profile.spendingGoal.targetAmount,
      type: "splurge",
      shoppingLink: profile.spendingGoal.shoppingLink,
    };
    return { goals: [goal], activeId: "legacy" };
  }
  return { goals: [], activeId: null };
}

export const MAX_MONEY_AMOUNT = 10000;

export function validateAmount(amount: unknown, max = MAX_MONEY_AMOUNT): number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > max) {
    throw new ApiError(400, "Invalid amount");
  }
  return amount;
}

export function validateNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `Invalid ${field}`);
  }
  return value;
}
