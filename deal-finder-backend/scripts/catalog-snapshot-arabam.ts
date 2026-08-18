#!/usr/bin/env tsx
/**
 * Discover Arabam automobile taxonomy and write a versioned catalog snapshot.
 * Network required. No database writes.
 *
 *   npm run catalog:snapshot:arabam
 *   npx tsx scripts/catalog-snapshot-arabam.ts --out=src/catalog/snapshots/arabam-automobile-v1.json
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  discoverArabamBrands,
  discoverArabamSeriesForBrand,
  type DiscoveryFetchStats,
} from "../src/catalog/arabam-taxonomy-discovery.js";
import {
  classifyDiscoveredBrandOffline,
  classifyDiscoveredSeriesOffline,
  buildCatalogSnapshot,
  evaluateSnapshotBuildGate,
  snapshotReviewsFromClassified,
  type OfflineClassifiedBrand,
  type OfflineClassifiedSeries,
} from "../src/catalog/catalog-snapshot-classify.js";
import { defaultCatalogSnapshotPath } from "../src/catalog/catalog-snapshot.js";
import { writeSnapshotIfPassing } from "../src/catalog/catalog-snapshot-write.js";
import { isAllowedCatalogSeries, ARABAM_CONTROLLED_BRANDS } from "../src/catalog/catalog-source-rules.js";

function parseArgs(argv: string[]): { out: string; allBrands: boolean } {
  let out = defaultCatalogSnapshotPath();
  let allBrands = true;
  for (const arg of argv) {
    const m = /^--out=(.*)$/.exec(arg);
    if (m) {
      out = m[1]!;
    }
    if (arg === "--controlled-only") {
      allBrands = false;
    }
  }
  return { out, allBrands };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const stats: DiscoveryFetchStats = {
    requestCount: 0,
    failureCount: 0,
    failedPaths: [],
  };

  const discoveredBrands = await discoverArabamBrands({
    stats,
    ...(opts.allBrands ? {} : { brandSlugs: [...ARABAM_CONTROLLED_BRANDS] }),
  });

  const classifiedBrands: OfflineClassifiedBrand[] = [];
  const classifiedSeries: OfflineClassifiedSeries[] = [];

  for (const sourceBrand of discoveredBrands) {
    const brand = classifyDiscoveredBrandOffline(sourceBrand);
    classifiedBrands.push(brand);
    if (brand.review.status === "IGNORED" || brand.review.status === "UNRESOLVED") {
      continue;
    }
    try {
      const seriesList = await discoverArabamSeriesForBrand(sourceBrand, {
        filterSeries: (part) => isAllowedCatalogSeries(part),
        stats,
      });
      for (const sourceSeries of seriesList) {
        classifiedSeries.push(
          classifyDiscoveredSeriesOffline(sourceBrand, sourceSeries, brand),
        );
      }
    } catch {
      continue;
    }
  }

  const reviews = snapshotReviewsFromClassified({
    brands: classifiedBrands,
    series: classifiedSeries,
  });
  const qualityGate = evaluateSnapshotBuildGate({
    brands: reviews.brands,
    series: reviews.series,
    fetchRequestCount: stats.requestCount,
    fetchFailureCount: stats.failureCount,
  });
  const snapshot = buildCatalogSnapshot({
    brands: classifiedBrands,
    series: classifiedSeries,
    generatedAt: new Date().toISOString(),
  });

  await mkdir(path.dirname(opts.out), { recursive: true });
  const write = await writeSnapshotIfPassing({
    outputPath: opts.out,
    snapshot,
    qualityGate,
  });

  const samples = [
    ["honda", "honda-civic"],
    ["toyota", "toyota-corolla"],
    ["volkswagen", "volkswagen-golf"],
    ["renault", "renault-clio"],
    ["fiat", "fiat-egea"],
    ["mercedes-benz", "mercedes-benz-c"],
    ["bmw", "bmw-3-serisi"],
    ["audi", "audi-a4"],
    ["tesla", "tesla-model-y"],
    ["cupra", "cupra-formentor"],
    ["mini", ""],
    ["citroen", ""],
    ["mg", ""],
    ["byd", ""],
    ["chery", ""],
  ] as const;

  const sampleRows = samples.map(([brandSlug, seriesSlug]) => {
    const brand = snapshot.brands.find((b) => b.sourceSlug === brandSlug);
    const series = seriesSlug
      ? brand?.series.find((s) => s.sourceSlug === seriesSlug)
      : undefined;
    return {
      sourceSlug: brandSlug,
      canonicalName: brand?.canonicalName ?? null,
      normalizedName: brand?.normalizedName ?? null,
      seriesCanonical: series?.canonicalName ?? null,
      seriesSlug: series?.sourceSlug ?? (brand ? brand.series[0]?.sourceSlug ?? null : null),
      seriesCount: brand?.series.length ?? 0,
    };
  });

  console.log(
    JSON.stringify(
      {
        written: write.written,
        reason: write.reason ?? null,
        outputPath: opts.out,
        qualityGate,
        requestCount: stats.requestCount,
        fetchFailureCount: stats.failureCount,
        failedPaths: stats.failedPaths,
        sourceBrandsFound: discoveredBrands.length,
        sourceSeriesFound: classifiedSeries.filter(
          (s) => s.review.status === "NEW" || s.review.status === "MATCHED",
        ).length,
        snapshotVersion: snapshot.version,
        catalogHash: snapshot.catalogHash,
        snapshotBrands: snapshot.brands.length,
        snapshotSeries: snapshot.brands.reduce((n, b) => n + b.series.length, 0),
        samples: sampleRows,
      },
      null,
      2,
    ),
  );

  if (!write.written) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
