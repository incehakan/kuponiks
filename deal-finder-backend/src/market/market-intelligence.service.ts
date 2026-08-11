import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  getMarketLookbackDays,
  getMarketMinSample,
} from "./market-config.js";
import { resolveMarketConfidence } from "./market-confidence.js";
import {
  dispersionPct,
  filterIqrOutliers,
  median,
  priceAdvantagePct,
} from "./market-stats.js";
import type {
  ComparableListingRow,
  MarketAnalysisInput,
  MarketAnalysisResult,
} from "./market-intelligence.types.js";
import {
  applySegmentConfidencePenalty,
  brandsMatch,
  citiesMatch,
  effectiveSeries,
  isVehicleMarketCategory,
  mileageToleranceKm,
  segmentLevelLabel,
  seriesMatch,
  trimsMatch,
  yearDeltaForLevel,
} from "./vehicle-segment.js";

export interface CandidateQuery {
  brand: string;
  series: string;
  currency: string;
  yearMin: number;
  yearMax: number;
  mileageMin: number;
  mileageMax: number;
  lookbackSince: Date;
  excludeId?: string | null;
  excludePlatform?: string;
  excludeExternalId?: string;
}

export interface MarketIntelligenceDeps {
  findCandidates: (query: CandidateQuery) => Promise<ComparableListingRow[]>;
  minSample?: number;
  lookbackDays?: number;
}

function insufficient(
  sampleSize: number,
  reason: string,
  segmentLevel: MarketAnalysisResult["segmentLevel"] = null,
): MarketAnalysisResult {
  return {
    status: "INSUFFICIENT_DATA",
    marketMedianPrice: null,
    sampleSize,
    priceAdvantagePct: null,
    confidence: null,
    segmentLevel,
    dispersionPct: null,
    calculatedAt: new Date(),
    reason,
  };
}

function rowEffectiveSeries(row: ComparableListingRow): string | null {
  return effectiveSeries(row.series, row.model);
}

/**
 * Default Prisma-backed comparable finder (brand + series window).
 * Series equality refined in-memory (series ?? model).
 */
export async function findComparableCandidates(
  query: CandidateQuery,
): Promise<ComparableListingRow[]> {
  const rows = await prisma.listing.findMany({
    where: {
      platform: { not: "mock" },
      currency: query.currency,
      brand: { not: null },
      OR: [{ series: { not: null } }, { model: { not: null } }],
      year: { gte: query.yearMin, lte: query.yearMax },
      mileage: { gte: query.mileageMin, lte: query.mileageMax },
      price: { gt: 0 },
      lastSeenAt: { gte: query.lookbackSince },
      ...(query.excludeId ? { id: { not: query.excludeId } } : {}),
      ...(query.excludePlatform && query.excludeExternalId
        ? {
            NOT: {
              AND: [
                { platform: query.excludePlatform },
                { externalId: query.excludeExternalId },
              ],
            },
          }
        : {}),
    },
    select: {
      id: true,
      externalId: true,
      platform: true,
      price: true,
      currency: true,
      brand: true,
      model: true,
      series: true,
      trim: true,
      year: true,
      mileage: true,
      city: true,
      lastSeenAt: true,
    },
    take: 500,
  });

  return rows.filter(
    (row) =>
      brandsMatch(row.brand, query.brand) &&
      seriesMatch(rowEffectiveSeries(row), query.series),
  );
}

/**
 * Real-market comparable median engine (vehicles) — V1.1 series/trim segments.
 */
export class MarketIntelligenceService {
  private readonly findCandidates: MarketIntelligenceDeps["findCandidates"];
  private readonly minSample: number;
  private readonly lookbackDays: number;

  constructor(deps: Partial<MarketIntelligenceDeps> = {}) {
    this.findCandidates = deps.findCandidates ?? findComparableCandidates;
    this.minSample = deps.minSample ?? getMarketMinSample();
    this.lookbackDays = deps.lookbackDays ?? getMarketLookbackDays();
  }

