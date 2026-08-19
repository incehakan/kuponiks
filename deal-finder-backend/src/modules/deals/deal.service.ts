import { Prisma } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { DEAL_SCORE_THRESHOLD } from "../../analyzer/deal-score.service.js";
import { toPublicListingImageUrl } from "../../lib/listing-image.js";
import { listingPlatformLabel } from "../../lib/platform-label.js";

/**
 * Deal listing DTO shaped for mobile clients (backward-compatible + V2 fields).
 */
export interface DealListItem {
  id: string;
  listingId: string;
  title: string;
  city: string;
  district?: string | null;
  price: number;
  currency?: string | null;
  marketAverage: number;
  dealScore: number;
  dealPercent: number;
  listingUrl: string;
  platform: string;
  platformLabel?: string;
  createdAt: Date;
  matchedAt?: Date | null;
  imageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  trim?: string | null;
  year?: number | null;
  mileage?: number | null;
  sellerType?: string | null;
  description?: string | null;
  marketStatus?: string | null;
  /** Market Intelligence V1 (optional, backward-compatible). */
  marketMedianPrice?: number | null;
  priceAdvantagePct?: number | null;
  marketSampleSize?: number | null;
  marketConfidence?: string | null;
  marketSegmentLevel?: string | null;
  matchedFilterCount?: number;
  matchedFilters?: Array<{
    id: string;
    name: string | null;
    category: string;
    brand: string | null;
    series: string | null;
  }>;
  firstSeenAt?: Date | null;
  publishedAt?: Date | null;
}

export interface UserDealsPage {
  deals: DealListItem[];
  nextCursor: string | null;
  authenticated: true;
}

export type DealFeedSort = "newest" | "score" | "advantage" | "price";

export interface DealFeedViewQuery {
  limit?: number;
  cursor?: string;
  sort?: DealFeedSort;
  minScore?: number;
  platform?: string;
  brand?: string;
  city?: string;
  onlyBelowMarket?: boolean;
}

const FEED_SELECT = {
  id: true,
  title: true,
  city: true,
  district: true,
  price: true,
  currency: true,
  marketAveragePrice: true,
  marketMedianPrice: true,
  priceAdvantagePct: true,
  marketSampleSize: true,
  marketConfidence: true,
  marketSegmentLevel: true,
  marketStatus: true,
  brand: true,
  model: true,
  series: true,
  trim: true,
  year: true,
  mileage: true,
  sellerType: true,
  description: true,
  imageUrl: true,
  dealScore: true,
  url: true,
  platform: true,
  createdAt: true,
  firstSeenAt: true,
  publishedAt: true,
} satisfies Prisma.ListingSelect;

type AggregatedMatch = {
  listing: Prisma.ListingGetPayload<{ select: typeof FEED_SELECT }>;
  matchedAt: Date;
  filters: NonNullable<DealListItem["matchedFilters"]>;
};

function hasPresentationFilters(query: DealFeedViewQuery): boolean {
  return (
    (query.minScore != null && query.minScore > 0) ||
    Boolean(query.platform?.trim()) ||
    Boolean(query.brand?.trim()) ||
    Boolean(query.city?.trim()) ||
    Boolean(query.onlyBelowMarket) ||
    (query.sort != null && query.sort !== "newest")
  );
}

function listingMatchesPresentation(
  listing: AggregatedMatch["listing"],
  query: DealFeedViewQuery,
): boolean {
  if (query.minScore != null && listing.dealScore < query.minScore) {
    return false;
  }
  if (query.platform?.trim()) {
    if (listing.platform.toLowerCase() !== query.platform.trim().toLowerCase()) {
      return false;
    }
  }
  if (query.brand?.trim()) {
    const brand = (listing.brand ?? "").toLocaleLowerCase("tr-TR");
    if (brand !== query.brand.trim().toLocaleLowerCase("tr-TR")) {
      return false;
    }
  }
  if (query.city?.trim()) {
    const city = (listing.city ?? "").toLocaleLowerCase("tr-TR");
    if (city !== query.city.trim().toLocaleLowerCase("tr-TR")) {
      return false;
    }
  }
  if (query.onlyBelowMarket) {
    const ready = (listing.marketStatus ?? "").toUpperCase() === "READY";
    if (
      !ready ||
      listing.priceAdvantagePct == null ||
      listing.priceAdvantagePct <= 0
    ) {
      return false;
    }
  }
  return true;
}

