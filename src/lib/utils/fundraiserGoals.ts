function money(value: number | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

/** Canonical personal fundraiser progress. All recorded donations count toward the current total goal. */
export function getPersonalFundraiserGoalProgress(
  goalAmount: number | undefined,
  lifetimeDonated: number | undefined,
) {
  const goal = money(goalAmount);
  const donated = money(lifetimeDonated);
  const donatedTowardGoal = donated;
  const remainingGoal = goal > 0 ? money(Math.max(0, goal - donatedTowardGoal)) : null;

  return {
    goalAmount: goal,
    donatedTowardGoal,
    remainingGoal,
    goalReached: remainingGoal === 0 && donatedTowardGoal > 0,
  };
}

/** A raised total goal must preserve both the prior target and all progress in this goal cycle. */
export function isValidRaisedFundraiserGoal(
  nextGoalAmount: number | undefined,
  currentGoalAmount: number | undefined,
  donatedTowardGoal: number | undefined,
): boolean {
  const nextGoal = money(nextGoalAmount);
  return nextGoal > Math.max(money(currentGoalAmount), money(donatedTowardGoal));
}
