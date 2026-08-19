import { Prisma } from "@prisma/client";
import {
  dealScoreService,
  type DealScoreService,
} from "../analyzer/deal-score.service.js";
import { shouldEnqueueListingForUserMatching } from "../filters/match-eligibility.js";
import { prisma } from "../lib/prisma.js";
import { redisExists, redisSetEx } from "../lib/redis.js";
import {
  marketFieldsForPersistence,
  marketIntelligenceService,
  type MarketIntelligenceService,
} from "../market/market-intelligence.service.js";
import { attachMarketSourceToRawDetails } from "../market/market-source-persist.js";
import {
  enqueueListingMatch,
  type ListingMatchJobData,
} from "../queues/listing.queue.js";

/** Redis key prefix for 24h listing deduplication. */
const LISTING_SEEN_PREFIX = "listing:seen:";

/** Dedup TTL: 24 hours in seconds. */
const LISTING_SEEN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Raw inbound listing payload from scrapers / external feeds.
 */
export interface IncomingListingInput {
  externalId: string;
  platform: string;
  title: string;
  price: number;
  city?: string;
  url: string;
  rawDetails?: Record<string, unknown>;
  /** Optional; ignored as fake market — MI computes median. */
  marketAveragePrice?: number | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  currency?: string | null;
}

/**
 * Outcome of processing a single inbound listing.
 */
export type ProcessListingResult =
  | {
      status: "duplicate";
      externalId: string;
    }
  | {
      status: "processed";
      listingId: string;
      externalId: string;
      dealScore: number;
      isDeal: boolean;
      enqueuedForMatch: boolean;
    };

/**
 * Ingests scraped listings: dedupe → Market Intelligence → DealScore V2 → persist → match.
 */
export class ListingProcessor {
  constructor(
    private readonly scorer: DealScoreService = dealScoreService,
    private readonly market: MarketIntelligenceService = marketIntelligenceService,
  ) {}

  /**
   * Processes a single inbound listing end-to-end.
   */
  async processIncomingListing(
    input: IncomingListingInput,
  ): Promise<ProcessListingResult> {
    try {
      this.validateInput(input);

      const seenKey = `${LISTING_SEEN_PREFIX}${input.externalId}`;

      // Deduplication: skip if seen within the last 24 hours.
      const alreadySeen = await redisExists(seenKey);
      if (alreadySeen === 1) {
        return { status: "duplicate", externalId: input.externalId };
      }

      const category =
        input.category ??
        (typeof input.rawDetails?.category === "string"
          ? input.rawDetails.category
          : typeof input.rawDetails?.kategori === "string"
            ? input.rawDetails.kategori
            : null);

      const marketResult = await this.market.analyzeListing({
        externalId: input.externalId,
        platform: input.platform,
        price: input.price,
        currency: input.currency ?? "TRY",
        category,
        brand: input.brand ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        mileage: input.mileage ?? null,
        city: input.city ?? null,
      });

      const scoreResult = this.scorer.calculateFromMarket(
        {
          brand: input.brand ?? null,
          model: input.model ?? null,
          year: input.year ?? null,
          mileage: input.mileage ?? null,
          price: input.price,
          currency: input.currency ?? "TRY",
          city: input.city ?? null,
        },
        marketResult,
      );

      const rawDetailsJson = this.toPrismaJson(
        attachMarketSourceToRawDetails(input.rawDetails, marketResult),
      );
      const marketFields = marketFieldsForPersistence(marketResult);

      const listing = await prisma.listing.create({
        data: {
          externalId: input.externalId,
          platform: input.platform,
          title: input.title,
          price: input.price,
          dealScore: scoreResult.dealScore,
          category,
          ...marketFields,
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.brand != null ? { brand: input.brand } : {}),
          ...(input.model != null ? { model: input.model } : {}),
          ...(input.year != null ? { year: input.year } : {}),
          ...(input.mileage != null ? { mileage: input.mileage } : {}),
          ...(input.currency != null ? { currency: input.currency } : {}),
          url: input.url,
          ...(rawDetailsJson !== undefined
            ? { rawDetails: rawDetailsJson }
            : {}),
        },
      });

      // Mark as seen only after a successful DB write.
      await redisSetEx(seenKey, "1", LISTING_SEEN_TTL_SECONDS);

      let enqueuedForMatch = false;

      // User matching is independent of DEAL_SCORE_THRESHOLD / isDeal.
      if (shouldEnqueueListingForUserMatching({ platform: listing.platform })) {
        const jobData = this.toMatchJobData(
          listing.id,
          input,
          scoreResult.dealScore,
          marketFields.marketAveragePrice,
        );
        await enqueueListingMatch(jobData);
        enqueuedForMatch = true;
      }

      return {
        status: "processed",
        listingId: listing.id,
        externalId: input.externalId,
        dealScore: scoreResult.dealScore,
        isDeal: scoreResult.isDeal,
        enqueuedForMatch,
      };
    } catch (error) {
      // Unique constraint race: another worker inserted the same externalId.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        try {
          await redisSetEx(
            `${LISTING_SEEN_PREFIX}${input.externalId}`,
            "1",
            LISTING_SEEN_TTL_SECONDS,
          );
        } catch (redisError) {
          const redisMessage =
            redisError instanceof Error
              ? redisError.message
              : "Unknown Redis error after unique conflict";
          console.error(
            `ListingProcessor: failed to backfill seen key after P2002: ${redisMessage}`,
          );
        }

        return { status: "duplicate", externalId: input.externalId };
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unknown listing processing error";
      console.error(
        `ListingProcessor failed for ${input.externalId}: ${message}`,
      );
      throw error;
    }
  }

  /**
   * Validates required inbound fields before scoring / persistence.
   */
  private validateInput(input: IncomingListingInput): void {
    if (!input.externalId?.trim()) {
      throw new Error("ListingProcessor: externalId is required");
    }
    if (!input.platform?.trim()) {
      throw new Error("ListingProcessor: platform is required");
    }
    if (!input.title?.trim()) {
      throw new Error("ListingProcessor: title is required");
    }
    if (!input.url?.trim()) {
      throw new Error("ListingProcessor: url is required");
    }
    if (!Number.isFinite(input.price) || input.price <= 0) {
      throw new Error("ListingProcessor: price must be a positive number");
    }
  }

  /**
   * Converts a plain object into a Prisma-compatible JSON value.
   */
  private toPrismaJson(
    rawDetails?: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    if (rawDetails === undefined) {
      return undefined;
    }

    return rawDetails as Prisma.InputJsonValue;
  }

  /**
   * Builds the BullMQ payload for the listing-match queue.
   */
  private toMatchJobData(
    listingId: string,
    input: IncomingListingInput,
    dealScore: number,
    marketAveragePrice: number | null,
  ): ListingMatchJobData {
    const job: ListingMatchJobData = {
      listingId,
      externalId: input.externalId,
      platform: input.platform,
      title: input.title,
      price: input.price,
      dealScore,
      url: input.url,
    };

    if (marketAveragePrice != null) {
      job.marketAveragePrice = marketAveragePrice;
    }

    if (input.city !== undefined) {
      job.city = input.city;
    }

    if (input.rawDetails !== undefined) {
      job.rawDetails = input.rawDetails as Prisma.JsonValue;
    }

    return job;
  }
}

/** Shared listing processor instance. */
export const listingProcessor = new ListingProcessor();
