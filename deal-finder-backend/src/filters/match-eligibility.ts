import { DEAL_SCORE_THRESHOLD } from "../analyzer/deal-score.service.js";

/**
 * Separates global deal highlighting from per-user filter matching.
 *
 * - DEAL_SCORE_THRESHOLD → deals feed / isDeal / global highlight
 * - UserFilter.minDealScore → whether a listing notifies a specific user filter
 *
 * A listing with score 60 must still enter the match pipeline so a user with
 * minDealScore=50 can match, even when the global threshold is 70.
 */

/** True when listing qualifies as a global "deal" highlight / deals feed item. */
export function isGlobalDealHighlight(
  dealScore: number,
  threshold: number = DEAL_SCORE_THRESHOLD,
): boolean {
  return Number.isFinite(dealScore) && dealScore >= threshold;
}

/**
 * Whether a newly ingested listing should enter the user-filter match queue.
 * Independent of DEAL_SCORE_THRESHOLD. Mock platform listings are skipped.
 */
export function shouldEnqueueListingForUserMatching(options: {
  platform?: string | null;
}): boolean {
  const platform = (options.platform ?? "").trim().toLowerCase();
  return platform !== "mock";
}
