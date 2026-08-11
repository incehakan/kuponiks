import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { createBullmqConnection } from "../lib/redis.js";
import {
  SCRAPER_QUEUE_NAME,
  type ScraperJobData,
} from "../queues/scraper.queue.js";
import { resolveScraperAdapter } from "./adapters/index.js";
import { runAdapterPipeline } from "./scraper.manager.js";
import { scraperService } from "./scraper.service.js";

/**
 * BullMQ worker that consumes scraper-queue jobs, runs platform adapters,
 * normalizes payloads, and persists via ScraperService.
 */
export class ScraperWorker {
  private readonly worker: Worker<ScraperJobData>;
  private readonly connection: Redis;

  constructor() {
    this.connection = createBullmqConnection();
    this.worker = new Worker<ScraperJobData>(
      SCRAPER_QUEUE_NAME,
      async (job: Job<ScraperJobData>) => this.process(job),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );

    this.worker.on("completed", (job) => {
      console.log(`ScraperWorker: job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(
        `ScraperWorker: job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });

    this.worker.on("error", (error) => {
      console.warn(`ScraperWorker error: ${error.message}`);
    });
  }

  private async process(job: Job<ScraperJobData>): Promise<void> {
    const { platform, category, city, limit, triggeredBy, query } = job.data;
    const keyword = query?.trim();

    console.log(
      `[SCRAPER WORKER] ── Tarama başladı ── job=${job.id} platform=${platform} keyword=${keyword ?? "(yok)"} by=${triggeredBy ?? "manual"}`,
    );

    const adapter = resolveScraperAdapter(platform);
    if (!adapter) {
      console.warn(
        `[SCRAPER WORKER] Adaptör yok — platform=${platform}, job=${job.id}`,
      );
      return;
    }

    // Keyword → adapter.search({ query }); shared manager handles errors + normalize.
    const { rawCount, normalized, error } = await runAdapterPipeline(adapter, {
      ...(category ? { category } : {}),
      ...(city ? { city } : {}),
      ...(limit != null ? { limit } : {}),
      ...(keyword ? { query: keyword } : {}),
    });

    if (error) {
      console.error(
        `[SCRAPER WORKER] Adaptör hatası — job=${job.id}: ${error.message}`,
      );
    }

    console.log(
      `[SCRAPER WORKER] Ham ilan=${rawCount} → normalize edilen=${normalized.length} (platform=${platform}, keyword=${keyword ?? "-"})`,
    );

    for (const item of normalized.slice(0, 5)) {
      const discount =
        item.marketAveragePrice > 0
          ? (
              ((item.marketAveragePrice - item.price) / item.marketAveragePrice) *
              100
            ).toFixed(1)
          : "?";
      console.log(
        `[SCRAPER WORKER] aday → "${item.title}" | fiyat=${item.price} | piyasa=${item.marketAveragePrice} | indirim≈%${discount}`,
      );
    }

    const summary = await scraperService.ingestNormalizedBatch(normalized);

    const dealHits = summary.results.filter(
      (r) => r.status === "created" && r.isDeal,
    );

    if (dealHits.length > 0) {
      console.log("★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★");
      console.log(
        `[KELEPİR EŞLEŞME] ${dealHits.length} ilan skor eşiğini geçti (platform=${platform}, keyword=${keyword ?? "-"})`,
      );
      for (const hit of dealHits) {
        if (hit.status !== "created") {
          continue;
        }
        console.log(
          `[KELEPİR EŞLEŞME] skor=${hit.dealScore} | ${hit.listing.price} TL (piyasa=${hit.listing.marketAveragePrice ?? "-"}) | "${hit.listing.title}" | id=${hit.listing.id}`,
        );
      }
      console.log("★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★");
    } else {
      console.log(
        `[SCRAPER WORKER] Kelepir eşleşme yok — created=${summary.created}, deals=${summary.deals}, duplicates=${summary.duplicates}`,
      );
    }

    console.log(
      `[SCRAPER WORKER] ── Tarama bitti ── job=${job.id} created=${summary.created} duplicates=${summary.duplicates} skipped=${summary.skipped} deals(kelepir)=${summary.deals}`,
    );
  }

  async close(): Promise<void> {
    try {
      await this.worker.close();
      await this.connection.quit();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown scraper worker close error";
      console.error(`Failed to close ScraperWorker: ${message}`);
      try {
        this.connection.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

export function startScraperWorker(): ScraperWorker {
  return new ScraperWorker();
}
