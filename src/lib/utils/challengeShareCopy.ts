import type { Project } from "@/lib/types/models";
import { formatCurrency } from "@/lib/utils/currency";

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripSentenceEnd(value: string): string {
  return cleanTitle(value).replace(/[.!?]+$/g, "").trim();
}

function descriptionCausePhrase(description: string): string {
  return stripSentenceEnd(description)
    .replace(/^your\s+(?:skips|savings|skipped savings)\s+(?:can|could|will)?\s*(?:help\s+)?(?:fund|provide|support|equip)\s+/i, "")
    .replace(/^skips\s+(?:can|could|will)?\s*(?:help\s+)?(?:fund|provide|support|equip)\s+/i, "")
    .replace(/^help\s+(?:fund|provide|support|equip)\s+/i, "")
    .trim();
}

export function getChallengeCausePhrase(project: Project): string {
  const descriptionPhrase = descriptionCausePhrase(project.description ?? "");
  if (descriptionPhrase) return descriptionPhrase;
  return stripSentenceEnd(project.groupName ?? project.title);
}

export function getDirectChallengeShareText(project: Project): string {
  return `Join me in skipping one expense this week to help save money for ${getChallengeCausePhrase(project)}.`;
}

export function getPostSkipShareText(project: Project, itemLabel: string, amount: number): string {
  return `I just skipped ${itemLabel} and saved ${formatCurrency(amount)} toward ${getChallengeCausePhrase(project)}. Join me in skipping one expense this week for the same cause.`;
}

export function getPersonalSkipShareText(itemLabel: string, amount: number, goalLabel?: string | null): string {
  const towardGoal = goalLabel?.trim() ? ` toward ${goalLabel.trim()}` : "";
  return `I skipped ${itemLabel} and saved ${formatCurrency(amount)}${towardGoal}. Join me in tracking your skipped expenses on iSkipped!`;
}

export function getFundraiserProgressShareText(project: Project, totalRaised: number): string {
  const goalAmount = Math.max(0, project.goalAmount ?? 0);
  const remaining = Math.max(0, goalAmount - Math.max(0, totalRaised));
  const cause = getChallengeCausePhrase(project);

  if (goalAmount > 0) {
    return `Our group has been skipping expenses to save money for ${cause}. We’re ${formatCurrency(remaining)} away from our ${formatCurrency(goalAmount)} group goal. Want to join us on iSkipped?`;
  }

  return `Our group has been skipping expenses to save money for ${cause}. Want to join us on iSkipped?`;
}

export function getDonationShareText(amount: number, cause: string): string {
  return `I turned the savings from skipped expenses into a ${formatCurrency(amount)} donation to provide ${stripSentenceEnd(cause)}. Want to see how a few skipped expenses can turn into real-world impact?`;
}
