/**
 * Bounded Market Intelligence re-analysis (no notification / no recursion).
 */

import type { Listing } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  getMarketLookbackDays,
  getMarketReanalyzeLimit,
} from "./market-config.js";
import {
  marketFieldsForPersistence,
  marketIntelligenceService,
  type MarketIntelligenceService,
} from "./market-intelligence.service.js";
import { dealScoreService } from "../analyzer/deal-score.service.js";
import { effectiveSeries } from "./vehicle-segment.js";
import { normalizeMatchText } from "../lib/text-normalize.js";

export interface ReanalyzeResult {
  listingId: string;
  externalId: string;
  oldScore: number;
  newScore: number;
  oldMedian: number | null;
  newMedian: number | null;
  segment: string | null;
  sampleSize: number;
  status: string;
  updated: boolean;
}

export interface ReanalyzeOptions {
  /** When true, compute but do not write DB. */
  dryRun?: boolean;
  limit?: number;
  lookbackDays?: number;
}

/**
 * Persists Market Intelligence + DealScore V2 for one listing without
 * enqueueing notifications or triggering comparable re-analysis.
 */
export class MarketReanalysisService {
  constructor(
    private readonly market: MarketIntelligenceService = marketIntelligenceService,
  ) {}

  async reanalyzeListingById(
    listingId: string,
    options: ReanalyzeOptions = {},
  ): Promise<ReanalyzeResult | null> {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      return null;
    }
    return this.reanalyzeListing(listing, options);
  }

  async reanalyzeListing(
    listing: Listing,
    options: ReanalyzeOptions = {},
  ): Promise<ReanalyzeResult> {
    const market = await this.market.analyzeListing({
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

    const score = dealScoreService.calculateFromMarket(
      {
        brand: listing.brand,
        model: listing.model,
        year: listing.year,
        mileage: listing.mileage,
        price: listing.price,
        currency: listing.currency,
        city: listing.city,
      },
      market,
    );

    const result: ReanalyzeResult = {
      listingId: listing.id,
      externalId: listing.externalId,
      oldScore: listing.dealScore,
      newScore: score.dealScore,
      oldMedian: listing.marketMedianPrice ?? listing.marketAveragePrice,
      newMedian: market.marketMedianPrice,
      segment: market.segmentLevel,
      sampleSize: market.sampleSize,
      status: market.status,
      updated: false,
    };

    if (options.dryRun) {
      return result;
    }

    const marketFields = marketFieldsForPersistence(market);
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        dealScore: score.dealScore,
        ...marketFields,
        // firstSeenAt / lastSeenAt / notifications untouched
      },
    });

    result.updated = true;
    return result;
  }

  /**
   * Re-analyzes nearby same brand+series listings after a new comparable arrives.
   * Never enqueues notifications. Never calls itself recursively.
   */
  async reanalyzeComparableListings(
    seed: Pick<
      Listing,
      | "id"
      | "brand"
      | "series"
      | "model"
      | "year"
      | "currency"
      | "platform"
    >,
    options: ReanalyzeOptions = {},
  ): Promise<ReanalyzeResult[]> {
    const series = effectiveSeries(seed.series, seed.model);
    if (!seed.brand?.trim() || !series || seed.year == null) {
      return [];
    }

    const limit = options.limit ?? getMarketReanalyzeLimit();
    const lookbackDays = options.lookbackDays ?? getMarketLookbackDays();
    const lookbackSince = new Date(
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
    );
    const yearMin = seed.year - 3;
    const yearMax = seed.year + 3;

    const candidates = await prisma.listing.findMany({
      where: {
        id: { not: seed.id },
        platform: { not: "mock" },
        brand: { not: null },
        currency: seed.currency ?? "TRY",
        year: { gte: yearMin, lte: yearMax },
        lastSeenAt: { gte: lookbackSince },
        OR: [{ series: { not: null } }, { model: { not: null } }],
      },
      orderBy: { lastSeenAt: "desc" },
      take: Math.max(limit * 4, 50),
    });

    const seriesNorm = normalizeMatchText(series);
    const brandNorm = normalizeMatchText(seed.brand);
    const matched = candidates
      .filter((row) => {
        if (normalizeMatchText(row.brand) !== brandNorm) {
          return false;
        }
        const rowSeries = effectiveSeries(row.series, row.model);
        return normalizeMatchText(rowSeries) === seriesNorm;
      })
      .slice(0, limit);

    const results: ReanalyzeResult[] = [];
    for (const row of matched) {
      // Explicit non-recursive: only reanalyzeListing, never reanalyzeComparableListings
      results.push(await this.reanalyzeListing(row, options));
    }
    return results;
  }
}

export const marketReanalysisService = new MarketReanalysisService();
