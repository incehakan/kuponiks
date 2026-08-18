#!/usr/bin/env tsx
/** Read-only Vehicle Catalog status — no external requests. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { defaultCatalogSnapshotPath } from "../src/catalog/catalog-snapshot.js";
import { readCatalogSnapshotFile } from "../src/catalog/catalog-snapshot-write.js";
import { validateCatalogSnapshot } from "../src/catalog/catalog-snapshot-validator.js";

async function main(): Promise<void> {
  const [brands, series, trims, arabamBrandAliases, arabamSeriesAliases] =
    await Promise.all([
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

  let snapshot: {
    snapshotVersion: number | null;
    snapshotHash: string | null;
    snapshotBrands: number | null;
    snapshotSeries: number | null;
    snapshotValid: boolean | null;
  } = {
    snapshotVersion: null,
    snapshotHash: null,
    snapshotBrands: null,
    snapshotSeries: null,
    snapshotValid: null,
  };

  try {
    const file = await readCatalogSnapshotFile(defaultCatalogSnapshotPath());
    const validation = validateCatalogSnapshot(file);
    snapshot = {
      snapshotVersion: file.version,
      snapshotHash: file.catalogHash,
      snapshotBrands: file.brands.length,
      snapshotSeries: file.brands.reduce((n, b) => n + b.series.length, 0),
      snapshotValid: validation.ok,
    };
  } catch {
    snapshot = {
      snapshotVersion: null,
      snapshotHash: null,
      snapshotBrands: null,
      snapshotSeries: null,
      snapshotValid: false,
    };
  }

  console.log(
    JSON.stringify(
      {
        snapshotVersion: snapshot.snapshotVersion,
        snapshotHash: snapshot.snapshotHash,
        snapshotBrands: snapshot.snapshotBrands,
        snapshotSeries: snapshot.snapshotSeries,
        snapshotValid: snapshot.snapshotValid,
        brands,
        series,
        trims,
        arabamMappedBrands: arabamBrandAliases,
        arabamMappedSeries: arabamSeriesAliases,
        unresolvedAliases: 0,
        brandMappingPct:
          brands > 0 ? Math.round((arabamBrandAliases / brands) * 1000) / 10 : 0,
        seriesMappingPct:
          series > 0 ? Math.round((arabamSeriesAliases / series) * 1000) / 10 : 0,
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
