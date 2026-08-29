/** Appends a referral ref param to a share/invite URL. No-ops if ref is empty. */
export function appendRefParam(url: string, ref: string | null | undefined): string {
  if (!ref) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ref=${encodeURIComponent(ref)}`;
}

/** Creates a stable, readable path segment from a challenge's group or title. */
export function slugifyChallengeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "challenge";
}

function getChallengeSlug(project: { title: string; groupName?: string }): string {
  return slugifyChallengeName(project.groupName?.trim() || project.title);
}

export function getChallengeSharePath(project: { id?: string; title: string; groupName?: string }): string {
  const slug = getChallengeSlug(project);
  return project.id ? `/join/${slug}?project=${encodeURIComponent(project.id)}` : `/join/${slug}`;
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
