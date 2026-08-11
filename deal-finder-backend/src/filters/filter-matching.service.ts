import {
  NotificationChannel,
  SubscriptionPlan,
  type Listing,
  type User,
  type UserFilter,
} from "@prisma/client";
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
import {
  listingMatchesFilter,
  type MatchableListing,
} from "./filter-match.engine.js";

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
 * Smart Filter Matching Engine V2 — matches listings to active user filters
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
          `FilterMatchingService: listing ${listingId} has no category; skipping match`,
        );
        return;
      }

      const candidateFilters = await this.findCandidateFilters(
        listing,
        listingCategory,
      );

      const matched = candidateFilters.filter((filter) =>
        listingMatchesFilter(this.toMatchableListing(listing), filter),
      );

      if (matched.length === 0) {
        console.log(
          `FilterMatchingService: no filter matches for listing ${listingId}`,
        );
        return;
      }

      const aggregates = this.aggregateByUser(matched);

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
   * Resolves listing category from column, then rawDetails fallback.
   */
  private resolveListingCategory(listing: Listing): string | null {
    if (listing.category?.trim()) {
      return listing.category.trim();
    }

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

  private toMatchableListing(listing: Listing): MatchableListing {
    return {
      title: listing.title,
      price: listing.price,
      dealScore: listing.dealScore,
      category: listing.category,
      subcategory: listing.subcategory,
      brand: listing.brand,
      model: listing.model,
      series: listing.series,
      trim: listing.trim,
      variant: listing.variant,
      year: listing.year,
      mileage: listing.mileage,
      fuelType: listing.fuelType,
      transmission: listing.transmission,
      city: listing.city,
      district: listing.district,
      sellerType: listing.sellerType,
      description: listing.description,
      rawDetails: listing.rawDetails,
    };
  }

  /**
   * Broad Prisma pre-filter (category + dealScore + coarse price).
   * Fine-grained V2 rules run in-memory via listingMatchesFilter.
   */
  private async findCandidateFilters(
    listing: Listing,
    category: string,
  ): Promise<UserFilterWithUser[]> {
    return prisma.userFilter.findMany({
      where: {
        isActive: true,
        category,
        minDealScore: { lte: listing.dealScore },
        AND: [
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

  private buildNotificationJob(
    listing: Listing,
    user: User,
    channels: NotificationChannel[],
  ): NotificationJobData {
    const priceLabel = listing.price.toLocaleString("tr-TR", {
      style: "currency",
      currency: listing.currency?.trim() || "TRY",
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
