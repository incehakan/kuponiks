import type {
  ProviderReliability,
  RuntimeAvailability,
} from "./coverage-types.js";
import {
  defaultAvailabilityMap,
  evaluateCoverage,
} from "./coverage-engine.js";
import { loadAvailabilityMap } from "./platform-availability.js";
import {
  applyReliabilityToCoverage,
  summarizeWindow,
  type ReliabilityMap,
} from "./provider-reliability.js";
import {
  lastAttemptAtFromAttempts,
  shouldEnqueueDegradedProbe,
} from "./provider-probe-cadence.js";
import {
  loadReliabilityMap,
  loadReliabilityStates,
  type ReliabilityStore,
} from "./provider-reliability-store.js";
import { buildSearchIntentFromFilter } from "./search-intent-builder.js";

const HEALTH_PLATFORMS = ["arabam", "letgo", "sahibinden"] as const;

const hondaCivicSample = {
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  minYear: 2016,
  maxYear: 2018,
  city: "Tüm Türkiye",
  minDealScore: 50,
  notifyPush: true,
};

export function providerHealthLabel(
  availability: RuntimeAvailability | undefined,
  reliability: ProviderReliability | undefined,
): string {
  if (availability === "UNAVAILABLE") {
    return "unavailable";
  }
  switch (reliability) {
    case "HEALTHY":
      return "healthy";
    case "NO_DATA":
      return "no_data";
    case "DEGRADED":
      return "degraded";
    case "FAILING":
      return "failing";
    default:
      return "unknown";
  }
}

export async function getProviderHealthSummary(options?: {
  store?: ReliabilityStore;
}): Promise<Record<string, string>> {
  const availability = await loadAvailabilityMap().catch(() =>
    defaultAvailabilityMap(),
  );
  const reliability: ReliabilityMap = await loadReliabilityMap(
    [...HEALTH_PLATFORMS],
    options?.store,
  ).catch(() => ({} as ReliabilityMap));
  const out: Record<string, string> = {};
  for (const platform of HEALTH_PLATFORMS) {
    out[platform] = providerHealthLabel(
      availability[platform]?.availability,
      reliability[platform],
    );
  }
  return out;
}

export async function buildProviderStatusReport(options?: {
  store?: ReliabilityStore;
}) {
  const availability = await loadAvailabilityMap().catch(() =>
    defaultAvailabilityMap(),
  );
  const reliabilityMap: ReliabilityMap = await loadReliabilityMap(
    [...HEALTH_PLATFORMS],
    options?.store,
  ).catch(() => ({} as ReliabilityMap));
  const states = await loadReliabilityStates(
    [...HEALTH_PLATFORMS],
    options?.store,
  );
  const intent = buildSearchIntentFromFilter(hondaCivicSample);
  const rows = applyReliabilityToCoverage(
    evaluateCoverage(intent, availability),
    reliabilityMap,
  );

  return HEALTH_PLATFORMS.map((platform) => {
    const state = states[platform]!;
    const metrics = summarizeWindow(state.attempts);
    const row = rows.find((item) => item.platform === platform);
    const lastAttemptAt = lastAttemptAtFromAttempts(state.attempts);
    const probe = shouldEnqueueDegradedProbe({
      reliability: state.reliability,
      lastAttemptAt,
    });
    return {
      platform,
      capability: row?.coverage ?? "FULL",
      availability: row?.availability ?? availability[platform]?.availability,
      reliability: state.reliability,
      effectiveStatus: row?.effectiveStatus,
      attempts: metrics.attempts,
      success: metrics.successCount,
      empty: metrics.emptyCount,
      failure: metrics.failureCount,
      avgRaw: metrics.avgRaw,
      lastNonEmptyAt: metrics.lastNonEmptyAt,
      nextProbeAt: probe.nextProbeAt,
      probeDue: probe.due,
    };
  });
}
