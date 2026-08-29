import { describe, expect, it } from "vitest";
import { getPersonalFundraiserGoalProgress, isValidRaisedFundraiserGoal } from "./fundraiserGoals";

describe("personal fundraiser goal progress", () => {
  it("counts each donation once when it is deleted and logged again", () => {
    expect(getPersonalFundraiserGoalProgress(150, 20, 0)).toMatchObject({
      donatedTowardGoal: 20,
      remainingGoal: 130,
    });

    expect(getPersonalFundraiserGoalProgress(150, 0, 0)).toMatchObject({
      donatedTowardGoal: 0,
      remainingGoal: 150,
    });

    expect(getPersonalFundraiserGoalProgress(150, 20, 0)).toMatchObject({
      donatedTowardGoal: 20,
      remainingGoal: 130,
    });
  });

  it("only counts donations made during the current goal cycle", () => {
    expect(getPersonalFundraiserGoalProgress(150, 40, 20)).toMatchObject({
      donatedTowardGoal: 20,
      remainingGoal: 130,
    });
  });

  it("never lets a completed goal become negative", () => {
    expect(getPersonalFundraiserGoalProgress(150, 175, 0)).toEqual({
      goalAmount: 150,
      donatedTowardGoal: 175,
      remainingGoal: 0,
      goalReached: true,
    });
  });

  it("requires a raised total goal to exceed the amount already donated", () => {
    expect(isValidRaisedFundraiserGoal(175, 150, 175)).toBe(false);
    expect(isValidRaisedFundraiserGoal(150, 150, 175)).toBe(false);
    expect(isValidRaisedFundraiserGoal(200, 150, 175)).toBe(true);
  });
});
