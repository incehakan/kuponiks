import { cleanPrice } from "./utils/clean-price.js";
import { canonicalizeExternalId } from "./utils/external-id.js";

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
  city?: string;
  sehir?: string;
  il?: string;
  location?: string;
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
 * Category is stored inside `rawDetails` (Listing model has no category column).
 */
export interface NormalizedListingInput {
  externalId: string;
  platform: string;
  title: string;
  price: number;
  category: string;
  city: string | null;
  url: string;
  marketAveragePrice: number;
  rawDetails: Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
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
 * Parses Turkish / locale-flavored price strings into a number.
 * Delegates to shared `cleanPrice` helper.
 */
export function parsePrice(value: unknown): number | null {
  return cleanPrice(value);
}

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

  const marketAverage =
    parsePrice(
      raw.marketAveragePrice ?? raw.marketAverage ?? raw.piyasaOrt,
    ) ?? price;

  const description =
    pickString(raw, ["description", "aciklama"]) ?? undefined;

  const keywordsRaw = raw.keywords;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.filter((item): item is string => typeof item === "string")
    : typeof keywordsRaw === "string"
      ? keywordsRaw.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)
      : [];

  return {
    externalId,
    platform,
    title,
    price,
    category,
    city,
    url,
    marketAveragePrice: marketAverage,
    rawDetails: {
      category,
      kategori: category,
      ...(description ? { description } : {}),
      ...(keywords.length > 0 ? { keywords } : {}),
      source: platform,
      originalUrl: url,
      scrapedAt: new Date().toISOString(),
    },
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
