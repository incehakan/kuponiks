import { Prisma, type Listing } from "@prisma/client";
import {
  DEAL_SCORE_THRESHOLD,
  dealScoreService,
  type DealScoreService,
} from "../analyzer/deal-score.service.js";
import { prisma } from "../lib/prisma.js";
import { redisSetNxEx } from "../lib/redis.js";
import {
  marketFieldsForPersistence,
  marketIntelligenceService,
  type MarketIntelligenceService,
} from "../market/market-intelligence.service.js";
import {
  marketReanalysisService,
  type MarketReanalysisService,
} from "../market/market-reanalysis.service.js";
import { enqueueListingMatch } from "../queues/listing.queue.js";
import {
  normalizeScrapedListing,
  normalizeScrapedListings,
  toListingCreateData,
  type NormalizedListingInput,
  type RawScrapedListing,
} from "./normalizer.js";
import { logBatchDataQuality } from "./utils/data-quality.js";

/** Prevents re-notifying the same listing within 24 hours. */
const LISTING_NOTIFY_LOCK_PREFIX = "listing:notify-lock:";
const LISTING_NOTIFY_LOCK_TTL_SECONDS = 24 * 60 * 60;

export type ScraperIngestResult =
  | {
      status: "created";
      listing: Listing;
      dealScore: number;
      isDeal: boolean;
      enqueuedForMatch: boolean;
    }
  | {
      status: "updated";
      listing: Listing;
      dealScore: number;
      isDeal: boolean;
      enqueuedForMatch: boolean;
    }
  | {
      status: "duplicate";
      externalId: string;
    }
  | {
      status: "skipped";
      reason: string;
    };

export interface ScraperBatchSummary {
  created: number;
  updated: number;
  duplicates: number;
  skipped: number;
  deals: number;
  results: ScraperIngestResult[];
}

/**
 * Persists scraped listings, runs Market Intelligence + DealScore V2,
 * then enqueues filter matching when score clears the threshold.
 */
export class ScraperService {
  constructor(
    private readonly scorer: DealScoreService = dealScoreService,
    private readonly market: MarketIntelligenceService = marketIntelligenceService,
    private readonly reanalysis: MarketReanalysisService = marketReanalysisService,
  ) {}

  /**
   * Normalizes + ingests a single raw scraped listing.
   */
  async ingestRawListing(
    raw: RawScrapedListing,
    defaults: { platform?: string; category?: string; city?: string } = {},
  ): Promise<ScraperIngestResult> {
    const normalized = normalizeScrapedListing(raw, defaults);
    if (!normalized) {
      return {
        status: "skipped",
        reason: "normalize_failed",
      };
    }

    return this.ingestNormalizedListing(normalized);
  }

