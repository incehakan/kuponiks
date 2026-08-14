/**
 * Pure Filter Matching Engine V2 — no Prisma / Redis side effects.
 * Used by FilterMatchingService, ListingAlertNotificationService, and unit tests.
 */

import { normalizeMatchText } from "../lib/text-normalize.js";
import { categoriesMatchForFilter } from "../scraper/utils/category.js";

export interface MatchableListing {
  title: string;
  price: number;
  dealScore: number;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  trim?: string | null;
  variant?: string | null;
  year?: number | null;
  mileage?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  city?: string | null;
  district?: string | null;
  sellerType?: string | null;
  description?: string | null;
  rawDetails?: unknown;
}

export interface MatchableFilter {
  category: string;
  subcategory?: string | null;
  brand?: string | null;
  model?: string | null;
  variant?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minMileage?: number | null;
  maxMileage?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  city?: string | null;
  district?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  sellerType?: string | null;
  keywords?: string[] | null;
  excludedKeywords?: string[] | null;
  minDealScore?: number | null;
  series?: string | null;
  trim?: string | null;
}

export { normalizeMatchText } from "../lib/text-normalize.js";

/**
 * Equality for optional string criteria.
 * Filter unset → pass. Filter set + listing null → fail. Else case-insensitive equality.
 */
export function matchesOptionalString(
  filterValue: string | null | undefined,
  listingValue: string | null | undefined,
): boolean {
  const filterNorm = normalizeMatchText(filterValue);
  if (!filterNorm) {
    return true;
  }
  const listingNorm = normalizeMatchText(listingValue);
  if (!listingNorm) {
    return false;
  }
  return filterNorm === listingNorm;
}

/**
 * City filters may contain comma/semicolon separated values from the mobile client.
 * Listing city must match any token (or equal the whole string).
 */
export function matchesCityFilter(
  filterCity: string | null | undefined,
  listingCity: string | null | undefined,
): boolean {
  const raw = (filterCity ?? "").trim();
  if (!raw) {
    return true;
  }
  const nationwide = normalizeMatchText(raw);
  if (
    nationwide === "all" ||
    nationwide === "tüm türkiye" ||
    nationwide === "tum turkiye" ||
    nationwide === "türkiye" ||
    nationwide === "turkiye"
  ) {
    return true;
  }
  const listingNorm = normalizeMatchText(listingCity);
  if (!listingNorm) {
    return false;
  }

  const tokens = raw
    .split(/[,;/|]+/)
    .map((part) => normalizeMatchText(part))
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.some(
    (token) => listingNorm === token || listingNorm.includes(token) || token.includes(listingNorm),
  );
}

function matchesNumericMin(
  filterMin: number | null | undefined,
  listingValue: number | null | undefined,
): boolean {
  if (filterMin == null || !Number.isFinite(filterMin)) {
    return true;
  }
  if (listingValue == null || !Number.isFinite(listingValue)) {
    return false;
  }
  return listingValue >= filterMin;
}

function matchesNumericMax(
  filterMax: number | null | undefined,
  listingValue: number | null | undefined,
): boolean {
  if (filterMax == null || !Number.isFinite(filterMax)) {
    return true;
  }
  if (listingValue == null || !Number.isFinite(listingValue)) {
    return false;
  }
  return listingValue <= filterMax;
}

function buildSearchCorpus(listing: MatchableListing): string {
  const chunks: string[] = [listing.title];
  if (listing.description) {
    chunks.push(listing.description);
  }

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      chunks.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        walk(nested);
      }
    }
  };

  if (listing.rawDetails !== null && listing.rawDetails !== undefined) {
    walk(listing.rawDetails);
  }

  return chunks.join(" ").toLocaleLowerCase("tr-TR");
}

function keywordHitsCorpus(corpus: string, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return true;
  }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(escaped, "iu").test(corpus);
  } catch {
    return corpus.includes(trimmed.toLocaleLowerCase("tr-TR"));
  }
}

