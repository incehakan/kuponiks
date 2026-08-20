#!/usr/bin/env tsx
/**
 * Read-only multi-provider filter E2E status.
 *
 *   npm run filter:e2e-status -- --filter=<uuid>
 *   npx tsx scripts/filter-e2e-status.ts --brand=Honda --series=Civic
 *
 * Does NOT scrape, enqueue, ingest, or send notifications.
 */
import "dotenv/config";
import { NotificationChannel, SubscriptionPlan } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { buildSearchIntentFromFilter } from "../src/coverage/search-intent-builder.js";
import {
  buildFilterCoverageSnapshot,
  defaultAvailabilityMap,
  evaluateCoverage,
} from "../src/coverage/coverage-engine.js";
import { loadAvailabilityMap } from "../src/coverage/platform-availability.js";
import { loadReliabilityMap } from "../src/coverage/provider-reliability-store.js";
import { groupActiveFilters } from "../src/scraper/scheduler/canonical-query.js";
import { buildPlatformQuery } from "../src/scraper/query/scrape-query-planner.js";
import { listingMatchesFilter } from "../src/filters/filter-match.engine.js";
import {
  canNotifyUserForListing,
  hasSuccessfulChannelNotification,
} from "../src/notifications/notification-eligibility.js";
import { listingPlatformLabel } from "../src/lib/platform-label.js";
import { dealService } from "../src/modules/deals/deal.service.js";
import { applyReliabilityToCoverage } from "../src/coverage/provider-reliability.js";

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function failReason(
  listing: {
    brand?: string | null;
    series?: string | null;
    model?: string | null;
    year?: number | null;
    mileage?: number | null;
    city?: string | null;
    dealScore: number;
    category?: string | null;
  },
  filter: {
    brand?: string | null;
    series?: string | null;
    minYear?: number | null;
    maxYear?: number | null;
    minMileage?: number | null;
    maxMileage?: number | null;
    city?: string | null;
    minDealScore?: number | null;
    category: string;
  },
): string {
  if (listingMatchesFilter(listing as never, filter as never)) {
    return "pass";
  }
  if (
    filter.minYear != null &&
    (listing.year == null || listing.year < filter.minYear)
  ) {
    return "year";
  }
  if (
    filter.maxYear != null &&
    (listing.year == null || listing.year > filter.maxYear)
  ) {
    return "year";
  }
  if (filter.minDealScore != null && listing.dealScore < filter.minDealScore) {
    return "minDealScore";
  }
  if (filter.brand && !listing.brand) return "brand";
  if (filter.series && !(listing.series || listing.model)) return "series";
  if (filter.city && filter.city !== "Tüm Türkiye" && !listing.city) {
    return "city";
  }
  return "other";
}

