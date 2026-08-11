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
  brandsMatch,
  citiesMatch,
  isVehicleMarketCategory,
  mileageToleranceKm,
  modelsMatch,
  segmentLevelLabel,
  yearDeltaForLevel,
} from "./vehicle-segment.js";

export interface CandidateQuery {
  brand: string;
  model: string;
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

/**
 * Default Prisma-backed comparable finder.
 * Brand/model equality is refined in-memory with normalizeMatchText.
 */
export async function findComparableCandidates(
  query: CandidateQuery,
): Promise<ComparableListingRow[]> {
  const rows = await prisma.listing.findMany({
    where: {
      platform: { not: "mock" },
      currency: query.currency,
      brand: { not: null },
      model: { not: null },
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
      modelsMatch(row.model, query.model),
  );
}

/**
 * Real-market comparable median engine (vehicles only in V1).
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

  /**
   * Analyzes a listing against the live comparable pool.
   * Never invents a market price when sample is insufficient.
   */
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

    if (
      !listing.brand?.trim() ||
      !listing.model?.trim() ||
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

    for (const level of [1, 2, 3, 4] as const) {
      const yearDelta = yearDeltaForLevel(level);
      const mileTol = mileageToleranceKm(listing.mileage, level);

      const candidates = await this.findCandidates({
        brand: listing.brand,
        model: listing.model,
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

      let pool = candidates.filter((row) => {
        if (row.platform === "mock") {
          return false;
        }
        if (row.currency !== listing.currency) {
          return false;
        }
        if (!brandsMatch(row.brand, listing.brand)) {
          return false;
        }
        if (!modelsMatch(row.model, listing.model)) {
          return false;
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
        // Exclude self by id or platform+externalId
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
      const confidence = resolveMarketConfidence(filtered.length, disp);
      const segment = segmentLevelLabel(level);

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

  /**
   * Re-analyze a persisted listing by id (batch / admin boundary).
   */
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

/** Shared Market Intelligence instance. */
export const marketIntelligenceService = new MarketIntelligenceService();

/**
 * Maps market analysis → Prisma Listing persistence fields.
 * marketAveragePrice stores the median for backward compatibility when READY.
 */
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

/** Prisma update/create data helper (typed loosely for schema evolution). */
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
