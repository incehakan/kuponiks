/**
 * Read-only heuristic for possible cross-platform duplicate listings.
 * Does not merge or rewrite listings.
 */

import { normalizeMatchText } from "../lib/text-normalize.js";
import { isMockMarketPlatform } from "./market-source-diversity.js";
import { brandsMatch, effectiveSeries, seriesMatch } from "./vehicle-segment.js";

export interface DuplicateAuditListing {
  id?: string;
  platform: string;
  externalId: string;
  title?: string | null;
  brand?: string | null;
  series?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  price: number;
  city?: string | null;
  imageUrl?: string | null;
}

export interface DuplicateCandidatePair {
  left: DuplicateAuditListing;
  right: DuplicateAuditListing;
  yearEqual: boolean;
  mileageDeltaKm: number | null;
  priceDeltaPct: number | null;
  cityMatch: boolean;
  titleOverlap: boolean;
}

export interface DuplicateAuditOptions {
  maxMileageDeltaKm?: number;
  maxPriceDeltaPct?: number;
}

const DEFAULT_MILEAGE_DELTA = 2_000;
const DEFAULT_PRICE_DELTA_PCT = 3;

function titleOverlaps(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return left.includes(right) || right.includes(left);
}

/**
 * Pairwise candidates across different platforms with close year/km/price.
 */
export function findCrossPlatformDuplicateCandidates(
  listings: DuplicateAuditListing[],
  options: DuplicateAuditOptions = {},
): DuplicateCandidatePair[] {
  const maxKm = options.maxMileageDeltaKm ?? DEFAULT_MILEAGE_DELTA;
  const maxPricePct = options.maxPriceDeltaPct ?? DEFAULT_PRICE_DELTA_PCT;
  const real = listings.filter((row) => !isMockMarketPlatform(row.platform));
  const pairs: DuplicateCandidatePair[] = [];

  for (let i = 0; i < real.length; i += 1) {
    for (let j = i + 1; j < real.length; j += 1) {
      const left = real[i]!;
      const right = real[j]!;
      if (normalizeMatchText(left.platform) === normalizeMatchText(right.platform)) {
        continue;
      }
      if (!brandsMatch(left.brand, right.brand)) {
        continue;
      }
      const leftSeries = effectiveSeries(left.series, left.model);
      const rightSeries = effectiveSeries(right.series, right.model);
      if (!seriesMatch(leftSeries, rightSeries)) {
        continue;
      }
      if (left.year == null || right.year == null || left.year !== right.year) {
        continue;
      }
      if (left.mileage == null || right.mileage == null) {
        continue;
      }
      const mileageDeltaKm = Math.abs(left.mileage - right.mileage);
      if (mileageDeltaKm > maxKm) {
        continue;
      }
      if (!(left.price > 0) || !(right.price > 0)) {
        continue;
      }
      const denom = Math.max(left.price, right.price);
      const priceDeltaPct = Number((((Math.abs(left.price - right.price) / denom) * 100).toFixed(2)));
      if (priceDeltaPct > maxPricePct) {
        continue;
      }

      pairs.push({
        left,
        right,
        yearEqual: true,
        mileageDeltaKm,
        priceDeltaPct,
        cityMatch: Boolean(
          left.city?.trim() &&
            right.city?.trim() &&
            normalizeMatchText(left.city) === normalizeMatchText(right.city),
        ),
        titleOverlap: titleOverlaps(left.title, right.title),
      });
    }
  }

  return pairs;
}