  /**
   * Ingests an already-normalized listing payload.
   * Flow: analyze market → DealScore V2 → persist → match (if deal) → bounded reanalysis.
   * Pass `{ quiet: true }` to skip match/notification enqueue (test scrapes).
   * Pass `{ skipComparableReanalysis: true }` to skip neighbor re-scoring.
   */
  async ingestNormalizedListing(
    input: NormalizedListingInput,
    options: { quiet?: boolean; skipComparableReanalysis?: boolean } = {},
  ): Promise<ScraperIngestResult> {
    try {
      const existing = await prisma.listing.findFirst({
        where: {
          platform: input.platform,
          externalId: input.externalId,
        },
      });

      if (existing) {
        return this.updateExistingListing(existing, input, options);
      }

      // Secondary global unique on externalId (legacy / race safety).
      const byExternalOnly = await prisma.listing.findUnique({
        where: { externalId: input.externalId },
      });
      if (byExternalOnly) {
        return this.updateExistingListing(byExternalOnly, input, options);
      }

      const marketResult = await this.market.analyzeListing({
        externalId: input.externalId,
        platform: input.platform,
        price: input.price,
        currency: input.currency,
        category: input.category,
        brand: input.brand,
        model: input.model,
        series: input.series,
        trim: input.trim,
        year: input.year,
        mileage: input.mileage,
        city: input.city,
      });

      const scoreResult = this.scorer.calculateFromMarket(
        {
          brand: input.brand,
          model: input.model,
          year: input.year,
          mileage: input.mileage,
          price: input.price,
          currency: input.currency,
          city: input.city,
        },
        marketResult,
      );

      if (marketResult.status === "READY") {
        console.log(
          `[MARKET] listing=${input.platform}:${input.externalId} segment=${marketResult.segmentLevel} sample=${marketResult.sampleSize} median=${marketResult.marketMedianPrice} advantage=${marketResult.priceAdvantagePct} confidence=${marketResult.confidence} score=${scoreResult.dealScore}`,
        );
      }

      const marketFields = marketFieldsForPersistence(marketResult);
      const now = new Date();
      const listing = await prisma.listing.create({
        data: {
          ...toListingCreateData(input, scoreResult.dealScore, marketFields),
          rawDetails: input.rawDetails as Prisma.InputJsonValue,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });

      console.log(
        `[SCRAPER] İlan kaydedildi → id=${listing.id}, skor=${scoreResult.dealScore}, market=${marketResult.status}, title="${listing.title}"`,
      );

      const enqueuedForMatch = options.quiet
        ? false
        : await this.maybeEnqueueMatch(
            listing,
            scoreResult.dealScore,
            scoreResult.isDeal,
          );

      if (!options.skipComparableReanalysis) {
        await this.reanalysis.reanalyzeComparableListings(listing, {
          dryRun: false,
        });
      }

      return {
        status: "created",
        listing,
        dealScore: scoreResult.dealScore,
        isDeal: scoreResult.isDeal,
        enqueuedForMatch,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await prisma.listing.findFirst({
          where: {
            OR: [
              { externalId: input.externalId },
              { platform: input.platform, externalId: input.externalId },
            ],
          },
        });
        if (raced) {
          return this.updateExistingListing(raced, input, options);
        }
        console.log(
          `[SCRAPER] Unique race — mükerrer externalId=${input.externalId}`,
        );
        return { status: "duplicate", externalId: input.externalId };
      }

      const message =
        error instanceof Error ? error.message : "Unknown ingest error";
      console.error(`[SCRAPER] İlan kaydı başarısız: ${message}`);
      return { status: "skipped", reason: message };
    }
  }

  private async updateExistingListing(
    existing: Listing,
    input: NormalizedListingInput,
    options: { quiet?: boolean; skipComparableReanalysis?: boolean } = {},
  ): Promise<ScraperIngestResult> {
    const marketResult = await this.market.analyzeListing({
      id: existing.id,
      externalId: input.externalId,
      platform: input.platform,
      price: input.price,
      currency: input.currency,
      category: input.category,
      brand: input.brand,
      model: input.model,
      series: input.series,
      trim: input.trim,
      year: input.year,
      mileage: input.mileage,
      city: input.city,
    });

    const scoreResult = this.scorer.calculateFromMarket(
      {
        brand: input.brand,
        model: input.model,
        year: input.year,
        mileage: input.mileage,
        price: input.price,
        currency: input.currency,
        city: input.city,
      },
      marketResult,
    );

    const marketFields = marketFieldsForPersistence(marketResult);

    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        price: input.price,
        dealScore: scoreResult.dealScore,
        category: input.category,
        subcategory: input.subcategory,
        brand: input.brand,
        model: input.model,
        series: input.series,
        trim: input.trim,
        variant: input.variant,
        year: input.year,
        mileage: input.mileage,
        fuelType: input.fuelType,
        transmission: input.transmission,
        city: input.city,
        district: input.district,
        sellerType: input.sellerType,
        description: input.description,
        currency: input.currency,
        imageUrl: input.imageUrl,
        url: input.url,
        rawDetails: input.rawDetails as Prisma.InputJsonValue,
        lastSeenAt: new Date(),
        ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
        ...marketFields,
        // firstSeenAt intentionally untouched
      },
    });

    console.log(
      `[SCRAPER] İlan güncellendi (firstSeenAt korundu) → id=${listing.id} externalId=${listing.externalId} market=${marketResult.status} skor=${scoreResult.dealScore} lastSeenAt=${listing.lastSeenAt.toISOString()}`,
    );

    if (!options.skipComparableReanalysis) {
      await this.reanalysis.reanalyzeComparableListings(listing, {
        dryRun: false,
      });
    }

    return {
      status: "updated",
      listing,
      dealScore: scoreResult.dealScore,
      isDeal: scoreResult.isDeal,
      enqueuedForMatch: false,
    };
  }

  private async maybeEnqueueMatch(
    listing: Listing,
    dealScore: number,
    isDeal: boolean,
  ): Promise<boolean> {
    if (!(isDeal || dealScore >= DEAL_SCORE_THRESHOLD)) {
      return false;
    }

    await enqueueListingMatch({
      listingId: listing.id,
      externalId: listing.externalId,
      platform: listing.platform,
      title: listing.title,
      price: listing.price,
      dealScore: listing.dealScore,
      url: listing.url,
      ...(listing.marketAveragePrice != null
        ? { marketAveragePrice: listing.marketAveragePrice }
        : {}),
      ...(listing.city ? { city: listing.city } : {}),
      ...(listing.rawDetails != null
        ? { rawDetails: listing.rawDetails }
        : {}),
    });

    const notifyLockKey = `${LISTING_NOTIFY_LOCK_PREFIX}${listing.externalId}`;
    const claimed = await redisSetNxEx(
      notifyLockKey,
      "1",
      LISTING_NOTIFY_LOCK_TTL_SECONDS,
    );

    if (claimed === "OK") {
      console.log(
        `[SCRAPER] notify-lock=CLAIMED (yeni) → skor=${dealScore} externalId=${listing.externalId} title="${listing.title}" — listing-match kuyruğunda plan bazlı bildirim`,
      );
    } else if (claimed === null) {
      console.log(
        `[SCRAPER] notify-lock=REDIS_DOWN → skor=${dealScore} externalId=${listing.externalId} — listing-match kuyruğu zaten eklendi`,
      );
    } else {
      console.log(
        `[SCRAPER] notify-lock=BLOCKED (24h içinde tekrar) → skor=${dealScore} externalId=${listing.externalId}`,
      );
    }

    return true;
  }

  /**
   * Batch ingest for a scrape run (raw payloads).
   */
  async ingestRawBatch(
    items: RawScrapedListing[],
    defaults: { platform?: string; category?: string; city?: string } = {},
  ): Promise<ScraperBatchSummary> {
    const normalized = normalizeScrapedListings(items, defaults);
    return this.ingestNormalizedBatch(normalized, items.length, defaults.platform);
  }

  /**
   * Batch ingest for already-normalized listings.
   */
  async ingestNormalizedBatch(
    items: NormalizedListingInput[],
    rawInputCount?: number,
    platformHint?: string,
  ): Promise<ScraperBatchSummary> {
    const results: ScraperIngestResult[] = [];

    let created = 0;
    let updated = 0;
    let duplicates = 0;
    let skipped = 0;
    let deals = 0;

    for (const item of items) {
      const result = await this.ingestNormalizedListing(item);
      results.push(result);

      if (result.status === "created") {
        created += 1;
        if (result.isDeal) {
          deals += 1;
        }
      } else if (result.status === "updated") {
        updated += 1;
        if (result.isDeal) {
          deals += 1;
        }
      } else if (result.status === "duplicate") {
        duplicates += 1;
      } else {
        skipped += 1;
      }
    }

    if (rawInputCount != null) {
      skipped += Math.max(0, rawInputCount - items.length);
    }

    const platform =
      platformHint ??
      items[0]?.platform ??
      "unknown";
    logBatchDataQuality(platform, items);

    console.log(
      `[SCRAPER] Batch özet → created=${created}, updated=${updated}, duplicates=${duplicates}, skipped=${skipped}, deals=${deals}`,
    );

    return { created, updated, duplicates, skipped, deals, results };
  }
}

/** Shared scraper service instance. */
export const scraperService = new ScraperService();
