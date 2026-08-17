import { prisma } from "../../lib/prisma.js";
import { redisSetNxEx } from "../../lib/redis.js";
import { enqueueScrapeJob } from "../../queues/scraper.queue.js";
import { isPlatformCircuitOpen } from "./circuit-breaker.js";
import {
  buildScrapeJobId,
  groupActiveFilters,
  type CanonicalQueryGroup,
  type SchedulerFilterInput,
} from "./canonical-query.js";
import { recordSchedulerCycle } from "./scheduler-state.js";
import { recordSchedulerCycleOpsStats } from "./scheduler-ops-stats.js";
import { redisIncrBy } from "../../lib/redis.js";

const CYCLE_LOCK_KEY = "scheduler:v2:cycle-lock";

export interface SchedulerCycleResult {
  skipped: boolean;
  skipReason?: "lock" | "disabled" | "no_filters";
  activeFilters: number;
  queryGroups: number;
  queued: number;
  dedupSkipped: number;
  circuitSkipped: number;
  platforms: Record<string, number>;
  durationMs: number;
  groups: CanonicalQueryGroup[];
}

export function isSchedulerAutoStartEnabled(): boolean {
  const raw = process.env.SCHEDULER_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return false;
  }
  return true;
}

function lockTtlSeconds(): number {
  const raw = process.env.SCHEDULER_LOCK_TTL_SECONDS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 90;
  return Number.isFinite(parsed) && parsed >= 15 ? parsed : 90;
}

export async function loadActiveSchedulerFilters(): Promise<
  SchedulerFilterInput[]
> {
  const rows = await prisma.userFilter.findMany({
    where: { isActive: true },
    select: {
      id: true,
      isActive: true,
      category: true,
      subcategory: true,
      brand: true,
      series: true,
      trim: true,
      city: true,
      district: true,
      minYear: true,
      maxYear: true,
      minPrice: true,
      maxPrice: true,
      minMileage: true,
      maxMileage: true,
      fuelType: true,
      transmission: true,
      sellerType: true,
      keywords: true,
      user: { select: { subscriptionPlan: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    isActive: row.isActive,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand,
    series: row.series,
    trim: row.trim,
    city: row.city,
    district: row.district,
    minYear: row.minYear,
    maxYear: row.maxYear,
    minPrice: row.minPrice,
    maxPrice: row.maxPrice,
    minMileage: row.minMileage,
    maxMileage: row.maxMileage,
    fuelType: row.fuelType,
    transmission: row.transmission,
    sellerType: row.sellerType,
    keywords: row.keywords,
    plan: row.user.subscriptionPlan,
  }));
}

export async function runSchedulerCycle(options: {
  enqueue?: boolean;
  acquireLock?: boolean;
  nowMs?: number;
  filters?: SchedulerFilterInput[];
} = {}): Promise<SchedulerCycleResult> {
  const startedAt = Date.now();
  const enqueue = options.enqueue !== false;
  const acquireLock = options.acquireLock ?? enqueue;

  if (acquireLock && enqueue) {
    const lock = await redisSetNxEx(
      CYCLE_LOCK_KEY,
      String(process.pid),
      lockTtlSeconds(),
    );
    if (lock !== "OK") {
      return {
        skipped: true,
        skipReason: "lock",
        activeFilters: 0,
        queryGroups: 0,
        queued: 0,
        dedupSkipped: 0,
        circuitSkipped: 0,
        platforms: {},
        durationMs: Date.now() - startedAt,
        groups: [],
      };
    }
  }

  const filters = options.filters ?? (await loadActiveSchedulerFilters());
  const groups = groupActiveFilters(filters);
  const platforms: Record<string, number> = {};
  let queued = 0;
  let dedupSkipped = 0;
  let circuitSkipped = 0;

  if (filters.length === 0) {
    const durationMs = Date.now() - startedAt;
    recordSchedulerCycle({
      durationMs,
      queued: 0,
      dedupSkipped: 0,
      activeFilterCount: 0,
      queryGroupCount: 0,
    });
    console.log(
      `[SCHEDULER] activeFilters=0 queryGroups=0 queued=0 dedupSkipped=0 platforms= durationMs=${durationMs}`,
    );
    return {
      skipped: false,
      skipReason: "no_filters",
      activeFilters: 0,
      queryGroups: 0,
      queued: 0,
      dedupSkipped: 0,
      circuitSkipped: 0,
      platforms,
      durationMs,
      groups: [],
    };
  }

  if (enqueue) {
    for (const group of groups) {
      if (await isPlatformCircuitOpen(group.platform, options.nowMs)) {
        circuitSkipped += 1;
        void redisIncrBy(
          `scheduler:v2:stats:${new Date().toISOString().slice(0, 10)}:${group.platform}:circuitSkipped`,
          1,
          48 * 60 * 60,
        );
        continue;
      }
      const jobId = await enqueueScrapeJob(
        {
          platform: group.platform,
          query: group.query,
          category: group.category,
          ...(group.city ? { city: group.city } : {}),
          limit: 50,
          triggeredBy: "cron",
          queryKey: group.key,
          scrapeUrl: group.scrapeUrl,
          appliedCriteria: group.appliedCriteria,
          deferredCriteria: group.deferredCriteria,
        },
        {
          jobId: buildScrapeJobId({
            platform: group.platform,
            queryHash: group.queryHash,
            intervalMs: group.intervalMs,
            ...(options.nowMs != null ? { nowMs: options.nowMs } : {}),
          }),
          priority: group.priority,
        },
      );
      if (jobId) {
        queued += 1;
        platforms[group.platform] = (platforms[group.platform] ?? 0) + 1;
      } else {
        dedupSkipped += 1;
      }
    }
  } else {
    for (const group of groups) {
      platforms[group.platform] = (platforms[group.platform] ?? 0) + 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  recordSchedulerCycle({
    durationMs,
    queued: enqueue ? queued : 0,
    dedupSkipped,
    activeFilterCount: filters.length,
    queryGroupCount: groups.length,
  });

  if (enqueue) {
    void recordSchedulerCycleOpsStats({
      queued,
      circuitSkipped,
    });
  }

  const platformSummary = Object.entries(platforms)
    .map(([name, count]) => `${name}:${count}`)
    .join(",");
  console.log(
    `[SCHEDULER] activeFilters=${filters.length} queryGroups=${groups.length} queued=${enqueue ? queued : 0} dedupSkipped=${dedupSkipped} circuitSkipped=${circuitSkipped} platforms=${platformSummary} durationMs=${durationMs}`,
  );

  return {
    skipped: false,
    activeFilters: filters.length,
    queryGroups: groups.length,
    queued: enqueue ? queued : 0,
    dedupSkipped,
    circuitSkipped,
    platforms,
    durationMs,
    groups,
  };
}
