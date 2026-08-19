import type { ScrapePlatform } from "../queues/scraper.queue.js";
import { redisGet, redisSetEx } from "../lib/redis.js";
import type { ScrapeOutcome } from "../scraper/scheduler/scrape-outcome.js";
import {
  DEFAULT_RELIABILITY_THRESHOLDS,
  reliabilityRedisKey,
} from "./provider-reliability-config.js";
import {
  applyProviderResult,
  emptyReliabilityState,
  summarizeWindow,
  type ProviderReliabilityState,
  type ReliabilityMap,
} from "./provider-reliability.js";

export interface ReliabilityStore {
  get(platform: ScrapePlatform): Promise<ProviderReliabilityState | null>;
  set(platform: ScrapePlatform, state: ProviderReliabilityState): Promise<void>;
}

function parseState(raw: string | null): ProviderReliabilityState | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ProviderReliabilityState;
    if (!parsed || !Array.isArray(parsed.attempts)) {
      return null;
    }
    const windowSize = DEFAULT_RELIABILITY_THRESHOLDS.windowSize;
    return {
      reliability: parsed.reliability ?? "UNKNOWN",
      attempts: parsed.attempts.slice(-windowSize),
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function createMemoryReliabilityStore(
  seed: Partial<Record<ScrapePlatform, ProviderReliabilityState>> = {},
): ReliabilityStore {
  const map = new Map<ScrapePlatform, ProviderReliabilityState>();
  for (const [platform, state] of Object.entries(seed) as Array<
    [ScrapePlatform, ProviderReliabilityState]
  >) {
    map.set(platform, state);
  }
  return {
    async get(platform) {
      return map.get(platform) ?? null;
    },
    async set(platform, state) {
      map.set(platform, {
        ...state,
        attempts: state.attempts.slice(
          -DEFAULT_RELIABILITY_THRESHOLDS.windowSize,
        ),
      });
    },
  };
}

export const redisReliabilityStore: ReliabilityStore = {
  async get(platform) {
    return parseState(await redisGet(reliabilityRedisKey(platform)));
  },
  async set(platform, state) {
    const bounded: ProviderReliabilityState = {
      ...state,
      attempts: state.attempts.slice(
        -DEFAULT_RELIABILITY_THRESHOLDS.windowSize,
      ),
    };
    await redisSetEx(
      reliabilityRedisKey(platform),
      JSON.stringify(bounded),
      DEFAULT_RELIABILITY_THRESHOLDS.ttlSeconds,
    );
  },
};

export async function loadReliabilityMap(
  platforms: ScrapePlatform[] = ["arabam", "otoplus", "letgo", "sahibinden"],
  store: ReliabilityStore = redisReliabilityStore,
): Promise<ReliabilityMap> {
  const entries = await Promise.all(
    platforms.map(async (platform) => {
      const state = await store.get(platform);
      return [platform, state?.reliability ?? "UNKNOWN"] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function loadReliabilityStates(
  platforms: ScrapePlatform[] = ["arabam", "otoplus", "letgo", "sahibinden"],
  store: ReliabilityStore = redisReliabilityStore,
): Promise<Record<string, ProviderReliabilityState>> {
  const out: Record<string, ProviderReliabilityState> = {};
  for (const platform of platforms) {
    out[platform] = (await store.get(platform)) ?? emptyReliabilityState();
  }
  return out;
}

export function logProviderTransition(
  platform: string,
  previous: string,
  next: ProviderReliabilityState,
): void {
  if (previous === next.reliability) {
    return;
  }
  const metrics = summarizeWindow(next.attempts);
  console.log(`[PROVIDER_STATE] ${platform} ${previous} -> ${next.reliability}`);
  console.log(
    `[PROVIDER] platform=${platform} reliability=${next.reliability} attempts=${metrics.attempts} empty=${metrics.emptyCount} failures=${metrics.failureCount} lastNonEmptyAt=${metrics.lastNonEmptyAt ?? "null"}`,
  );
}

export async function recordProviderResult(input: {
  platform: ScrapePlatform;
  outcome: ScrapeOutcome;
  rawCount: number;
  at?: string;
  store?: ReliabilityStore;
}): Promise<ProviderReliabilityState> {
  const store = input.store ?? redisReliabilityStore;
  const current = await store.get(input.platform);
  const payload: { outcome: ScrapeOutcome; rawCount: number; at?: string } = {
    outcome: input.outcome,
    rawCount: input.rawCount,
  };
  if (input.at) {
    payload.at = input.at;
  }
  const { previous, next } = applyProviderResult(current, payload);
  await store.set(input.platform, next);
  logProviderTransition(input.platform, previous, next);
  return next;
}
