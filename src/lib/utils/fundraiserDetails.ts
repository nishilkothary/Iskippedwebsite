import type { Project } from "@/lib/types/models";

export const fundraiserDetailFields = [
  "donationURL", "donationNote", "title", "groupName", "sponsor", "description",
  "location", "goalAmount", "learnMoreURL", "imageURL", "imagePosition",
  "unitName", "unitDisplay", "unitCost", "visibility",
] as const;

export type FundraiserDetailField = typeof fundraiserDetailFields[number];

export function getFundraiserTitles(project: { title?: unknown; previousTitles?: unknown }): Set<string> {
  return new Set([project.title, ...(Array.isArray(project.previousTitles) ? project.previousTitles : [])]
    .filter((title): title is string => typeof title === "string" && title.length > 0));
}

// Only explicitly edited fields override the curated official-project defaults.
export function getFundraiserDetailOverrides(project: Project): Partial<Project> {
  return Object.fromEntries(fundraiserDetailFields
    .filter((field) => project.editedDetailFields?.includes(field) && project[field] !== undefined)
    .map((field) => [field, project[field]]));
}
