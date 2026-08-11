import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { Listing, User, UserFilter } from "@prisma/client";
import { env } from "../config/env.js";
import {
  listingMatchesFilter,
  type MatchableFilter,
  type MatchableListing,
} from "../filters/filter-match.engine.js";
import { prisma } from "../lib/prisma.js";

export interface ExpoPushPayload {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: {
    dealId: string;
    url: string;
    listingId: string;
    dealScore: number;
    type: "deal_alert";
  };
}

export interface FilterMatchNotificationResult {
  listingId: string;
  matchedFilterCount: number;
  notifiedUserCount: number;
  pushPayloads: ExpoPushPayload[];
  tickets: ExpoPushTicket[];
}

type FilterWithUser = UserFilter & { user: User };

interface MatchEvaluation {
  matched: boolean;
  reason?: string;
}

const expo = new Expo(
  env.EXPO_ACCESS_TOKEN
    ? { accessToken: env.EXPO_ACCESS_TOKEN }
    : undefined,
);

/**
 * Scans user alarms when a new kelepir listing arrives and sends Expo push notifications.
 */
export class ListingAlertNotificationService {
  /**
   * Matches a listing against active UserFilter rows and sends Expo pushes.
   */
  async notifyMatchingFilters(
    listing: Listing,
  ): Promise<FilterMatchNotificationResult> {
    const filters = await prisma.userFilter.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    console.log(
      `[NOTIFICATION MATCH] İlan taranıyor: "${listing.title}" | aktifFiltre=${filters.length} | şehir=${listing.city ?? "-"} | fiyat=${listing.price} | skor=${listing.dealScore}`,
    );

    const matched: FilterWithUser[] = [];

    for (const filter of filters) {
      const evaluation = this.evaluateFilter(listing, filter);

      if (evaluation.matched) {
        matched.push(filter);
        console.log(
          `[NOTIFICATION MATCH] İlan: ${listing.title} -> Eşleşen Filtre ID: ${filter.id} (userId=${filter.userId}, kategori=${filter.category}, şehir=${filter.city ?? "Tüm Türkiye"})`,
        );
      } else {
        console.log(
          `[NOTIFICATION MATCH] İlan: ${listing.title} -> Elendi Filtre ID: ${filter.id} (sebep: ${evaluation.reason ?? "bilinmiyor"})`,
        );
      }
    }

    const byUser = new Map<string, FilterWithUser>();
    for (const filter of matched) {
      if (!filter.notifyPush) {
        console.log(
          `[NOTIFICATION MATCH] Filtre ${filter.id} eşleşti ancak notifyPush=false — push atlandı`,
        );
        continue;
      }
      if (!byUser.has(filter.userId)) {
        byUser.set(filter.userId, filter);
      }
    }

    const marketAverage = listing.marketAveragePrice ?? listing.price;
    const discountRate =
      marketAverage > 0
        ? Math.round(((marketAverage - listing.price) / marketAverage) * 100)
        : 0;

    const cityName = listing.city?.trim() || "Türkiye";
    const title = "Kuponiks Fırsat Alarmı";
    const body = `🔥 %${discountRate} · ${listing.title} - ${listing.price} TL (${cityName})`;

    const pushPayloads: ExpoPushPayload[] = [];
    const messages: ExpoPushMessage[] = [];

    for (const filter of byUser.values()) {
      const user = filter.user;
      const pushToken = user.expoPushToken?.trim() || null;
      const shortTitle = "Kuponiks Fırsat Alarmı";

      console.log(
        `[PUSH SIMULATION]: 🔔 BİLDİRİM FIRSATI! Kullanıcı ID: ${user.id} | Başlık: ${shortTitle} | İlan: ${listing.title}`,
      );

      if (!pushToken) {
        console.warn(
          `[WARNING] Kullanıcının push token'ı yok! userId=${user.id}, filterId=${filter.id}, listing="${listing.title}"`,
        );
        continue;
      }

      const payload: ExpoPushPayload = {
        to: pushToken,
        sound: "default",
        title,
        body,
        data: {
          dealId: listing.id,
          url: listing.url,
          listingId: listing.id,
          dealScore: listing.dealScore,
          type: "deal_alert",
        },
      };

      pushPayloads.push(payload);

      // Mock tokens are never sent to Expo; everything else goes to the real push API.
      if (pushToken.includes("mock-")) {
        console.log(
          `[PUSH SIMULATION]: mock- token — Expo gönderimi atlandı → userId=${user.id}`,
        );
        continue;
      }

      console.log(
        `[BİLDİRİM] Gerçek Expo push gönderiliyor → userId=${user.id}, token=${pushToken}`,
      );

      messages.push({
        to: pushToken,
        sound: "default",
        title,
        body,
        data: payload.data,
      });
    }

    const tickets = await this.sendExpoPushMessages(messages);

    console.log(
      `[NOTIFICATION MATCH] Özet → listingId=${listing.id}, eşleşen=${matched.length}, simülasyon=${byUser.size}, gerçekPush=${messages.length}`,
    );

    return {
      listingId: listing.id,
      matchedFilterCount: matched.length,
      notifiedUserCount: pushPayloads.length,
      pushPayloads,
      tickets,
    };
  }

  private async sendExpoPushMessages(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) {
      return [];
    }

    const tickets: ExpoPushTicket[] = [];
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);

        for (const ticket of ticketChunk) {
          if (ticket.status === "error") {
            console.error(
              `[BİLDİRİM] Expo push hatası → ${ticket.message}`,
              ticket.details ?? "",
            );
          } else {
            console.log(`[BİLDİRİM] Expo push gönderildi → id=${ticket.id}`);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Bilinmeyen Expo push hatası";
        console.error(`[BİLDİRİM] Expo push gönderilemedi: ${message}`);
      }
    }

    return tickets;
  }

  /**
   * Sync notification path uses the same central V2 matcher as async FilterMatchingService.
   */
  private evaluateFilter(
    listing: Listing,
    filter: UserFilter,
  ): MatchEvaluation {
    const matched = listingMatchesFilter(
      this.toMatchableListing(listing),
      this.toMatchableFilter(filter),
    );

    return matched
      ? { matched: true }
      : { matched: false, reason: "V2 matcher kriterleri karşılanmadı" };
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

  private toMatchableFilter(filter: UserFilter): MatchableFilter {
    return {
      category: filter.category,
      subcategory: filter.subcategory,
      brand: filter.brand,
      model: filter.model,
      variant: filter.variant,
      minYear: filter.minYear,
      maxYear: filter.maxYear,
      minMileage: filter.minMileage,
      maxMileage: filter.maxMileage,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      city: filter.city,
      district: filter.district,
      fuelType: filter.fuelType,
      transmission: filter.transmission,
      sellerType: filter.sellerType,
      keywords: filter.keywords,
      excludedKeywords: filter.excludedKeywords,
      minDealScore: filter.minDealScore,
    };
  }
}

/** Shared listing-alert notification service instance. */
export const listingAlertNotificationService =
  new ListingAlertNotificationService();
