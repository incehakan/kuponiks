import type { ScrapePlatform } from "../queues/scraper.queue.js";
import type { QueryField } from "../scraper/query/platform-capabilities.js";
import type {
  AvailabilityReason,
  CoverageCapabilityStatus,
  CoverageStatus,
  PlatformCoverageResult,
  RuntimeAvailability,
} from "./coverage-types.js";
import {
  PLATFORM_MATCHER_RELIABILITY,
  criterionRole,
} from "./platform-capability-v2.js";
import {
  isNationwideCity,
  isRealtyCategory,
  isVehicleCategory,
  type SearchIntent,
} from "./search-intent.js";

const VEHICLE_PLATFORMS: readonly ScrapePlatform[] = [
  "arabam",
  "letgo",
  "sahibinden",
];
const REALTY_PLATFORMS: readonly ScrapePlatform[] = [
  "hepsiemlak",
  "sahibinden",
];

/** Vehicle discovery platforms — hepsiemlak is a separate vertical. */
export function coveragePlatformsForIntent(
  intent: SearchIntent,
): ScrapePlatform[] {
  if (isRealtyCategory(intent.category)) {
    return [...REALTY_PLATFORMS];
  }
  if (isVehicleCategory(intent.category)) {
    return [...VEHICLE_PLATFORMS];
  }
  return ["sahibinden", "letgo"];
}

export interface SetCriterion {
  field: QueryField;
  critical: boolean;
}

function hasValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/**
 * Set discovery criteria. Notification prefs and minDealScore never appear.
 * Nationwide city is not a geographic constraint.
 */
export function setDiscoveryCriteria(intent: SearchIntent): SetCriterion[] {
  const rows: SetCriterion[] = [];
  const push = (field: QueryField, value: unknown, critical: boolean) => {
    if (hasValue(value)) {
      rows.push({ field, critical });
    }
  };

  push("brand", intent.brand, true);
  push("series", intent.series, true);
  push("trim", intent.trim, false);
  if (!isNationwideCity(intent.city)) {
    push("city", intent.city, false);
  }
  push("district", intent.district, false);
  push("minYear", intent.minYear, false);
  push("maxYear", intent.maxYear, false);
  push("minPrice", intent.minPrice, false);
  push("maxPrice", intent.maxPrice, false);
  push("minMileage", intent.minMileage, false);
  push("maxMileage", intent.maxMileage, false);
  push("fuelType", intent.fuelType, false);
  push("transmission", intent.transmission, false);
  push("sellerType", intent.sellerType, false);
  if (!intent.brand && !intent.series) {
    push("keywords", intent.keywords, true);
  }

  return rows;
}

export interface AvailabilityOverride {
  availability: RuntimeAvailability;
  reason?: AvailabilityReason;
}

export type AvailabilityMap = Partial<Record<ScrapePlatform, AvailabilityOverride>>;

export function defaultAvailabilityMap(): AvailabilityMap {
  return {
    arabam: { availability: "AVAILABLE", reason: "none" },
    letgo: { availability: "DEGRADED", reason: "empty" },
    sahibinden: { availability: "UNAVAILABLE", reason: "cloudflare" },
  };
}

function platformSupportsCategory(
  platform: ScrapePlatform,
  intent: SearchIntent,
): boolean {
  if (isVehicleCategory(intent.category)) {
    return platform !== "hepsiemlak";
  }
  if (isRealtyCategory(intent.category)) {
    return platform === "hepsiemlak" || platform === "sahibinden";
  }
  return platform !== "arabam" && platform !== "hepsiemlak";
}

function userStatusFor(
  coverage: CoverageCapabilityStatus,
  availability: RuntimeAvailability,
  schedulable: boolean,
): PlatformCoverageResult["userStatus"] {
  if (coverage === "UNSUPPORTED") {
    return "unsupported";
  }
  if (availability === "UNAVAILABLE" || !schedulable) {
    return "unavailable";
  }
  if (coverage === "PARTIAL" || availability === "DEGRADED") {
    return "limited";
  }
  return "active";
}

