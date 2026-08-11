/**
 * Vehicle category gate + mileage / year segment helpers for Market Intelligence V1.1.
 */

import { canonicalizeCategoryForMatch } from "../scraper/utils/category.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import type {
  MarketConfidence,
  MarketSegmentLevel,
} from "./market-intelligence.types.js";

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

export function seriesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  return Boolean(left && right && left === right);
}

export function trimsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  return Boolean(left && right && left === right);
}

/** @deprecated Prefer seriesMatch — kept for legacy exact model equality helpers/tests. */
export function modelsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return seriesMatch(a, b);
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
 * Temporary BC: prefer series, else legacy model.
 */
export function effectiveSeries(
  series: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const s = series?.trim();
  if (s) {
    return s;
  }
  const m = model?.trim();
  return m || null;
}

/**
 * Mileage half-window (km) for a segment level.
 * L1/L2 trim-level, L3/L4 series-level reuse the same numeric windows.
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
  if (level === 1) {
    return "L1";
  }
  if (level === 2) {
    return "L2";
  }
  if (level === 3) {
    return "L3_SERIES";
  }
  return "L4_SERIES";
}

/**
 * Series-level segments are less precise than trim-level.
 * L3_SERIES: downgrade one step.
 * L4_SERIES: downgrade two steps.
 * L1/L2: unchanged.
 */
export function applySegmentConfidencePenalty(
  confidence: MarketConfidence,
  segment: MarketSegmentLevel,
): MarketConfidence {
  const rank: MarketConfidence[] = ["LOW", "MEDIUM", "HIGH"];
  const idx = rank.indexOf(confidence);
  if (idx < 0) {
    return confidence;
  }
  let penalty = 0;
  if (segment === "L3_SERIES" || segment === "L3") {
    penalty = 1;
  } else if (segment === "L4_SERIES" || segment === "L4") {
    penalty = 2;
  }
  return rank[Math.max(0, idx - penalty)]!;
}
