/**
 * Production: snapshot Honda Civic filter → repair artifact 0 mileage →
 * dry-eval READY listings → persist matches with notifyPush quiet.
 * No mass push. Does not loosen year/score/brand criteria.
 *
 * Usage (VDS or local with prod DATABASE_URL):
 *   npx tsx scripts/prod-filter-mileage-repair-rematch.ts
 */
import "dotenv/config";
import { listingMatchesFilter } from "../src/filters/filter-match.engine.js";
import { filterMatchingService } from "../src/filters/filter-matching.service.js";
import { prisma } from "../src/lib/prisma.js";
import { probeRedisConnection } from "../src/lib/redis.js";
import { filterService } from "../src/modules/filters/filter.service.js";
import { closeListingMatchQueue } from "../src/queues/listing.queue.js";
import { closeNotificationQueue } from "../src/queues/notification.queue.js";
import { closeScraperQueue } from "../src/queues/scraper.queue.js";

const FILTER_ID = "6a70c7f0-c475-470b-a5f7-def15bebf885";

function failReason(
  listing: {
    year: number | null;
    mileage: number | null;
    dealScore: number;
    brand: string | null;
    series: string | null;
    marketStatus: string;
  },
  filter: {
    minYear: number | null;
    maxYear: number | null;
    minMileage: number | null;
    maxMileage: number | null;
    minDealScore: number;
    brand: string | null;
    series: string | null;
  },
): string {
  if (listing.marketStatus !== "READY") return "not_READY";
  if (
    filter.brand &&
    (listing.brand ?? "").toLocaleLowerCase("tr-TR") !==
      filter.brand.toLocaleLowerCase("tr-TR")
  ) {
    return "brand";
  }
  if (
    filter.series &&
    !(listing.series ?? "")
      .toLocaleLowerCase("tr-TR")
      .includes(filter.series.toLocaleLowerCase("tr-TR"))
  ) {
    return "series";
  }
  if (filter.minYear != null && (listing.year == null || listing.year < filter.minYear)) {
    return `year_lt_${filter.minYear}`;
  }
  if (filter.maxYear != null && (listing.year == null || listing.year > filter.maxYear)) {
    return `year_gt_${filter.maxYear}`;
  }
  if (
    filter.minMileage != null &&
    (listing.mileage == null || listing.mileage < filter.minMileage)
  ) {
    return "minMileage";
  }
  if (
    filter.maxMileage != null &&
    (listing.mileage == null || listing.mileage > filter.maxMileage)
  ) {
    return "maxMileage";
  }
  if (listing.dealScore < filter.minDealScore) {
    return `dealScore_lt_${filter.minDealScore}`;
  }
  return "other";
}

async function main(): Promise<void> {
  await probeRedisConnection();

  const before = await prisma.userFilter.findUnique({ where: { id: FILTER_ID } });
  if (!before) throw new Error(`filter ${FILTER_ID} missing`);

  const snapshot = {
    id: before.id,
    name: before.name,
    category: before.category,
    subcategory: before.subcategory,
    brand: before.brand,
    series: before.series,
    trim: before.trim,
    minYear: before.minYear,
    maxYear: before.maxYear,
    minMileage: before.minMileage,
    maxMileage: before.maxMileage,
    minPrice: before.minPrice,
    maxPrice: before.maxPrice,
    city: before.city,
    district: before.district,
    minDealScore: before.minDealScore,
    isActive: before.isActive,
    updatedAt: before.updatedAt,
  };

  const matchesBefore = await prisma.userListingMatch.count({
    where: { userId: before.userId, filterId: before.id },
  });

  const repair: { minMileage?: null; maxMileage?: null } = {};
  if (before.maxMileage === 0) repair.maxMileage = null;
  if (before.minMileage === 0) repair.minMileage = null;

  if (Object.keys(repair).length > 0) {
    await filterService.updateFilter(before.id, before.userId, repair);
  }

  const afterRepair = await prisma.userFilter.findUnique({
    where: { id: FILTER_ID },
  });
  if (!afterRepair) throw new Error("filter missing after repair");

  const listings = await prisma.listing.findMany({
    where: {
      brand: { equals: "Honda", mode: "insensitive" },
      series: { equals: "Civic", mode: "insensitive" },
      marketStatus: "READY",
    },
  });

  const dry = listings.map((l) => {
    const pass = listingMatchesFilter(l, afterRepair);
    return {
      id: l.id,
      year: l.year,
      mileage: l.mileage,
      dealScore: l.dealScore,
      pass,
      failReason: pass ? null : failReason(l, afterRepair),
    };
  });
  const passList = dry.filter((d) => d.pass);
  const failList = dry.filter((d) => !d.pass);

  for (const row of passList) {
    await filterMatchingService.matchListingWithFilters(row.id, {
      suppressNotifications: true,
    });
  }

  const matchesAfter = await prisma.userListingMatch.count({
    where: { userId: afterRepair.userId, filterId: afterRepair.id },
  });

  const finalFilter = await prisma.userFilter.findUnique({
    where: { id: FILTER_ID },
    select: {
      minMileage: true,
      maxMileage: true,
      minYear: true,
      maxYear: true,
      minDealScore: true,
      brand: true,
      series: true,
      city: true,
      subcategory: true,
      notifyPush: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        snapshotBefore: snapshot,
        repairApplied: repair,
        filterAfter: finalFilter,
        listingEvaluated: listings.length,
        passCount: passList.length,
        failCount: failList.length,
        failReasonsSample: failList.slice(0, 25),
        passSample: passList.slice(0, 15),
        userListingMatchBefore: matchesBefore,
        userListingMatchAfter: matchesAfter,
        duplicatesExpected: 0,
        historicalPushSent: false,
        notificationsSuppressed: true,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      closeNotificationQueue(),
      closeListingMatchQueue(),
      closeScraperQueue(),
      prisma.$disconnect(),
    ]);
  });
