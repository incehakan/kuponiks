import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("Notification history API mapping", () => {
  const service = new NotificationHistoryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the queried user's logs and strips placeholder images", async () => {
    mocked.notificationLog.findMany.mockResolvedValue([
      {
        id: "e40290bc-0000-0000-0000-000000000001",
        userId: "user-a",
        listingId: "af7ab012-0000-0000-0000-000000000001",
        channel: "PUSH",
        status: "SENT",
        reason: null,
        sentAt: new Date("2026-08-14T16:09:35.000Z"),
        listing: {
          id: "af7ab012-0000-0000-0000-000000000001",
          title: "Honda Civic",
          imageUrl:
            "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
          dealScore: 86,
          priceAdvantagePct: 21.4,
          url: "https://www.arabam.com/ilan/x",
          platform: "arabam",
        },
      },
    ]);

    const items = await service.listForUser("user-a");
    expect(mocked.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-a" },
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("SENT");
    expect(items[0]?.channel).toBe("PUSH");
    expect(items[0]?.imageUrl).toBeNull();
    expect(items[0]?.title).toBe("Honda Civic");
    expect(JSON.stringify(items)).not.toMatch(/expoPushToken|telegramChatId|chat_id/i);
  });
});
