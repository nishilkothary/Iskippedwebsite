import { ApiError } from "@/lib/services/apiAuth";
import { MAX_LOGGED_AMOUNT } from "@/lib/constants/amountLimits";
import type { Project } from "@/lib/types/models";

export function validateAmount(value: unknown, fieldName = "amount"): number {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive number`);
  }

  return Math.round(amount * 100) / 100;
}

/** Applies the per-entry ceiling used only when recording skips and donations. */
export function validateLoggedAmount(value: unknown, fieldName = "amount"): number {
  const amount = validateAmount(value, fieldName);

  if (amount > MAX_LOGGED_AMOUNT) {
    throw new ApiError(400, `${fieldName} cannot exceed $10,000`);
  }

  return amount;
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
