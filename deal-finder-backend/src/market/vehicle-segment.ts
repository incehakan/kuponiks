/**
 * Vehicle category gate + mileage / year segment helpers for Market Intelligence V1.
 */

import { canonicalizeCategoryForMatch } from "../scraper/utils/category.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import type { MarketSegmentLevel } from "./market-intelligence.types.js";

/**
 * True when listing category is vehicle/otomobil (Market Intelligence V1 scope).
 * Real-estate and other categories are unsupported.
 */
export function isVehicleMarketCategory(
  category: string | null | undefined,
): boolean {
  const c = canonicalizeCategoryForMatch(category);
  if (!c) {
    return false;
  }
  if (c === "emlak" || c.includes("emlak")) {
    return false;
  }
  return (
    c.includes("vasıta") ||
    c.includes("otomobil") ||
    c.includes("motosiklet") ||
    c === "vehicle"
  );
}

export function brandsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  return Boolean(left && right && left === right);
}

export function modelsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  return Boolean(left && right && left === right);
}

export function citiesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  return Boolean(left && right && left === right);
}

/**
 * Mileage half-window (km) for a segment level.
 * Uses max(fixed km, mileage * pct) so high-mileage cars scale.
 *
 * L1: max(25_000, 25%)
 * L2: max(50_000, 35%)
 * L3: max(75_000, 50%)
 * L4: max(100_000, 75%)
 */
export function mileageToleranceKm(
  mileage: number,
  level: 1 | 2 | 3 | 4,
): number {
  const fixed =
    level === 1 ? 25_000 : level === 2 ? 50_000 : level === 3 ? 75_000 : 100_000;
  const pct = level === 1 ? 0.25 : level === 2 ? 0.35 : level === 3 ? 0.5 : 0.75;
  return Math.max(fixed, Math.round(mileage * pct));
}

export function yearDeltaForLevel(level: 1 | 2 | 3 | 4): number {
  if (level === 1 || level === 2) {
    return 1;
  }
  if (level === 3) {
    return 2;
  }
  return 3;
}

export function segmentLevelLabel(level: 1 | 2 | 3 | 4): MarketSegmentLevel {
  return (`L${level}` as MarketSegmentLevel);
}
