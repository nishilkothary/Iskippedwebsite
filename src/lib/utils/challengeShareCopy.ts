import type { Project } from "@/lib/types/models";
import { oneUnitPhrase } from "@/lib/utils/impact";
import { formatCurrency } from "@/lib/utils/currency";

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function withLocation(phrase: string, location?: string): string {
  const cleanPhrase = cleanTitle(phrase);
  const cleanLocation = location ? cleanTitle(location) : "";
  if (!cleanLocation || cleanPhrase.toLowerCase().includes(cleanLocation.toLowerCase())) {
    return cleanPhrase;
  }
  return `${cleanPhrase} in ${cleanLocation}`;
}

export function getChallengeCausePhrase(project: Project): string {
  if (project.unitIsGoal && (project.unitPhrase || project.unitName)) {
    return withLocation(project.unitPhrase ?? oneUnitPhrase(project.unitName!), project.location);
  }

  return withLocation(project.title, project.location);
}

export function getDirectChallengeShareText(project: Project): string {
  return `Join me in skipping one expense this week to help fund ${getChallengeCausePhrase(project)}.`;
}

export function getPostSkipShareText(project: Project, itemLabel: string, amount: number): string {
  return `I skipped ${itemLabel} and added ${formatCurrency(amount)} to my Skip Bank. Join me in skipping one expense this week to help fund ${getChallengeCausePhrase(project)}.`;
}
