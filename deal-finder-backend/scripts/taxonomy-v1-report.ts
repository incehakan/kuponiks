/**
 * Deterministic URL→series/trim backfill for existing Arabam rows + MI report.
 * No title parsing. Quiet / no notifications.
 */
import { prisma } from "../src/lib/prisma.js";
import {
  parseArabamUrlTaxonomy,
  resolveArabamSeriesTrim,
} from "../src/scraper/utils/arabam-structured.js";
import { marketIntelligenceService } from "../src/market/market-intelligence.service.js";
import { dealScoreService } from "../src/analyzer/deal-score.service.js";
import { marketReanalysisService } from "../src/market/market-reanalysis.service.js";
import { Prisma } from "@prisma/client";

async function main() {
  const rows = await prisma.listing.findMany({
    where: { platform: "arabam", brand: { not: null }, model: { not: null } },
    orderBy: { lastSeenAt: "desc" },
    take: 120,
  });

  let updated = 0;
  for (const r of rows) {
    if (r.series?.trim()) {
      continue;
    }
    const tax = parseArabamUrlTaxonomy(r.url);
    const resolved = resolveArabamSeriesTrim({
      brand: r.brand,
      urlSeries: tax.series,
      ldModel: null,
      domModel: r.model,
    });
    if (!resolved.series) {
      continue;
    }
    const prev =
      r.rawDetails && typeof r.rawDetails === "object" && !Array.isArray(r.rawDetails)
        ? (r.rawDetails as Record<string, unknown>)
        : {};
    await prisma.listing.update({
      where: { id: r.id },
      data: {
        series: resolved.series,
        trim: resolved.trim,
        rawDetails: {
          ...prev,
          sourceSeries: resolved.series,
          seriesSource: resolved.seriesSource,
          ...(resolved.trim
            ? { sourceTrim: resolved.trim, trimSource: resolved.trimSource }
            : {}),
        } as Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }

  const totalArabam = await prisma.listing.count({
    where: { platform: "arabam", brand: { not: null } },
  });
  const withSeries = await prisma.listing.count({
    where: { platform: "arabam", series: { not: null } },
  });
  const withTrim = await prisma.listing.count({
    where: { platform: "arabam", trim: { not: null } },
  });

  const enriched = await prisma.listing.findMany({
    where: {
      platform: "arabam",
      brand: { not: null },
      series: { not: null },
      year: { not: null },
      mileage: { not: null },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 40,
  });

  let ready = 0;
  let insuf = 0;
  const segments: Record<string, number> = {};
  const samples: unknown[] = [];
  const beforeAfter: unknown[] = [];

  for (const listing of enriched.slice(0, 30)) {
    const market = await marketIntelligenceService.analyzeListing({
      id: listing.id,
      externalId: listing.externalId,
      platform: listing.platform,
      price: listing.price,
      currency: listing.currency,
      category: listing.category ?? "Vasıta > Otomobil",
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
        price: listing.price,
        currency: listing.currency,
        city: listing.city,
      },
      market,
    );
    if (market.status === "READY") {
      ready += 1;
      const key = String(market.segmentLevel ?? "UNKNOWN");
      segments[key] = (segments[key] ?? 0) + 1;
      if (samples.length < 5) {
        samples.push({
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
      insuf += 1;
    }
  }

  for (const listing of enriched.slice(0, 5)) {
    const dry = await marketReanalysisService.reanalyzeListing(listing, {
      dryRun: true,
    });
    const live = await marketReanalysisService.reanalyzeListing(listing, {
      dryRun: false,
    });
    beforeAfter.push({
      externalId: listing.externalId,
      before: { score: dry.oldScore, median: dry.oldMedian },
      after: {
        score: live.newScore,
        median: live.newMedian,
        segment: live.segment,
        status: live.status,
        sampleSize: live.sampleSize,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        backfillUpdated: updated,
        totalArabam,
        withSeries,
        withTrim,
        seriesPct: totalArabam ? Math.round((withSeries / totalArabam) * 100) : 0,
        trimPct: totalArabam ? Math.round((withTrim / totalArabam) * 100) : 0,
        analyzed: ready + insuf,
        ready,
        insuf,
        segments,
        samples,
        beforeAfter,
        notifications: 0,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
