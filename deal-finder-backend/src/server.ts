import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./lib/prisma.js";
import { disconnectRedis, probeRedisConnection } from "./lib/redis.js";
import { warnMissingProductionExpoAccessToken } from "./notifications/notification-ops-health.js";
import { closeListingMatchQueue } from "./queues/listing.queue.js";
import {
  startListingMatchWorker,
  type ListingMatchWorker,
} from "./queues/listing-match.worker.js";
import { closeNotificationQueue } from "./queues/notification.queue.js";
import {
  startNotificationWorker,
  type NotificationWorker,
} from "./queues/notification.worker.js";
import { closeScraperQueue } from "./queues/scraper.queue.js";
import {
  startScraperScheduler,
  type ScraperScheduler,
} from "./scraper/scraper.scheduler.js";
import {
  startScraperWorker,
  type ScraperWorker,
} from "./scraper/scraper.worker.js";

let isShuttingDown = false;

type ProcessRole = "api" | "worker" | "all";

/**
 * - production default: `api` (PM2 splits worker into scraper-worker)
 * - development default: `all` (single process for local DX)
 */
function resolveProcessRole(): ProcessRole {
  const raw = process.env.PROCESS_ROLE?.trim().toLowerCase();
  if (raw === "api" || raw === "worker" || raw === "all") {
    return raw;
  }
  return env.NODE_ENV === "production" ? "api" : "all";
}

/**
 * Starts the HTTP server and optionally co-located workers (dev / PROCESS_ROLE=all).
 * Production PM2 uses PROCESS_ROLE=api here and `dist/scraper/worker.main.js` for queues.
 */
async function start(): Promise<void> {
  const role = resolveProcessRole();
  let notificationWorker: NotificationWorker | null = null;
  let listingMatchWorker: ListingMatchWorker | null = null;
  let scraperWorker: ScraperWorker | null = null;
  let scheduler: ScraperScheduler | null = null;

  try {
    warnMissingProductionExpoAccessToken();
    const app = await buildApp();

    if (role === "worker") {
      app.log.error(
        "PROCESS_ROLE=worker ile server.ts çalıştırılmamalı. dist/scraper/worker.main.js kullanın.",
      );
      process.exit(1);
    }

    const shouldRunBackground = role === "all";
    // Coverage / reliability /health providers read Redis even on PROCESS_ROLE=api.
    const redisOk = await probeRedisConnection();

    if (shouldRunBackground && redisOk) {
      try {
        notificationWorker = startNotificationWorker();
        listingMatchWorker = startListingMatchWorker();
        scraperWorker = startScraperWorker();
        scheduler = startScraperScheduler();
        app.log.info("NotificationWorker is consuming notification-queue");
        app.log.info("ListingMatchWorker is consuming listing-match-queue");
        app.log.info("ScraperWorker is consuming scraper-queue");
        app.log.info("ScraperScheduler is watching active UserFilter rows");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown worker start error";
        app.log.warn(
          `Queue worker'lar başlatılamadı (${message}). HTTP API çalışmaya devam ediyor.`,
        );
        notificationWorker = null;
        listingMatchWorker = null;
        scraperWorker = null;
        scheduler = null;
      }
    } else if (shouldRunBackground && !redisOk) {
      app.log.warn(
        "Redis kapalı/ulaşılamıyor — BullMQ worker'lar devre dışı. /api/filters ve /api/deals etkilenmez.",
      );
    } else {
      app.log.info(
        `PROCESS_ROLE=${role} — HTTP API only (scraper-worker PM2 process handles queues/scheduler).`,
      );
    }

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      app.log.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        await app.close();
        scheduler?.stop();
        if (scraperWorker) {
          await scraperWorker.close();
        }
        if (listingMatchWorker) {
          await listingMatchWorker.close();
        }
        if (notificationWorker) {
          await notificationWorker.close();
        }
        await closeNotificationQueue();
        await closeListingMatchQueue();
        await closeScraperQueue();
        await disconnectPrisma();
        await disconnectRedis();
        app.log.info("Graceful shutdown completed.");
        process.exit(0);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown shutdown error";
        app.log.error(`Graceful shutdown failed: ${message}`);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`Server listening on port ${env.PORT} (role=${role})`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown startup error";
    console.error(`Failed to start server: ${message}`);
    process.exit(1);
  }
}

void start();
