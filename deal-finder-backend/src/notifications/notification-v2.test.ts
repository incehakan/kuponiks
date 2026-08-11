import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  NotificationChannel,
  NotificationStatus,
} from "@prisma/client";
import {
  buildOpportunityNotificationCopy,
  canNotifyUserForListing,
  isMarketReadyForOpportunity,
} from "../notifications/notification-eligibility.js";
import { isGlobalDealHighlight } from "../filters/match-eligibility.js";
import { listingMatchesFilter } from "../filters/filter-match.engine.js";
import { PermanentNotificationError } from "../notifications/permanent-error.js";

describe("Notification V2 eligibility", () => {
  it("score=60 / global=70 / user=50 → match TRUE, global highlight FALSE", () => {
    expect(isGlobalDealHighlight(60, 70)).toBe(false);
    expect(
      listingMatchesFilter(
        {
          title: "Honda Civic",
          price: 900_000,
          dealScore: 60,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          minDealScore: 50,
        },
      ),
    ).toBe(true);
  });

  it("READY market required for opportunity notify", () => {
    expect(
      canNotifyUserForListing(
        {
          dealScore: 60,
          marketStatus: "READY",
          category: "Vasıta > Otomobil",
        },
        { isActive: true, minDealScore: 50 },
      ).eligible,
    ).toBe(true);

    expect(
      canNotifyUserForListing(
        {
          dealScore: 60,
          marketStatus: "INSUFFICIENT_DATA",
          category: "Vasıta > Otomobil",
        },
        { isActive: true, minDealScore: 50 },
      ),
    ).toEqual({ eligible: false, reason: "market_not_ready" });
  });

  it("inactive filter not eligible", () => {
    expect(
      canNotifyUserForListing(
        { dealScore: 80, marketStatus: "READY", category: "Vasıta > Otomobil" },
        { isActive: false, minDealScore: 50 },
      ).reason,
    ).toBe("inactive_filter");
  });

  it("below user minDealScore not eligible", () => {
    expect(
      canNotifyUserForListing(
        { dealScore: 60, marketStatus: "READY", category: "Vasıta > Otomobil" },
        { isActive: true, minDealScore: 80 },
      ).reason,
    ).toBe("below_min_deal_score");
  });

  it("isMarketReadyForOpportunity only READY", () => {
    expect(
      isMarketReadyForOpportunity({
        marketStatus: "READY",
        category: "Vasıta",
      }),
    ).toBe(true);
    expect(
      isMarketReadyForOpportunity({
        marketStatus: "INSUFFICIENT_DATA",
        category: "Vasıta",
      }),
    ).toBe(false);
  });

  it("push copy includes score and optional advantage", () => {
    const copy = buildOpportunityNotificationCopy({
      title: "Honda Civic 1.6i",
      price: 955_000,
      dealScore: 82,
      priceAdvantagePct: 8.7,
      platform: "arabam",
      city: "İzmir",
    });
    expect(copy.title).toContain("fırsat");
    expect(copy.message).toContain("955");
    expect(copy.message).toContain("82");
    expect(copy.message).toContain("8,7");
  });

  it("PermanentNotificationError is marked permanent", () => {
    const err = new PermanentNotificationError("invalid_token", "bad");
    expect(err.permanent).toBe(true);
    expect(err.reason).toBe("invalid_token");
  });
});

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    notificationLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma.js";
import { NotificationService } from "../notifications/notification.service.js";
import type { INotificationProvider } from "../notifications/notification.interface.js";

describe("NotificationService channel dedup + token skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips push when already SENT", async () => {
    (prisma.notificationLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "log1",
    });
    (prisma.notificationLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const push: INotificationProvider = {
      send: vi.fn(async () => true),
    };
    const service = new NotificationService({
      [NotificationChannel.PUSH]: push,
    });

    const result = await service.dispatch(
      {
        userId: "u1",
        listingId: "l1",
        title: "t",
        message: "m",
        price: 1,
        dealScore: 80,
        url: "https://example.com",
        expoPushToken: "ExponentPushToken[xxx]",
      },
      [NotificationChannel.PUSH],
    );

    expect(result.skipped).toBe(1);
    expect(push.send).not.toHaveBeenCalled();
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationStatus.SKIPPED,
          reason: "already_sent",
        }),
      }),
    );
  });

  it("skips push when no token (no infinite retry)", async () => {
    (prisma.notificationLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (prisma.notificationLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const push: INotificationProvider = {
      send: vi.fn(async () => true),
    };
    const service = new NotificationService({
      [NotificationChannel.PUSH]: push,
    });

    const result = await service.dispatch(
      {
        userId: "u1",
        listingId: "l1",
        title: "t",
        message: "m",
        price: 1,
        dealScore: 80,
        url: "https://example.com",
      },
      [NotificationChannel.PUSH],
    );

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(push.send).not.toHaveBeenCalled();
  });

  it("permanent invalid token → SKIPPED not FAILED retry storm", async () => {
    (prisma.notificationLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (prisma.notificationLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const push: INotificationProvider = {
      send: vi.fn(async () => {
        throw new PermanentNotificationError("invalid_token", "bad token");
      }),
    };
    const service = new NotificationService({
      [NotificationChannel.PUSH]: push,
    });

    const result = await service.dispatch(
      {
        userId: "u1",
        listingId: "l1",
        title: "t",
        message: "m",
        price: 1,
        dealScore: 80,
        url: "https://example.com",
        expoPushToken: "ExponentPushToken[xxx]",
      },
      [NotificationChannel.PUSH],
    );

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("transient failure with no success throws for BullMQ retry", async () => {
    (prisma.notificationLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (prisma.notificationLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const push: INotificationProvider = {
      send: vi.fn(async () => false),
    };
    const service = new NotificationService({
      [NotificationChannel.PUSH]: push,
    });

    await expect(
      service.dispatch(
        {
          userId: "u1",
          listingId: "l1",
          title: "t",
          message: "m",
          price: 1,
          dealScore: 80,
          url: "https://example.com",
          expoPushToken: "ExponentPushToken[xxx]",
        },
        [NotificationChannel.PUSH],
      ),
    ).rejects.toThrow(/All notification channels failed/);
  });
});