function sortAggregated(
  items: AggregatedMatch[],
  sort: DealFeedSort,
): AggregatedMatch[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "score") {
      return (
        b.listing.dealScore - a.listing.dealScore ||
        b.matchedAt.getTime() - a.matchedAt.getTime()
      );
    }
    if (sort === "advantage") {
      const av = a.listing.priceAdvantagePct ?? Number.NEGATIVE_INFINITY;
      const bv = b.listing.priceAdvantagePct ?? Number.NEGATIVE_INFINITY;
      return bv - av || b.matchedAt.getTime() - a.matchedAt.getTime();
    }
    if (sort === "price") {
      return (
        a.listing.price - b.listing.price ||
        b.matchedAt.getTime() - a.matchedAt.getTime()
      );
    }
    return b.matchedAt.getTime() - a.matchedAt.getTime();
  });
  return copy;
}

function mapListingToDeal(
  listing: Prisma.ListingGetPayload<{ select: typeof FEED_SELECT }>,
  extras: {
    matchedAt?: Date | null;
    matchedFilterCount?: number;
    matchedFilters?: DealListItem["matchedFilters"];
  } = {},
): DealListItem {
  const marketReady = (listing.marketStatus ?? "").toUpperCase() === "READY";
  const marketMedian = marketReady ? listing.marketMedianPrice : null;
  const marketAverage = marketReady
    ? (listing.marketMedianPrice ?? listing.marketAveragePrice ?? 0)
    : 0;
  const advantage = marketReady ? listing.priceAdvantagePct : null;
  const dealPercent =
    advantage != null
      ? Math.round(advantage)
      : marketAverage > 0
        ? Math.round(((marketAverage - listing.price) / marketAverage) * 100)
        : 0;

  return {
    id: listing.id,
    listingId: listing.id,
    title: listing.title,
    city: listing.city ?? "Belirtilmemiş",
    district: listing.district,
    price: listing.price,
    currency: listing.currency,
    marketAverage,
    dealScore: listing.dealScore,
    dealPercent,
    listingUrl: listing.url,
    platform: listing.platform,
    platformLabel: listingPlatformLabel(listing.platform),
    createdAt: listing.createdAt,
    matchedAt: extras.matchedAt ?? null,
    imageUrl: toPublicListingImageUrl(listing.imageUrl),
    brand: listing.brand,
    model: listing.model,
    series: listing.series,
    trim: listing.trim,
    year: listing.year,
    mileage: listing.mileage,
    sellerType: listing.sellerType,
    description: listing.description,
    marketStatus: listing.marketStatus,
    marketMedianPrice: marketMedian,
    priceAdvantagePct: advantage,
    marketSampleSize: marketReady ? listing.marketSampleSize : null,
    marketConfidence: marketReady ? listing.marketConfidence : null,
    marketSegmentLevel: marketReady ? listing.marketSegmentLevel : null,
    ...(extras.matchedFilterCount != null
      ? { matchedFilterCount: extras.matchedFilterCount }
      : {}),
    ...(extras.matchedFilters ? { matchedFilters: extras.matchedFilters } : {}),
    firstSeenAt: listing.firstSeenAt,
    publishedAt: listing.publishedAt,
  };
}

