import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import {
  isUserFacingNotificationLog,
  toUserFacingNotification,
} from "./notification-history.mapper.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    notificationLog: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { NotificationHistoryService } from "./notification-history.service.js";

const mocked = prisma as unknown as {
  notificationLog: { findMany: ReturnType<typeof vi.fn> };
};

const listing = {
  id: "af7ab012-b187-4870-b6e6-afdf3b66acae",
  title: "MASRAFSIZ BAKIMLI Honda Civic",
  imageUrl:
    "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
  dealScore: 90,
  priceAdvantagePct: 24.8,
  platform: "arabam",
  brand: "Honda",
  series: "Civic",
  trim: "1.6i VTEC Elegance",
};

describe("user-facing notification mapper", () => {
  it("maps SENT push to Yeni fırsat bulundu! and hides raw status", () => {
    const mapped = toUserFacingNotification({
      id: "e40290bc-49af-4a04-84e6-45cd2ab911d0",
      channel: NotificationChannel.PUSH,
      status: NotificationStatus.SENT,
      reason: null,
      listingId: listing.id,
      sentAt: new Date("2026-08-14T16:09:35.000Z"),
      listing,
    });
    expect(mapped).not.toBeNull();
    expect(mapped?.title).toBe("Yeni fırsat bulundu!");
    expect(mapped?.message).toBe("Honda Civic 1.6i VTEC Elegance");
    expect(mapped?.type).toBe("deal");
    expect(mapped?.dealId).toBe(listing.id);
    expect(mapped?.imageUrl).toBeNull();
    expect(mapped?.platform).toBe("Arabam");
    expect(mapped).not.toHaveProperty("status");
    expect(mapped).not.toHaveProperty("reason");
    expect(mapped).not.toHaveProperty("channel");
  });

  it("hides SKIPPED already_sent from the user feed", () => {
    expect(
      isUserFacingNotificationLog({
        status: NotificationStatus.SKIPPED,
        reason: "already_sent",
        channel: NotificationChannel.PUSH,
      }),
    ).toBe(false);
    expect(
      toUserFacingNotification({
        id: "skip",
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SKIPPED,
        reason: "already_sent",
        listingId: listing.id,
        sentAt: new Date(),
        listing,
      }),
    ).toBeNull();
  });

  it("hides FAILED and no_token from the user feed", () => {
    expect(
      isUserFacingNotificationLog({
        status: NotificationStatus.FAILED,
        reason: "no_token",
        channel: NotificationChannel.PUSH,
      }),
    ).toBe(false);
  });
});

describe("Notification history API mapping", () => {
  const service = new NotificationHistoryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only SENT logs and returns user-facing DTOs", async () => {
    mocked.notificationLog.findMany.mockResolvedValue([
      {
        id: "e40290bc-0000-0000-0000-000000000001",
        userId: "user-a",
        listingId: listing.id,
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SENT,
        reason: null,
        sentAt: new Date("2026-08-14T16:09:35.000Z"),
        listing,
      },
    ]);

    const items = await service.listForUser("user-a");
    expect(mocked.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-a", status: NotificationStatus.SENT },
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Yeni fırsat bulundu!");
    expect(items[0]?.message).toContain("Honda Civic");
    expect(JSON.stringify(items)).not.toMatch(/already_sent|expoPushToken|chat_id/i);
  });
});
