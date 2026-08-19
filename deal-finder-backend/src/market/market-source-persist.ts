/**
 * Store source-diversity snapshot in existing Listing.rawDetails JSON.
 * Avoids a Prisma migration for V1.
 */

import type { MarketAnalysisResult } from "./market-intelligence.types.js";
import { emptyMarketSourceDiversity } from "./market-source-diversity.js";

export const MARKET_SOURCE_RAW_KEY = "_kuponiksMarketSource";

export function snapshotFromMarketResult(market: MarketAnalysisResult): {
  sourceCount: number;
  sourceDistribution: MarketAnalysisResult["sourceDistribution"];
  dominantSourcePct: number | null;
  diversity: MarketAnalysisResult["diversity"];
} {
  return {
    sourceCount: market.sourceCount ?? 0,
    sourceDistribution: market.sourceDistribution ?? [],
    dominantSourcePct: market.dominantSourcePct ?? null,
    diversity: market.diversity ?? null,
  };
}

export function attachMarketSourceToRawDetails(
  raw: unknown,
  market: MarketAnalysisResult,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};

  if (market.status !== "READY") {
    delete base[MARKET_SOURCE_RAW_KEY];
    return base;
  }

  base[MARKET_SOURCE_RAW_KEY] = snapshotFromMarketResult(market);
  return base;
}

export function parseMarketSourceFromRawDetails(raw: unknown): {
  sourceCount: number;
  sourceDistribution: Array<{ platform: string; sampleSize: number }>;
  dominantSourcePct: number | null;
  diversity: string | null;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const snap = (raw as Record<string, unknown>)[MARKET_SOURCE_RAW_KEY];
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
    return null;
  }
  const rec = snap as Record<string, unknown>;
  const sourceCount = Number(rec.sourceCount);
  const distRaw = rec.sourceDistribution;
  const sourceDistribution = Array.isArray(distRaw)
    ? distRaw
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null;
          }
          const platform = String((row as { platform?: unknown }).platform ?? "").trim();
          const sampleSize = Number((row as { sampleSize?: unknown }).sampleSize);
          if (!platform || !Number.isFinite(sampleSize)) {
            return null;
          }
          return { platform, sampleSize };
        })
        .filter((row): row is { platform: string; sampleSize: number } => row != null)
    : [];

  if (!Number.isFinite(sourceCount) || sourceCount <= 0 || sourceDistribution.length === 0) {
    return null;
  }

  const dominant =
    rec.dominantSourcePct == null ? null : Number(rec.dominantSourcePct);
  const diversity =
    typeof rec.diversity === "string" && rec.diversity.trim()
      ? rec.diversity.trim()
      : null;

  return {
    sourceCount,
    sourceDistribution,
    dominantSourcePct: dominant != null && Number.isFinite(dominant) ? dominant : null,
    diversity,
  };
}

export function emptySourceSnapshot() {
  return emptyMarketSourceDiversity();
}
