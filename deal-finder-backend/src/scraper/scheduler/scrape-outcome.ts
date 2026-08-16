import type { ScrapePlatform } from "../../queues/scraper.queue.js";

export type ScrapeOutcome = "success" | "empty" | "failure";

/**
 * Classifies a scrape job outcome for ops logs/metrics.
 * Empty Letgo is "empty" (not failure); Sahibinden empty is still "empty"
 * at classification time — circuit trip is handled separately.
 */
export function classifyScrapeOutcome(input: {
  platform: ScrapePlatform;
  rawCount: number;
  error?: Error | null;
}): ScrapeOutcome {
  if (input.error) {
    return "failure";
  }
  if (input.rawCount <= 0) {
    return "empty";
  }
  return "success";
}
