import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { NotificationStatus } from "@prisma/client";
import {
  toUserFacingNotification,
  type UserFacingNotification,
} from "./notification-history.mapper.js";

/**
 * Authenticated user's own meaningful notification history.
 * Internal SKIPPED/FAILED/reason codes are not returned.
 */
export class NotificationHistoryService {
  async listForUser(
    userId: string,
    limit = 50,
  ): Promise<UserFacingNotification[]> {
    try {
      const take = Math.min(Math.max(limit, 1), 100);
      const rows = await prisma.notificationLog.findMany({
        where: {
          userId,
          status: NotificationStatus.SENT,
        },
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
              platform: true,
              brand: true,
              series: true,
              trim: true,
            },
          },
        },
      });

      return rows
        .map((row) => toUserFacingNotification(row))
        .filter((item): item is UserFacingNotification => item != null);
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
