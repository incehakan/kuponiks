import {
  NotificationChannel,
  SubscriptionPlan,
  type Listing,
  type User,
  type UserFilter,
} from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { redisDel, redisSetNxEx } from "../lib/redis.js";
import {
  FREE_PLAN_DELAY_MS,
  resolveNotificationChannels,
} from "../lib/subscription-plan.js";
import {
  enqueueNotification,
  type NotificationJobData,
} from "../queues/notification.queue.js";

/** Redis key prefix for 24h per-user listing notification deduplication. */
const NOTIFIED_KEY_PREFIX = "notified:";

/** Dedup TTL: 24 hours in seconds. */
const NOTIFIED_TTL_SECONDS = 24 * 60 * 60;

/**
 * BullMQ priorities — lower number = higher priority.
 */
const PLAN_PRIORITY: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.VIP]: 1,
  [SubscriptionPlan.PRO]: 2,
  [SubscriptionPlan.FREE]: 10,
};

type UserFilterWithUser = UserFilter & { user: User };

/**
 * Aggregated match for a single user (multiple filters collapsed).
 */
interface UserMatchAggregate {
  user: User;
  notifyPush: boolean;
  notifyTelegram: boolean;
  notifyWhatsapp: boolean;
}

/**
 * Smart Filter Matching Engine — matches deal listings to active user filters
 * and enqueues plan-aware notification jobs.
 */
export class FilterMatchingService {
  /**
   * Loads a listing, finds matching active filters, and enqueues notifications.
   */
  async matchListingWithFilters(listingId: string): Promise<void> {
    try {
      if (!listingId?.trim()) {
        throw new Error("FilterMatchingService: listingId is required");
      }

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
      });

      if (!listing) {
        throw new Error(
          `FilterMatchingService: listing not found (${listingId})`,
        );
      }

      const listingCategory = this.resolveListingCategory(listing);
      if (!listingCategory) {
        console.warn(
          `FilterMatchingService: listing ${listingId} has no category in rawDetails; skipping match`,
        );
        return;
      }

      const candidateFilters = await this.findCandidateFilters(
        listing,
        listingCategory,
      );

      const keywordMatched = candidateFilters.filter((filter) =>
        this.matchesKeywords(listing, filter.keywords),
      );

      if (keywordMatched.length === 0) {
        console.log(
          `FilterMatchingService: no filter matches for listing ${listingId}`,
        );
        return;
      }

      const aggregates = this.aggregateByUser(keywordMatched);

      const results = await Promise.allSettled(
        [...aggregates.values()].map((aggregate) =>
          this.enqueueForUser(listing, aggregate),
        ),
      );

      let enqueued = 0;
      let skipped = 0;
      let failed = 0;

      for (const result of results) {
        if (result.status === "rejected") {
          failed += 1;
          const reason =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown enqueue error";
          console.error(
            `FilterMatchingService: enqueue failed for listing ${listingId}: ${reason}`,
          );
          continue;
        }

        if (result.value === "enqueued") {
          enqueued += 1;
        } else {
          skipped += 1;
        }
      }

      console.log(
        `FilterMatchingService: listing ${listingId} enqueued=${enqueued} skipped=${skipped} failed=${failed}`,
      );

