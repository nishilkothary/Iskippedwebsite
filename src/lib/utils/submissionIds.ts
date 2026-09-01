type SubmissionKind = "skip" | "donation";

type PendingSubmission = {
  id: string;
  fingerprint: string;
  createdAt: number;
};

const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;
const memoryFallback: Partial<Record<SubmissionKind, PendingSubmission>> = {};

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

function createSubmissionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function storageKey(kind: SubmissionKind): string {
  return `iskipped:pending-${kind}-submission`;
}

function readPending(kind: SubmissionKind): PendingSubmission | null {
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(storageKey(kind));
      if (raw) return JSON.parse(raw) as PendingSubmission;
    } catch {
      // Privacy settings can disable sessionStorage; the in-memory fallback remains available.
    }
  }
  return memoryFallback[kind] ?? null;
}

function writePending(kind: SubmissionKind, pending: PendingSubmission | null) {
  if (pending) memoryFallback[kind] = pending;
  else delete memoryFallback[kind];
  if (typeof window !== "undefined") {
    try {
      if (pending) window.sessionStorage.setItem(storageKey(kind), JSON.stringify(pending));
      else window.sessionStorage.removeItem(storageKey(kind));
    } catch {
      // The in-memory fallback above still protects retries within this page session.
    }
  }
}

export function getOrCreateSubmissionId(kind: SubmissionKind, payload: Record<string, unknown>): string {
  const fingerprint = JSON.stringify(canonicalize(payload));
  const existing = readPending(kind);
  if (
    existing
    && existing.fingerprint === fingerprint
    && Date.now() - existing.createdAt <= MAX_PENDING_AGE_MS
  ) {
    return existing.id;
  }
  const pending = { id: createSubmissionId(), fingerprint, createdAt: Date.now() };
  writePending(kind, pending);
  return pending.id;
}

export function clearSubmissionId(kind: SubmissionKind, id: string) {
  const existing = readPending(kind);
  if (existing?.id === id) writePending(kind, null);
}
