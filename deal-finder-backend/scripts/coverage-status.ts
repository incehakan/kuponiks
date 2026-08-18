#!/usr/bin/env tsx
/** Read-only platform coverage status — no scrape, no notifications. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { buildSearchIntentFromFilter } from "../src/coverage/search-intent-builder.js";
import {
  buildFilterCoverageSnapshot,
  defaultAvailabilityMap,
  evaluateCoverage,
  formatCoverageLogLine,
} from "../src/coverage/coverage-engine.js";
import { loadAvailabilityMap } from "../src/coverage/platform-availability.js";
import { getPlatformStatusReport } from "../src/coverage/platform-status.service.js";
import { toCoverageApiResponse } from "../src/coverage/coverage.service.js";
import { loadReliabilityMap } from "../src/coverage/provider-reliability-store.js";

const hondaCivicSample = {
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null,
  minYear: 2016,
  maxYear: 2018,
  minMileage: null,
  maxMileage: null,
  city: "Tüm Türkiye",
  keywords: [] as string[],
  minDealScore: 50,
  notifyPush: true,
};

async function main(): Promise<void> {
  const availability = await loadAvailabilityMap().catch(() =>
    defaultAvailabilityMap(),
  );
  const reliability = await loadReliabilityMap().catch(() => ({}));

  const sampleIntent = buildSearchIntentFromFilter(hondaCivicSample);
  const sampleRows = evaluateCoverage(sampleIntent, availability);
  const sample = buildFilterCoverageSnapshot(
    "honda-civic-sample",
    sampleIntent,
    sampleRows,
    reliability,
  );

  const filters = await prisma.userFilter.findMany({
    where: { isActive: true },
    select: {
      id: true,
      category: true,
      brand: true,
      series: true,
      trim: true,
      minYear: true,
      maxYear: true,
      minMileage: true,
      maxMileage: true,
      minPrice: true,
      maxPrice: true,
      city: true,
      district: true,
      fuelType: true,
      transmission: true,
      sellerType: true,
      keywords: true,
      minDealScore: true,
      notifyPush: true,
    },
  });

  const perFilter = filters.map((filter) => {
    const intent = buildSearchIntentFromFilter(filter);
    const platforms = evaluateCoverage(intent, availability);
    const snapshot = buildFilterCoverageSnapshot(
      filter.id,
      intent,
      platforms,
      reliability,
    );
    return {
      log: formatCoverageLogLine(filter.id, snapshot),
      api: toCoverageApiResponse(snapshot),
    };
  });

  const status = await getPlatformStatusReport();

  console.log(
    JSON.stringify(
      {
        activeFilters: filters.length,
        hondaCivicSample: toCoverageApiResponse(sample),
        perFilter,
        platformAvailability: status.snapshots,
        listingCompleteness: status.completeness,
        availabilityUsed: availability,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
