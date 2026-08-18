import type { ScrapePlatform } from "../queues/scraper.queue.js";
import { redisGet } from "../lib/redis.js";
import { getPlatformCircuit } from "../scraper/scheduler/circuit-breaker.js";
import { readDayOpsStats } from "../scraper/scheduler/scheduler-ops-stats.js";
import type {
  AvailabilityReason,
  PlatformRuntimeSnapshot,
  RuntimeAvailability,
} from "./coverage-types.js";
import type { AvailabilityMap } from "./coverage-engine.js";

const LAST_KEY_PREFIX = "scheduler:v2:last:";

export interface LastScrapeSnapshot {
  at: string;
  rawCount: number;
  outcome: string;
}

export function lastScrapeRedisKey(platform: ScrapePlatform): string {
  return `${LAST_KEY_PREFIX}${platform}`;
}

function parseLast(raw: string | null): LastScrapeSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as LastScrapeSnapshot;
    if (!parsed?.at || typeof parsed.rawCount !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Known production defaults when Redis has no scrape history yet.
 * Not completeness scores — runtime only.
 */
export const DEFAULT_RUNTIME_SNAPSHOT: Record<
  "arabam" | "letgo" | "sahibinden",
  Pick<PlatformRuntimeSnapshot, "availability" | "reason">
> = {
  arabam: { availability: "AVAILABLE", reason: "none" },
  letgo: { availability: "DEGRADED", reason: "empty" },
  sahibinden: { availability: "UNAVAILABLE", reason: "cloudflare" },
};

function classifyArabam(input: {
  success: number;
  empty: number;
  failure: number;
  last: LastScrapeSnapshot | null;
}): { availability: RuntimeAvailability; reason: AvailabilityReason } {
  if (input.last?.outcome === "success" || input.success > 0) {
    return { availability: "AVAILABLE", reason: "none" };
  }
  if (input.failure > 0 && input.success === 0) {
    return { availability: "DEGRADED", reason: "empty" };
  }
  return { ...DEFAULT_RUNTIME_SNAPSHOT.arabam };
}

function classifyLetgo(input: {
  success: number;
  empty: number;
  last: LastScrapeSnapshot | null;
}): { availability: RuntimeAvailability; reason: AvailabilityReason } {
  if (input.last?.outcome === "success" || input.success > 0) {
    return { availability: "AVAILABLE", reason: "none" };
  }
  if (input.empty > 0 || (input.last && input.last.rawCount === 0)) {
    return { availability: "DEGRADED", reason: "empty" };
  }
  return { ...DEFAULT_RUNTIME_SNAPSHOT.letgo };
}

function classifySahibinden(input: {
  circuitOpen: boolean;
  success: number;
  last: LastScrapeSnapshot | null;
}): { availability: RuntimeAvailability; reason: AvailabilityReason } {
  if (input.circuitOpen) {
    return { availability: "UNAVAILABLE", reason: "circuit_open" };
  }
  if (input.last?.outcome === "success" || input.success > 0) {
    return { availability: "AVAILABLE", reason: "none" };
  }
  return { ...DEFAULT_RUNTIME_SNAPSHOT.sahibinden };
}

export async function readLastScrapeSnapshot(
  platform: ScrapePlatform,
): Promise<LastScrapeSnapshot | null> {
  return parseLast(await redisGet(lastScrapeRedisKey(platform)));
}

export async function loadPlatformRuntimeSnapshots(): Promise<
  Record<"arabam" | "letgo" | "sahibinden", PlatformRuntimeSnapshot>
> {
  const [stats, arabamCircuit, letgoCircuit, sahibindenCircuit, arabamLast, letgoLast, sahibindenLast] =
    await Promise.all([
      readDayOpsStats(),
      getPlatformCircuit("arabam"),
      getPlatformCircuit("letgo"),
      getPlatformCircuit("sahibinden"),
      readLastScrapeSnapshot("arabam"),
      readLastScrapeSnapshot("letgo"),
      readLastScrapeSnapshot("sahibinden"),
    ]);

  const now = Date.now();
  const sahibindenOpen = Boolean(
    sahibindenCircuit && sahibindenCircuit.nextAllowedAt > now,
  );

  const arabam = classifyArabam({
    success: stats["arabam:outcome:success"] ?? 0,
    empty: stats["arabam:outcome:empty"] ?? 0,
    failure: stats["arabam:outcome:failure"] ?? 0,
    last: arabamLast,
  });
  const letgo = classifyLetgo({
    success: stats["letgo:outcome:success"] ?? 0,
    empty: stats["letgo:outcome:empty"] ?? 0,
    last: letgoLast,
  });
  const sahibinden = classifySahibinden({
    circuitOpen: sahibindenOpen,
    success: stats["sahibinden:outcome:success"] ?? 0,
    last: sahibindenLast,
  });

  return {
    arabam: {
      platform: "arabam",
      ...arabam,
      circuitOpen: Boolean(
        arabamCircuit && arabamCircuit.nextAllowedAt > now,
      ),
      lastSuccessAt: arabamLast?.outcome === "success" ? arabamLast.at : null,
      lastRawCount: arabamLast?.rawCount ?? null,
      lastOutcome: arabamLast?.outcome ?? null,
    },
    letgo: {
      platform: "letgo",
      ...letgo,
      circuitOpen: Boolean(letgoCircuit && letgoCircuit.nextAllowedAt > now),
      lastSuccessAt: letgoLast?.outcome === "success" ? letgoLast.at : null,
      lastRawCount: letgoLast?.rawCount ?? null,
      lastOutcome: letgoLast?.outcome ?? null,
    },
    sahibinden: {
      platform: "sahibinden",
      ...sahibinden,
      circuitOpen: sahibindenOpen,
      lastSuccessAt:
        sahibindenLast?.outcome === "success" ? sahibindenLast.at : null,
      lastRawCount: sahibindenLast?.rawCount ?? null,
      lastOutcome: sahibindenLast?.outcome ?? null,
    },
  };
}

export async function loadAvailabilityMap(): Promise<AvailabilityMap> {
  const snapshots = await loadPlatformRuntimeSnapshots();
  return {
    arabam: {
      availability: snapshots.arabam.availability,
      reason: snapshots.arabam.reason,
    },
    letgo: {
      availability: snapshots.letgo.availability,
      reason: snapshots.letgo.reason,
    },
    sahibinden: {
      availability: snapshots.sahibinden.availability,
      reason: snapshots.sahibinden.reason,
    },
  };
}
