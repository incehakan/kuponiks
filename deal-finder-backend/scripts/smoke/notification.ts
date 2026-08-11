/**
 * Controlled real notification smoke (single user + listing).
 *
 * Dry-run / preflight (default — NO real notification):
 *   npm run smoke:notification -- --user=<uuid> --listing=<uuid>
 *
 * Real send (explicit confirm required):
 *   npm run smoke:notification -- --user=<uuid> --listing=<uuid> --confirm-real-notification
 */
import { Expo } from "expo-server-sdk";
import { env } from "../../src/config/env.js";
import { filterMatchingService } from "../../src/filters/filter-matching.service.js";
import { listingMatchesFilter } from "../../src/filters/filter-match.engine.js";
import { prisma } from "../../src/lib/prisma.js";
import {
  probeRedisConnection,
  redisDel,
} from "../../src/lib/redis.js";
import { dealService } from "../../src/modules/deals/deal.service.js";
import { getNotificationOpsHealth } from "../../src/notifications/notification-ops-health.js";
import { closeNotificationQueue } from "../../src/queues/notification.queue.js";
import { startNotificationWorker } from "../../src/queues/notification.worker.js";
import { cleanupSmokeResources, parseSmokeArgs } from "./_shared.js";

const SMOKE_FILTER_NAME = "Kuponiks Smoke Test";

