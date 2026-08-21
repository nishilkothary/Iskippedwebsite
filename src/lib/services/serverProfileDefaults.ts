import { ApiError } from "@/lib/services/apiAuth";
import type { Project } from "@/lib/types/models";

export function validateAmount(value: unknown, fieldName = "amount"): number {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive number`);
  }

  return Math.round(amount * 100) / 100;
}

export function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  return value.trim();
}

export function isChallengeProjectServer(project: Pick<Project, "projectKind" | "memberUids" | "visibility"> | null | undefined): boolean {
  return project?.projectKind === "challenge" || Array.isArray(project?.memberUids) || Boolean(project?.visibility);
}
