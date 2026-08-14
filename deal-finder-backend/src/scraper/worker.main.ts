import { disconnectPrisma } from "../lib/prisma.js";
import {
  disconnectRedis,
  probeRedisConnection,
} from "../lib/redis.js";
import { warnMissingProductionExpoAccessToken } from "../notifications/notification-ops-health.js";
import { closeListingMatchQueue } from "../queues/listing.queue.js";
import {
  startListingMatchWorker,
  type ListingMatchWorker,
} from "../queues/listing-match.worker.js";
import { closeNotificationQueue } from "../queues/notification.queue.js";
import {
  startNotificationWorker,
  type NotificationWorker,
} from "../queues/notification.worker.js";
import { closeScraperQueue } from "../queues/scraper.queue.js";
import {
  startScraperScheduler,
  type ScraperScheduler,
} from "./scraper.scheduler.js";
import {
  startScraperWorker,
  type ScraperWorker,
} from "./scraper.worker.js";

let isShuttingDown = false;

/**
 * Production worker entrypoint (PM2 `scraper-worker`):
 * - BullMQ consumers: scraper, listing-match, notification
 * - Filter-based scrape scheduler (every 15 minutes by default)
 */
async function start(): Promise<void> {
  let scraperWorker: ScraperWorker | null = null;
  let listingMatchWorker: ListingMatchWorker | null = null;
  let notificationWorker: NotificationWorker | null = null;
  let scheduler: ScraperScheduler | null = null;

  try {
    warnMissingProductionExpoAccessToken();
    const redisOk = await probeRedisConnection();
    if (!redisOk) {
      console.error(
        "[scraper-worker] Redis ulaşılamıyor — worker başlatılamadı.",
      );
      process.exit(1);
    }

    scraperWorker = startScraperWorker();
    listingMatchWorker = startListingMatchWorker();
    notificationWorker = startNotificationWorker();
    scheduler = startScraperScheduler();

    console.log("[scraper-worker] ScraperWorker → scraper-queue");
    console.log("[scraper-worker] ListingMatchWorker → listing-match-queue");
    console.log("[scraper-worker] NotificationWorker → notification-queue");
    console.log("[scraper-worker] ScraperScheduler V2 aktif (UserFilter.isActive, bootstrap tick yok)");

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      console.log(`[scraper-worker] ${signal} — graceful shutdown...`);

      try {
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
        await closeScraperQueue();
        await closeListingMatchQueue();
        await closeNotificationQueue();
        await disconnectPrisma();
        await disconnectRedis();
        console.log("[scraper-worker] Shutdown tamam.");
        process.exit(0);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown shutdown error";
        console.error(`[scraper-worker] Shutdown hatası: ${message}`);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker startup error";
    console.error(`[scraper-worker] Başlatılamadı: ${message}`);
    process.exit(1);
  }
}

void start();
