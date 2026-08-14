import {
  isSchedulerAutoStartEnabled,
  runSchedulerCycle,
} from "./scheduler/scheduler.service.js";
import { setSchedulerEnabled } from "./scheduler/scheduler-state.js";
import {
  groupActiveFilters,
  platformsForCategory,
  type CanonicalQueryGroup,
} from "./scheduler/canonical-query.js";

export { platformsForCategory } from "./scheduler/canonical-query.js";
export {
  isSchedulerAutoStartEnabled,
  runSchedulerCycle,
} from "./scheduler/scheduler.service.js";

/** Default poll: 5 minutes (VIP scrape cadence). Override with SCHEDULER_POLL_SECONDS. */
export const DEFAULT_SCRAPER_INTERVAL_MS = 5 * 60 * 1000;

export interface ScrapeTarget {
  platform: CanonicalQueryGroup["platform"];
  query: string;
  city?: string;
  category: string;
}

function resolvePollIntervalMs(): number {
  const secondsRaw = process.env.SCHEDULER_POLL_SECONDS?.trim();
  if (secondsRaw) {
    const seconds = Number.parseInt(secondsRaw, 10);
    if (Number.isFinite(seconds) && seconds >= 60) {
      return seconds * 1000;
    }
  }
  const raw = process.env.SCRAPER_SCHEDULE_INTERVAL_MS?.trim();
  if (!raw) {
    return DEFAULT_SCRAPER_INTERVAL_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 60_000) {
    console.warn(
      `[SCRAPER SCHEDULER] Geçersiz SCRAPER_SCHEDULE_INTERVAL_MS="${raw}" — ${DEFAULT_SCRAPER_INTERVAL_MS}ms kullanılıyor`,
    );
    return DEFAULT_SCRAPER_INTERVAL_MS;
  }
  return parsed;
}

/**
 * Periodically loads active user filters and enqueues grouped scrape jobs.
 */
export class ScraperScheduler {
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(intervalMs: number = resolvePollIntervalMs()) {
    this.intervalMs = intervalMs;
  }

  /**
   * Starts the interval loop. Does not run a bootstrap tick (no catch-up flood).
   */
  start(): void {
    if (this.timer) {
      return;
    }
    if (!isSchedulerAutoStartEnabled()) {
      setSchedulerEnabled(false);
      console.log("[SCRAPER SCHEDULER] Auto-start kapalı (test/disabled)");
      return;
    }

    setSchedulerEnabled(true);
    console.log(
      `[SCRAPER SCHEDULER] V2 aktif (poll=${this.intervalMs}ms, bootstrap tick yok)`,
    );

    this.timer = setInterval(() => {
      void this.tick("cron");
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    setSchedulerEnabled(false);
    console.log("[SCRAPER SCHEDULER] Durduruldu");
  }

  async tick(reason: "bootstrap" | "cron" | "manual"): Promise<void> {
    if (this.tickInFlight) {
      console.warn(
        `[SCRAPER SCHEDULER] Önceki tur bitmedi — ${reason} atlandı`,
      );
      return;
    }

    this.tickInFlight = true;
    try {
      await runSchedulerCycle({ enqueue: true, acquireLock: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown scheduler error";
      console.error(`[SCRAPER SCHEDULER] Tur başarısız (${reason}): ${message}`);
    } finally {
      this.tickInFlight = false;
    }
  }
}

export function startScraperScheduler(
  intervalMs?: number,
): ScraperScheduler {
  const scheduler = new ScraperScheduler(intervalMs);
  scheduler.start();
  return scheduler;
}

/** @deprecated Use groupActiveFilters / runSchedulerCycle. */
export async function collectActiveFilterScrapeTargets(): Promise<
  ScrapeTarget[]
> {
  const { loadActiveSchedulerFilters } = await import(
    "./scheduler/scheduler.service.js"
  );
  const filters = await loadActiveSchedulerFilters();
  return groupActiveFilters(filters).map((group) => ({
    platform: group.platform,
    query: group.query,
    category: group.category,
    ...(group.city ? { city: group.city } : {}),
  }));
}

export async function enqueueActiveFilterScrapes(): Promise<{
  filterCount: number;
  targetCount: number;
  enqueued: number;
}> {
  const result = await runSchedulerCycle({ enqueue: true, acquireLock: true });
  return {
    filterCount: result.activeFilters,
    targetCount: result.queryGroups,
    enqueued: result.queued,
  };
}
