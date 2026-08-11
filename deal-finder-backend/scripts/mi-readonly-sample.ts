/**
 * Read-only Market Intelligence sample report against local DB.
 * Does not mutate listings.
 */
import { dealScoreService } from "../src/analyzer/deal-score.service.js";
import { prisma } from "../src/lib/prisma.js";
import { marketIntelligenceService } from "../src/market/market-intelligence.service.js";

async function main() {
  const candidates = await prisma.listing.findMany({
    where: {
      platform: "arabam",
      brand: { not: null },
      model: { not: null },
      year: { not: null },
      mileage: { not: null },
      currency: { not: null },
      price: { gt: 0 },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 40,
  });

  console.log(`[MI READ-ONLY] candidates=${candidates.length}`);

  let reported = 0;
  for (const listing of candidates) {
    if (reported >= 8) {
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

    console.log(
      JSON.stringify(
        {
          externalId: listing.externalId,
          brand: listing.brand,
          model: listing.model,
          year: listing.year,
          mileage: listing.mileage,
          price: listing.price,
          currency: listing.currency,
          city: listing.city,
          status: market.status,
          segment: market.segmentLevel,
          sampleSize: market.sampleSize,
          marketMedianPrice: market.marketMedianPrice,
          dispersionPct: market.dispersionPct,
          confidence: market.confidence,
          priceAdvantagePct: market.priceAdvantagePct,
          dealScore: score.dealScore,
        },
        null,
        2,
      ),
    );
    reported += 1;
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
