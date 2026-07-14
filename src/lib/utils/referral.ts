const REF_STORAGE_KEY = "iskipped_ref_code";

/** First-touch capture: only stores if no ref code is already saved. */
export function captureReferralCode(code: string | null | undefined): void {
  if (!code || typeof window === "undefined") return;
  try {
    if (!window.localStorage.getItem(REF_STORAGE_KEY)) {
      window.localStorage.setItem(REF_STORAGE_KEY, code);
    }
  } catch {
    // localStorage unavailable (privacy mode, etc.) — attribution is best-effort
  }
}

export function consumeReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REF_STORAGE_KEY);
  } catch {
    // ignore
  }
}
