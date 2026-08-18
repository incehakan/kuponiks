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
  monitoredPlatformCount: number;
  monitoredLabel: string;
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
