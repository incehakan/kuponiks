/**
 * Pure market statistics helpers (median, IQR, outliers, dispersion).
 */

export function median(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) {
    return null;
  }
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 1) {
    return sortedAsc[mid]!;
  }
  return (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2;
}

export function quantile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) {
    return null;
  }
  if (sortedAsc.length === 1) {
    return sortedAsc[0]!;
  }
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sortedAsc[base]!;
  const b = sortedAsc[Math.min(base + 1, sortedAsc.length - 1)]!;
  return a + (b - a) * rest;
}

/**
 * IQR outlier filter. Requires at least 5 samples to apply.
 * Returns filtered prices (sorted ascending).
 */
export function filterIqrOutliers(
  prices: number[],
  minSamplesToApply = 5,
): number[] {
  const sorted = [...prices]
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (sorted.length < minSamplesToApply) {
    return sorted;
  }

  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  if (q1 == null || q3 == null) {
    return sorted;
  }

  const iqr = q3 - q1;
  if (iqr <= 0) {
    return sorted;
  }

  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter((p) => p >= lower && p <= upper);
}

/**
 * dispersionPct = IQR / median * 100
 */
export function dispersionPct(sortedAsc: number[]): number | null {
  if (sortedAsc.length < 2) {
    return null;
  }
  const med = median(sortedAsc);
  if (med == null || med <= 0) {
    return null;
  }
  const q1 = quantile(sortedAsc, 0.25);
  const q3 = quantile(sortedAsc, 0.75);
  if (q1 == null || q3 == null) {
    return null;
  }
  return Number((((q3 - q1) / med) * 100).toFixed(2));
}

export function priceAdvantagePct(
  listingPrice: number,
  marketMedianPrice: number,
): number | null {
  if (
    !Number.isFinite(listingPrice) ||
    !Number.isFinite(marketMedianPrice) ||
    marketMedianPrice <= 0
  ) {
    return null;
  }
  return Number(
    (((marketMedianPrice - listingPrice) / marketMedianPrice) * 100).toFixed(2),
  );
}
