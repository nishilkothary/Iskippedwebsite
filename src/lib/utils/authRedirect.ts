const DEFAULT_AUTH_DESTINATION = "/home";

/** Keep URL-provided post-auth redirects on this site. */
export function safeAuthDestination(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return DEFAULT_AUTH_DESTINATION;
  }

  return value;
}

export function signInHrefFor(destination: string): string {
  const safeDestination = safeAuthDestination(destination);
  return `/sign-in?mode=signin&redirect=${encodeURIComponent(safeDestination)}`;
}