async function main() {
  const filterId = arg("filter");
  const brand = arg("brand", "Honda");
  const series = arg("series", "Civic");

  const filter = filterId
    ? await prisma.userFilter.findUnique({ where: { id: filterId } })
    : await prisma.userFilter.findFirst({
        where: {
          isActive: true,
          brand: { equals: brand, mode: "insensitive" },
          OR: [
            { series: { equals: series, mode: "insensitive" } },
            { model: { equals: series, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

  if (!filter) {
    console.error("FILTER_NOT_FOUND");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { id: filter.userId },
    select: {
      id: true,
      subscriptionPlan: true,
      expoPushToken: true,
      telegramChatId: true,
    },
  });

  const intent = buildSearchIntentFromFilter(filter);
  const availability = await loadAvailabilityMap().catch(() =>
    defaultAvailabilityMap(),
  );
  const reliability = await loadReliabilityMap().catch(() => ({}));
  const coverageBase = evaluateCoverage(intent, availability);
  const coverageRows = applyReliabilityToCoverage(coverageBase, reliability);
  const coverageSnap = buildFilterCoverageSnapshot(
    filter.id,
    intent,
    coverageBase,
    reliability,
  );

  const schedulerInput = {
    id: filter.id,
    isActive: filter.isActive,
    category: filter.category,
    subcategory: filter.subcategory,
    brand: filter.brand,
    series: filter.series ?? filter.model,
    trim: filter.trim,
    city: filter.city,
    district: filter.district,
    minYear: filter.minYear,
    maxYear: filter.maxYear,
    minMileage: filter.minMileage,
    maxMileage: filter.maxMileage,
    minPrice: filter.minPrice,
    maxPrice: filter.maxPrice,
    keywords: filter.keywords ?? [],
    plan: user?.subscriptionPlan ?? SubscriptionPlan.FREE,
  };

  const groups = groupActiveFilters([schedulerInput], {
    availability,
    reliability,
  });
  const platforms = ["arabam", "letgo", "otoplus", "sahibinden"] as const;
  const queries: Record<string, unknown> = {};
  for (const platform of platforms) {
    const built = buildPlatformQuery(platform, schedulerInput).built;
    queries[platform] = {
      url: built.url,
      query: built.query,
      appliedCriteria: built.appliedCriteria,
      deferredCriteria: built.deferredCriteria,
      scheduled: groups.some((g) => g.platform === platform),
    };
  }

  const matchRows = await prisma.userListingMatch.findMany({
    where: { filterId: filter.id },
    include: {
      listing: {
        select: {
          id: true,
          platform: true,
          brand: true,
          series: true,
          year: true,
          mileage: true,
          price: true,
          city: true,
          imageUrl: true,
          dealScore: true,
          marketStatus: true,
          marketSampleSize: true,
          marketMedianPrice: true,
          title: true,
          url: true,
          rawDetails: true,
        },
      },
    },
  });

  const matchesByPlatform: Record<string, number> = {};
  for (const row of matchRows) {
    const p = row.listing.platform;
    matchesByPlatform[p] = (matchesByPlatform[p] ?? 0) + 1;
  }

  let feedByPlatform: Record<string, number> = {};
  let feedTotal = 0;
  let feedSample: unknown[] = [];
  try {
    const page = await dealService.getUserMatchedDeals(filter.userId, {
      limit: 50,
      sort: "newest",
    });
    feedTotal = page.deals.length;
    for (const deal of page.deals) {
      const p = deal.platform;
      feedByPlatform[p] = (feedByPlatform[p] ?? 0) + 1;
    }
    feedSample = page.deals.slice(0, 8).map((d) => ({
      id: d.id,
      platform: d.platform,
      platformLabel: d.platformLabel ?? listingPlatformLabel(d.platform),
      title: d.title?.slice(0, 60),
      price: d.price,
      dealScore: d.dealScore,
      marketStatus: d.marketStatus,
      hasImage: Boolean(d.imageUrl),
      listingUrl: d.listingUrl,
      matchedFilterCount: d.matchedFilterCount,
      marketSourceCount: d.marketSourceCount,
    }));
  } catch (e) {
    feedByPlatform = { error: String(e) } as never;
  }

  const eligibility: Record<
    string,
    { eligible: number; reasons: Record<string, number> }
  > = {};
  for (const platform of ["arabam", "letgo", "otoplus"] as const) {
    const subset = matchRows.filter((m) => m.listing.platform === platform);
    const reasons: Record<string, number> = {};
    let eligible = 0;
    for (const row of subset) {
      const base = canNotifyUserForListing(row.listing, filter);
      let reason: string = base.reason;
      if (base.eligible) {
        if (!filter.notifyPush) {
          reason = "channel_disabled";
        } else if (!user?.expoPushToken) {
          reason = "no_token";
        } else if (
          await hasSuccessfulChannelNotification(
            filter.userId,
            row.listingId,
            NotificationChannel.PUSH,
          )
        ) {
          reason = "already_sent";
        } else {
          eligible += 1;
          reason = "ok";
        }
      }
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    eligibility[platform] = { eligible, reasons };
  }

  const matcherDb: Record<string, unknown> = {};
  for (const platform of ["arabam", "letgo", "otoplus"]) {
    const listings = await prisma.listing.findMany({
      where: {
        platform,
        brand: { equals: filter.brand ?? "Honda", mode: "insensitive" },
        OR: [
          {
            series: {
              contains: filter.series ?? filter.model ?? "Civic",
              mode: "insensitive",
            },
          },
          {
            model: {
              contains: filter.series ?? filter.model ?? "Civic",
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
    });
    let pass = 0;
    let fail = 0;
    const reasons: Record<string, number> = {};
    const fields = {
      brand: 0,
      series: 0,
      trim: 0,
      year: 0,
      mileage: 0,
      price: 0,
      city: 0,
      image: 0,
    };
    for (const row of listings) {
      if (row.brand) fields.brand += 1;
      if (row.series || row.model) fields.series += 1;
      if (row.trim) fields.trim += 1;
      if (row.year != null) fields.year += 1;
      if (row.mileage != null) fields.mileage += 1;
      if (row.price > 0) fields.price += 1;
      if (row.city) fields.city += 1;
      if (row.imageUrl) fields.image += 1;
      const reason = failReason(row, filter);
      if (reason === "pass") pass += 1;
      else {
        fail += 1;
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }
    const n = listings.length || 1;
    matcherDb[platform] = {
      sample: listings.length,
      pass,
      fail,
      reasons,
      completeness: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [
          k,
          Math.round((v / n) * 100),
        ]),
      ),
    };
  }

  const pool = await prisma.listing.groupBy({
    by: ["platform"],
    where: {
      brand: { equals: filter.brand ?? "Honda", mode: "insensitive" },
      series: {
        contains: filter.series ?? filter.model ?? "Civic",
        mode: "insensitive",
      },
      ...(filter.minYear != null && filter.maxYear != null
        ? { year: { gte: filter.minYear, lte: filter.maxYear } }
        : {}),
      price: { gt: 0 },
    },
    _count: { _all: true },
  });

  const readySample = matchRows.find(
    (m) => (m.listing.marketStatus ?? "").toUpperCase() === "READY",
  );

  const miDetail =
    readySample?.listing.rawDetails &&
    typeof readySample.listing.rawDetails === "object"
      ? (readySample.listing.rawDetails as Record<string, unknown>)
      : null;

  console.log(
    JSON.stringify(
      {
        tag: "FILTER_E2E",
        filter: {
          filterId: filter.id,
          userId: filter.userId,
          isActive: filter.isActive,
          name: filter.name,
          category: filter.category,
          subcategory: filter.subcategory,
          brand: filter.brand,
          series: filter.series,
          model: filter.model,
          trim: filter.trim,
          minYear: filter.minYear,
          maxYear: filter.maxYear,
          minMileage: filter.minMileage,
          maxMileage: filter.maxMileage,
          minPrice: filter.minPrice,
          maxPrice: filter.maxPrice,
          city: filter.city,
          district: filter.district,
          minDealScore: filter.minDealScore,
          notifyPush: filter.notifyPush,
          notifyTelegram: filter.notifyTelegram,
          notifyWhatsapp: filter.notifyWhatsapp,
        },
        searchIntent: intent,
        intentExcludes: {
          notifyPush: "not in SearchIntent",
          notifyTelegram: "not in SearchIntent",
          notifyWhatsapp: "not in SearchIntent",
          minDealScore: "not in SearchIntent",
        },
        coverage: coverageRows.map((r) => ({
          platform: r.platform,
          capability: r.capability,
          availability: r.availability,
          reliability: r.reliability,
          effectiveStatus: r.effectiveStatus,
          reason: r.availabilityReason,
        })),
        coverageSummary: {
          activeSourceCount: coverageSnap.activeSourceCount,
          unavailableSourceCount: coverageSnap.unavailableSourceCount,
          statusLabel: coverageSnap.statusLabel,
        },
        queries,
        schedulerGroups: groups.map((g) => ({
          platform: g.platform,
          scrapeUrl: g.scrapeUrl,
          filterIds: g.filterIds,
          appliedCriteria: g.appliedCriteria,
          deferredCriteria: g.deferredCriteria,
        })),
        schedulerPlatforms: [...new Set(groups.map((g) => g.platform))].sort(),
        matches: {
          total: matchRows.length,
          byPlatform: matchesByPlatform,
        },
        feed: {
          total: feedTotal,
          byPlatform: feedByPlatform,
          sample: feedSample,
        },
        notificationEligibilityDryRun: eligibility,
        matcherDbSample: matcherDb,
        threeSourcePool: pool,
        miReadySample: readySample
          ? {
              platform: readySample.listing.platform,
              marketStatus: readySample.listing.marketStatus,
              sampleSize: readySample.listing.marketSampleSize,
              median: readySample.listing.marketMedianPrice,
              dealScore: readySample.listing.dealScore,
              rawSourceMeta: miDetail
                ? {
                    marketSourceCount: miDetail.marketSourceCount,
                    marketSourceDistribution: miDetail.marketSourceDistribution,
                  }
                : null,
            }
          : null,
        userHasPushToken: Boolean(user?.expoPushToken),
      },
      null,
      2,
    ),
  );

  console.error(
    `[FILTER_E2E] filter=${filter.id} arabam matches=${matchesByPlatform.arabam ?? 0} letgo=${matchesByPlatform.letgo ?? 0} otoplus=${matchesByPlatform.otoplus ?? 0} feed=${feedTotal} groups=${groups.map((g) => g.platform).join(",")}`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
