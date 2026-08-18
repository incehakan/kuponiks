/**
 * Testable thresholds for provider reliability classification.
 * Reliability answers "does this source produce listings?" — not capability.
 */
export interface ProviderReliabilityThresholds {
  /** Max scrape outcomes kept per platform (fixed-size window). */
  windowSize: number;
  /** Redis TTL refreshed on each write. */
  ttlSeconds: number;
  /** Below this, classification stays UNKNOWN (unless hysteresis keeps prior). */
  minAttemptsUnknown: number;
  healthyMinAttempts: number;
  healthyMaxFailureRatio: number;
  healthyMinNonEmpty: number;
  /** Consecutive empty allowed before HEALTHY drops (one empty must not kill). */
  healthyDropConsecutiveEmpty: number;
  noDataMinAttempts: number;
  noDataMaxFailureRatio: number;
  noDataMinEmptyRatio: number;
  failingMinAttempts: number;
  failingMinFailureRatio: number;
  /** Consecutive non-empty to leave NO_DATA into DEGRADED. */
  recoveryToDegradedNonEmpty: number;
  /** Consecutive non-empty to reach HEALTHY from NO_DATA/DEGRADED/FAILING. */
  recoveryToHealthyNonEmpty: number;
}

export const DEFAULT_RELIABILITY_THRESHOLDS: ProviderReliabilityThresholds = {
  windowSize: 10,
  ttlSeconds: 7 * 24 * 60 * 60,
  minAttemptsUnknown: 3,
  healthyMinAttempts: 5,
  healthyMaxFailureRatio: 0.2,
  healthyMinNonEmpty: 3,
  healthyDropConsecutiveEmpty: 5,
  noDataMinAttempts: 5,
  noDataMaxFailureRatio: 0.2,
  noDataMinEmptyRatio: 0.8,
  failingMinAttempts: 3,
  failingMinFailureRatio: 0.5,
  recoveryToDegradedNonEmpty: 1,
  recoveryToHealthyNonEmpty: 3,
};

export function reliabilityRedisKey(platform: string): string {
  return `provider:reliability:${platform}`;
}
