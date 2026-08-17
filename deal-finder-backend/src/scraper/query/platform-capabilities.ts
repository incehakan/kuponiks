import type { ScrapePlatform } from "../../queues/scraper.queue.js";

/** Fields that can appear on a UserFilter / ScrapeQueryPlan. */
export type QueryField =
  | "category"
  | "subcategory"
  | "brand"
  | "series"
  | "trim"
  | "city"
  | "district"
  | "minYear"
  | "maxYear"
  | "minPrice"
  | "maxPrice"
  | "minMileage"
  | "maxMileage"
  | "fuelType"
  | "transmission"
  | "sellerType"
  | "keywords";

export type FieldRole = "SOURCE" | "MATCHER_ONLY";

/**
 * Per-platform field roles — conservative: only mark SOURCE when the live
 * adapter already sends the field to the platform search URL.
 *
 * Arabam (verified): ikinci-el?searchText={brand series}&take=50 only.
 * Letgo (verified): search/q/category/city query params.
 * Sahibinden (verified): query_text + address_city on /otomobil.
 */
export const PLATFORM_FIELD_ROLES: Record<
  ScrapePlatform,
  Partial<Record<QueryField, FieldRole>>
> = {
  arabam: {
    brand: "SOURCE",
    series: "SOURCE",
    keywords: "SOURCE",
    category: "MATCHER_ONLY",
    subcategory: "MATCHER_ONLY",
    city: "MATCHER_ONLY",
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
    trim: "MATCHER_ONLY",
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
  },
  generic: {},
};

/** Fields that must never affect scrape grouping (matcher / notify / plan). */
export const NEVER_SIGNATURE_FIELDS = new Set([
  "minDealScore",
  "notifyPush",
  "notifyTelegram",
  "notifyWhatsapp",
  "isActive",
  "trim",
] as const);

export function fieldRole(
  platform: ScrapePlatform,
  field: QueryField,
): FieldRole {
  return PLATFORM_FIELD_ROLES[platform]?.[field] ?? "MATCHER_ONLY";
}

export function isSourceField(
  platform: ScrapePlatform,
  field: QueryField,
): boolean {
  return fieldRole(platform, field) === "SOURCE";
}
