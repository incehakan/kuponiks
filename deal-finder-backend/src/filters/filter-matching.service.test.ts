import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../lib/redis.js", () => ({
  redisSetNxEx: vi.fn().mockResolvedValue("OK"),
  redisDel: vi.fn(),
}));

vi.mock("../notifications/notification-eligibility.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../notifications/notification-eligibility.js")>();
  return {
    ...actual,
    filterChannelsNeedingDelivery: vi.fn().mockResolvedValue({
      pending: ["PUSH"],
      skipped: [],
    }),
  };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    listing: { findUnique: vi.fn() },
    userFilter: { findMany: vi.fn() },
    notificationLog: { create: vi.fn().mockResolvedValue({ id: "n1" }) },
  },
}));

vi.mock("./user-listing-match.service.js", () => ({
  persistUserListingMatches: vi.fn().mockResolvedValue({ created: 1, existing: 0 }),
}));

vi.mock("../queues/notification.queue.js", () => ({
  enqueueNotification: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { FilterMatchingService } from "./filter-matching.service.js";
import { persistUserListingMatches } from "./user-listing-match.service.js";
import { enqueueNotification } from "../queues/notification.queue.js";

describe("FilterMatchingService notification suppression", () => {
  const service = new FilterMatchingService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.listing.findUnique).mockResolvedValue({
      id: "l1",
      title: "Honda Civic",
      price: 1_000_000,
      dealScore: 80,
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      year: 2017,
      mileage: 90_000,
      marketStatus: "READY",
      subcategory: null,
      rawDetails: null,
      city: "İstanbul",
      currency: "TRY",
    } as never);
    vi.mocked(prisma.userFilter.findMany).mockResolvedValue([
      {
        id: "f1",
        userId: "u1",
        isActive: true,
        category: "Vasıta > Otomobil",
        brand: "Honda",
        series: "Civic",
        minYear: 2016,
        maxYear: 2018,
        minDealScore: 50,
        notifyPush: true,
        notifyTelegram: false,
        notifyWhatsapp: false,
        user: {
          id: "u1",
          subscriptionPlan: "VIP",
          expoPushToken: "ExponentPushToken[test]",
        },
      },
    ] as never);
  });

  it("10. suppressNotifications persists matches without enqueue", async () => {
    await service.matchListingWithFilters("l1", { suppressNotifications: true });
    expect(persistUserListingMatches).toHaveBeenCalled();
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("11. default path still enqueues when eligible", async () => {
    await service.matchListingWithFilters("l1");
    expect(persistUserListingMatches).toHaveBeenCalled();
    expect(enqueueNotification).toHaveBeenCalled();
  });
});
