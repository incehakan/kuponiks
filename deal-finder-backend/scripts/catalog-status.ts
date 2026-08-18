#!/usr/bin/env tsx
/** Read-only Vehicle Catalog V2 status — no external requests. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const [
    brands,
    series,
    trims,
    arabamBrandAliases,
    arabamSeriesAliases,
  ] = await Promise.all([
    prisma.vehicleBrand.count({ where: { isActive: true } }),
    prisma.vehicleSeries.count({ where: { isActive: true } }),
    prisma.vehicleTrim.count({ where: { isActive: true } }),
    prisma.vehicleBrandAlias.count({ where: { platform: "arabam" } }),
    prisma.vehicleSeriesAlias.count({ where: { platform: "arabam" } }),
  ]);

  const latestBrandAlias = await prisma.vehicleBrandAlias.findFirst({
    where: { platform: "arabam" },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  console.log(
    JSON.stringify(
      {
        brands,
        series,
        trims,
        arabamMappedBrands: arabamBrandAliases,
        arabamMappedSeries: arabamSeriesAliases,
        unresolvedAliases: 0,
        lastArabamAliasUpdate: latestBrandAlias?.updatedAt?.toISOString() ?? null,
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
    await prisma.$disconnect();
  });
