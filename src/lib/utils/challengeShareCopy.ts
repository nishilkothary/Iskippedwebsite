import type { Project } from "@/lib/types/models";
import { oneUnitPhrase } from "@/lib/utils/impact";

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

export function getPostSkipShareText(project: Project, itemLabel: string, givePercent: number): string {
  const pledgedPortion = givePercent >= 100 ? "what I saved" : "part of what I saved";
  return `I skipped ${itemLabel} and pledged ${pledgedPortion} toward ${getChallengeCausePhrase(project)}. Want to skip something this week for the same cause?`;
}
