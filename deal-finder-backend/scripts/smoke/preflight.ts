/**
 * Read-only notification preflight (no enqueue / no real push).
 *
 * Usage: npm run smoke:preflight
 *    or: npx tsx scripts/smoke/preflight.ts
 */
import { Expo } from "expo-server-sdk";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { getNotificationOpsHealth } from "../../src/notifications/notification-ops-health.js";
import { cleanupSmokeResources } from "./_shared.js";

function maskToken(value: string | null | undefined): string {
  if (!value?.trim()) return "(yok)";
  const v = value.trim();
  if (v.length <= 10) return "****";
  return `${v.slice(0, 18)}...${v.slice(-4)}`;
}

function maskChat(value: string | null | undefined): string {
  if (!value?.trim()) return "(yok)";
  const v = value.trim();
  if (v.length <= 4) return "****";
  return `****${v.slice(-4)}`;
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true,
      fullName: true,
      phoneNumber: true,
      expoPushToken: true,
      telegramChatId: true,
      subscriptionPlan: true,
      filters: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          category: true,
          brand: true,
          series: true,
          trim: true,
          minDealScore: true,
          notifyPush: true,
          notifyTelegram: true,
        },
        take: 10,
      },
      _count: { select: { filters: true, notifications: true } },
    },
  });

  console.log("=== USERS ===");
  console.log("count=", users.length);
  for (const u of users) {
    const token = u.expoPushToken?.trim() ?? "";
    console.log(
      JSON.stringify(
        {
          id: u.id,
          fullName: u.fullName,
          phoneMasked: maskChat(u.phoneNumber),
          plan: u.subscriptionPlan,
          expoTokenMasked: maskToken(u.expoPushToken),
          expoTokenValidFormat: token ? Expo.isExpoPushToken(token) : false,
          telegramMasked: maskChat(u.telegramChatId),
          activeFilters: u.filters.length,
          totalFilters: u._count.filters,
          notificationLogs: u._count.notifications,
          filters: u.filters,
        },
        null,
        2,
      ),
    );
  }

  console.log("\n=== ENV (presence only) ===");
  console.log({
    EXPO_ACCESS_TOKEN: env.EXPO_ACCESS_TOKEN ? "configured" : "missing",
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN ? "configured" : "missing",
    REDIS_URL: env.REDIS_URL ? "configured" : "missing",
    DEAL_SCORE_THRESHOLD: env.DEAL_SCORE_THRESHOLD ?? "(default)",
    NODE_ENV: env.NODE_ENV,
  });

  const ready = await prisma.listing.findMany({
    where: {
      platform: { not: "mock" },
      marketStatus: "READY",
      brand: { not: null },
      series: { not: null },
      dealScore: { gt: 0 },
    },
    orderBy: [{ dealScore: "desc" }, { lastSeenAt: "desc" }],
    take: 10,
    select: {
      id: true,
      externalId: true,
      platform: true,
      brand: true,
      series: true,
      trim: true,
      year: true,
      mileage: true,
      price: true,
      dealScore: true,
      marketMedianPrice: true,
      priceAdvantagePct: true,
      marketSampleSize: true,
      marketConfidence: true,
      title: true,
    },
  });

  console.log("\n=== READY LISTINGS (sample) ===");
  console.log("count=", ready.length);
  for (const l of ready) {
    console.log(
      JSON.stringify({
        id: l.id,
        externalId: l.externalId,
        platform: l.platform,
        brand: l.brand,
        series: l.series,
        trim: l.trim,
        year: l.year,
        mileage: l.mileage,
        price: l.price,
        dealScore: l.dealScore,
        median: l.marketMedianPrice,
        adv: l.priceAdvantagePct,
        sample: l.marketSampleSize,
        conf: l.marketConfidence,
        title: l.title.slice(0, 80),
      }),
    );
  }

  console.log("\n=== OPS HEALTH ===");
  const health = await getNotificationOpsHealth({ probeRedis: true });
  console.log(JSON.stringify(health, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupSmokeResources();
  });
