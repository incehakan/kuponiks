import type { ScrapeOutcome } from "../scraper/scheduler/scrape-outcome.js";
import type {
  CoverageCapabilityStatus,
  EffectiveMonitorStatus,
  PlatformCoverageResult,
  ProviderReliability,
  RuntimeAvailability,
} from "./coverage-types.js";
import {
  DEFAULT_RELIABILITY_THRESHOLDS,
  type ProviderReliabilityThresholds,
} from "./provider-reliability-config.js";

export interface ProviderAttempt {
  at: string;
  outcome: ScrapeOutcome;
  rawCount: number;
}

export interface ProviderWindowMetrics {
  attempts: number;
  successCount: number;
  emptyCount: number;
  failureCount: number;
  totalRaw: number;
  avgRaw: number;
  lastNonEmptyAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveEmpty: number;
  consecutiveNonEmpty: number;
  consecutiveFailure: number;
  failureRatio: number;
  emptyRatio: number;
  nonEmptyCount: number;
}

export interface ProviderReliabilityState {
  reliability: ProviderReliability;
  attempts: ProviderAttempt[];
  updatedAt: string;
}

export const USER_LABELS: Record<EffectiveMonitorStatus, string> = {
  ACTIVE: "Aktif",
  LIMITED: "Sınırlı",
  NO_DATA: "Şu anda veri alınamıyor",
  UNAVAILABLE: "Geçici olarak kullanılamıyor",
  UNSUPPORTED: "Bu arama desteklenmiyor",
};

export function userLabelForEffective(
  status: EffectiveMonitorStatus,
): string {
  return USER_LABELS[status];
}

export function userStatusForEffective(
  status: EffectiveMonitorStatus,
): PlatformCoverageResult["userStatus"] {
  if (status === "UNSUPPORTED") {
    return "unsupported";
  }
  if (status === "UNAVAILABLE") {
    return "unavailable";
  }
  if (status === "ACTIVE") {
    return "active";
  }
  return "limited";
}

