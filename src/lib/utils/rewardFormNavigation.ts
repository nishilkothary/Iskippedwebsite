export const ONBOARDING_REWARD_HREF = "/jars?tab=live&add=reward&skip=1&onboarding=choose";

// Once the form consumes its add/prefill parameters, retain the onboarding
// selection marker so the introduction does not reopen over the active form.
export function rewardFormReadyHref(isOnboardingSelection: boolean): string {
  return isOnboardingSelection ? "/jars?tab=live&onboarding=choose" : "/jars?tab=live";
}
