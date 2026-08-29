function money(value: number | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

/** Canonical personal fundraiser progress for the current goal cycle. */
export function getPersonalFundraiserGoalProgress(
  goalAmount: number | undefined,
  lifetimeDonated: number | undefined,
  donationBaseline: number | undefined,
) {
  const goal = money(goalAmount);
  const donated = money(lifetimeDonated);
  const baseline = money(donationBaseline);
  const donatedTowardGoal = money(Math.max(0, donated - baseline));
  const remainingGoal = goal > 0 ? money(Math.max(0, goal - donatedTowardGoal)) : null;

  return {
    goalAmount: goal,
    donatedTowardGoal,
    remainingGoal,
    goalReached: remainingGoal === 0 && donatedTowardGoal > 0,
  };
}