export function emptyReliabilityState(): ProviderReliabilityState {
  return {
    reliability: "UNKNOWN",
    attempts: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function summarizeWindow(
  attempts: ProviderAttempt[],
  windowSize = DEFAULT_RELIABILITY_THRESHOLDS.windowSize,
): ProviderWindowMetrics {
  const window = attempts.slice(-windowSize);
  let successCount = 0;
  let emptyCount = 0;
  let failureCount = 0;
  let totalRaw = 0;
  let lastNonEmptyAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let lastFailureAt: string | null = null;
  let nonEmptyCount = 0;

  for (const row of window) {
    totalRaw += Math.max(0, row.rawCount);
    if (row.outcome === "success") {
      successCount += 1;
      lastSuccessAt = row.at;
    } else if (row.outcome === "empty") {
      emptyCount += 1;
    } else {
      failureCount += 1;
      lastFailureAt = row.at;
    }
    if (row.rawCount > 0) {
      nonEmptyCount += 1;
      lastNonEmptyAt = row.at;
    }
  }

  let consecutiveEmpty = 0;
  let consecutiveNonEmpty = 0;
  let consecutiveFailure = 0;
  for (let i = window.length - 1; i >= 0; i -= 1) {
    const row = window[i]!;
    if (row.rawCount <= 0 && row.outcome !== "failure") {
      if (consecutiveNonEmpty === 0 && consecutiveFailure === 0) {
        consecutiveEmpty += 1;
      } else {
        break;
      }
    } else if (row.outcome === "failure") {
      if (consecutiveEmpty === 0 && consecutiveNonEmpty === 0) {
        consecutiveFailure += 1;
      } else {
        break;
      }
    } else if (row.rawCount > 0) {
      if (consecutiveEmpty === 0 && consecutiveFailure === 0) {
        consecutiveNonEmpty += 1;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const attemptsCount = window.length;
  return {
    attempts: attemptsCount,
    successCount,
    emptyCount,
    failureCount,
    totalRaw,
    avgRaw: attemptsCount === 0 ? 0 : totalRaw / attemptsCount,
    lastNonEmptyAt,
    lastSuccessAt,
    lastFailureAt,
    consecutiveEmpty,
    consecutiveNonEmpty,
    consecutiveFailure,
    failureRatio: attemptsCount === 0 ? 0 : failureCount / attemptsCount,
    emptyRatio: attemptsCount === 0 ? 0 : emptyCount / attemptsCount,
    nonEmptyCount,
  };
}

function looksNoData(
  metrics: ProviderWindowMetrics,
  t: ProviderReliabilityThresholds,
): boolean {
  return (
    metrics.attempts >= t.noDataMinAttempts &&
    metrics.failureRatio <= t.noDataMaxFailureRatio &&
    metrics.emptyRatio >= t.noDataMinEmptyRatio &&
    metrics.nonEmptyCount === 0
  );
}

function looksHealthy(
  metrics: ProviderWindowMetrics,
  t: ProviderReliabilityThresholds,
): boolean {
  return (
    metrics.attempts >= t.healthyMinAttempts &&
    metrics.failureRatio <= t.healthyMaxFailureRatio &&
    metrics.nonEmptyCount >= t.healthyMinNonEmpty
  );
}

function looksFailing(
  metrics: ProviderWindowMetrics,
  t: ProviderReliabilityThresholds,
): boolean {
  return (
    metrics.attempts >= t.failingMinAttempts &&
    metrics.failureRatio >= t.failingMinFailureRatio
  );
}

function classifyFresh(
  metrics: ProviderWindowMetrics,
  t: ProviderReliabilityThresholds,
): ProviderReliability {
  if (metrics.attempts < t.minAttemptsUnknown) {
    return "UNKNOWN";
  }
  if (looksFailing(metrics, t)) {
    return "FAILING";
  }
  if (looksNoData(metrics, t)) {
    return "NO_DATA";
  }
  if (looksHealthy(metrics, t)) {
    return "HEALTHY";
  }
  return "DEGRADED";
}

/**
 * Window-based reliability with hysteresis.
 * One empty does not drop HEALTHY; one non-empty does not promote NO_DATA to HEALTHY.
 */
export function classifyReliability(
  attempts: ProviderAttempt[],
  previous: ProviderReliability = "UNKNOWN",
  thresholds: ProviderReliabilityThresholds = DEFAULT_RELIABILITY_THRESHOLDS,
): ProviderReliability {
  const metrics = summarizeWindow(attempts, thresholds.windowSize);
  if (metrics.attempts === 0) {
    return "UNKNOWN";
  }

  if (previous === "HEALTHY") {
    if (looksFailing(metrics, thresholds)) {
      return metrics.nonEmptyCount > 0 ? "DEGRADED" : "FAILING";
    }
    if (
      metrics.consecutiveEmpty >= thresholds.healthyDropConsecutiveEmpty &&
      metrics.nonEmptyCount === 0
    ) {
      return "NO_DATA";
    }
    if (
      metrics.consecutiveEmpty >= thresholds.healthyDropConsecutiveEmpty &&
      metrics.nonEmptyCount > 0
    ) {
      return "DEGRADED";
    }
    return "HEALTHY";
  }

  if (previous === "NO_DATA") {
    if (looksFailing(metrics, thresholds)) {
      return "FAILING";
    }
    if (metrics.consecutiveNonEmpty >= thresholds.recoveryToHealthyNonEmpty) {
      return "HEALTHY";
    }
    if (metrics.consecutiveNonEmpty >= thresholds.recoveryToDegradedNonEmpty) {
      return "DEGRADED";
    }
    return "NO_DATA";
  }

  if (previous === "FAILING") {
    if (metrics.consecutiveNonEmpty >= thresholds.recoveryToHealthyNonEmpty) {
      return "HEALTHY";
    }
    if (metrics.consecutiveNonEmpty >= thresholds.recoveryToDegradedNonEmpty) {
      return "DEGRADED";
    }
    if (
      looksNoData(metrics, thresholds) &&
      metrics.consecutiveFailure === 0
    ) {
      return "NO_DATA";
    }
    if (looksFailing(metrics, thresholds)) {
      return "FAILING";
    }
    return metrics.attempts < thresholds.minAttemptsUnknown
      ? "FAILING"
      : "DEGRADED";
  }

  if (previous === "DEGRADED") {
    if (looksFailing(metrics, thresholds)) {
      return "FAILING";
    }
    if (metrics.consecutiveNonEmpty >= thresholds.recoveryToHealthyNonEmpty) {
      return "HEALTHY";
    }
    if (looksNoData(metrics, thresholds)) {
      return "NO_DATA";
    }
    if (
      metrics.consecutiveEmpty >= thresholds.healthyDropConsecutiveEmpty &&
      metrics.nonEmptyCount === 0
    ) {
      return "NO_DATA";
    }
    return "DEGRADED";
  }

  return classifyFresh(metrics, thresholds);
}

export function pushBoundedAttempt(
  attempts: ProviderAttempt[],
  next: ProviderAttempt,
  windowSize = DEFAULT_RELIABILITY_THRESHOLDS.windowSize,
): ProviderAttempt[] {
  const appended = [...attempts, next];
  return appended.length > windowSize
    ? appended.slice(appended.length - windowSize)
    : appended;
}

export function applyProviderResult(
  state: ProviderReliabilityState | null,
  input: { outcome: ScrapeOutcome; rawCount: number; at?: string },
  thresholds: ProviderReliabilityThresholds = DEFAULT_RELIABILITY_THRESHOLDS,
): { previous: ProviderReliability; next: ProviderReliabilityState } {
  const previous = state?.reliability ?? "UNKNOWN";
  const at = input.at ?? new Date().toISOString();
  const attempts = pushBoundedAttempt(
    state?.attempts ?? [],
    { at, outcome: input.outcome, rawCount: input.rawCount },
    thresholds.windowSize,
  );
  const reliability = classifyReliability(attempts, previous, thresholds);
  return {
    previous,
    next: {
      reliability,
      attempts,
      updatedAt: at,
    },
  };
}

export function resolveEffectiveStatus(input: {
  coverage: CoverageCapabilityStatus;
  availability: RuntimeAvailability;
  schedulable: boolean;
  reliability: ProviderReliability;
}): EffectiveMonitorStatus {
  if (input.coverage === "UNSUPPORTED") {
    return "UNSUPPORTED";
  }
  if (input.availability === "UNAVAILABLE" || !input.schedulable) {
    return "UNAVAILABLE";
  }
  if (input.reliability === "FAILING") {
    return "UNAVAILABLE";
  }
  if (input.reliability === "NO_DATA") {
    return "NO_DATA";
  }
  if (input.reliability === "HEALTHY") {
    if (input.coverage === "PARTIAL" || input.availability === "DEGRADED") {
      return "LIMITED";
    }
    return "ACTIVE";
  }
  if (
    input.reliability === "DEGRADED" ||
    input.coverage === "PARTIAL" ||
    input.availability === "DEGRADED"
  ) {
    return "LIMITED";
  }
  return "LIMITED";
}

export interface EffectiveSourceCounts {
  activeSourceCount: number;
  limitedSourceCount: number;
  unavailableSourceCount: number;
  totalSourceCount: number;
  statusLabel: string;
  limitedLabel: string | null;
  unavailableLabel: string | null;
}

export function countEffectiveSources(
  rows: Array<{ effectiveStatus: EffectiveMonitorStatus }>,
): EffectiveSourceCounts {
  let activeSourceCount = 0;
  let limitedSourceCount = 0;
  let unavailableSourceCount = 0;
  for (const row of rows) {
    if (row.effectiveStatus === "ACTIVE") {
      activeSourceCount += 1;
    } else if (
      row.effectiveStatus === "LIMITED" ||
      row.effectiveStatus === "NO_DATA"
    ) {
      limitedSourceCount += 1;
    } else if (row.effectiveStatus === "UNAVAILABLE") {
      unavailableSourceCount += 1;
    }
  }
  return {
    activeSourceCount,
    limitedSourceCount,
    unavailableSourceCount,
    totalSourceCount: rows.length,
    statusLabel: `${activeSourceCount} kaynak aktif`,
    limitedLabel:
      limitedSourceCount > 0 ? `${limitedSourceCount} kaynak sınırlı` : null,
    unavailableLabel:
      unavailableSourceCount > 0
        ? `${unavailableSourceCount} kaynak geçici kullanılamıyor`
        : null,
  };
}

export type ReliabilityMap = Partial<
  Record<PlatformCoverageResult["platform"], ProviderReliability>
>;

export function applyReliabilityToCoverage(
  rows: PlatformCoverageResult[],
  reliability: ReliabilityMap = {},
): PlatformCoverageResult[] {
  return rows.map((row) => {
    const rel = reliability[row.platform] ?? row.reliability ?? "UNKNOWN";
    const effectiveStatus = resolveEffectiveStatus({
      coverage: row.coverage,
      availability: row.availability,
      schedulable: row.schedulable,
      reliability: rel,
    });
    return {
      ...row,
      reliability: rel,
      effectiveStatus,
      userStatus: userStatusForEffective(effectiveStatus),
      userLabel: userLabelForEffective(effectiveStatus),
    };
  });
}

export function attemptsFromOutcomes(
  outcomes: Array<{ outcome: ScrapeOutcome; rawCount: number }>,
  startedAt = "2026-08-18T00:00:00.000Z",
): ProviderAttempt[] {
  return outcomes.map((row, index) => ({
    at: new Date(Date.parse(startedAt) + index * 300_000).toISOString(),
    outcome: row.outcome,
    rawCount: row.rawCount,
  }));
}
