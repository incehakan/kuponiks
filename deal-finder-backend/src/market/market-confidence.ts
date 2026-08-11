/**
 * Market confidence from sample size + price dispersion.
 */

import type { MarketConfidence } from "./market-intelligence.types.js";

/**
 * Deterministic confidence rules:
 * - sample >= 15 & dispersion <= 25 → HIGH
 * - sample >= 15 & dispersion <= 40 → MEDIUM
 * - sample 8–14 & dispersion <= 30 → MEDIUM
 * - otherwise LOW (including sample 5–7)
 */
export function resolveMarketConfidence(
  sampleSize: number,
  dispersionPct: number | null,
): MarketConfidence {
  const d = dispersionPct == null ? Number.POSITIVE_INFINITY : dispersionPct;

  if (sampleSize >= 15 && d <= 25) {
    return "HIGH";
  }
  if (sampleSize >= 15 && d <= 40) {
    return "MEDIUM";
  }
  if (sampleSize >= 8 && sampleSize <= 14 && d <= 30) {
    return "MEDIUM";
  }
  if (sampleSize >= 8 && sampleSize <= 14) {
    return "LOW";
  }
  return "LOW";
}
