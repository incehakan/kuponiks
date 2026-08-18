import type { ScrapePlatform } from "../../queues/scraper.queue.js";
import { redisGet, redisIncrBy, redisSetEx } from "../../lib/redis.js";
import type { ScrapeOutcome } from "./scrape-outcome.js";

const STATS_PREFIX = "scheduler:v2:stats:";
const STATS_TTL_SECONDS = 48 * 60 * 60;

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function metricKey(day: string, metric: string): string {
  return `${STATS_PREFIX}${day}:${metric}`;
}

async function bump(metric: string, by = 1): Promise<void> {
  const key = metricKey(dayKey(), metric);
  await redisIncrBy(key, by, STATS_TTL_SECONDS);
}

/** Records per-platform scrape cycle counters (observability only). */
export async function recordScrapeOpsStats(input: {
  platform: ScrapePlatform;
  outcome: ScrapeOutcome;
  created: number;
  updated: number;
  matchesQueued: number;
  circuitSkipped?: boolean;
  rawCount?: number;
}): Promise<void> {
  const p = input.platform;
  await bump(`${p}:cycles`);
  await bump(`${p}:created`, input.created);
  await bump(`${p}:updated`, input.updated);
  await bump(`${p}:matchesQueued`, input.matchesQueued);
  await bump(`${p}:outcome:${input.outcome}`);
  if (input.circuitSkipped) {
    await bump(`${p}:circuitSkipped`);
  }
  if (input.rawCount != null) {
    await redisSetEx(
      `scheduler:v2:last:${p}`,
      JSON.stringify({
        at: new Date().toISOString(),
        rawCount: input.rawCount,
        outcome: input.outcome,
      }),
      STATS_TTL_SECONDS,
    );
  }
}

export async function recordSchedulerCycleOpsStats(input: {
  queued: number;
  circuitSkipped: number;
}): Promise<void> {
  await bump("scheduler:cycles");
  await bump("scheduler:queued", input.queued);
  await bump("scheduler:circuitSkipped", input.circuitSkipped);
}

export async function readDayOpsStats(
  day = dayKey(),
): Promise<Record<string, number>> {
  const metrics = [
    "scheduler:cycles",
    "scheduler:queued",
    "scheduler:circuitSkipped",
    "arabam:cycles",
    "arabam:created",
    "arabam:updated",
    "arabam:matchesQueued",
    "arabam:outcome:success",
    "arabam:outcome:empty",
    "arabam:outcome:failure",
    "letgo:cycles",
    "letgo:created",
    "letgo:updated",
    "letgo:matchesQueued",
    "letgo:outcome:success",
    "letgo:outcome:empty",
    "letgo:outcome:failure",
    "sahibinden:cycles",
    "sahibinden:created",
    "sahibinden:updated",
    "sahibinden:matchesQueued",
    "sahibinden:outcome:success",
    "sahibinden:outcome:empty",
    "sahibinden:outcome:failure",
    "sahibinden:circuitSkipped",
  ];
  const pairs = await Promise.all(
    metrics.map(async (metric) => {
      const raw = await redisGet(metricKey(day, metric));
      return [metric, raw ? Number.parseInt(raw, 10) || 0 : 0] as const;
    }),
  );
  return Object.fromEntries(pairs);
}
