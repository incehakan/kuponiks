import { prisma } from "../lib/prisma.js";
import {
  enqueueScrapeJob,
  type ScrapePlatform,
} from "../queues/scraper.queue.js";

/** Default: every 15 minutes. Override with SCRAPER_SCHEDULE_INTERVAL_MS. */
export const DEFAULT_SCRAPER_INTERVAL_MS = 15 * 60 * 1000;

const ALL_PLATFORMS: readonly ScrapePlatform[] = [
  "sahibinden",
  "arabam",
  "letgo",
  "hepsiemlak",
] as const;

export interface ScrapeTarget {
  platform: ScrapePlatform;
  query: string;
  city?: string;
  category: string;
}

/**
 * Maps a user filter category to the marketplace adapters that should run.
 */
export function platformsForCategory(category: string): ScrapePlatform[] {
  const c = category.toLocaleLowerCase("tr-TR");

  if (
    c.includes("emlak") ||
    c.includes("konut") ||
    c.includes("daire") ||
    c.includes("arsa") ||
    c.includes("işyeri") ||
    c.includes("isyeri")
  ) {
    return ["hepsiemlak", "sahibinden"];
  }

  if (
    c.includes("vasıta") ||
    c.includes("vasita") ||
    c.includes("otomobil") ||
    c.includes("motosiklet") ||
    c.includes("araba") ||
    c.includes("suv") ||
    c.includes("ticari")
  ) {
    return ["arabam", "sahibinden", "letgo"];
  }

  if (
    c.includes("elektronik") ||
    c.includes("telefon") ||
    c.includes("bilgisayar") ||
    c.includes("tablet")
  ) {
    return ["sahibinden", "letgo"];
  }

  return [...ALL_PLATFORMS];
}

function normalizeCity(city: string | null | undefined): string | undefined {
  const value = city?.trim();
  if (!value) {
    return undefined;
  }
  const lower = value.toLocaleLowerCase("tr-TR");
  if (
    lower === "all" ||
    lower === "tüm türkiye" ||
    lower === "tum turkiye" ||
    lower === "türkiye" ||
    lower === "turkiye"
  ) {
    return undefined;
  }
  return value;
}

function resolveQueries(filter: {
  category: string;
  keywords: string[];
}): string[] {
  const fromKeywords = filter.keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  if (fromKeywords.length > 0) {
    return fromKeywords;
  }

  const category = filter.category.trim();
  return category.length > 0 ? [category] : [];
}

/**
 * Reads active UserFilter rows and builds deduplicated scrape targets
 * (platform × keyword × city).
 */
export async function collectActiveFilterScrapeTargets(): Promise<
  ScrapeTarget[]
> {
  const filters = await prisma.userFilter.findMany({
    where: { isActive: true },
    select: {
      category: true,
      city: true,
      keywords: true,
    },
  });

  const unique = new Map<string, ScrapeTarget>();

  for (const filter of filters) {
    const queries = resolveQueries(filter);
    const platforms = platformsForCategory(filter.category);
    const city = normalizeCity(filter.city);

    for (const query of queries) {
      for (const platform of platforms) {
        const key = [
          platform,
          query.toLocaleLowerCase("tr-TR"),
          city?.toLocaleLowerCase("tr-TR") ?? "",
          filter.category.toLocaleLowerCase("tr-TR"),
        ].join("|");

        if (unique.has(key)) {
          continue;
        }

        const target: ScrapeTarget = {
          platform,
          query,
          category: filter.category,
        };
        if (city) {
          target.city = city;
        }
        unique.set(key, target);
      }
    }
  }

  return [...unique.values()];
}

/**
 * Enqueues one scrape job per active-filter target for the current tick.
 */
export async function enqueueActiveFilterScrapes(): Promise<{
  filterCount: number;
  targetCount: number;
  enqueued: number;
}> {
  const filterCount = await prisma.userFilter.count({
    where: { isActive: true },
  });
  const targets = await collectActiveFilterScrapeTargets();
  let enqueued = 0;

  for (const target of targets) {
    const jobId = await enqueueScrapeJob({
      platform: target.platform,
      query: target.query,
      category: target.category,
      ...(target.city ? { city: target.city } : {}),
      limit: 50,
      triggeredBy: "cron",
    });
    if (jobId) {
      enqueued += 1;
    }
  }

  return { filterCount, targetCount: targets.length, enqueued };
}

function resolveIntervalMs(): number {
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
 * Periodically loads active user filters and enqueues platform scrape jobs.
 */
export class ScraperScheduler {
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(intervalMs: number = resolveIntervalMs()) {
    this.intervalMs = intervalMs;
  }

  /**
   * Runs an immediate tick, then repeats on the configured interval.
   */
  start(): void {
    if (this.timer) {
      return;
    }

    console.log(
      `[SCRAPER SCHEDULER] Aktif UserFilter taraması başlatıldı (every=${this.intervalMs}ms)`,
    );

    void this.tick("bootstrap");
    this.timer = setInterval(() => {
      void this.tick("cron");
    }, this.intervalMs);

    // Allow process to exit even if interval is open (PM2 handles lifecycle).
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[SCRAPER SCHEDULER] Durduruldu");
  }

  private async tick(reason: "bootstrap" | "cron"): Promise<void> {
    if (this.tickInFlight) {
      console.warn(
        `[SCRAPER SCHEDULER] Önceki tur bitmedi — ${reason} atlandı`,
      );
      return;
    }

    this.tickInFlight = true;
    const startedAt = Date.now();

    try {
      const result = await enqueueActiveFilterScrapes();
      console.log(
        `[SCRAPER SCHEDULER] ${reason} → aktifFiltre=${result.filterCount}, hedef=${result.targetCount}, kuyruk=${result.enqueued} (${Date.now() - startedAt}ms)`,
      );
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
