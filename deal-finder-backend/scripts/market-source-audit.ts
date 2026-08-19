/**
 * Read-only production/local market source audit.
 * DB WRITE YOK. Scrape yok. Notification yok.
 */
import { prisma } from "../src/lib/prisma.js";
import { marketIntelligenceService } from "../src/market/market-intelligence.service.js";
import { runMarketSourceAudit } from "../src/market/market-source-audit.js";

async function sampleReadyAnalyses(): Promise<unknown[]> {
  const listings = await prisma.listing.findMany({
    where: {
      platform: { not: "mock" },
      marketStatus: "READY",
      brand: { not: null },
      year: { not: null },
      mileage: { not: null },
      price: { gt: 0 },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 80,
  });

  const samples: unknown[] = [];
  const seenPlatforms = new Set<string>();

  for (const listing of listings) {
    if (samples.length >= 8) {
      break;
    }
    const market = await marketIntelligenceService.analyzeListing({
      id: listing.id,
      externalId: listing.externalId,
      platform: listing.platform,
      price: listing.price,
      currency: listing.currency,
      category: listing.category,
      brand: listing.brand,
      model: listing.model,
      series: listing.series,
      trim: listing.trim,
      year: listing.year,
      mileage: listing.mileage,
      city: listing.city,
    });
    if (market.status !== "READY") {
      continue;
    }
    const preferUnderrepresented =
      !seenPlatforms.has(listing.platform) || samples.length < 5;
    if (!preferUnderrepresented) {
      continue;
    }
    seenPlatforms.add(listing.platform);
    samples.push({
      listing: `${listing.platform}:${listing.externalId}`,
      brand: listing.brand,
      series: listing.series,
      year: listing.year,
      price: listing.price,
      median: market.marketMedianPrice,
      advantage: market.priceAdvantagePct,
      sampleSize: market.sampleSize,
      sourceCount: market.sourceCount,
      sourceDistribution: market.sourceDistribution,
      dominantSourcePct: market.dominantSourcePct,
      diversity: market.diversity,
      confidence: market.confidence,
    });
  }

  return samples;
}

async function main() {
  const audit = await runMarketSourceAudit();
  const samples = await sampleReadyAnalyses();
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        writes: false,
        scrape: false,
        notification: false,
        ...audit,
        samples,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
