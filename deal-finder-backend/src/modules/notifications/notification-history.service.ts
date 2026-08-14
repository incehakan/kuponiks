import { HttpError } from "../../lib/http-error.js";
import { toPublicListingImageUrl } from "../../lib/listing-image.js";
import { prisma } from "../../lib/prisma.js";

export interface NotificationHistoryItem {
  id: string;
  channel: string;
  status: string;
  reason: string | null;
  listingId: string;
  createdAt: Date;
  sentAt: Date;
  title: string;
  imageUrl: string | null;
  dealScore: number | null;
  priceAdvantagePct: number | null;
  listingUrl: string | null;
  platform: string | null;
}

/**
 * Authenticated user's own NotificationLog history.
 * Never returns push tokens, Telegram chat ids, or provider payloads.
 */
export class NotificationHistoryService {
  async listForUser(
    userId: string,
    limit = 50,
  ): Promise<NotificationHistoryItem[]> {
    try {
      const take = Math.min(Math.max(limit, 1), 100);
      const rows = await prisma.notificationLog.findMany({
        where: { userId },
        orderBy: { sentAt: "desc" },
        take,
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              dealScore: true,
              priceAdvantagePct: true,
              url: true,
              platform: true,
            },
          },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        status: row.status,
        reason: row.reason,
        listingId: row.listingId,
        createdAt: row.sentAt,
        sentAt: row.sentAt,
        title: row.listing.title,
        imageUrl: toPublicListingImageUrl(row.listing.imageUrl),
        dealScore: row.listing.dealScore,
        priceAdvantagePct: row.listing.priceAdvantagePct,
        listingUrl: row.listing.url,
        platform: row.listing.platform,
      }));
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown notification history error";
      console.error(`NotificationHistoryService.listForUser failed: ${message}`);
      throw new HttpError("Bildirimler alınamadı", 500);
    }
  }
}

export const notificationHistoryService = new NotificationHistoryService();
