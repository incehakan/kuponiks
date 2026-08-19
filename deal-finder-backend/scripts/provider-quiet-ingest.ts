#!/usr/bin/env tsx
/**
 * Controlled quiet ingest — max 20, no notifications.
 *
 *   npx tsx scripts/provider-quiet-ingest.ts --platform=otoplus --limit=20
 */
process.env.ENABLE_MOCK_LISTINGS = "false";

import { prisma } from "../src/lib/prisma.js";
import { resolveScraperAdapter } from "../src/scraper/adapters/index.js";
import { runAdapterPipeline } from "../src/scraper/scraper.manager.js";
import { buildPlatformQuery } from "../src/scraper/query/scrape-query-planner.js";
import type { ScrapePlatform } from "../src/queues/scraper.queue.js";
import { SubscriptionPlan } from "@prisma/client";
import { listingMatchesFilter } from "../src/filters/filter-match.engine.js";

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

async function main() {
  const platform = (arg("platform", "otoplus") || "otoplus") as ScrapePlatform;
  const limit = Math.min(20, Math.max(1, Number(arg("limit", "20")) || 20));
  const brand = arg("brand") || null;
  const series = arg("series") || null;
  const built = buildPlatformQuery(platform, {
    id: "ingest",
    isActive: true,
    category: "Vasıta > Otomobil",
    brand,
    series,
    trim: null,
    city: null,
    keywords: [],
    plan: SubscriptionPlan.VIP,
  }).built;
  const scrapeUrl = arg("url") || built.url;
  const adapter = resolveScraperAdapter(platform);
  if (!adapter) {
    throw new Error(`No adapter for ${platform}`);
  }
  const { rawCount, normalized, error } = await runAdapterPipeline(adapter, {
    query: [brand, series].filter(Boolean).join(" ") || platform,
    category: "Vasıta > Otomobil",
    limit,
    scrapeUrl,
  });
  if (error) {
    console.error(error.message);
  }
  const { scraperService } = await import("../src/scraper/scraper.service.js");
  let created = 0;
  let updated = 0;
  let duplicates = 0;
  let skipped = 0;
  const ids: string[] = [];
  for (const item of normalized.slice(0, limit)) {
    const result = await scraperService.ingestNormalizedListing(item, {
      quiet: true,
      skipComparableReanalysis: true,
    });
    if (result.status === "created" || result.status === "updated") {
      ids.push(result.listing.id);
      if (result.status === "created") created += 1;
      else updated += 1;
    } else if (result.status === "duplicate") {
      duplicates += 1;
    } else {
      skipped += 1;
    }
  }
  const rows = await prisma.listing.findMany({ where: { id: { in: ids } } });
  let firstSeenUnchanged: boolean | null = null;
  const sample = rows[0];
  if (sample) {
    const before = sample.firstSeenAt;
    const again = await scraperService.ingestNormalizedListing(
      normalized.find((item) => item.externalId === sample.externalId)!,
      { quiet: true, skipComparableReanalysis: true },
    );
    if (again.status === "created" || again.status === "updated") {
      firstSeenUnchanged =
        again.listing.firstSeenAt.getTime() === before.getTime();
    }
  }
  const hondaFilter = await prisma.userFilter.findFirst({
    where: {
      isActive: true,
      brand: { equals: "Honda", mode: "insensitive" },
      series: { equals: "Civic", mode: "insensitive" },
    },
  });
  const matcher = hondaFilter
    ? rows.map((listing) => ({
        externalId: listing.externalId,
        year: listing.year,
        pass: listingMatchesFilter(listing, hondaFilter),
      }))
    : [];
  console.log(
    JSON.stringify(
      {
        platform,
        scrapeUrl,
        rawCount,
        normalized: normalized.length,
        created,
        updated,
        duplicates,
        skipped,
        firstSeenUnchanged,
        matcher,
        sample: rows.slice(0, 3).map((row) => ({
          id: row.id,
          externalId: row.externalId,
          platform: row.platform,
          brand: row.brand,
          series: row.series,
          year: row.year,
          mileage: row.mileage,
          price: row.price,
          marketStatus: row.marketStatus,
          marketSampleSize: row.marketSampleSize,
          marketMedianPrice: row.marketMedianPrice,
          dealScore: row.dealScore,
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
