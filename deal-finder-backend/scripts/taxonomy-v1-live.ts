/**
 * Controlled quiet Arabam ingest for Vehicle Taxonomy V1 + MI V1.1 quality.
 * Notification enqueue disabled. Limited volume.
 */
process.env.ENABLE_MOCK_LISTINGS = "false";

import { prisma } from "../src/lib/prisma.js";
import { arabamAdapter } from "../src/scraper/adapters/arabam.adapter.js";
import { runAdapterPipeline } from "../src/scraper/scraper.manager.js";
import { scraperService } from "../src/scraper/scraper.service.js";
import { marketIntelligenceService } from "../src/market/market-intelligence.service.js";
import { dealScoreService } from "../src/analyzer/deal-score.service.js";

async function main() {
  console.log("[TAXONOMY LIVE] quiet arabam ingest, mocks off, notifications off");
  const { rawCount, normalized, error } = await runAdapterPipeline(arabamAdapter, {
    query: "honda civic",
    category: "Vasıta > Otomobil",
    limit: 30,
  });

  if (error) {
    console.error("[TAXONOMY LIVE] pipeline error", error.message);
  }

  console.log(`[TAXONOMY LIVE] raw=${rawCount} normalized=${normalized.length}`);

  let created = 0;
  let updated = 0;
  const ids: string[] = [];

  for (const item of normalized.slice(0, 30)) {
    const result = await scraperService.ingestNormalizedListing(item, {
      quiet: true,
      skipComparableReanalysis: true,
    });
    if (result.status === "created") {
      created += 1;
      ids.push(result.listing.id);
    } else if (result.status === "updated") {
      updated += 1;
      ids.push(result.listing.id);
    }
  }

  console.log(`[TAXONOMY LIVE] created=${created} updated=${updated}`);

  const recent = await prisma.listing.findMany({
    where: { id: { in: ids } },
    select: {
      externalId: true,
      brand: true,
      series: true,
      trim: true,
      model: true,
      year: true,
      mileage: true,
      price: true,
      currency: true,
      city: true,
    },
  });

  const n = recent.length || 1;
  const filled = (key: keyof (typeof recent)[0]) =>
    recent.filter((r) => {
      const v = r[key];
      return v != null && String(v).trim() !== "";
    }).length;

  console.log(
    JSON.stringify(
      {
        sample: recent.length,
        brandPct: Math.round((filled("brand") / n) * 100),
        seriesPct: Math.round((filled("series") / n) * 100),
        trimPct: Math.round((filled("trim") / n) * 100),
        modelPct: Math.round((filled("model") / n) * 100),
        yearPct: Math.round((filled("year") / n) * 100),
        mileagePct: Math.round((filled("mileage") / n) * 100),
      },
      null,
      2,
    ),
  );

  const segments: Record<string, number> = {};
  let ready = 0;
  let insufficient = 0;
  const readySamples: unknown[] = [];

  for (const listing of recent.slice(0, 25)) {
    const market = await marketIntelligenceService.analyzeListing({
      externalId: listing.externalId,
      platform: "arabam",
      price: listing.price!,
      currency: listing.currency,
      category: "Vasıta > Otomobil",
      brand: listing.brand,
      model: listing.model,
      series: listing.series,
      trim: listing.trim,
      year: listing.year,
      mileage: listing.mileage,
      city: listing.city,
    });
    const score = dealScoreService.calculateFromMarket(
      {
        brand: listing.brand,
        model: listing.model,
        year: listing.year,
        mileage: listing.mileage,
        price: listing.price!,
        currency: listing.currency,
        city: listing.city,
      },
      market,
    );

    if (market.status === "READY") {
      ready += 1;
      const key = market.segmentLevel ?? "UNKNOWN";
      segments[key] = (segments[key] ?? 0) + 1;
      if (readySamples.length < 5) {
        readySamples.push({
          externalId: listing.externalId,
          brand: listing.brand,
          series: listing.series,
          trim: listing.trim,
          year: listing.year,
          mileage: listing.mileage,
          price: listing.price,
          median: market.marketMedianPrice,
          sampleSize: market.sampleSize,
          segment: market.segmentLevel,
          confidence: market.confidence,
          advantage: market.priceAdvantagePct,
          score: score.dealScore,
        });
      }
    } else {
      insufficient += 1;
    }
  }

  console.log(
    JSON.stringify({ ready, insufficient, segments, readySamples }, null, 2),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
