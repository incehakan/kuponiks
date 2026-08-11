import type { NormalizedListingInput } from "../normalizer.js";

const QUALITY_FIELDS = [
  "category",
  "subcategory",
  "brand",
  "model",
  "variant",
  "year",
  "mileage",
  "fuelType",
  "transmission",
  "city",
  "district",
  "sellerType",
  "description",
  "currency",
  "publishedAt",
  "imageUrl",
  "price",
] as const;

type QualityField = (typeof QUALITY_FIELDS)[number];

function isFilled(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  return true;
}

/**
 * Low-cost batch data-quality summary for scraper ingest (no secrets / HTML).
 */
export function logBatchDataQuality(
  platform: string,
  listings: NormalizedListingInput[],
): void {
  const total = listings.length;
  if (total === 0) {
    console.log(`[DATA QUALITY] platform=${platform} total=0`);
    return;
  }

  const counts = Object.fromEntries(
    QUALITY_FIELDS.map((field) => [field, 0]),
  ) as Record<QualityField, number>;

  for (const listing of listings) {
    for (const field of QUALITY_FIELDS) {
      if (isFilled(listing[field])) {
        counts[field] += 1;
      }
    }
  }

  const parts = QUALITY_FIELDS.map((field) => {
    const filled = counts[field];
    const pct = Math.round((filled / total) * 100);
    return `${field}=${filled}/${total} (${pct}%)`;
  });

  console.log(`[DATA QUALITY] platform=${platform} total=${total} ${parts.join(" ")}`);
}
