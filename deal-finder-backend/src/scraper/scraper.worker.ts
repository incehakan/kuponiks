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
import {
  recordPlatformFailure,
  recordPlatformSuccess,
  shouldTripCircuitOnEmpty,
} from "./scheduler/circuit-breaker.js";
import { classifyScrapeOutcome } from "./scheduler/scrape-outcome.js";
import { recordScrapeOpsStats } from "./scheduler/scheduler-ops-stats.js";

function workerConcurrency(): number {
  const raw = process.env.SCRAPER_GLOBAL_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
}

function jobTimeoutMs(): number {
  const raw = process.env.SCRAPER_JOB_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 180_000;
  return Number.isFinite(parsed) && parsed >= 30_000 ? parsed : 180_000;
}

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
        concurrency: workerConcurrency(),
        limiter: {
          max: 1,
          duration: 8_000,
        },
        lockDuration: jobTimeoutMs(),
      },
    );

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
    const {
      platform,
      category,
      city,
      limit,
      triggeredBy,
      query,
      queryKey,
      scrapeUrl,
      appliedCriteria,
      deferredCriteria,
    } = job.data;
    const keyword = query?.trim();
    const startedAt = Date.now();

    const adapter = resolveScraperAdapter(platform);
    if (!adapter) {
      console.warn(
        `[SCRAPE] platform=${platform} queryKey=${queryKey ?? "-"} outcome=failure reason=no_adapter job=${job.id}`,
      );
      return;
    }

    console.log(
      `[SCRAPE_QUERY] platform=${platform} queryKey=${queryKey ?? "-"} applied=${appliedCriteria?.join(",") ?? "-"} deferred=${deferredCriteria?.join(",") ?? "-"} url=${scrapeUrl ?? "adapter-built"}`,
    );

    const { rawCount, normalized, error } = await runAdapterPipeline(adapter, {
      ...(category ? { category } : {}),
      ...(city ? { city } : {}),
      ...(keyword ? { query: keyword } : {}),
      ...(limit != null ? { limit } : {}),
      ...(scrapeUrl ? { scrapeUrl } : {}),
    });

    const outcome = classifyScrapeOutcome({
      platform,
      rawCount,
      error: error ?? null,
    });

    if (error) {
      console.error(
        `[SCRAPE] platform=${platform} queryKey=${queryKey ?? "-"} outcome=failure error=${error.message}`,
      );
      await recordPlatformFailure(platform);
    } else if (rawCount === 0 && shouldTripCircuitOnEmpty(platform)) {
      await recordPlatformFailure(platform);
    } else {
      await recordPlatformSuccess(platform);
    }

    const summary = await scraperService.ingestNormalizedBatch(normalized);
    // Create-path only: listing-match queue enqueue count (NOT notification queue).
    const matchesQueued = summary.results.filter(
      (result) => result.status === "created" && result.enqueuedForMatch,
    ).length;

    await recordScrapeOpsStats({
      platform,
      outcome,
      created: summary.created,
      updated: summary.updated,
      matchesQueued,
      rawCount,
    });

    console.log(
      `[SCRAPE] platform=${platform} queryKey=${queryKey ?? "-"} outcome=${outcome} raw=${rawCount} normalized=${normalized.length} created=${summary.created} updated=${summary.updated} matchesQueued=${matchesQueued} durationMs=${Date.now() - startedAt} by=${triggeredBy ?? "manual"}`,
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