function combinedStatus(
  coverage: CoverageCapabilityStatus,
  availability: RuntimeAvailability,
): CoverageStatus {
  if (coverage === "UNSUPPORTED") {
    return "UNSUPPORTED";
  }
  if (availability === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  return coverage;
}

export function isSchedulableCoverage(row: {
  coverage: CoverageCapabilityStatus;
  availability: RuntimeAvailability;
}): boolean {
  if (row.coverage === "UNSUPPORTED") {
    return false;
  }
  return (
    row.availability === "AVAILABLE" || row.availability === "DEGRADED"
  );
}

export function countMonitoredPlatforms(
  rows: Array<{
    coverage: CoverageCapabilityStatus;
    availability: RuntimeAvailability;
  }>,
): number {
  return rows.filter(isSchedulableCoverage).length;
}

export function monitoredLabel(monitored: number, total: number): string {
  return `${monitored}/${total} kaynak aktif`;
}

export function formatCoverageLogLine(
  filterId: string,
  snapshot: {
    platforms: Array<{
      platform: string;
      coverage: string;
      availability: string;
    }>;
    monitoredPlatformCount: number;
  },
): string {
  const parts = snapshot.platforms.map(
    (row) => `${row.platform}=${row.coverage}/${row.availability}`,
  );
  return `[COVERAGE] filter=${filterId} ${parts.join(" ")} monitored=${snapshot.monitoredPlatformCount}`;
}

export function evaluatePlatformCoverage(
  intent: SearchIntent,
  platform: ScrapePlatform,
  availability: AvailabilityOverride = {
    availability: "AVAILABLE",
    reason: "none",
  },
): PlatformCoverageResult {
  const runtime = availability.availability;
  const reason = availability.reason ?? "none";
  const supports = platformSupportsCategory(platform, intent);

  if (!supports) {
    const coverage: CoverageCapabilityStatus = "UNSUPPORTED";
    return {
      platform,
      coverage,
      status: "UNSUPPORTED",
      availability: runtime,
      availabilityReason: "unsupported_category",
      sourceCriteria: [],
      matcherCriteria: [],
      unsupportedCriteria: setDiscoveryCriteria(intent).map((row) => row.field),
      schedulable: false,
      userStatus: "unsupported",
    };
  }

  const set = setDiscoveryCriteria(intent);
  const sourceCriteria: QueryField[] = [];
  const matcherCriteria: QueryField[] = [];
  const unsupportedCriteria: QueryField[] = [];

  let criticalUnsupported = false;
  let optionalUnsupported = false;
  let matcherOnlyImportant = false;

  for (const row of set) {
    const role = criterionRole(platform, row.field);
    if (role === "SOURCE") {
      sourceCriteria.push(row.field);
    } else if (role === "MATCHER_ONLY") {
      matcherCriteria.push(row.field);
      matcherOnlyImportant = true;
    } else {
      unsupportedCriteria.push(row.field);
      if (row.critical) {
        criticalUnsupported = true;
      } else {
        optionalUnsupported = true;
      }
    }
  }

  let coverage: CoverageCapabilityStatus;
  if (criticalUnsupported) {
    coverage = "UNSUPPORTED";
  } else if (
    matcherOnlyImportant &&
    PLATFORM_MATCHER_RELIABILITY[platform] === "weak"
  ) {
    coverage = "PARTIAL";
  } else if (optionalUnsupported) {
    coverage = "PARTIAL";
  } else {
    coverage = "FULL";
  }

  const schedulable = isSchedulableCoverage({
    coverage,
    availability: runtime,
  });
  const status = combinedStatus(coverage, runtime);

  return {
    platform,
    coverage,
    status,
    availability: runtime,
    availabilityReason: runtime === "UNAVAILABLE" ? reason : reason,
    sourceCriteria,
    matcherCriteria,
    unsupportedCriteria,
    schedulable,
    userStatus: userStatusFor(coverage, runtime, schedulable),
  };
}

export function evaluateCoverage(
  intent: SearchIntent,
  availability: AvailabilityMap = {},
  platforms = coveragePlatformsForIntent(intent),
): PlatformCoverageResult[] {
  return platforms.map((platform) =>
    evaluatePlatformCoverage(intent, platform, availability[platform] ?? {
      availability: "AVAILABLE",
      reason: "none",
    }),
  );
}

export function buildFilterCoverageSnapshot(
  filterId: string,
  intent: SearchIntent,
  platforms: PlatformCoverageResult[],
): {
  filterId: string;
  intent: { category: string; brand: string | null; series: string | null; city: string | null };
  platforms: PlatformCoverageResult[];
  monitoredPlatformCount: number;
  monitoredLabel: string;
} {
  const monitoredPlatformCount = countMonitoredPlatforms(platforms);
  return {
    filterId,
    intent: {
      category: intent.category,
      brand: intent.brand,
      series: intent.series,
      city: intent.city,
    },
    platforms,
    monitoredPlatformCount,
    monitoredLabel: monitoredLabel(monitoredPlatformCount, platforms.length),
  };
}