function encodeCursor(matchedAt: Date, listingId: string): string {
  return Buffer.from(
    `${matchedAt.toISOString()}|${listingId}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
): { matchedAt: Date; listingId: string } | null {
  if (!cursor?.trim()) {
    return null;
  }
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, listingId] = raw.split("|");
    if (!iso || !listingId) {
      return null;
    }
    const matchedAt = new Date(iso);
    if (Number.isNaN(matchedAt.getTime())) {
      return null;
    }
    return { matchedAt, listingId };
  } catch {
    return null;
  }
}

/**
 * High-score listing queries + user-specific matched Deal Feed V2.
 */
export class DealService {
  /**
   * Legacy global high-score feed (highlight). Kept for BC / unauthenticated.
   */
  async getHighScoreDeals(
    minDealScore: number = DEAL_SCORE_THRESHOLD,
    take: number = 50,
  ): Promise<DealListItem[]> {
    try {
      const listings = await prisma.listing.findMany({
        where: {
          dealScore: {
            gte: minDealScore,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take,
        select: FEED_SELECT,
      });

      return listings.map((listing) => mapListingToDeal(listing));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown deals fetch error";
      console.error(`DealService.getHighScoreDeals failed: ${message}`);
      throw new HttpError("İlanlar alınamadı", 500);
    }
  }

  /**
   * User-specific Deal Feed: one row per listing (deduped across filters).
   */
  async getUserMatchedDeals(
    userId: string,
    options: DealFeedViewQuery = {},
  ): Promise<UserDealsPage> {
    try {
      const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
      const sort: DealFeedSort =
        options.sort === "score" ||
        options.sort === "advantage" ||
        options.sort === "price"
          ? options.sort
          : "newest";
      const cursor = decodeCursor(options.cursor);

      if (hasPresentationFilters({ ...options, sort })) {
        return this.getUserMatchedDealsFiltered(userId, limit, cursor, {
          ...options,
          sort,
        });
      }

      const matches = await prisma.userListingMatch.findMany({
        where: {
          userId,
          ...(cursor
            ? {
                OR: [
                  { matchedAt: { lt: cursor.matchedAt } },
                  {
                    matchedAt: cursor.matchedAt,
                    listingId: { lt: cursor.listingId },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ matchedAt: "desc" }, { listingId: "desc" }],
        take: limit * 4,
        include: {
          listing: { select: FEED_SELECT },
          filter: {
            select: {
              id: true,
              name: true,
              category: true,
              brand: true,
              series: true,
            },
          },
        },
      });

      const byListing = new Map<
        string,
        {
          listing: (typeof matches)[number]["listing"];
          matchedAt: Date;
          filters: DealListItem["matchedFilters"];
        }
      >();

      for (const row of matches) {
        const existing = byListing.get(row.listingId);
        if (!existing) {
          byListing.set(row.listingId, {
            listing: row.listing,
            matchedAt: row.matchedAt,
            filters: [
              {
                id: row.filter.id,
                name: row.filter.name,
                category: row.filter.category,
                brand: row.filter.brand,
                series: row.filter.series,
              },
            ],
          });
          continue;
        }
        if (row.matchedAt > existing.matchedAt) {
          existing.matchedAt = row.matchedAt;
        }
        if (!existing.filters?.some((f) => f.id === row.filter.id)) {
          existing.filters?.push({
            id: row.filter.id,
            name: row.filter.name,
            category: row.filter.category,
            brand: row.filter.brand,
            series: row.filter.series,
          });
        }
      }

      const deals = [...byListing.values()]
        .sort((a, b) => b.matchedAt.getTime() - a.matchedAt.getTime())
        .slice(0, limit)
        .map((item) =>
          mapListingToDeal(item.listing, {
            matchedAt: item.matchedAt,
            matchedFilterCount: item.filters?.length ?? 0,
            matchedFilters: item.filters,
          }),
        );

      const last = deals[deals.length - 1];
      const nextCursor =
        deals.length === limit && last?.matchedAt
          ? encodeCursor(last.matchedAt, last.listingId)
          : null;

      return { deals, nextCursor, authenticated: true };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown user deals error";
      console.error(`DealService.getUserMatchedDeals failed: ${message}`);
      throw new HttpError("Fırsatlar alınamadı", 500);
    }
  }

  /**
   * Presentation filters/sorts over the user's already-matched feed.
   * Does not create or alter UserFilter rows.
   */
  private async getUserMatchedDealsFiltered(
    userId: string,
    limit: number,
    cursor: { matchedAt: Date; listingId: string } | null,
    query: DealFeedViewQuery,
  ): Promise<UserDealsPage> {
    const matches = await prisma.userListingMatch.findMany({
      where: { userId },
      orderBy: [{ matchedAt: "desc" }],
      take: 500,
      include: {
        listing: { select: FEED_SELECT },
        filter: {
          select: {
            id: true,
            name: true,
            category: true,
            brand: true,
            series: true,
          },
        },
      },
    });

    const byListing = new Map<string, AggregatedMatch>();

    for (const row of matches) {
      const existing = byListing.get(row.listingId);
      if (!existing) {
        byListing.set(row.listingId, {
          listing: row.listing,
          matchedAt: row.matchedAt,
          filters: [
            {
              id: row.filter.id,
              name: row.filter.name,
              category: row.filter.category,
              brand: row.filter.brand,
              series: row.filter.series,
            },
          ],
        });
        continue;
      }
      if (row.matchedAt > existing.matchedAt) {
        existing.matchedAt = row.matchedAt;
      }
      if (!existing.filters.some((f) => f.id === row.filter.id)) {
        existing.filters.push({
          id: row.filter.id,
          name: row.filter.name,
          category: row.filter.category,
          brand: row.filter.brand,
          series: row.filter.series,
        });
      }
    }

    let ranked = sortAggregated(
      [...byListing.values()].filter((item) =>
        listingMatchesPresentation(item.listing, query),
      ),
      query.sort ?? "newest",
    );

    if (cursor) {
      const idx = ranked.findIndex((r) => r.listing.id === cursor.listingId);
      ranked = idx >= 0 ? ranked.slice(idx + 1) : ranked;
    }

    const page = ranked.slice(0, limit);
    const deals = page.map((item) =>
      mapListingToDeal(item.listing, {
        matchedAt: item.matchedAt,
        matchedFilterCount: item.filters.length,
        matchedFilters: item.filters,
      }),
    );

    const last = page[page.length - 1];
    const nextCursor =
      page.length === limit && last
        ? encodeCursor(last.matchedAt, last.listing.id)
        : null;

    return { deals, nextCursor, authenticated: true };
  }

  /**
   * User-authorized deal detail — only if the user has a match for this listing.
   */
  async getUserDealById(userId: string, listingId: string): Promise<DealListItem> {
    try {
      if (!listingId?.trim()) {
        throw new HttpError("İlan kimliği zorunludur", 400);
      }

      const matches = await prisma.userListingMatch.findMany({
        where: { userId, listingId },
        include: {
          listing: { select: FEED_SELECT },
          filter: {
            select: {
              id: true,
              name: true,
              category: true,
              brand: true,
              series: true,
            },
          },
        },
        orderBy: { matchedAt: "desc" },
      });

      if (matches.length === 0) {
        throw new HttpError("Fırsat bulunamadı", 404, "NotFoundError");
      }

      const listing = matches[0]!.listing;
      const matchedAt = matches[0]!.matchedAt;
      const matchedFilters = matches.map((m) => ({
        id: m.filter.id,
        name: m.filter.name,
        category: m.filter.category,
        brand: m.filter.brand,
        series: m.filter.series,
      }));

      return mapListingToDeal(listing, {
        matchedAt,
        matchedFilterCount: matchedFilters.length,
        matchedFilters,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown deal fetch error";
      console.error(`DealService.getUserDealById failed: ${message}`);
      throw new HttpError("İlan detayı alınamadı", 500);
    }
  }

  /**
   * Returns a single listing by id, shaped for mobile deal detail (legacy/global).
   */
  async getDealById(dealId: string): Promise<DealListItem> {
    try {
      if (!dealId?.trim()) {
        throw new HttpError("İlan kimliği zorunludur", 400);
      }

      const listing = await prisma.listing.findUnique({
        where: { id: dealId },
        select: FEED_SELECT,
      });

      if (!listing) {
        throw new HttpError("İlan bulunamadı", 404, "NotFoundError");
      }

      return mapListingToDeal(listing);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "Unknown deal fetch error";
      console.error(`DealService.getDealById failed: ${message}`);
      throw new HttpError("İlan detayı alınamadı", 500);
    }
  }
}

/** Shared deal service instance. */
export const dealService = new DealService();