      if (failed > 0 && enqueued === 0 && skipped === 0) {
        throw new Error(
          `FilterMatchingService: all notification enqueues failed for listing ${listingId}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown filter matching error";
      console.error(
        `FilterMatchingService.matchListingWithFilters failed: ${message}`,
      );
      throw error;
    }
  }

  /**
   * Resolves listing category from rawDetails (`category` / `kategori`).
   */
  private resolveListingCategory(listing: Listing): string | null {
    const raw = listing.rawDetails;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }

    const details = raw as Record<string, unknown>;
    for (const key of ["category", "kategori"] as const) {
      const value = details[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Prisma query for active filters matching category, city, price, and deal score.
   * Keyword filtering is applied in-memory afterwards.
   */
  private async findCandidateFilters(
    listing: Listing,
    category: string,
  ): Promise<UserFilterWithUser[]> {
    // Dev/test: missing listing city must not block matches (city optional).
    // Prod: no city on listing → only filters with city=null (all-Turkey).
    const cityClause = listing.city
      ? {
          OR: [{ city: null }, { city: listing.city }],
        }
      : this.isTestMode()
        ? {}
        : { city: null };

    return prisma.userFilter.findMany({
      where: {
        isActive: true,
        category,
        minDealScore: { lte: listing.dealScore },
        AND: [
          ...(Object.keys(cityClause).length > 0 ? [cityClause] : []),
          {
            OR: [{ minPrice: null }, { minPrice: { lte: listing.price } }],
          },
          {
            OR: [{ maxPrice: null }, { maxPrice: { gte: listing.price } }],
          },
        ],
      },
      include: {
        user: true,
      },
    });
  }

  private isTestMode(): boolean {
    return env.NODE_ENV !== "production";
  }

  /**
   * Keyword match against title / rawDetails corpus.
   * Test mode: case-insensitive regex, OR semantics (any keyword hits).
   * Production: AND semantics with includes (all keywords required).
   */
  private matchesKeywords(listing: Listing, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) {
      return true;
    }

    const corpus = this.buildSearchCorpus(listing);
    const normalizedKeywords = keywords
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (normalizedKeywords.length === 0) {
      return true;
    }

    if (this.isTestMode()) {
      return normalizedKeywords.some((keyword) =>
        this.keywordMatchesCorpus(corpus, keyword),
      );
    }

    return normalizedKeywords.every((keyword) =>
      corpus.includes(keyword.toLocaleLowerCase("tr-TR")),
    );
  }

  /**
   * Case-insensitive content search (escaped regex) for a single keyword.
   * "Toyota" matches "toyota Corolla 2020 hatasız" etc.
   */
  private keywordMatchesCorpus(corpus: string, keyword: string): boolean {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return true;
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return new RegExp(escaped, "iu").test(corpus);
    } catch {
      return corpus.includes(trimmed.toLocaleLowerCase("tr-TR"));
    }
  }

  /**
   * Builds a lowercase search corpus from title and rawDetails.
   */
  private buildSearchCorpus(listing: Listing): string {
    const chunks: string[] = [listing.title];

    const walk = (value: unknown): void => {
      if (typeof value === "string") {
        chunks.push(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
        return;
      }
      if (value && typeof value === "object") {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          walk(nested);
        }
      }
    };

    if (listing.rawDetails !== null && listing.rawDetails !== undefined) {
      walk(listing.rawDetails);
    }

    return chunks.join(" ").toLocaleLowerCase("tr-TR");
  }

  /**
   * Collapses multiple matching filters into one aggregate per user.
   */
  private aggregateByUser(
    filters: UserFilterWithUser[],
  ): Map<string, UserMatchAggregate> {
    const aggregates = new Map<string, UserMatchAggregate>();

    for (const filter of filters) {
      const existing = aggregates.get(filter.userId);

      if (!existing) {
        aggregates.set(filter.userId, {
          user: filter.user,
          notifyPush: filter.notifyPush,
          notifyTelegram: filter.notifyTelegram,
          notifyWhatsapp: filter.notifyWhatsapp,
        });
        continue;
      }

      existing.notifyPush = existing.notifyPush || filter.notifyPush;
      existing.notifyTelegram =
        existing.notifyTelegram || filter.notifyTelegram;
      existing.notifyWhatsapp =
        existing.notifyWhatsapp || filter.notifyWhatsapp;
    }

    return aggregates;
  }

  /**
   * Deduplicates, resolves plan channels, and enqueues a notification job.
   */
  private async enqueueForUser(
    listing: Listing,
    aggregate: UserMatchAggregate,
  ): Promise<"enqueued" | "skipped"> {
    const { user } = aggregate;
    const notifiedKey = `${NOTIFIED_KEY_PREFIX}${user.id}:${listing.id}`;

    // Atomic claim — prevents duplicate notifications within 24 hours.
    // If Redis is down, skip enqueue rather than hanging HTTP/workers.
    const claimed = await redisSetNxEx(
      notifiedKey,
      "1",
      NOTIFIED_TTL_SECONDS,
    );

    if (claimed !== "OK") {
      if (claimed === null) {
        console.warn(
          `[FilterMatching] Redis yok — dedupe atlandı, bildirim kuyruğa alınmadı (user=${user.id})`,
        );
      }
      return "skipped";
    }

    try {
      const channels = resolveNotificationChannels(user.subscriptionPlan, {
        notifyPush: aggregate.notifyPush,
        notifyTelegram: aggregate.notifyTelegram,
        notifyWhatsapp: aggregate.notifyWhatsapp,
      });

      if (channels.length === 0) {
        await redisDel(notifiedKey);
        console.warn(
          `FilterMatchingService: user ${user.id} matched but has no enabled channels`,
        );
        return "skipped";
      }

      const jobData = this.buildNotificationJob(listing, user, channels);
      const priority = PLAN_PRIORITY[user.subscriptionPlan];
      const delay =
        user.subscriptionPlan === SubscriptionPlan.FREE
          ? FREE_PLAN_DELAY_MS
          : undefined;

      await enqueueNotification(jobData, {
        priority,
        ...(delay !== undefined ? { delay } : {}),
      });

      return "enqueued";
    } catch (error) {
      // Release claim so a retry can re-attempt delivery.
      try {
        await redisDel(notifiedKey);
      } catch (redisError) {
        const redisMessage =
          redisError instanceof Error
            ? redisError.message
            : "Unknown Redis delete error";
        console.error(
          `FilterMatchingService: failed to release notified key: ${redisMessage}`,
        );
      }
      throw error;
    }
  }

  /**
   * Builds the notification-queue job payload from listing + user.
   */
  private buildNotificationJob(
    listing: Listing,
    user: User,
    channels: NotificationChannel[],
  ): NotificationJobData {
    const priceLabel = listing.price.toLocaleString("tr-TR", {
      style: "currency",
      currency: "TRY",
    });

    const job: NotificationJobData = {
      userId: user.id,
      listingId: listing.id,
      subscriptionPlan: user.subscriptionPlan,
      title: "Kuponiks Fırsat Alarmı",
      message: `${listing.title} — Kelepir skor ${listing.dealScore}/100 — ${priceLabel}`,
      price: listing.price,
      dealScore: listing.dealScore,
      url: listing.url,
      channels,
      phoneNumber: user.phoneNumber,
    };

    if (user.expoPushToken) {
      job.expoPushToken = user.expoPushToken;
    }
    if (user.fcmDeviceToken) {
      job.fcmToken = user.fcmDeviceToken;
    }
    if (user.telegramChatId) {
      job.telegramChatId = user.telegramChatId;
    }

    return job;
  }
}

/** Shared filter matching engine instance. */
export const filterMatchingService = new FilterMatchingService();
