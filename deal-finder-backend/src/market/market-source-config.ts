/**
 * Source-diversity classification thresholds (testable, not used by DealScore V1).
 */

import { config as loadDotenv } from "dotenv";

loadDotenv();

function parsePct(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 50 && n <= 100 ? n : fallback;
}

/**
 * When 2+ providers exist but the largest share is at/above this %,
 * diversity is MULTI_SOURCE_LOW (not balanced).
 * Default 80 — Honda Civic ~99% Arabam is LOW, not balanced.
 */
export function getDominantSourceLowThresholdPct(): number {
  return parsePct(process.env.MARKET_DOMINANT_SOURCE_LOW_PCT, 80);
}
