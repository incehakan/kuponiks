import type { ScrapePlatform } from "../queues/scraper.queue.js";
import type { QueryField } from "../scraper/query/platform-capabilities.js";

export type CriterionRole = "SOURCE" | "MATCHER_ONLY" | "UNSUPPORTED";

export type CoverageCapabilityStatus = "FULL" | "PARTIAL" | "UNSUPPORTED";

export type CoverageStatus =
  | "FULL"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "UNAVAILABLE";

export type RuntimeAvailability = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

/** Whether the provider actually produces listings over a scrape window. */
export type ProviderReliability =
  | "HEALTHY"
  | "NO_DATA"
  | "DEGRADED"
  | "FAILING"
  | "UNKNOWN";

/** User/ops monitoring effectiveness — not capability, not availability. */
export type EffectiveMonitorStatus =
  | "ACTIVE"
  | "LIMITED"
  | "NO_DATA"
  | "UNAVAILABLE"
  | "UNSUPPORTED";

export type AvailabilityReason =
  | "none"
  | "empty"
  | "cloudflare"
  | "circuit_open"
  | "unsupported_category";

export type MatcherReliability = "structured" | "weak";

export interface PlatformCoverageResult {
  platform: ScrapePlatform;
  /** Capability quality (ignores runtime). */
  coverage: CoverageCapabilityStatus;
  /** Combined routing status: UNAVAILABLE when runtime is down. */
  status: CoverageStatus;
  availability: RuntimeAvailability;
  availabilityReason: AvailabilityReason;
  sourceCriteria: QueryField[];
  matcherCriteria: QueryField[];
  unsupportedCriteria: QueryField[];
  schedulable: boolean;
  userStatus: "active" | "limited" | "unavailable" | "unsupported";
  reliability: ProviderReliability;
  effectiveStatus: EffectiveMonitorStatus;
  userLabel: string;
}

export interface FilterCoverageSnapshot {
  filterId: string;
  intent: {
    category: string;
    brand: string | null;
    series: string | null;
    city: string | null;
  };
  platforms: PlatformCoverageResult[];
  /** User-facing: HEALTHY+ACTIVE sources only. */
  monitoredPlatformCount: number;
  monitoredLabel: string;
  activeSourceCount: number;
  limitedSourceCount: number;
  unavailableSourceCount: number;
  totalSourceCount: number;
  statusLabel: string;
  limitedLabel: string | null;
  unavailableLabel: string | null;
}

export interface PlatformRuntimeSnapshot {
  platform: ScrapePlatform;
  availability: RuntimeAvailability;
  reason: AvailabilityReason;
  circuitOpen: boolean;
  lastSuccessAt: string | null;
  lastRawCount: number | null;
  lastOutcome: string | null;
}
