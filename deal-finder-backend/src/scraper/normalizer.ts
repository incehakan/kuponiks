import { canonicalizeExternalId } from "./utils/external-id.js";
import { splitCityDistrict } from "./utils/location.js";
import { normalizeCurrency } from "./utils/normalize-currency.js";
import {
  parseMileage,
  parsePrice,
  parseYear,
} from "./utils/parse-number.js";
import { toStoredListingImageUrl } from "../lib/listing-image.js";

/**
 * Raw listing payload as returned by heterogeneous scrapers / APIs.
 * Field names vary by platform — the normalizer maps common aliases.
 */
export interface RawScrapedListing {
  // Identity
  id?: string | number;
  externalId?: string | number;
  external_id?: string | number;
  listingId?: string | number;
  ilanId?: string | number;

  // Core fields
  title?: string;
  baslik?: string;
  name?: string;
  price?: number | string;
  fiyat?: number | string;
  category?: string;
  kategori?: string;
  subcategory?: string;
  brand?: string;
  marka?: string;
  model?: string;
  variant?: string;
  year?: number | string;
  yil?: number | string;
  mileage?: number | string;
  kilometre?: number | string;
  km?: number | string;
  fuelType?: string;
  yakit?: number | string;
  transmission?: string;
  vites?: string;
  city?: string;
  sehir?: string;
  il?: string;
  location?: string;
  district?: string;
  ilce?: string;
  sellerType?: string;
  saticiTipi?: string;
  currency?: string;
  imageUrl?: string;
  image?: string;
  photoUrl?: string;
  publishedAt?: string | Date;
  url?: string;
  link?: string;
  href?: string;
  originalUrl?: string;

  // Market / pricing helpers
  marketAveragePrice?: number | string;
  marketAverage?: number | string;
  piyasaOrt?: number | string;

  // Source
  platform?: string;
  source?: string;
  site?: string;

  // Free-form extras
  description?: string;
  aciklama?: string;
  keywords?: string[] | string;
  [key: string]: unknown;
}

/**
 * Normalized listing shape ready for Prisma `Listing` persistence.
 */
