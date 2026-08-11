/**
 * Market Intelligence runtime config (env-backed, safe defaults).
 * Reads process.env directly so unit tests need not load full AppEnv.
 */

import { config as loadDotenv } from "dotenv";

loadDotenv();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Minimum comparable sample size after outlier filtering. Default 5. */
export function getMarketMinSample(): number {
  return parsePositiveInt(process.env.MARKET_MIN_SAMPLE, 5);
}

/** Comparable lookback window in days (lastSeenAt). Default 90. */
export function getMarketLookbackDays(): number {
  return parsePositiveInt(process.env.MARKET_LOOKBACK_DAYS, 90);
}

/** Global deal threshold (isDeal / enqueue). Default 70. */
export function getDealScoreThreshold(): number {
  return parsePositiveInt(process.env.DEAL_SCORE_THRESHOLD, 70);
}
