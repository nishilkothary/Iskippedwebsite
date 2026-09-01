import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/services/apiAuth";

const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

export function parseSubmissionId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !SUBMISSION_ID_PATTERN.test(raw)) {
    throw new ApiError(400, "Invalid submission receipt");
  }
  return raw;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function submissionFingerprint(operation: "skip" | "donation", payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ operation, payload: canonicalize(payload) }))
    .digest("hex");
}

export function replayResult<T extends object>(
  receipt: Record<string, unknown>,
  operation: "skip" | "donation",
  fingerprint: string,
): T {
  if (receipt.operation !== operation || receipt.fingerprint !== fingerprint) {
    throw new ApiError(409, "This submission receipt was already used for different details");
  }
  if (!receipt.result || typeof receipt.result !== "object" || Array.isArray(receipt.result)) {
    throw new ApiError(409, "This submission receipt cannot be replayed safely");
  }
  return receipt.result as T;
}