export interface NormalizedListingInput {
  externalId: string;
  platform: string;
  title: string;
  price: number;
  category: string;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  series: string | null;
  trim: string | null;
  variant: string | null;
  year: number | null;
  mileage: number | null;
  fuelType: string | null;
  transmission: string | null;
  city: string | null;
  district: string | null;
  sellerType: string | null;
  description: string | null;
  currency: string;
  imageUrl: string | null;
  publishedAt: Date | null;
  url: string;
  /** Optional scraper-provided market hint only — never filled with listing.price. */
  marketAveragePrice: number | null;
  rawDetails: Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().replace(/\s+/g, " ");
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function pickString(
  raw: RawScrapedListing,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = asNonEmptyString(raw[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

/**
 * Parses a positive integer from trusted numeric fields only (no guessing from title).
 */
function pickYear(raw: RawScrapedListing, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseYear(raw[key]);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}

function pickMileage(raw: RawScrapedListing, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseMileage(raw[key]);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}

function pickDate(raw: RawScrapedListing, keys: string[]): Date | null {
  for (const key of keys) {
    const value = raw[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return null;
}

/**
 * Parses Turkish / locale-flavored price strings into a number.
 */
export { parsePrice };

function resolveExternalId(
  raw: RawScrapedListing,
  platform: string,
): string | null {
  const candidate = pickString(raw, [
    "externalId",
    "external_id",
    "listingId",
    "ilanId",
    "id",
  ]);

  if (candidate) {
    try {
      return canonicalizeExternalId(platform, candidate);
    } catch {
      return null;
    }
  }

  const url = pickString(raw, ["url", "link", "href", "originalUrl"]);
  if (url) {
    try {
      return canonicalizeExternalId(platform, `url:${url}`);
    } catch {
      return null;
    }
  }

  return null;
}

function resolvePlatform(raw: RawScrapedListing, fallback = "generic"): string {
  return (
    pickString(raw, ["platform", "source", "site"])?.toLowerCase() ?? fallback
  );
}

/**
 * Only maps fields that are explicitly present on the raw payload / rawDetails.
 * Does not infer brand/model from titles.
 */
function pickFromRawDetails(
  rawDetails: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!rawDetails) {
    return null;
  }
  for (const key of keys) {
    const value = rawDetails[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

/**
 * Normalizes a single raw scraped listing into the Prisma Listing input shape.
 * Returns null when required fields (title, price, url/externalId) are missing.
 */
export function normalizeScrapedListing(
  raw: RawScrapedListing,
  defaults: { platform?: string; category?: string; city?: string } = {},
): NormalizedListingInput | null {
  const platform = resolvePlatform(raw, defaults.platform ?? "generic");
  const title = pickString(raw, ["title", "baslik", "name"]);
  const price = parsePrice(raw.price ?? raw.fiyat);
  const url = pickString(raw, ["url", "link", "href", "originalUrl"]);
  const externalId = resolveExternalId(raw, platform);
  const category =
    pickString(raw, ["category", "kategori"]) ??
    defaults.category?.trim() ??
    "Genel";
  const city =
    pickString(raw, ["city", "sehir", "il", "location"]) ??
    defaults.city?.trim() ??
    null;

  if (!title || price == null || !url || !externalId) {
    console.warn(
      `[NORMALIZER] İlan atlandı — eksik alan (title/price/url/externalId). platform=${platform}`,
    );
    return null;
  }

  // Never fall back to listing.price — Market Intelligence owns real medians.
  const marketAverage = parsePrice(
    raw.marketAveragePrice ?? raw.marketAverage ?? raw.piyasaOrt,
  );

  const description = pickString(raw, ["description", "aciklama"]);
  const subcategory = pickString(raw, ["subcategory"]);
  const brand = pickString(raw, ["brand", "marka"]);
  const model = pickString(raw, ["model"]);
  const series = pickString(raw, ["series", "seri"]);
  const trim = pickString(raw, ["trim"]);
  const variant = pickString(raw, ["variant"]);
  const year = pickYear(raw, ["year", "yil"]);
  const mileage = pickMileage(raw, ["mileage", "kilometre", "km"]);
  const fuelType = pickString(raw, ["fuelType", "yakit"]);
  const transmission = pickString(raw, ["transmission", "vites"]);
  const explicitDistrict = pickString(raw, ["district", "ilce"]);
  const sellerType = pickString(raw, ["sellerType", "saticiTipi"]);
  const currency =
    normalizeCurrency(pickString(raw, ["currency"])) ??
    normalizeCurrency(String(raw.price ?? raw.fiyat ?? "")) ??
    "TRY";
  const imageUrl = toStoredListingImageUrl(
    pickString(raw, ["imageUrl", "image", "photoUrl"]),
  );
  const publishedAt = pickDate(raw, ["publishedAt"]);

  const locationParts = splitCityDistrict(city);
  const resolvedCity = locationParts.city;
  const districtFromCity =
    explicitDistrict ?? locationParts.district;

  const keywordsRaw = raw.keywords;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.filter((item): item is string => typeof item === "string")
    : typeof keywordsRaw === "string"
      ? keywordsRaw.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)
      : [];

  const nestedRaw =
    raw.rawDetails && typeof raw.rawDetails === "object" && !Array.isArray(raw.rawDetails)
      ? (raw.rawDetails as Record<string, unknown>)
      : undefined;

  // Prefer explicit top-level fields; optionally promote already-normalized rawDetails keys.
  const resolvedBrand =
    brand ?? pickFromRawDetails(nestedRaw, ["brand", "marka"]);
  const resolvedModel = model ?? pickFromRawDetails(nestedRaw, ["model"]);
  const resolvedSeries =
    series ?? pickFromRawDetails(nestedRaw, ["series", "sourceSeries"]);
  const resolvedTrim =
    trim ?? pickFromRawDetails(nestedRaw, ["trim", "sourceTrim"]);
  const resolvedVariant =
    variant ?? pickFromRawDetails(nestedRaw, ["variant"]);
  const resolvedFuel =
    fuelType ?? pickFromRawDetails(nestedRaw, ["fuelType", "yakit"]);
  const resolvedTransmission =
    transmission ?? pickFromRawDetails(nestedRaw, ["transmission", "vites"]);
  const resolvedDistrict =
    districtFromCity ?? pickFromRawDetails(nestedRaw, ["district", "ilce"]);
  const resolvedSeller =
    sellerType ?? pickFromRawDetails(nestedRaw, ["sellerType", "saticiTipi"]);
  const resolvedSubcategory =
    subcategory ?? pickFromRawDetails(nestedRaw, ["subcategory"]);

  // Preserve property-specific extras (roomCount, grossM2, etc.) inside rawDetails.
  const rawDetails: Record<string, unknown> = {
    ...(nestedRaw ?? {}),
    category,
    kategori: category,
    ...(description ? { description } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(resolvedBrand ? { brand: resolvedBrand } : {}),
    ...(resolvedModel ? { model: resolvedModel } : {}),
    ...(resolvedSeries ? { series: resolvedSeries } : {}),
    ...(resolvedTrim ? { trim: resolvedTrim } : {}),
    ...(year != null ? { year } : {}),
    ...(mileage != null ? { mileage } : {}),
    source: platform,
    originalUrl: url,
    scrapedAt: new Date().toISOString(),
  };

  // Keep provenance keys from adapter (sourceBrand / brandSource / …).
  if (nestedRaw?.sourceBrand != null) {
    rawDetails.sourceBrand = nestedRaw.sourceBrand;
  }
  if (nestedRaw?.brandSource != null) {
    rawDetails.brandSource = nestedRaw.brandSource;
  }
  if (nestedRaw?.sourceMileage != null) {
    rawDetails.sourceMileage = nestedRaw.sourceMileage;
  }
  if (nestedRaw?.mileageSource != null) {
    rawDetails.mileageSource = nestedRaw.mileageSource;
  }
  if (nestedRaw?.sourceSeries != null) {
    rawDetails.sourceSeries = nestedRaw.sourceSeries;
  }
  if (nestedRaw?.seriesSource != null) {
    rawDetails.seriesSource = nestedRaw.seriesSource;
  }
  if (nestedRaw?.sourceTrim != null) {
    rawDetails.sourceTrim = nestedRaw.sourceTrim;
  }
  if (nestedRaw?.trimSource != null) {
    rawDetails.trimSource = nestedRaw.trimSource;
  }

  return {
    externalId,
    platform,
    title,
    price,
    category,
    subcategory: resolvedSubcategory,
    brand: resolvedBrand,
    model: resolvedModel,
    series: resolvedSeries,
    trim: resolvedTrim,
    variant: resolvedVariant,
    year,
    mileage,
    fuelType: resolvedFuel,
    transmission: resolvedTransmission,
    city: resolvedCity,
    district: resolvedDistrict,
    sellerType: resolvedSeller,
    description,
    currency,
    imageUrl,
    publishedAt,
    url,
    marketAveragePrice: marketAverage,
    rawDetails,
  };
}

/**
 * Normalizes a batch of raw listings, dropping invalid rows.
 */
export function normalizeScrapedListings(
  items: RawScrapedListing[],
  defaults: { platform?: string; category?: string; city?: string } = {},
): NormalizedListingInput[] {
  const results: NormalizedListingInput[] = [];

  for (const item of items) {
    const normalized = normalizeScrapedListing(item, defaults);
    if (normalized) {
      results.push(normalized);
    }
  }

  return results;
}

/**
 * Maps NormalizedListingInput → Prisma create data (shared by ingest paths).
 */
export function toListingCreateData(
  input: NormalizedListingInput,
  dealScore: number,
  market?: {
    marketAveragePrice: number | null;
    marketMedianPrice: number | null;
    marketSampleSize: number | null;
    marketConfidence: string | null;
    marketDispersionPct: number | null;
    priceAdvantagePct: number | null;
    marketCalculatedAt: Date | null;
    marketSegmentLevel: string | null;
    marketStatus: string;
  },
): {
  externalId: string;
  platform: string;
  title: string;
  price: number;
  marketAveragePrice: number | null;
  marketMedianPrice: number | null;
  marketSampleSize: number | null;
  marketConfidence: string | null;
  marketDispersionPct: number | null;
  priceAdvantagePct: number | null;
  marketCalculatedAt: Date | null;
  marketSegmentLevel: string | null;
  marketStatus: string | null;
  dealScore: number;
  category: string;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  series: string | null;
  trim: string | null;
  variant: string | null;
  year: number | null;
  mileage: number | null;
  fuelType: string | null;
  transmission: string | null;
  city: string | null;
  district: string | null;
  sellerType: string | null;
  description: string | null;
  currency: string;
  imageUrl: string | null;
  publishedAt: Date | null;
  url: string;
  rawDetails: Record<string, unknown>;
} {
  return {
    externalId: input.externalId,
    platform: input.platform,
    title: input.title,
    price: input.price,
    marketAveragePrice: market?.marketAveragePrice ?? input.marketAveragePrice,
    marketMedianPrice: market?.marketMedianPrice ?? null,
    marketSampleSize: market?.marketSampleSize ?? null,
    marketConfidence: market?.marketConfidence ?? null,
    marketDispersionPct: market?.marketDispersionPct ?? null,
    priceAdvantagePct: market?.priceAdvantagePct ?? null,
    marketCalculatedAt: market?.marketCalculatedAt ?? null,
    marketSegmentLevel: market?.marketSegmentLevel ?? null,
    marketStatus: market?.marketStatus ?? null,
    dealScore,
    category: input.category,
    subcategory: input.subcategory,
    brand: input.brand,
    model: input.model,
    series: input.series,
    trim: input.trim,
    variant: input.variant,
    year: input.year,
    mileage: input.mileage,
    fuelType: input.fuelType,
    transmission: input.transmission,
    city: input.city,
    district: input.district,
    sellerType: input.sellerType,
    description: input.description,
    currency: input.currency,
    imageUrl: input.imageUrl,
    publishedAt: input.publishedAt,
    url: input.url,
    rawDetails: input.rawDetails,
  };
}