/**
 * Keywords: all must match (AND). Empty → pass.
 * Excluded: any hit → fail.
 */
export function matchesKeywordRules(
  listing: MatchableListing,
  keywords: string[] | null | undefined,
  excludedKeywords: string[] | null | undefined,
): boolean {
  const corpus = buildSearchCorpus(listing);

  const excluded = (excludedKeywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean);
  if (excluded.some((k) => keywordHitsCorpus(corpus, k))) {
    return false;
  }

  const required = (keywords ?? []).map((k) => k.trim()).filter(Boolean);
  if (required.length === 0) {
    return true;
  }
  return required.every((k) => keywordHitsCorpus(corpus, k));
}

/**
 * Full V2 match: every set filter criterion must pass; unset criteria are ignored.
 */
export function listingMatchesFilter(
  listing: MatchableListing,
  filter: MatchableFilter,
): boolean {
  const listingCategory =
    listing.category?.trim() ||
    (typeof (listing.rawDetails as Record<string, unknown> | null)?.category ===
    "string"
      ? String((listing.rawDetails as Record<string, unknown>).category).trim()
      : "") ||
    (typeof (listing.rawDetails as Record<string, unknown> | null)?.kategori ===
    "string"
      ? String((listing.rawDetails as Record<string, unknown>).kategori).trim()
      : "");

  if (!listingCategory) {
    return false;
  }

  if (!categoriesMatchForFilter(filter.category, listingCategory)) {
    return false;
  }

  // Mobile derives subcategory from the category leaf ("Otomobil"). Arabam
  // listings often persist subcategory=null — fall back to listing category.
  const filterSubcategory = filter.subcategory?.trim();
  if (filterSubcategory) {
    const listingSubOrCategory =
      listing.subcategory?.trim() || listingCategory;
    if (!categoriesMatchForFilter(filterSubcategory, listingSubOrCategory)) {
      return false;
    }
  }
  if (!matchesOptionalString(filter.brand, listing.brand)) {
    return false;
  }
  if (!matchesOptionalString(filter.model, listing.model)) {
    return false;
  }
  // Additive series/trim: unset → pass; set → match series??model / trim
  if (
    !matchesOptionalString(
      filter.series,
      listing.series?.trim() ? listing.series : listing.model,
    )
  ) {
    return false;
  }
  if (!matchesOptionalString(filter.trim, listing.trim)) {
    return false;
  }
  if (!matchesOptionalString(filter.variant, listing.variant)) {
    return false;
  }
  if (!matchesOptionalString(filter.fuelType, listing.fuelType)) {
    return false;
  }
  if (!matchesOptionalString(filter.transmission, listing.transmission)) {
    return false;
  }
  if (!matchesOptionalString(filter.sellerType, listing.sellerType)) {
    return false;
  }
  if (!matchesOptionalString(filter.district, listing.district)) {
    return false;
  }
  if (!matchesCityFilter(filter.city, listing.city)) {
    return false;
  }

  if (!matchesNumericMin(filter.minYear, listing.year)) {
    return false;
  }
  if (!matchesNumericMax(filter.maxYear, listing.year)) {
    return false;
  }
  if (!matchesNumericMin(filter.minMileage, listing.mileage)) {
    return false;
  }
  if (!matchesNumericMax(filter.maxMileage, listing.mileage)) {
    return false;
  }
  if (!matchesNumericMin(filter.minPrice, listing.price)) {
    return false;
  }
  if (!matchesNumericMax(filter.maxPrice, listing.price)) {
    return false;
  }

  if (
    filter.minDealScore != null &&
    Number.isFinite(filter.minDealScore) &&
    listing.dealScore < filter.minDealScore
  ) {
    return false;
  }

  if (
    !matchesKeywordRules(listing, filter.keywords, filter.excludedKeywords)
  ) {
    return false;
  }

  return true;
}