  async analyzeListing(
    listing: MarketAnalysisInput,
  ): Promise<MarketAnalysisResult> {
    const calculatedAt = new Date();

    if (!isVehicleMarketCategory(listing.category)) {
      const result: MarketAnalysisResult = {
        status: "UNSUPPORTED_CATEGORY",
        marketMedianPrice: null,
        sampleSize: 0,
        priceAdvantagePct: null,
        confidence: null,
        segmentLevel: null,
        dispersionPct: null,
        calculatedAt,
        reason: "unsupported_category",
      };
      this.logResult(listing, result);
      return result;
    }

    if (!listing.currency?.trim()) {
      const result = insufficient(0, "currency_null");
      this.logResult(listing, result);
      return result;
    }

    const series = effectiveSeries(listing.series, listing.model);
    const trim = listing.trim?.trim() || null;

    if (
      !listing.brand?.trim() ||
      !series ||
      listing.year == null ||
      listing.mileage == null ||
      !Number.isFinite(listing.price) ||
      listing.price <= 0
    ) {
      const result = insufficient(0, "missing_vehicle_fields");
      this.logResult(listing, result);
      return result;
    }

    const lookbackSince = new Date(
      calculatedAt.getTime() - this.lookbackDays * 24 * 60 * 60 * 1000,
    );

    // Trim-level L1/L2 only when trim is known; otherwise start at series L3.
    const levels = (trim ? [1, 2, 3, 4] : [3, 4]) as Array<1 | 2 | 3 | 4>;

    for (const level of levels) {
      const yearDelta = yearDeltaForLevel(level);
      const mileTol = mileageToleranceKm(listing.mileage, level);
      const requireTrim = level === 1 || level === 2;

      const candidates = await this.findCandidates({
        brand: listing.brand,
        series,
        currency: listing.currency,
        yearMin: listing.year - yearDelta,
        yearMax: listing.year + yearDelta,
        mileageMin: Math.max(0, listing.mileage - mileTol),
        mileageMax: listing.mileage + mileTol,
        lookbackSince,
        excludeId: listing.id ?? null,
        excludePlatform: listing.platform,
        excludeExternalId: listing.externalId,
      });

      const pool = candidates.filter((row) => {
        if (row.platform === "mock") {
          return false;
        }
        if (row.currency !== listing.currency) {
          return false;
        }
        if (!brandsMatch(row.brand, listing.brand)) {
          return false;
        }
        if (!seriesMatch(rowEffectiveSeries(row), series)) {
          return false;
        }
        if (requireTrim) {
          if (!trim || !trimsMatch(row.trim, trim)) {
            return false;
          }
        }
        if (row.year == null || row.mileage == null) {
          return false;
        }
        if (
          Math.abs(row.year - listing.year!) > yearDelta ||
          Math.abs(row.mileage - listing.mileage!) > mileTol
        ) {
          return false;
        }
        if (level === 1) {
          if (!listing.city?.trim() || !citiesMatch(row.city, listing.city)) {
            return false;
          }
        }
        if (listing.id && row.id === listing.id) {
          return false;
        }
        if (
          row.platform === listing.platform &&
          row.externalId === listing.externalId
        ) {
          return false;
        }
        return true;
      });

      if (pool.length < this.minSample) {
        continue;
      }

      const prices = pool.map((r) => r.price);
      const filtered = filterIqrOutliers(prices, this.minSample);

      if (filtered.length < this.minSample) {
        continue;
      }

      const med = median(filtered);
      if (med == null || med <= 0) {
        continue;
      }

      const disp = dispersionPct(filtered);
      const advantage = priceAdvantagePct(listing.price, med);
      const segment = segmentLevelLabel(level);
      const baseConfidence = resolveMarketConfidence(filtered.length, disp);
      const confidence = applySegmentConfidencePenalty(baseConfidence, segment);

      const result: MarketAnalysisResult = {
        status: "READY",
        marketMedianPrice: Math.round(med),
        sampleSize: filtered.length,
        priceAdvantagePct: advantage,
        confidence,
        segmentLevel: segment,
        dispersionPct: disp,
        calculatedAt,
      };
      this.logResult(listing, result);
      return result;
    }

    const result = insufficient(0, "no_segment_met_min_sample");
    this.logResult(listing, result);
    return result;
  }

  async reanalyzeListingById(listingId: string): Promise<MarketAnalysisResult> {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      return insufficient(0, "listing_not_found");
    }
    return this.analyzeListing({
      id: listing.id,
      externalId: listing.externalId,
      platform: listing.platform,
      price: listing.price,
      currency: listing.currency,
      category: listing.category,
      brand: listing.brand,
      model: listing.model,
      series: listing.series,
      trim: listing.trim,
      year: listing.year,
      mileage: listing.mileage,
      city: listing.city,
    });
  }

  private logResult(
    listing: MarketAnalysisInput,
    result: MarketAnalysisResult,
  ): void {
    if (result.status === "READY") {
      console.log(
        `[MARKET] listing=${listing.platform}:${listing.externalId} segment=${result.segmentLevel} sample=${result.sampleSize} median=${result.marketMedianPrice} advantage=${result.priceAdvantagePct} confidence=${result.confidence}`,
      );
      return;
    }
    console.log(
      `[MARKET] listing=${listing.platform}:${listing.externalId} status=${result.status} sample=${result.sampleSize}${result.reason ? ` reason=${result.reason}` : ""}`,
    );
  }
}

export const marketIntelligenceService = new MarketIntelligenceService();

export function marketFieldsForPersistence(market: MarketAnalysisResult): {
  marketAveragePrice: number | null;
  marketMedianPrice: number | null;
  marketSampleSize: number | null;
  marketConfidence: string | null;
  marketDispersionPct: number | null;
  priceAdvantagePct: number | null;
  marketCalculatedAt: Date | null;
  marketSegmentLevel: string | null;
  marketStatus: string;
} {
  if (market.status !== "READY") {
    return {
      marketAveragePrice: null,
      marketMedianPrice: null,
      marketSampleSize: market.sampleSize,
      marketConfidence: null,
      marketDispersionPct: null,
      priceAdvantagePct: null,
      marketCalculatedAt: market.calculatedAt,
      marketSegmentLevel: market.segmentLevel,
      marketStatus: market.status,
    };
  }

  return {
    marketAveragePrice: market.marketMedianPrice,
    marketMedianPrice: market.marketMedianPrice,
    marketSampleSize: market.sampleSize,
    marketConfidence: market.confidence,
    marketDispersionPct: market.dispersionPct,
    priceAdvantagePct: market.priceAdvantagePct,
    marketCalculatedAt: market.calculatedAt,
    marketSegmentLevel: market.segmentLevel,
    marketStatus: market.status,
  };
}

export type MarketPersistenceFields = ReturnType<
  typeof marketFieldsForPersistence
>;

export function toPrismaMarketData(
  market: MarketAnalysisResult,
): Prisma.ListingUpdateInput {
  const fields = marketFieldsForPersistence(market);
  return {
    marketAveragePrice: fields.marketAveragePrice,
    marketMedianPrice: fields.marketMedianPrice,
    marketSampleSize: fields.marketSampleSize,
    marketConfidence: fields.marketConfidence,
    marketDispersionPct: fields.marketDispersionPct,
    priceAdvantagePct: fields.priceAdvantagePct,
    marketCalculatedAt: fields.marketCalculatedAt,
    marketSegmentLevel: fields.marketSegmentLevel,
    marketStatus: fields.marketStatus,
  };
}
