/**
 * Read-only market source audit (no scrape, no notify, no listing writes).
 */

import { prisma } from "../lib/prisma.js";
import { median } from "./market-stats.js";
import { findCrossPlatformDuplicateCandidates } from "./market-duplicate-audit.js";
import { isMockMarketPlatform } from "./market-source-diversity.js";
import { parseMarketSourceFromRawDetails } from "./market-source-persist.js";
import { brandsMatch, effectiveSeries, seriesMatch } from "./vehicle-segment.js";

const STRUCTURED_FIELDS = [
  "brand",
  "series",
  "year",
  "mileage",
  "price",
  "currency",
  "city",
] as const;

export async function collectListingPlatformCounts(): Promise<
  Array<{ platform: string; count: number }>
> {
  const rows = await prisma.listing.groupBy({
    by: ["platform"],
    _count: { _all: true },
  });
  return rows
    .filter((row) => !isMockMarketPlatform(row.platform))
    .map((row) => ({ platform: row.platform, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function collectStructuredCompleteness(): Promise<
  Record<string, Record<(typeof STRUCTURED_FIELDS)[number] | "total", number>>
> {
  const listings = await prisma.listing.findMany({
    select: {
      platform: true,
      brand: true,
      series: true,
      year: true,
      mileage: true,
      price: true,
      currency: true,
      city: true,
    },
  });

  const byPlatform: Record<
    string,
    Record<(typeof STRUCTURED_FIELDS)[number] | "total", number>
  > = {};

  for (const row of listings) {
    if (isMockMarketPlatform(row.platform)) {
      continue;
    }
    const bucket = (byPlatform[row.platform] ??= {
      total: 0,
      brand: 0,
      series: 0,
      year: 0,
      mileage: 0,
      price: 0,
      currency: 0,
      city: 0,
    });
    bucket.total += 1;
    if (row.brand?.trim()) bucket.brand += 1;
    if (row.series?.trim()) bucket.series += 1;
    if (row.year != null) bucket.year += 1;
    if (row.mileage != null) bucket.mileage += 1;
    if (row.price > 0) bucket.price += 1;
    if (row.currency?.trim()) bucket.currency += 1;
    if (row.city?.trim()) bucket.city += 1;
  }

  return byPlatform;
}

export interface SegmentAuditRow {
  brand: string;
  series: string;
  yearMin: number;
  yearMax: number;
  total: number;
  byPlatform: Record<string, number>;
  combinedMedian: number | null;
  platformMedians: Record<string, number | null>;
  min: number | null;
  max: number | null;
}

export async function auditVehicleSegment(options: {
  brand: string;
  series: string;
  yearMin: number;
  yearMax: number;
}): Promise<SegmentAuditRow> {
  const listings = await prisma.listing.findMany({
    where: {
      platform: { not: "mock" },
      price: { gt: 0 },
      year: { gte: options.yearMin, lte: options.yearMax },
    },
    select: {
      platform: true,
      brand: true,
      series: true,
      model: true,
      year: true,
      price: true,
    },
  });

  const matched = listings.filter(
    (row) =>
      !isMockMarketPlatform(row.platform) &&
      brandsMatch(row.brand, options.brand) &&
      seriesMatch(effectiveSeries(row.series, row.model), options.series),
  );

  const byPlatform: Record<string, number> = {};
  const pricesByPlatform: Record<string, number[]> = {};
  const prices: number[] = [];
  for (const row of matched) {
    byPlatform[row.platform] = (byPlatform[row.platform] ?? 0) + 1;
    (pricesByPlatform[row.platform] ??= []).push(row.price);
    prices.push(row.price);
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const platformMedians: Record<string, number | null> = {};
  for (const [platform, list] of Object.entries(pricesByPlatform)) {
    platformMedians[platform] = median([...list].sort((a, b) => a - b));
  }

  return {
    brand: options.brand,
    series: options.series,
    yearMin: options.yearMin,
    yearMax: options.yearMax,
    total: matched.length,
    byPlatform,
    combinedMedian: median(sorted),
    platformMedians,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  };
}

export async function classifyStoredReadyDiversity(): Promise<{
  ready: number;
  single: number;
  low: number;
  balanced: number;
  missingSnapshot: number;
}> {
  const listings = await prisma.listing.findMany({
    where: { marketStatus: "READY" },
    select: { rawDetails: true },
  });
  let single = 0;
  let low = 0;
  let balanced = 0;
  let missingSnapshot = 0;
  for (const row of listings) {
    const snap = parseMarketSourceFromRawDetails(row.rawDetails);
    if (!snap?.diversity) {
      missingSnapshot += 1;
      continue;
    }
    if (snap.diversity === "SINGLE_SOURCE") single += 1;
    else if (snap.diversity === "MULTI_SOURCE_LOW") low += 1;
    else if (snap.diversity === "MULTI_SOURCE_BALANCED") balanced += 1;
  }
  return {
    ready: listings.length,
    single,
    low,
    balanced,
    missingSnapshot,
  };
}

export async function runMarketSourceAudit(): Promise<{
  platformCounts: Array<{ platform: string; count: number }>;
  completeness: Record<string, Record<string, number>>;
  readyDiversity: Awaited<ReturnType<typeof classifyStoredReadyDiversity>>;
  segments: SegmentAuditRow[];
  duplicateCandidates: number;
  duplicateRatePct: number | null;
  comparedPairUniverse: number;
}> {
  const platformCounts = await collectListingPlatformCounts();
  const completeness = await collectStructuredCompleteness();
  const readyDiversity = await classifyStoredReadyDiversity();
  const segments = await Promise.all([
    auditVehicleSegment({ brand: "Honda", series: "Civic", yearMin: 2016, yearMax: 2018 }),
    auditVehicleSegment({ brand: "Honda", series: "Civic", yearMin: 2014, yearMax: 2016 }),
    auditVehicleSegment({ brand: "Honda", series: "Civic", yearMin: 2019, yearMax: 2021 }),
  ]);

  const pool = await prisma.listing.findMany({
    where: {
      platform: { not: "mock" },
      brand: { not: null },
      price: { gt: 0 },
    },
    select: {
      id: true,
      platform: true,
      externalId: true,
      title: true,
      brand: true,
      series: true,
      model: true,
      year: true,
      mileage: true,
      price: true,
      city: true,
      imageUrl: true,
    },
    take: 2000,
  });
  const duplicates = findCrossPlatformDuplicateCandidates(pool);
  const comparedPairUniverse = pool.length;

  return {
    platformCounts,
    completeness,
    readyDiversity,
    segments,
    duplicateCandidates: duplicates.length,
    duplicateRatePct:
      comparedPairUniverse > 0
        ? Number(((duplicates.length / comparedPairUniverse) * 100).toFixed(2))
        : null,
    comparedPairUniverse,
  };
}
