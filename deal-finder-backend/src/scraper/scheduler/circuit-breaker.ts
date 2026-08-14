import {
  redisGet,
  redisSetEx,
} from "../../lib/redis.js";
import type { ScrapePlatform } from "../../queues/scraper.queue.js";

const CIRCUIT_PREFIX = "scheduler:v2:circuit:";
const FAILURE_THRESHOLD = 3;
const BASE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

export interface PlatformCircuitState {
  failures: number;
  lastFailureAt: number;
  nextAllowedAt: number;
}

function circuitKey(platform: ScrapePlatform): string {
  return `${CIRCUIT_PREFIX}${platform}`;
}

export async function getPlatformCircuit(
  platform: ScrapePlatform,
): Promise<PlatformCircuitState | null> {
  const raw = await redisGet(circuitKey(platform));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PlatformCircuitState;
    if (
      typeof parsed.failures !== "number" ||
      typeof parsed.nextAllowedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function isPlatformCircuitOpen(
  platform: ScrapePlatform,
  nowMs = Date.now(),
): Promise<boolean> {
  const state = await getPlatformCircuit(platform);
  if (!state) {
    return false;
  }
  return state.nextAllowedAt > nowMs;
}

export async function recordPlatformSuccess(
  platform: ScrapePlatform,
): Promise<void> {
  await redisSetEx(circuitKey(platform), JSON.stringify({
    failures: 0,
    lastFailureAt: 0,
    nextAllowedAt: 0,
  } satisfies PlatformCircuitState), 60 * 60);
}

export async function recordPlatformFailure(
  platform: ScrapePlatform,
  nowMs = Date.now(),
): Promise<PlatformCircuitState> {
  const prev = (await getPlatformCircuit(platform)) ?? {
    failures: 0,
    lastFailureAt: 0,
    nextAllowedAt: 0,
  };
  const failures = prev.failures + 1;
  const exp = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * 2 ** Math.max(0, failures - FAILURE_THRESHOLD),
  );
  const nextAllowedAt =
    failures >= FAILURE_THRESHOLD ? nowMs + exp : 0;
  const state: PlatformCircuitState = {
    failures,
    lastFailureAt: nowMs,
    nextAllowedAt,
  };
  await redisSetEx(circuitKey(platform), JSON.stringify(state), 6 * 60 * 60);
  return state;
}

export function shouldTripCircuitOnEmpty(platform: ScrapePlatform): boolean {
  return platform === "sahibinden";
}