function maskToken(value: string | null | undefined): string {
  if (!value?.trim()) return "(yok)";
  const v = value.trim();
  if (v.length <= 10) return "****";
  return `ExpoPushToken[${v.slice(0, 4)}...${v.slice(-4)}]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseSmokeArgs(process.argv.slice(2));
  const report: Record<string, unknown> = {
    mode: args.confirmRealNotification ? "real" : "dry-run",
  };

  const health = await getNotificationOpsHealth({ probeRedis: true });
  report.opsHealth = health;

  if (!args.userId || !args.listingId) {
    console.log(
      JSON.stringify(
        {
          ...report,
          error:
            "Usage: --user=<uuid> --listing=<uuid> [--confirm-real-notification]",
          hint: "Without --confirm-real-notification this script never sends push/Telegram.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      id: true,
      fullName: true,
      expoPushToken: true,
      telegramChatId: true,
      subscriptionPlan: true,
    },
  });
  if (!user) {
    console.error("ABORT: user not found");
    process.exitCode = 1;
    return;
  }

  const listing = await prisma.listing.findUnique({
    where: { id: args.listingId },
  });
  if (!listing) {
    console.error("ABORT: listing not found");
    process.exitCode = 1;
    return;
  }

  const token = user.expoPushToken?.trim() ?? "";
  report.user = {
    id: user.id,
    fullName: user.fullName,
    plan: user.subscriptionPlan,
    expoTokenMasked: maskToken(user.expoPushToken),
    expoTokenValidFormat: token ? Expo.isExpoPushToken(token) : false,
    telegramConnected: Boolean(user.telegramChatId?.trim()),
  };
  report.listing = {
    id: listing.id,
    externalId: listing.externalId,
    platform: listing.platform,
    brand: listing.brand,
    series: listing.series,
    trim: listing.trim,
    dealScore: listing.dealScore,
    marketStatus: listing.marketStatus,
    price: listing.price,
    marketMedianPrice: listing.marketMedianPrice,
    priceAdvantagePct: listing.priceAdvantagePct,
  };
  report.thresholds = {
    userMinDealScore: "(see filter)",
    global: env.DEAL_SCORE_THRESHOLD ?? 70,
  };

  if (listing.marketStatus !== "READY") {
    console.error("ABORT: listing marketStatus !== READY");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const priorSent = await prisma.notificationLog.findMany({
    where: {
      userId: user.id,
      listingId: listing.id,
      status: "SENT",
    },
    select: { channel: true, status: true, sentAt: true },
  });
  report.priorSent = priorSent;

  // Dry-run: never enqueue / never start worker.
  if (!args.confirmRealNotification) {
    report.dryRun = true;
    report.wouldSend =
      priorSent.length === 0 &&
      Boolean(token) &&
      Expo.isExpoPushToken(token) &&
      health.redis === "available";
    report.message =
      "Dry-run only. Pass --confirm-real-notification to send a real notification.";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (health.redis !== "available") {
    console.error("ABORT: Redis unavailable — will not enqueue");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!token || !Expo.isExpoPushToken(token)) {
    console.error("Test kullanıcısında Expo Push Token yok veya geçersiz");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (priorSent.length > 0) {
    console.error("ABORT: prior SENT NotificationLog exists for this user+listing");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  await prisma.userFilter.updateMany({
    where: { userId: user.id, isActive: true },
    data: { isActive: false },
  });

  let smokeFilter = await prisma.userFilter.findFirst({
    where: { userId: user.id, name: SMOKE_FILTER_NAME },
  });

  if (!smokeFilter) {
    smokeFilter = await prisma.userFilter.create({
      data: {
        userId: user.id,
        name: SMOKE_FILTER_NAME,
        category: listing.category ?? "Vasıta > Otomobil",
        brand: "Honda",
        series: "Civic",
        minDealScore: 70,
        notifyPush: true,
        notifyTelegram: Boolean(user.telegramChatId?.trim()),
        notifyWhatsapp: false,
        isActive: true,
      },
    });
  } else {
    smokeFilter = await prisma.userFilter.update({
      where: { id: smokeFilter.id },
      data: {
        category: listing.category ?? "Vasıta > Otomobil",
        brand: listing.brand ?? "Honda",
        series: listing.series ?? "Civic",
        minDealScore: 70,
        notifyPush: true,
        notifyTelegram: Boolean(user.telegramChatId?.trim()),
        isActive: true,
      },
    });
  }

  report.filter = {
    id: smokeFilter.id,
    name: smokeFilter.name,
    brand: smokeFilter.brand,
    series: smokeFilter.series,
    minDealScore: smokeFilter.minDealScore,
  };

  const matchOk = listingMatchesFilter(
    {
      category: listing.category,
      brand: listing.brand,
      model: listing.model,
      series: listing.series,
      trim: listing.trim,
      year: listing.year,
      mileage: listing.mileage,
      price: listing.price,
      city: listing.city,
      district: listing.district,
      fuelType: listing.fuelType,
      transmission: listing.transmission,
      sellerType: listing.sellerType,
      title: listing.title,
      description: listing.description,
      dealScore: listing.dealScore,
    },
    smokeFilter,
  );
  report.filterMatch = matchOk;
  if (!matchOk) {
    await prisma.userFilter.update({
      where: { id: smokeFilter.id },
      data: { isActive: false },
    });
    console.error("ABORT: listingMatchesFilter false");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  await redisDel(`notified:${user.id}:${listing.id}`).catch(() => undefined);

  const worker = startNotificationWorker();
  try {
    console.log("=== MATCH + ENQUEUE #1 ===");
    await filterMatchingService.matchListingWithFilters(listing.id);

    let logs = await prisma.notificationLog.findMany({
      where: { userId: user.id, listingId: listing.id },
      orderBy: { sentAt: "asc" },
      select: {
        id: true,
        channel: true,
        status: true,
        reason: true,
        sentAt: true,
      },
    });
    for (let i = 0; i < 30 && !logs.some((l) => l.status === "SENT" || l.status === "FAILED" || l.status === "SKIPPED"); i += 1) {
      await sleep(1000);
      logs = await prisma.notificationLog.findMany({
        where: { userId: user.id, listingId: listing.id },
        orderBy: { sentAt: "asc" },
        select: {
          id: true,
          channel: true,
          status: true,
          reason: true,
          sentAt: true,
        },
      });
    }

    report.notificationLogsAfterFirst = logs;
    report.expoResult =
      logs.find((l) => l.channel === "PUSH")?.status ?? "NO_LOG";
    report.telegramResult = user.telegramChatId?.trim()
      ? logs.find((l) => l.channel === "TELEGRAM")?.status ?? "NO_LOG"
      : "SKIPPED (no telegram chat id)";

    console.log("=== MATCH + ENQUEUE #2 (dedup) ===");
    await filterMatchingService.matchListingWithFilters(listing.id);
    await sleep(2000);
    const afterDedup = await prisma.notificationLog.findMany({
      where: { userId: user.id, listingId: listing.id, status: "SENT" },
    });
    report.dedupSentCount = afterDedup.length;

    const feed = await dealService.getUserMatchedDeals(user.id, { limit: 50 });
    report.feedContainsListing = feed.deals.some((d) => d.id === listing.id);
    try {
      report.dealDetail = await dealService.getUserDealById(user.id, listing.id);
    } catch (error) {
      report.detailError =
        error instanceof Error ? error.message : String(error);
    }
  } finally {
    await worker.close();
    await closeNotificationQueue();
    await prisma.userFilter.updateMany({
      where: { userId: user.id, name: SMOKE_FILTER_NAME },
      data: { isActive: false },
    });
    report.filtersDeactivated = true;
  }

  console.log("\n=== SMOKE REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupSmokeResources();
  });
