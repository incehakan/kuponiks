import type { RawScrapedListing } from "./normalizer.js";
import type { ListingDto } from "./types/listing.dto.js";
import { cleanPrice } from "./utils/clean-price.js";
import { inferCurrencyFromPriceText } from "./utils/normalize-currency.js";
import { splitCityDistrict } from "./utils/location.js";
import { canonicalizeExternalId } from "./utils/external-id.js";
import type { BaseScraperAdapter } from "./adapters/base.adapter.js";
import type { ScrapeSearchParams } from "./adapters/base.adapter.js";
import { normalizeScrapedListings } from "./normalizer.js";
import type { NormalizedListingInput } from "./normalizer.js";
import { logBatchDataQuality } from "./utils/data-quality.js";

export class ScraperAdapterError extends Error {
  constructor(
    public readonly platform: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${platform}] ${message}`);
    this.name = "ScraperAdapterError";
  }
}

export { canonicalizeExternalId } from "./utils/external-id.js";

/**
 * Maps a raw adapter row into the standard Listing DTO.
 */
export function toListingDto(
  platform: string,
  row: {
    id?: string | null;
    externalId?: string | null;
    title?: string | null;
    price?: number | string | null;
    priceText?: string | null;
    city?: string | null;
    district?: string | null;
    url?: string | null;
    category?: string | null;
    description?: string | null;
    model?: string | null;
    year?: string | number | null;
    mileage?: string | number | null;
    imageUrl?: string | null;
  },
  defaults: { category?: string; city?: string } = {},
): ListingDto | null {
  const title = row.title?.trim();
  const url = row.url?.trim();
  const rawId = (row.externalId ?? row.id)?.toString().trim();
  const price = cleanPrice(row.price ?? row.priceText);

  if (!title || !url || !rawId || price == null) {
    return null;
  }

  let externalId: string;
  try {
    externalId = canonicalizeExternalId(platform, rawId);
  } catch {
    return null;
  }

  const location = splitCityDistrict(
    row.city?.trim() || defaults.city?.trim() || null,
  );
  const city = location.city;
  const district = row.district?.trim() || location.district;
  const category =
    row.category?.trim() || defaults.category?.trim() || "Genel";
  const currency = inferCurrencyFromPriceText(
    typeof row.priceText === "string"
      ? row.priceText
      : String(row.price ?? ""),
  );

  const dto: ListingDto = {
    externalId,
    platform: platform.toLowerCase(),
    title,
    price,
    city,
    url: url.split("?")[0] ?? url,
    category,
  };

  if (row.description?.trim()) {
    dto.description = row.description.trim();
  }
  if (district) {
    dto.district = district;
  }
  if (row.model?.trim()) {
    dto.model = row.model.trim();
  }
  if (row.year != null && String(row.year).trim()) {
    dto.year = row.year;
  }
  if (row.mileage != null && String(row.mileage).trim()) {
    dto.mileage = row.mileage;
  }
  if (currency) {
    dto.currency = currency;
  }
  if (row.imageUrl?.trim()) {
    dto.imageUrl = row.imageUrl.trim();
  }

  return dto;
}

export function listingDtoToRaw(dto: ListingDto): RawScrapedListing {
  const raw: RawScrapedListing = {
    id: dto.externalId.includes(":")
      ? dto.externalId.slice(dto.externalId.indexOf(":") + 1)
      : dto.externalId,
    externalId: dto.externalId,
    title: dto.title,
    price: dto.price,
    url: dto.url,
    platform: dto.platform,
    category: dto.category,
  };
  if (dto.city) {
    raw.city = dto.city;
  }
  if (dto.district) {
    raw.district = dto.district;
  }
  if (dto.description) {
    raw.description = dto.description;
  }
  if (dto.model) {
    raw.model = dto.model;
  }
  if (dto.year != null) {
    raw.year = dto.year;
  }
  if (dto.mileage != null) {
    raw.mileage = dto.mileage;
  }
  if (dto.currency) {
    raw.currency = dto.currency;
  }
  if (dto.imageUrl) {
    raw.imageUrl = dto.imageUrl;
  }
  if (dto.marketAveragePrice != null) {
    raw.marketAveragePrice = dto.marketAveragePrice;
  }
  return raw;
}

/**
 * Runs an adapter search with shared error handling and DTO → normalize pipeline.
 */
export async function runAdapterPipeline(
  adapter: BaseScraperAdapter,
  params: ScrapeSearchParams,
): Promise<{
  rawCount: number;
  normalized: NormalizedListingInput[];
  error: ScraperAdapterError | null;
}> {
  try {
    const raw = await adapter.search(params);
    const normalized = normalizeScrapedListings(raw, {
      platform: adapter.platform,
      ...(params.category ? { category: params.category } : {}),
      ...(params.city ? { city: params.city } : {}),
    });
    logBatchDataQuality(adapter.platform, normalized);
    return { rawCount: raw.length, normalized, error: null };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unknown adapter error";
    const error = new ScraperAdapterError(adapter.platform, message, cause);
    console.error(`[SCRAPER MANAGER] ${error.message}`);
    return { rawCount: 0, normalized: [], error };
  }
}
