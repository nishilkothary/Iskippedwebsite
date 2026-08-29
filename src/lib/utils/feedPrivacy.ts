import type { FeedItem, Skip } from "@/lib/types/models";

/** Legacy feed records are visible unless they were explicitly marked private. */
export function isVisibleGroupFeedItem(item: Pick<FeedItem, "shareName">): boolean {
  return item.shareName !== false;
}

/** Local skip records must explicitly opt in before Home may reconstruct a feed item. */
export function isSharedFundraiserSkip(skip: Pick<Skip, "shareWithCommunity">): boolean {
  return skip.shareWithCommunity === true;
}
