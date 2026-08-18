import type { ScrapePlatform } from "../queues/scraper.queue.js";
import type { QueryField } from "../scraper/query/platform-capabilities.js";
import type { CriterionRole, MatcherReliability } from "./coverage-types.js";

/**
 * Capability V2 — technical support only. Runtime availability is separate.
 * Conservative: SOURCE only where query builders actually apply the field.
 */
export const PLATFORM_CRITERION_ROLES_V2: Record<
  ScrapePlatform,
  Partial<Record<QueryField, CriterionRole>>
> = {
  arabam: {
    brand: "SOURCE",
    series: "SOURCE",
    keywords: "SOURCE",
    city: "SOURCE",
    minYear: "SOURCE",
    maxYear: "SOURCE",
    minPrice: "SOURCE",
    maxPrice: "SOURCE",
    category: "MATCHER_ONLY",
    subcategory: "MATCHER_ONLY",
    district: "MATCHER_ONLY",
    minMileage: "MATCHER_ONLY",
    maxMileage: "MATCHER_ONLY",
    trim: "MATCHER_ONLY",
    fuelType: "MATCHER_ONLY",
    transmission: "MATCHER_ONLY",
    sellerType: "MATCHER_ONLY",
  },
  letgo: {
    brand: "SOURCE",
    series: "SOURCE",
    keywords: "SOURCE",
    category: "SOURCE",
    city: "SOURCE",
    subcategory: "MATCHER_ONLY",
    district: "MATCHER_ONLY",
    minYear: "MATCHER_ONLY",
    maxYear: "MATCHER_ONLY",
    minPrice: "MATCHER_ONLY",
    maxPrice: "MATCHER_ONLY",
    minMileage: "MATCHER_ONLY",
    maxMileage: "MATCHER_ONLY",
    trim: "UNSUPPORTED",
    fuelType: "MATCHER_ONLY",
    transmission: "MATCHER_ONLY",
    sellerType: "MATCHER_ONLY",
  },
  sahibinden: {
    brand: "SOURCE",
    series: "SOURCE",
    keywords: "SOURCE",
    category: "SOURCE",
    city: "SOURCE",
    subcategory: "MATCHER_ONLY",
    district: "MATCHER_ONLY",
    minYear: "MATCHER_ONLY",
    maxYear: "MATCHER_ONLY",
    minPrice: "MATCHER_ONLY",
    maxPrice: "MATCHER_ONLY",
    minMileage: "MATCHER_ONLY",
    maxMileage: "MATCHER_ONLY",
    trim: "MATCHER_ONLY",
    fuelType: "MATCHER_ONLY",
    transmission: "MATCHER_ONLY",
    sellerType: "MATCHER_ONLY",
  },
  hepsiemlak: {
    category: "SOURCE",
    keywords: "SOURCE",
    city: "SOURCE",
    subcategory: "MATCHER_ONLY",
    district: "MATCHER_ONLY",
    minPrice: "MATCHER_ONLY",
    maxPrice: "MATCHER_ONLY",
    brand: "UNSUPPORTED",
    series: "UNSUPPORTED",
    trim: "UNSUPPORTED",
    minYear: "UNSUPPORTED",
    maxYear: "UNSUPPORTED",
    minMileage: "UNSUPPORTED",
    maxMileage: "UNSUPPORTED",
    fuelType: "UNSUPPORTED",
    transmission: "UNSUPPORTED",
    sellerType: "UNSUPPORTED",
  },
  generic: {},
};

export const PLATFORM_MATCHER_RELIABILITY: Record<
  ScrapePlatform,
  MatcherReliability
> = {
  arabam: "structured",
  letgo: "weak",
  sahibinden: "structured",
  hepsiemlak: "structured",
  generic: "weak",
};

export function criterionRole(
  platform: ScrapePlatform,
  field: QueryField,
): CriterionRole {
  return PLATFORM_CRITERION_ROLES_V2[platform]?.[field] ?? "UNSUPPORTED";
}
