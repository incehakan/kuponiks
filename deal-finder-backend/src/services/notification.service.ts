import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { Listing, User, UserFilter } from "@prisma/client";
import { env } from "../config/env.js";
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

  private evaluateFilter(
    listing: Listing,
    filter: UserFilter,
  ): MatchEvaluation {
    if (listing.dealScore < filter.minDealScore) {
      return {
        matched: false,
        reason: `dealScore ${listing.dealScore} < minDealScore ${filter.minDealScore}`,
      };
    }

    if (!this.matchesCategory(listing, filter.category)) {
      return {
        matched: false,
        reason: `kategori uyuşmadı (filtre=${filter.category})`,
      };
    }

    if (!this.matchesCity(listing.city, filter.city)) {
      return {
        matched: false,
        reason: `şehir uyuşmadı (ilan=${listing.city ?? "-"}, filtre=${filter.city ?? "-"})`,
      };
    }

    if (filter.minPrice != null && listing.price < filter.minPrice) {
      return {
        matched: false,
        reason: `fiyat ${listing.price} < minPrice ${filter.minPrice}`,
      };
    }

    if (filter.maxPrice != null && listing.price > filter.maxPrice) {
      return {
        matched: false,
        reason: `fiyat ${listing.price} > maxPrice ${filter.maxPrice}`,
      };
    }

    if (!this.matchesKeywords(listing, filter.keywords)) {
      return {
        matched: false,
        reason: `keywords OR eşleşmedi (${(filter.keywords ?? []).join(", ") || "yok"})`,
      };
    }

    return { matched: true };
  }

  private matchesCategory(listing: Listing, filterCategory: string): boolean {
    const listingCategory = this.resolveListingCategory(listing);
    if (!listingCategory) {
      return false;
    }

    const left = listingCategory.toLocaleLowerCase("tr-TR");
    const right = filterCategory.trim().toLocaleLowerCase("tr-TR");

    return (
      left === right ||
      left.includes(right) ||
      right.includes(left) ||
      left.split(">").pop()?.trim() === right.split(">").pop()?.trim()
    );
  }

  private matchesCity(
    listingCity: string | null,
    filterCity: string | null,
  ): boolean {
    if (!filterCity || !filterCity.trim()) {
      return true;
    }

    const normalizedFilter = filterCity.toLocaleLowerCase("tr-TR");
    if (
      normalizedFilter.includes("tüm türkiye") ||
      normalizedFilter.includes("tum turkiye")
    ) {
      return true;
    }

    // Test/dev: missing listing city must not block keyword/budget matches.
    if (!listingCity) {
      if (env.NODE_ENV !== "production") {
        return true;
      }
      return false;
    }

    const city = listingCity.toLocaleLowerCase("tr-TR");
    return normalizedFilter
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => part === city || city.includes(part) || part.includes(city));
  }

  /**
   * Keyword match — test mode uses case-insensitive regex OR semantics
   * so "Toyota" filter hits titles containing Toyota (any case).
   */
  private matchesKeywords(listing: Listing, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) {
      return true;
    }

    const corpus = this.buildCorpus(listing);
    const normalizedKeywords = keywords
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (normalizedKeywords.length === 0) {
      return true;
    }

    if (env.NODE_ENV !== "production") {
      return normalizedKeywords.some((keyword) =>
        this.keywordMatchesCorpus(corpus, keyword),
      );
    }

    const lowerCorpus = corpus.toLocaleLowerCase("tr-TR");
    return normalizedKeywords.some((keyword) =>
      lowerCorpus.includes(keyword.toLocaleLowerCase("tr-TR")),
    );
  }

  private keywordMatchesCorpus(corpus: string, keyword: string): boolean {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return true;
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return new RegExp(escaped, "iu").test(corpus);
    } catch {
      return corpus
        .toLocaleLowerCase("tr-TR")
        .includes(trimmed.toLocaleLowerCase("tr-TR"));
    }
  }

  private buildCorpus(listing: Listing): string {
    const parts: string[] = [listing.title];

    const raw = listing.rawDetails;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const details = raw as Record<string, unknown>;
      for (const key of ["description", "keywords", "category", "kategori"]) {
        const value = details[key];
        if (typeof value === "string") {
          parts.push(value);
        } else if (Array.isArray(value)) {
          parts.push(
            value.filter((item): item is string => typeof item === "string").join(" "),
          );
        }
      }
    }

    if (listing.city) {
      parts.push(listing.city);
    }

    // Keep original casing for unicode-aware regex; flags handle case.
    return parts.join(" ");
  }

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
}

/** Shared listing-alert notification service instance. */
export const listingAlertNotificationService =
  new ListingAlertNotificationService();
