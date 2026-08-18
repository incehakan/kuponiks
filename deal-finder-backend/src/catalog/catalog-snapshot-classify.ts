import { normalizeMatchText } from "../lib/text-normalize.js";
import type { ArabamDiscoveredBrand, ArabamDiscoveredSeries } from "./arabam-taxonomy-discovery.js";
import {
  evaluateCatalogQualityGate,
  type CatalogBrandReview,
  type CatalogQualityGate,
  type CatalogSeriesReview,
} from "./catalog-quality-gate.js";
import {
  isAllowedCatalogSeries,
  isGarbageBrandSlug,
  isInvalidCatalogValue,
  looksLikeSlugDisplay,
  normalizeCatalogIdentity,
  resolveCanonicalBrandLabel,
  seriesSlugToDisplayLabel,
} from "./catalog-source-rules.js";
import { resolveCanonicalSeriesLabel } from "./platform-taxonomy.service.js";
import {
  CATALOG_SNAPSHOT_CATEGORY,
  CATALOG_SNAPSHOT_SOURCE,
  CATALOG_SNAPSHOT_VERSION,
  finalizeCatalogSnapshot,
  type CatalogSnapshot,
  type CatalogSnapshotBrand,
} from "./catalog-snapshot.js";

export interface OfflineClassifiedBrand {
  source: ArabamDiscoveredBrand;
  canonicalLabel: string;
  review: CatalogBrandReview;
}

export interface OfflineClassifiedSeries {
  sourceBrand: ArabamDiscoveredBrand;
  source: ArabamDiscoveredSeries;
  canonicalBrandLabel: string;
  canonicalSeriesLabel: string;
  review: CatalogSeriesReview;
}

export function classifyDiscoveredBrandOffline(
  sourceBrand: ArabamDiscoveredBrand,
): OfflineClassifiedBrand {
  if (
    isGarbageBrandSlug(sourceBrand.sourceSlug) ||
    isInvalidCatalogValue(sourceBrand.sourceLabel)
  ) {
    return {
      source: sourceBrand,
      canonicalLabel: "",
      review: {
        sourceLabel: sourceBrand.sourceLabel,
        sourceSlug: sourceBrand.sourceSlug,
        normalized: normalizeCatalogIdentity(sourceBrand.sourceLabel),
        canonicalMatch: null,
        status: "IGNORED",
      },
    };
  }

  const canonicalLabel = resolveCanonicalBrandLabel(
    sourceBrand.sourceLabel,
    sourceBrand.sourceSlug,
  );
  const normalized = normalizeCatalogIdentity(canonicalLabel);
  if (
    isInvalidCatalogValue(canonicalLabel) ||
    looksLikeSlugDisplay(canonicalLabel, sourceBrand.sourceSlug)
  ) {
    return {
      source: sourceBrand,
      canonicalLabel,
      review: {
        sourceLabel: sourceBrand.sourceLabel,
        sourceSlug: sourceBrand.sourceSlug,
        normalized,
        canonicalMatch: null,
        status: "UNRESOLVED",
      },
    };
  }

  return {
    source: sourceBrand,
    canonicalLabel,
    review: {
      sourceLabel: sourceBrand.sourceLabel,
      sourceSlug: sourceBrand.sourceSlug,
      normalized,
      canonicalMatch: canonicalLabel,
      status: "NEW",
    },
  };
}

