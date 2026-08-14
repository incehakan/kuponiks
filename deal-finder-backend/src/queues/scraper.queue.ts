import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import {
  createBullmqConnection,
  isRedisAvailable,
} from "../lib/redis.js";
import { toBullmqJobId } from "../lib/bullmq-job-id.js";

/** BullMQ queue name for periodic marketplace scrape jobs. */
export const SCRAPER_QUEUE_NAME = "scraper-queue";

/**
 * Supported scrape platforms / sources.
 */
export type ScrapePlatform =
  | "sahibinden"
  | "arabam"
  | "letgo"
  | "hepsiemlak"
  | "generic";

/**
 * Job payload for a single scrape run.
 */
export interface ScraperJobData {
  /** Marketplace / source to scan. */
  platform: ScrapePlatform;
  /** Optional category path filter (e.g. "Vasıta > Otomobil"). */
  category?: string;
  /** Optional city filter. */
  city?: string;
  /** Optional free-text search keyword (from trigger-test). */
  query?: string;
  /** Max listings to fetch in this run. */
  limit?: number;
  /** Trigger source for observability. */
  triggeredBy?: "cron" | "manual" | "bootstrap";
  /** Canonical query key for logs (no secrets). */
  queryKey?: string;
}

/**
 * Default job options for scrape work.
 */
export const scraperJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 5_000,
  },
  removeOnComplete: 200,
  removeOnFail: 1_000,
};

/** Default platforms enrolled in the periodic scan. */
const DEFAULT_PERIODIC_PLATFORMS: ScrapePlatform[] = [
  "sahibinden",
  "arabam",
  "letgo",
  "hepsiemlak",
];

/** Repeat every 15 minutes. */
const PERIODIC_SCRAPE_EVERY_MS = 15 * 60 * 1000;

let queueConnection: Redis | null = null;
let scraperQueue: Queue<ScraperJobData> | null = null;

function getScraperQueue(): Queue<ScraperJobData> | null {
  if (!isRedisAvailable()) {
    return null;
  }

  if (!scraperQueue) {
    queueConnection = createBullmqConnection();
    scraperQueue = new Queue<ScraperJobData>(SCRAPER_QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: scraperJobOptions,
    });
  }

  return scraperQueue;
}

function slugForJobId(value: string | undefined): string {
  const raw = (value ?? "none").trim().toLocaleLowerCase("tr-TR");
  return raw
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9ğüşıöç\-]+/gi, "")
    .slice(0, 48) || "none";
}

/**
 * Builds a stable-enough job id so the same keyword/platform pair is not
 * duplicated within a single 15-minute schedule slot.
 */
function buildScraperJobId(data: ScraperJobData): string {
  if (data.triggeredBy === "cron" || data.triggeredBy === "bootstrap") {
    const slot = Math.floor(Date.now() / PERIODIC_SCRAPE_EVERY_MS);
    return toBullmqJobId(
      [
        "scrape",
        data.platform,
        slugForJobId(data.query),
        slugForJobId(data.city),
        String(slot),
      ].join("-"),
    );
  }

  return toBullmqJobId(`scrape-${data.platform}-${Date.now()}`);
}

/**
 * Enqueues a one-off scrape job.
 * Never throws — Redis/BullMQ failures are logged and skipped.
 */
export async function enqueueScrapeJob(
  data: ScraperJobData,
  options: { jobId?: string; priority?: number } = {},
): Promise<string | undefined> {
  const queue = getScraperQueue();
  if (!queue) {
    console.warn(
      "[BullMQ] Redis yok — scraper job atlandı (HTTP API etkilenmez)",
    );
    return undefined;
  }

  try {
    const job = await queue.add("scrape-platform", data, {
      ...scraperJobOptions,
      jobId: options.jobId ?? buildScraperJobId(data),
      ...(options.priority != null ? { priority: options.priority } : {}),
    });

    console.log(
      `[SCRAPER QUEUE] Job eklendi → id=${job.id}, platform=${data.platform}, query=${data.query ?? "-"}, by=${data.triggeredBy ?? "manual"}`,
    );
    return job.id;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scraper enqueue error";
    // Duplicate jobId in the same slot is expected under concurrent ticks.
    if (message.toLowerCase().includes("jobId") || message.includes("already exists")) {
      console.warn(`[SCRAPER QUEUE] Job zaten kuyrukta — atlandı: ${message}`);
      return undefined;
    }
    console.error(`Failed to enqueue scraper job: ${message}`);
    return undefined;
  }
}

/**
 * @deprecated Prefer `ScraperScheduler` (active UserFilter keywords).
 * Kept for ops that want a blind platform heartbeat without keyword filters.
 */
export async function ensurePeriodicScrapeJobs(): Promise<void> {
  const queue = getScraperQueue();
  if (!queue) {
    console.warn(
      "[SCRAPER QUEUE] Redis yok — periyodik platform heartbeat kaydedilmedi",
    );
    return;
  }

  try {
    for (const platform of DEFAULT_PERIODIC_PLATFORMS) {
      const schedulerId = `scrape-periodic-heartbeat-${platform}`;

      await queue.upsertJobScheduler(
        schedulerId,
        { every: PERIODIC_SCRAPE_EVERY_MS },
        {
          name: "scrape-platform",
          data: {
            platform,
            limit: 50,
            triggeredBy: "cron",
          },
          opts: {
            ...scraperJobOptions,
          },
        },
      );

      console.log(
        `[SCRAPER QUEUE] Platform heartbeat hazır → platform=${platform}, every=${PERIODIC_SCRAPE_EVERY_MS}ms`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown periodic scraper schedule error";
    console.error(`[SCRAPER QUEUE] Heartbeat kurulumu başarısız: ${message}`);
  }
}

/**
 * Gracefully closes the scraper queue and its Redis connection.
 */
export async function closeScraperQueue(): Promise<void> {
  try {
    if (scraperQueue) {
      await scraperQueue.close();
      scraperQueue = null;
    }
    if (queueConnection) {
      await queueConnection.quit();
      queueConnection = null;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown scraper queue close error";
    console.error(`Failed to close scraper queue: ${message}`);
    try {
      queueConnection?.disconnect();
    } catch {
      // ignore
    }
    queueConnection = null;
    scraperQueue = null;
  }
}
