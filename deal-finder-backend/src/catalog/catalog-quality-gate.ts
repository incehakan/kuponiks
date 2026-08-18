import { looksLikeSlugDisplay } from "./catalog-source-rules.js";

export type CatalogItemStatus = "MATCHED" | "NEW" | "UNRESOLVED" | "IGNORED";

export interface CatalogBrandReview {
  sourceLabel: string;
  sourceSlug: string;
  normalized: string;
  canonicalMatch: string | null;
  status: CatalogItemStatus;
}

export interface CatalogSeriesReview {
  brand: string;
  sourceSeriesLabel: string;
  sourceSlug: string;
  canonicalMatch: string | null;
  status: CatalogItemStatus;
}

export interface CatalogQualityGate {
  pass: boolean;
  reasons: string[];
  garbageDetected: number;
  duplicateCandidates: number;
  fetchFailureRate: number;
  unresolvedBrands: number;
  unresolvedSeries: number;
  ignoredBrands: number;
  ignoredSeries: number;
}

export function evaluateCatalogQualityGate(input: {
  brands: CatalogBrandReview[];
  series: CatalogSeriesReview[];
  fetchRequestCount: number;
  fetchFailureCount: number;
}): CatalogQualityGate {
  const reasons: string[] = [];
  const fetchFailureRate =
    input.fetchRequestCount > 0
      ? input.fetchFailureCount / input.fetchRequestCount
      : 0;

  const unresolvedBrands = input.brands.filter((b) => b.status === "UNRESOLVED").length;
  const unresolvedSeries = input.series.filter((s) => s.status === "UNRESOLVED").length;
  const ignoredBrands = input.brands.filter((b) => b.status === "IGNORED").length;
  const ignoredSeries = input.series.filter((s) => s.status === "IGNORED").length;

  const writeBrands = input.brands.filter(
    (b) => b.status === "NEW" || b.status === "MATCHED",
  );
  const writeSeries = input.series.filter(
    (s) => s.status === "NEW" || s.status === "MATCHED",
  );

  const garbageDetected =
    writeBrands.filter((b) => looksLikeSlugDisplay(b.canonicalMatch ?? "", b.sourceSlug))
      .length +
    writeSeries.filter((s) =>
      looksLikeSlugDisplay(s.canonicalMatch ?? s.sourceSeriesLabel, s.sourceSlug),
    ).length;

  const brandNorms = writeBrands.map((b) => b.normalized);
  const duplicateBrandNorms = brandNorms.filter(
    (n, i) => brandNorms.indexOf(n) !== i,
  );
  const duplicateCandidates = new Set(duplicateBrandNorms).size;

  if (input.fetchRequestCount > 0 && fetchFailureRate > 0.1) {
    reasons.push(`fetchFailureRate=${fetchFailureRate.toFixed(3)}`);
  }
  if (unresolvedBrands > 0) {
    reasons.push(`unresolvedBrands=${unresolvedBrands}`);
  }
  if (unresolvedSeries > 0) {
    reasons.push(`unresolvedSeries=${unresolvedSeries}`);
  }
  if (garbageDetected > 0) {
    reasons.push(`garbageDetected=${garbageDetected}`);
  }
  if (writeBrands.length === 0) {
    reasons.push("noWritableBrands");
  }

  return {
    pass: reasons.length === 0,
    reasons,
    garbageDetected,
    duplicateCandidates,
    fetchFailureRate,
    unresolvedBrands,
    unresolvedSeries,
    ignoredBrands,
    ignoredSeries,
  };
}
