import { Prisma, type Listing } from "@prisma/client";
import {
  DEAL_SCORE_THRESHOLD,
  dealScoreService,
  type DealScoreService,
} from "../analyzer/deal-score.service.js";
import { prisma } from "../lib/prisma.js";
import { redisSetNxEx } from "../lib/redis.js";
import { enqueueListingMatch } from "../queues/listing.queue.js";
import {
  normalizeScrapedListing,
  normalizeScrapedListings,
  toListingCreateData,
  type NormalizedListingInput,
  type RawScrapedListing,
} from "./normalizer.js";

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
      status: "duplicate";
      externalId: string;
    }
  | {
      status: "skipped";
      reason: string;
    };

export interface ScraperBatchSummary {
  created: number;
  duplicates: number;
  skipped: number;
  deals: number;
  results: ScraperIngestResult[];
}

/**
 * Persists scraped listings, blocks duplicates via `externalId`,
 * and triggers the kelepir score engine after insert.
 */
export class ScraperService {
  constructor(private readonly scorer: DealScoreService = dealScoreService) {}

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
   */
  async ingestNormalizedListing(
    input: NormalizedListingInput,
  ): Promise<ScraperIngestResult> {
    try {
      // Strict duplicate guard: platform + externalId (externalId already platform-scoped).
      const existing = await prisma.listing.findFirst({
        where: {
          platform: input.platform,
          externalId: input.externalId,
        },
        select: { id: true, externalId: true, platform: true },
      });

      if (existing) {
        console.log(
          `[SCRAPER] Mükerrer kayıt engellendi → platform=${input.platform} externalId=${input.externalId}`,
        );
        return { status: "duplicate", externalId: input.externalId };
      }

      // Secondary global unique on externalId (legacy / race safety).
      const byExternalOnly = await prisma.listing.findUnique({
        where: { externalId: input.externalId },
        select: { id: true, externalId: true },
      });
      if (byExternalOnly) {
        console.log(
          `[SCRAPER] Mükerrer externalId (global) engellendi → ${input.externalId}`,
        );
        return { status: "duplicate", externalId: input.externalId };
      }

      const scoreResult = this.scorer.calculateDealScore(
        input.price,
        input.marketAveragePrice,
        {
          ...input.rawDetails,
          title: input.title,
          category: input.category,
        },
      );

      const listing = await prisma.listing.create({
        data: {
          ...toListingCreateData(input, scoreResult.dealScore),
          rawDetails: input.rawDetails as Prisma.InputJsonValue,
        },
      });

      console.log(
        `[SCRAPER] İlan kaydedildi → id=${listing.id}, skor=${scoreResult.dealScore}, title="${listing.title}"`,
      );

      let enqueuedForMatch = false;
      if (scoreResult.isDeal || scoreResult.dealScore >= DEAL_SCORE_THRESHOLD) {
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
        enqueuedForMatch = true;

        // 24h notify lock — same listing must not re-alert users within a day.
        const notifyLockKey = `${LISTING_NOTIFY_LOCK_PREFIX}${listing.externalId}`;
        const claimed = await redisSetNxEx(
          notifyLockKey,
          "1",
          LISTING_NOTIFY_LOCK_TTL_SECONDS,
        );

        if (claimed === "OK") {
          console.log(
            `[SCRAPER] notify-lock=CLAIMED (yeni) → skor=${scoreResult.dealScore} externalId=${listing.externalId} title="${listing.title}" — listing-match kuyruğunda plan bazlı bildirim`,
          );
          console.log(
            `★★ [KELEPİR BİLDİRİM] skor=${scoreResult.dealScore} | ${listing.price} TL / piyasa ${listing.marketAveragePrice ?? "-"} TL | "${listing.title}"`,
          );
        } else if (claimed === null) {
          console.log(
            `[SCRAPER] notify-lock=REDIS_DOWN → skor=${scoreResult.dealScore} externalId=${listing.externalId} — listing-match kuyruğu zaten eklendi`,
          );
        } else {
          console.log(
            `[SCRAPER] notify-lock=BLOCKED (24h içinde tekrar) → skor=${scoreResult.dealScore} externalId=${listing.externalId} title="${listing.title}" — bildirim atlandı`,
          );
        }
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

  /**
   * Batch ingest for a scrape run (raw payloads).
   */
  async ingestRawBatch(
    items: RawScrapedListing[],
    defaults: { platform?: string; category?: string; city?: string } = {},
  ): Promise<ScraperBatchSummary> {
    const normalized = normalizeScrapedListings(items, defaults);
    return this.ingestNormalizedBatch(normalized, items.length);
  }

  /**
   * Batch ingest for already-normalized listings.
   */
  async ingestNormalizedBatch(
    items: NormalizedListingInput[],
    rawInputCount?: number,
  ): Promise<ScraperBatchSummary> {
    const results: ScraperIngestResult[] = [];

    let created = 0;
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
      } else if (result.status === "duplicate") {
        duplicates += 1;
      } else {
        skipped += 1;
      }
    }

    if (rawInputCount != null) {
      skipped += Math.max(0, rawInputCount - items.length);
    }

    console.log(
      `[SCRAPER] Batch özet → created=${created}, duplicates=${duplicates}, skipped=${skipped}, deals=${deals}`,
    );

    return { created, duplicates, skipped, deals, results };
  }
}

/** Shared scraper service instance. */
export const scraperService = new ScraperService();