export function classifyDiscoveredSeriesOffline(
  sourceBrand: ArabamDiscoveredBrand,
  sourceSeries: ArabamDiscoveredSeries,
  brand: OfflineClassifiedBrand,
): OfflineClassifiedSeries {
  const derived = seriesSlugToDisplayLabel(sourceSeries.seriesSlugPart);
  if (!isAllowedCatalogSeries(sourceSeries.seriesSlugPart) || isInvalidCatalogValue(derived)) {
    return {
      sourceBrand,
      source: sourceSeries,
      canonicalBrandLabel: brand.canonicalLabel,
      canonicalSeriesLabel: derived,
      review: {
        brand: brand.canonicalLabel,
        sourceSeriesLabel: derived,
        sourceSlug: sourceSeries.sourceSlug,
        canonicalMatch: null,
        status: "IGNORED",
      },
    };
  }

  const canonicalSeriesLabel = resolveCanonicalSeriesLabel({
    brandNormalizedName: normalizeMatchText(brand.canonicalLabel),
    brandDisplayName: brand.canonicalLabel,
    seriesSlugPart: sourceSeries.seriesSlugPart,
    existingSeriesNames: [],
  });

  if (looksLikeSlugDisplay(canonicalSeriesLabel, sourceSeries.sourceSlug)) {
    return {
      sourceBrand,
      source: sourceSeries,
      canonicalBrandLabel: brand.canonicalLabel,
      canonicalSeriesLabel,
      review: {
        brand: brand.canonicalLabel,
        sourceSeriesLabel: derived,
        sourceSlug: sourceSeries.sourceSlug,
        canonicalMatch: null,
        status: "UNRESOLVED",
      },
    };
  }

  return {
    sourceBrand,
    source: sourceSeries,
    canonicalBrandLabel: brand.canonicalLabel,
    canonicalSeriesLabel,
    review: {
      brand: brand.canonicalLabel,
      sourceSeriesLabel: derived,
      sourceSlug: sourceSeries.sourceSlug,
      canonicalMatch: canonicalSeriesLabel,
      status: "NEW",
    },
  };
}

function brandSourceLabel(brand: OfflineClassifiedBrand): string {
  if (looksLikeSlugDisplay(brand.source.sourceLabel, brand.source.sourceSlug)) {
    return brand.canonicalLabel;
  }
  return brand.source.sourceLabel.trim().replace(/\s+/g, " ");
}

export function buildCatalogSnapshot(input: {
  brands: OfflineClassifiedBrand[];
  series: OfflineClassifiedSeries[];
  generatedAt: string;
}): CatalogSnapshot {
  const writableBrands = input.brands.filter(
    (b) => b.review.status === "NEW" || b.review.status === "MATCHED",
  );
  const byIdentity = new Map<string, CatalogSnapshotBrand>();

  for (const brand of writableBrands) {
    const identity = brand.review.normalized;
    const existing = byIdentity.get(identity);
    if (existing) {
      continue;
    }
    byIdentity.set(identity, {
      canonicalName: brand.canonicalLabel,
      normalizedName: identity,
      sourceLabel: brandSourceLabel(brand),
      sourceSlug: brand.source.sourceSlug,
      series: [],
    });
  }

  const writableSeries = input.series.filter(
    (s) => s.review.status === "NEW" || s.review.status === "MATCHED",
  );
  for (const series of writableSeries) {
    const brandIdentity = normalizeCatalogIdentity(series.canonicalBrandLabel);
    const brand = byIdentity.get(brandIdentity);
    if (!brand) {
      continue;
    }
    if (brand.series.some((row) => row.sourceSlug === series.source.sourceSlug)) {
      continue;
    }
    brand.series.push({
      canonicalName: series.canonicalSeriesLabel,
      normalizedName: normalizeMatchText(series.canonicalSeriesLabel),
      sourceLabel: series.canonicalSeriesLabel,
      sourceSlug: series.source.sourceSlug,
    });
  }

  return finalizeCatalogSnapshot({
    version: CATALOG_SNAPSHOT_VERSION,
    source: CATALOG_SNAPSHOT_SOURCE,
    category: CATALOG_SNAPSHOT_CATEGORY,
    generatedAt: input.generatedAt,
    brands: [...byIdentity.values()],
  });
}

export function snapshotReviewsFromClassified(input: {
  brands: OfflineClassifiedBrand[];
  series: OfflineClassifiedSeries[];
}): { brands: CatalogBrandReview[]; series: CatalogSeriesReview[] } {
  return {
    brands: input.brands.map((b) => b.review),
    series: input.series.map((s) => s.review),
  };
}

export function evaluateSnapshotBuildGate(input: {
  brands: CatalogBrandReview[];
  series: CatalogSeriesReview[];
  fetchRequestCount: number;
  fetchFailureCount: number;
}): CatalogQualityGate {
  const gate = evaluateCatalogQualityGate(input);
  const reasons = [...gate.reasons];
  if (input.fetchFailureCount > 0) {
    reasons.push(`fetchFailureCount=${input.fetchFailureCount}`);
  }
  return {
    ...gate,
    pass: reasons.length === 0,
    reasons,
  };
}
