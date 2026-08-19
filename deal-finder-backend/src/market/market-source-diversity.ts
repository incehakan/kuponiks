/**
 * Additive multi-source metadata for Market Intelligence samples.
 * Does not change median, IQR, confidence, or DealScore.
 */

import { listingPlatformLabel } from "../lib/platform-label.js";
import { getDominantSourceLowThresholdPct } from "./market-source-config.js";
import type { MarketDiversity, MarketSourceShare } from "./market-intelligence.types.js";

const MOCK_PLATFORMS = new Set(["mock", "mock-seeder"]);

export function isMockMarketPlatform(
  platform: string | null | undefined,
): boolean {
  return MOCK_PLATFORMS.has((platform ?? "").trim().toLowerCase());
}

export interface MarketSourceDiversity {
  sourceCount: number;
  sourceDistribution: MarketSourceShare[];
  dominantSourcePct: number | null;
  diversity: MarketDiversity | null;
}

export function emptyMarketSourceDiversity(): MarketSourceDiversity {
  return {
    sourceCount: 0,
    sourceDistribution: [],
    dominantSourcePct: null,
    diversity: null,
  };
}

function normalizePlatform(platform: string | null | undefined): string {
  return (platform ?? "").trim().toLowerCase();
}

/**
 * Distinct real providers in the comparable sample (mock excluded).
 * Distribution ordered by sampleSize desc, then platform asc.
 */
export function computeMarketSourceDiversity(
  platforms: Array<string | null | undefined>,
  dominantLowThresholdPct: number = getDominantSourceLowThresholdPct(),
): MarketSourceDiversity {
  const counts = new Map<string, number>();
  for (const raw of platforms) {
    const platform = normalizePlatform(raw);
    if (!platform || isMockMarketPlatform(platform)) {
      continue;
    }
    counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }

  const sourceDistribution: MarketSourceShare[] = [...counts.entries()]
    .map(([platform, sampleSize]) => ({ platform, sampleSize }))
    .sort((a, b) => {
      if (b.sampleSize !== a.sampleSize) {
        return b.sampleSize - a.sampleSize;
      }
      return a.platform.localeCompare(b.platform, "en");
    });

  const total = sourceDistribution.reduce((sum, row) => sum + row.sampleSize, 0);
  const sourceCount = sourceDistribution.length;
  if (sourceCount === 0 || total === 0) {
    return emptyMarketSourceDiversity();
  }

  const dominant = sourceDistribution[0]!;
  const dominantSourcePct = Number(((dominant.sampleSize / total) * 100).toFixed(1));
  const diversity = classifyMarketDiversity(
    sourceCount,
    dominantSourcePct,
    dominantLowThresholdPct,
  );

  return {
    sourceCount,
    sourceDistribution,
    dominantSourcePct,
    diversity,
  };
}

export function classifyMarketDiversity(
  sourceCount: number,
  dominantSourcePct: number | null,
  dominantLowThresholdPct: number = getDominantSourceLowThresholdPct(),
): MarketDiversity | null {
  if (sourceCount <= 0) {
    return null;
  }
  if (sourceCount === 1) {
    return "SINGLE_SOURCE";
  }
  if (dominantSourcePct == null) {
    return "MULTI_SOURCE_LOW";
  }
  if (dominantSourcePct >= dominantLowThresholdPct) {
    return "MULTI_SOURCE_LOW";
  }
  return "MULTI_SOURCE_BALANCED";
}

export function withPlatformLabels(
  distribution: MarketSourceShare[],
): Array<MarketSourceShare & { platformLabel: string }> {
  return distribution.map((row) => ({
    ...row,
    platformLabel: listingPlatformLabel(row.platform) || row.platform,
  }));
}

/** Keep listings whose price survived IQR (same rule as median sample). */
export function rowsMatchingIqrPrices<T extends { price: number }>(
  rows: T[],
  filteredPrices: number[],
): T[] {
  const remaining = new Map<number, number>();
  for (const price of filteredPrices) {
    remaining.set(price, (remaining.get(price) ?? 0) + 1);
  }
  const kept: T[] = [];
  for (const row of rows) {
    const left = remaining.get(row.price) ?? 0;
    if (left > 0) {
      kept.push(row);
      remaining.set(row.price, left - 1);
    }
  }
  return kept;
}
