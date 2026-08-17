import type { ScrapePlatform } from "../../queues/scraper.queue.js";
import type { QueryField } from "./platform-capabilities.js";
import { fieldRole, isSourceField } from "./platform-capabilities.js";

/** Nationwide sentinel → no city constraint in source query. */
export function normalizeSchedulerCity(
  city: string | null | undefined,
): string | undefined {
  const value = city?.trim();
  if (!value) {
    return undefined;
  }
  const lower = value.toLocaleLowerCase("tr-TR");
  if (
    lower === "all" ||
    lower === "tüm türkiye" ||
    lower === "tum turkiye" ||
    lower === "türkiye" ||
    lower === "turkiye"
  ) {
    return undefined;
  }
  return value;
}

/** Scheduler input — superset of legacy SchedulerFilterInput. */
export interface SchedulerFilterInput {
  id: string;
  isActive: boolean;
  category: string;
  subcategory?: string | null;
  brand: string | null;
  series: string | null;
  trim: string | null;
  city: string | null;
  district?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minMileage?: number | null;
  maxMileage?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  sellerType?: string | null;
  keywords: string[];
  plan: import("@prisma/client").SubscriptionPlan;
}

/**
 * Platform-neutral query plan derived from UserFilter.
 * sourceCriteria → platform URL / grouping; matcherCriteria → central matcher only.
 */
export interface ScrapeQueryPlan {
  platform: ScrapePlatform;
  category: string;
  subcategory?: string;
  brand?: string;
  series?: string;
  trim?: string;
  city?: string;
  district?: string;
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  minMileage?: number;
  maxMileage?: number;
  fuelType?: string;
  transmission?: string;
  sellerType?: string;
  keywords: string[];
  sourceCriteria: Record<string, string | number>;
  matcherCriteria: Record<string, string | number | string[] | null | undefined>;
  appliedCriteria: string[];
  deferredCriteria: string[];
}

export function brandSeriesQueryText(input: {
  brand: string | null | undefined;
  series: string | null | undefined;
  keywords: string[];
  category: string;
}): string {
  const brandSeries = [input.brand, input.series]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ")
    .trim();
  if (brandSeries) {
    return brandSeries;
  }
  const keyword = input.keywords
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  if (keyword) {
    return keyword;
  }
  return input.category.trim();
}

function optionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNumber(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function collectDeferred(
  platform: ScrapePlatform,
  plan: Omit<
    ScrapeQueryPlan,
    "sourceCriteria" | "matcherCriteria" | "appliedCriteria" | "deferredCriteria"
  >,
): string[] {
  const deferred: string[] = [];
  const entries: Array<[QueryField, unknown]> = [
    ["category", plan.category],
    ["subcategory", plan.subcategory],
    ["brand", plan.brand],
    ["series", plan.series],
    ["trim", plan.trim],
    ["city", plan.city],
    ["district", plan.district],
    ["minYear", plan.minYear],
    ["maxYear", plan.maxYear],
    ["minPrice", plan.minPrice],
    ["maxPrice", plan.maxPrice],
    ["minMileage", plan.minMileage],
    ["maxMileage", plan.maxMileage],
    ["fuelType", plan.fuelType],
    ["transmission", plan.transmission],
    ["sellerType", plan.sellerType],
    ["keywords", plan.keywords.length ? plan.keywords : undefined],
  ];
  for (const [field, value] of entries) {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    if (!isSourceField(platform, field)) {
      deferred.push(field);
    }
  }
  deferred.push("minDealScore", "notifyPush", "notifyTelegram", "notifyWhatsapp");
  return deferred;
}

function collectApplied(
  platform: ScrapePlatform,
  sourceCriteria: Record<string, string | number>,
): string[] {
  return Object.keys(sourceCriteria)
    .filter((key) => isSourceField(platform, key as QueryField))
    .sort();
}

/**
 * Builds a ScrapeQueryPlan for one platform from an active filter row.
 */
export function planFromFilter(
  platform: ScrapePlatform,
  filter: SchedulerFilterInput,
): ScrapeQueryPlan {
  const category = filter.category.trim();
  const city = normalizeSchedulerCity(filter.city);
  const displayQuery = brandSeriesQueryText(filter);

  const subcategory = optionalString(filter.subcategory);
  const brand = optionalString(filter.brand);
  const series = optionalString(filter.series);
  const trim = optionalString(filter.trim);
  const district = optionalString(filter.district);
  const minYear = optionalNumber(filter.minYear);
  const maxYear = optionalNumber(filter.maxYear);
  const minPrice = optionalNumber(filter.minPrice);
  const maxPrice = optionalNumber(filter.maxPrice);
  const minMileage = optionalNumber(filter.minMileage);
  const maxMileage = optionalNumber(filter.maxMileage);
  const fuelType = optionalString(filter.fuelType);
  const transmission = optionalString(filter.transmission);
  const sellerType = optionalString(filter.sellerType);

  const base: Omit<
    ScrapeQueryPlan,
    "sourceCriteria" | "matcherCriteria" | "appliedCriteria" | "deferredCriteria"
  > = {
    platform,
    category,
    keywords: filter.keywords,
    ...(subcategory ? { subcategory } : {}),
    ...(brand ? { brand } : {}),
    ...(series ? { series } : {}),
    ...(trim ? { trim } : {}),
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
    ...(minYear != null ? { minYear } : {}),
    ...(maxYear != null ? { maxYear } : {}),
    ...(minPrice != null ? { minPrice } : {}),
    ...(maxPrice != null ? { maxPrice } : {}),
    ...(minMileage != null ? { minMileage } : {}),
    ...(maxMileage != null ? { maxMileage } : {}),
    ...(fuelType ? { fuelType } : {}),
    ...(transmission ? { transmission } : {}),
    ...(sellerType ? { sellerType } : {}),
  };

  const sourceCriteria: Record<string, string | number> = {};
  if (fieldRole(platform, "category") === "SOURCE") {
    sourceCriteria.category = category;
  }
  if (fieldRole(platform, "brand") === "SOURCE" && base.brand) {
    sourceCriteria.brand = base.brand;
  }
  if (fieldRole(platform, "series") === "SOURCE" && base.series) {
    sourceCriteria.series = base.series;
  }
  if (
    fieldRole(platform, "keywords") === "SOURCE" &&
    !base.brand &&
    !base.series &&
    displayQuery &&
    displayQuery !== category
  ) {
    sourceCriteria.keywords = displayQuery;
  }
  if (fieldRole(platform, "city") === "SOURCE" && base.city) {
    sourceCriteria.city = base.city;
  }
  if (fieldRole(platform, "minYear") === "SOURCE" && base.minYear != null) {
    sourceCriteria.minYear = base.minYear;
  }
  if (fieldRole(platform, "maxYear") === "SOURCE" && base.maxYear != null) {
    sourceCriteria.maxYear = base.maxYear;
  }
  if (fieldRole(platform, "minPrice") === "SOURCE" && base.minPrice != null) {
    sourceCriteria.minPrice = base.minPrice;
  }
  if (fieldRole(platform, "maxPrice") === "SOURCE" && base.maxPrice != null) {
    sourceCriteria.maxPrice = base.maxPrice;
  }

  const matcherCriteria: Record<string, string | number | string[] | null | undefined> =
    {
      category,
      subcategory: filter.subcategory,
      brand: filter.brand,
      series: filter.series,
      trim: filter.trim,
      city: filter.city,
      district: filter.district,
      minYear: filter.minYear,
      maxYear: filter.maxYear,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      minMileage: filter.minMileage,
      maxMileage: filter.maxMileage,
      fuelType: filter.fuelType,
      transmission: filter.transmission,
      sellerType: filter.sellerType,
      keywords: filter.keywords,
    };

  return {
    ...base,
    sourceCriteria,
    matcherCriteria,
    appliedCriteria: collectApplied(platform, sourceCriteria),
    deferredCriteria: collectDeferred(platform, base),
  };
}
