import { canonicalBrandLabelFromArabam } from "../catalog/catalog-source-rules.js";
import type { SearchIntent, SearchIntentSource } from "./search-intent.js";

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ") : null;
}

function optionalNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function canonicalBrand(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return canonicalBrandLabelFromArabam(value);
}

/**
 * UserFilter → SearchIntent. Notification flags and minDealScore never enter intent.
 */
export function buildSearchIntentFromFilter(
  filter: SearchIntentSource,
): SearchIntent {
  const series =
    optionalString(filter.series) ?? optionalString(filter.model);
  return {
    category: filter.category.trim(),
    subcategory: optionalString(filter.subcategory),
    brand: canonicalBrand(optionalString(filter.brand)),
    series,
    trim: optionalString(filter.trim),
    minYear: optionalNumber(filter.minYear),
    maxYear: optionalNumber(filter.maxYear),
    minMileage: optionalNumber(filter.minMileage),
    maxMileage: optionalNumber(filter.maxMileage),
    minPrice: optionalNumber(filter.minPrice),
    maxPrice: optionalNumber(filter.maxPrice),
    city: optionalString(filter.city),
    district: optionalString(filter.district),
    fuelType: optionalString(filter.fuelType),
    transmission: optionalString(filter.transmission),
    sellerType: optionalString(filter.sellerType),
    keywords: (filter.keywords ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  };
}
