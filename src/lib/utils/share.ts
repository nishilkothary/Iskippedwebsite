/** Appends a referral ref param to a share/invite URL. No-ops if ref is empty. */
export function appendRefParam(url: string, ref: string | null | undefined): string {
  if (!ref) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ref=${encodeURIComponent(ref)}`;
}

export function buildWhatsAppShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export function buildXShareUrl(text: string, url: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function buildSmsShareUrl(text: string, url: string): string {
  // `?&body=` is the cross-platform-safe form (iOS needs the `?`, Android tolerates it).
  return `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
}
