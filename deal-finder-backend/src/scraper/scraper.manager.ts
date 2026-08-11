import type { RawScrapedListing } from "./normalizer.js";
import type { ListingDto } from "./types/listing.dto.js";
import { cleanPrice } from "./utils/clean-price.js";
import { canonicalizeExternalId } from "./utils/external-id.js";
import type { BaseScraperAdapter } from "./adapters/base.adapter.js";
import type { ScrapeSearchParams } from "./adapters/base.adapter.js";
import { normalizeScrapedListings } from "./normalizer.js";
import type { NormalizedListingInput } from "./normalizer.js";

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
    url?: string | null;
    category?: string | null;
    description?: string | null;
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

  const city = row.city?.trim() || defaults.city?.trim() || null;
  const category =
    row.category?.trim() || defaults.category?.trim() || "Genel";

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
  if (dto.description) {
    raw.description = dto.description;
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
    return { rawCount: raw.length, normalized, error: null };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unknown adapter error";
    const error = new ScraperAdapterError(adapter.platform, message, cause);
    console.error(`[SCRAPER MANAGER] ${error.message}`);
    return { rawCount: 0, normalized: [], error };
  }
}
