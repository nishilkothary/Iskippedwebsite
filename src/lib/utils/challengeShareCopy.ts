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
  return `I just skipped ${itemLabel} and saved ${formatCurrency(amount)} toward ${getChallengeCausePhrase(project)}.`;
}
