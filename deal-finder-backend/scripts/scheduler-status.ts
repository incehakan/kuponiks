/**
 * Read-only Scheduler V2 ops status. No scrape / enqueue / notify.
 *
 * Usage: npm run scheduler:status
 */
import "dotenv/config";
import { NotificationStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { probeRedisConnection } from "../src/lib/redis.js";
import {
  getPlatformCircuit,
} from "../src/scraper/scheduler/circuit-breaker.js";
import { isSchedulerAutoStartEnabled, loadActiveSchedulerFilters } from "../src/scraper/scheduler/scheduler.service.js";
import { readDayOpsStats } from "../src/scraper/scheduler/scheduler-ops-stats.js";
import { groupActiveFilters } from "../src/scraper/scheduler/canonical-query.js";

const HONDA = {
  OR: [
    {
      brand: { equals: "Honda", mode: "insensitive" as const },
      series: { contains: "Civic", mode: "insensitive" as const },
    },
    { title: { contains: "Honda Civic", mode: "insensitive" as const } },
  ],
};

async function main(): Promise<void> {
  await probeRedisConnection();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filters = await loadActiveSchedulerFilters();
  const groups = groupActiveFilters(filters);
  const dayStats = await readDayOpsStats();

  const [
    listingTotal,
    hondaTotal,
    readyHonda,
    matchTotal,
    hondaMatches,
    sent,
    skipped,
    failed,
    newListings24h,
    newReady24h,
    newMatches24h,
    sent24h,
    skipped24h,
    failed24h,
    arabamCircuit,
    letgoCircuit,
    sahibindenCircuit,
  ] = await Promise.all([
    prisma.listing.count(),
    prisma.listing.count({ where: HONDA }),
    prisma.listing.count({ where: { ...HONDA, marketStatus: "READY" } }),
    prisma.userListingMatch.count(),
    prisma.userListingMatch.count({ where: { listing: HONDA } }),
    prisma.notificationLog.count({ where: { status: NotificationStatus.SENT } }),
    prisma.notificationLog.count({
      where: { status: NotificationStatus.SKIPPED },
    }),
    prisma.notificationLog.count({
      where: { status: NotificationStatus.FAILED },
    }),
    prisma.listing.count({ where: { firstSeenAt: { gte: since } } }),
    prisma.listing.count({
      where: { firstSeenAt: { gte: since }, marketStatus: "READY" },
    }),
    prisma.userListingMatch.count({ where: { matchedAt: { gte: since } } }),
    prisma.notificationLog.count({
      where: {
        status: NotificationStatus.SENT,
        sentAt: { gte: since },
      },
    }),
    prisma.notificationLog.count({
      where: {
        status: NotificationStatus.SKIPPED,
        sentAt: { gte: since },
      },
    }),
    prisma.notificationLog.count({
      where: {
        status: NotificationStatus.FAILED,
        sentAt: { gte: since },
      },
    }),
    getPlatformCircuit("arabam"),
    getPlatformCircuit("letgo"),
    getPlatformCircuit("sahibinden"),
  ]);

  const now = Date.now();
  const circuitView = (name: string, state: Awaited<ReturnType<typeof getPlatformCircuit>>) => {
    if (!state) {
      return { platform: name, failures: 0, open: false, nextAllowedAt: null };
    }
    return {
      platform: name,
      failures: state.failures,
      open: state.nextAllowedAt > now,
      nextAllowedAt:
        state.nextAllowedAt > 0
          ? new Date(state.nextAllowedAt).toISOString()
          : null,
    };
  };

  console.log(
    JSON.stringify(
      {
        scheduler: {
          enabledEnv: isSchedulerAutoStartEnabled(),
          pollSeconds: Number(process.env.SCHEDULER_POLL_SECONDS ?? "300"),
          lockTtlSeconds: Number(process.env.SCHEDULER_LOCK_TTL_SECONDS ?? "90"),
          globalConcurrency: Number(
            process.env.SCRAPER_GLOBAL_CONCURRENCY ?? "1",
          ),
          activeFilters: filters.length,
          queryGroups: groups.length,
          note: "In-process lastCycle* lives on scraper-worker only; this CLI shows env + DB/Redis ops.",
        },
        inventory: {
          listingTotal,
          hondaCivicTotal: hondaTotal,
          readyHondaCivic: readyHonda,
          userListingMatchTotal: matchTotal,
          hondaCivicMatches: hondaMatches,
          notificationSent: sent,
          notificationSkipped: skipped,
          notificationFailed: failed,
        },
        last24h: {
          newListings: newListings24h,
          newReadyListings: newReady24h,
          newMatches: newMatches24h,
          notificationsSent: sent24h,
          notificationsSkipped: skipped24h,
          notificationsFailed: failed24h,
          redisOps: {
            schedulerCycles: dayStats["scheduler:cycles"] ?? 0,
            queuedJobs: dayStats["scheduler:queued"] ?? 0,
            circuitSkipped: dayStats["scheduler:circuitSkipped"] ?? 0,
            arabam: {
              cycles: dayStats["arabam:cycles"] ?? 0,
              created: dayStats["arabam:created"] ?? 0,
              updated: dayStats["arabam:updated"] ?? 0,
              matchesQueued: dayStats["arabam:matchesQueued"] ?? 0,
              success: dayStats["arabam:outcome:success"] ?? 0,
              empty: dayStats["arabam:outcome:empty"] ?? 0,
              failure: dayStats["arabam:outcome:failure"] ?? 0,
            },
            letgo: {
              cycles: dayStats["letgo:cycles"] ?? 0,
              created: dayStats["letgo:created"] ?? 0,
              empty: dayStats["letgo:outcome:empty"] ?? 0,
              success: dayStats["letgo:outcome:success"] ?? 0,
              failure: dayStats["letgo:outcome:failure"] ?? 0,
            },
            sahibinden: {
              cycles: dayStats["sahibinden:cycles"] ?? 0,
              empty: dayStats["sahibinden:outcome:empty"] ?? 0,
              failure: dayStats["sahibinden:outcome:failure"] ?? 0,
              circuitSkipped: dayStats["sahibinden:circuitSkipped"] ?? 0,
            },
          },
          redisOpsNote:
            "Redis day counters start after this observability deploy; before that they may be 0.",
        },
        circuits: [
          circuitView("arabam", arabamCircuit),
          circuitView("letgo", letgoCircuit),
          circuitView("sahibinden", sahibindenCircuit),
        ],
        expoAccessToken: process.env.EXPO_ACCESS_TOKEN?.trim()
          ? "configured"
          : "missing",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
    process.exit(process.exitCode ?? 0);
  });
