import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { DEAL_SCORE_THRESHOLD } from "../../analyzer/deal-score.service.js";

/**
 * Deal listing DTO shaped for mobile clients.
 */
export interface DealListItem {
  id: string;
  title: string;
  city: string;
  price: number;
  marketAverage: number;
  dealScore: number;
  dealPercent: number;
  listingUrl: string;
  platform: string;
  createdAt: Date;
  /** Market Intelligence V1 (optional, backward-compatible). */
  marketMedianPrice?: number | null;
  priceAdvantagePct?: number | null;
  marketSampleSize?: number | null;
  marketConfidence?: string | null;
}

/**
 * High-score listing queries for the deals feed.
 */
export class DealService {
  /**
   * Returns recent listings with dealScore >= threshold, newest first.
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
        // Project only feed fields — avoids pulling large rawDetails JSON.
        select: {
          id: true,
          title: true,
          city: true,
          price: true,
          marketAveragePrice: true,
          marketMedianPrice: true,
          priceAdvantagePct: true,
          marketSampleSize: true,
          marketConfidence: true,
          dealScore: true,
          url: true,
          platform: true,
          createdAt: true,
        },
      });

      return listings.map((listing) => {
        const marketAverage =
          listing.marketMedianPrice ?? listing.marketAveragePrice ?? 0;
        const dealPercent =
          listing.priceAdvantagePct != null
            ? Math.round(listing.priceAdvantagePct)
            : marketAverage > 0
              ? Math.round(
                  ((marketAverage - listing.price) / marketAverage) * 100,
                )
              : 0;

        return {
          id: listing.id,
          title: listing.title,
          city: listing.city ?? "Belirtilmemiş",
          price: listing.price,
          marketAverage,
          dealScore: listing.dealScore,
          dealPercent,
          listingUrl: listing.url,
          platform: listing.platform,
          createdAt: listing.createdAt,
          marketMedianPrice: listing.marketMedianPrice,
          priceAdvantagePct: listing.priceAdvantagePct,
          marketSampleSize: listing.marketSampleSize,
          marketConfidence: listing.marketConfidence,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown deals fetch error";
      console.error(`DealService.getHighScoreDeals failed: ${message}`);
      throw new HttpError("İlanlar alınamadı", 500);
    }
  }

  /**
   * Returns a single listing by id, shaped for mobile deal detail.
   */
  async getDealById(dealId: string): Promise<DealListItem> {
    try {
      if (!dealId?.trim()) {
        throw new HttpError("İlan kimliği zorunludur", 400);
      }

      const listing = await prisma.listing.findUnique({
        where: { id: dealId },
        select: {
          id: true,
          title: true,
          city: true,
          price: true,
          marketAveragePrice: true,
          marketMedianPrice: true,
          priceAdvantagePct: true,
          marketSampleSize: true,
          marketConfidence: true,
          dealScore: true,
          url: true,
          platform: true,
          createdAt: true,
        },
      });

      if (!listing) {
        throw new HttpError("İlan bulunamadı", 404, "NotFoundError");
      }

      const marketAverage =
        listing.marketMedianPrice ?? listing.marketAveragePrice ?? 0;
      const dealPercent =
        listing.priceAdvantagePct != null
          ? Math.round(listing.priceAdvantagePct)
          : marketAverage > 0
            ? Math.round(((marketAverage - listing.price) / marketAverage) * 100)
            : 0;

      return {
        id: listing.id,
        title: listing.title,
        city: listing.city ?? "Belirtilmemiş",
        price: listing.price,
        marketAverage,
        dealScore: listing.dealScore,
        dealPercent,
        listingUrl: listing.url,
        platform: listing.platform,
        createdAt: listing.createdAt,
        marketMedianPrice: listing.marketMedianPrice,
        priceAdvantagePct: listing.priceAdvantagePct,
        marketSampleSize: listing.marketSampleSize,
        marketConfidence: listing.marketConfidence,
      };
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
