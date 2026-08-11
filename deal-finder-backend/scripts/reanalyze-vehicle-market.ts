/**
 * Batch / dry-run Market Intelligence re-analysis for vehicle listings.
 *
 * Usage:
 *   npx tsx scripts/reanalyze-vehicle-market.ts --platform=arabam --limit=50 --dry-run
 *   npx tsx scripts/reanalyze-vehicle-market.ts --platform=arabam --limit=20
 */
process.env.ENABLE_MOCK_LISTINGS = "false";

import { prisma } from "../src/lib/prisma.js";
import { marketReanalysisService } from "../src/market/market-reanalysis.service.js";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const platform = arg("platform") ?? "arabam";
  const limit = Number.parseInt(arg("limit") ?? "50", 10);
  const dryRun = hasFlag("dry-run");

  console.log(
    `[REANALYZE] platform=${platform} limit=${limit} dryRun=${dryRun}`,
  );

  const listings = await prisma.listing.findMany({
    where: {
      platform,
      brand: { not: null },
      OR: [{ series: { not: null } }, { model: { not: null } }],
      year: { not: null },
      mileage: { not: null },
    },
    orderBy: { lastSeenAt: "desc" },
    take: Number.isFinite(limit) && limit > 0 ? limit : 50,
  });

  console.log(`[REANALYZE] candidates=${listings.length}`);

  for (const listing of listings) {
    const result = await marketReanalysisService.reanalyzeListing(listing, {
      dryRun,
    });
    console.log(
      JSON.stringify({
        externalId: result.externalId,
        oldScore: result.oldScore,
        newScore: result.newScore,
        oldMedian: result.oldMedian,
        newMedian: result.newMedian,
        segment: result.segment,
        sampleSize: result.sampleSize,
        status: result.status,
        updated: result.updated,
      }),
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
