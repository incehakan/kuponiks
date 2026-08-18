import { prisma } from "../lib/prisma.js";
import { ARABAM_BRAND_CANONICAL, catalogNormalizedCandidates } from "./catalog-source-rules.js";
import { vehicleCatalogAliasService } from "./vehicle-catalog-alias.service.js";
import { vehicleCatalogService } from "./vehicle-catalog.service.js";
import type { CatalogSnapshot, CatalogSnapshotBrand } from "./catalog-snapshot.js";
import { validateCatalogSnapshot } from "./catalog-snapshot-validator.js";
import { warmArabamAliasCache } from "./platform-taxonomy.service.js";

const PLATFORM = "arabam";

export interface CatalogSnapshotImportReport {
  dryRun: boolean;
  writeSkipped: boolean;
  snapshotVersion: number;
  snapshotHash: string;
  brandsCreate: number;
  brandsMatch: number;
  brandsUpdate: number;
  seriesCreate: number;
  seriesMatch: number;
  brandAliasesCreate: number;
  brandAliasesMatch: number;
  seriesAliasesCreate: number;
  seriesAliasesMatch: number;
  conflicts: string[];
  ignored: number;
}

interface ExistingCatalog {
  brandsByNorm: Map<string, { id: string; name: string; normalizedName: string }>;
  seriesByBrandNorm: Map<string, Map<string, { id: string; name: string }>>;
  brandAliasBySlug: Map<string, { id: string; brandId: string }>;
  seriesAliasBySlug: Map<string, { id: string; seriesId: string }>;
}

async function loadExistingCatalog(): Promise<ExistingCatalog> {
  const [brands, series, brandAliases, seriesAliases] = await Promise.all([
    prisma.vehicleBrand.findMany({
      where: { isActive: true },
      select: { id: true, name: true, normalizedName: true },
    }),
    prisma.vehicleSeries.findMany({
      where: { isActive: true },
      select: { id: true, name: true, normalizedName: true, brand: { select: { normalizedName: true } } },
    }),
    prisma.vehicleBrandAlias.findMany({
      where: { platform: PLATFORM },
      select: { id: true, sourceSlug: true, brandId: true },
    }),
    prisma.vehicleSeriesAlias.findMany({
      where: { platform: PLATFORM },
      select: { id: true, sourceSlug: true, seriesId: true },
    }),
  ]);

  const brandsByNorm = new Map<string, { id: string; name: string; normalizedName: string }>();
  for (const brand of brands) {
    brandsByNorm.set(brand.normalizedName, brand);
    for (const candidate of catalogNormalizedCandidates(brand.name)) {
      if (!brandsByNorm.has(candidate)) {
        brandsByNorm.set(candidate, brand);
      }
    }
  }

  const seriesByBrandNorm = new Map<string, Map<string, { id: string; name: string }>>();
  for (const row of series) {
    const bySeries = seriesByBrandNorm.get(row.brand.normalizedName) ?? new Map();
    bySeries.set(row.normalizedName, { id: row.id, name: row.name });
    seriesByBrandNorm.set(row.brand.normalizedName, bySeries);
  }

  return {
    brandsByNorm,
    seriesByBrandNorm,
    brandAliasBySlug: new Map(brandAliases.map((a) => [a.sourceSlug, { id: a.id, brandId: a.brandId }])),
    seriesAliasBySlug: new Map(seriesAliases.map((a) => [a.sourceSlug, { id: a.id, seriesId: a.seriesId }])),
  };
}

function resolveExistingBrand(
  existing: ExistingCatalog,
  brand: CatalogSnapshotBrand,
): { id: string; name: string; normalizedName: string } | undefined {
  for (const candidate of [brand.normalizedName, ...catalogNormalizedCandidates(brand.canonicalName)]) {
    const hit = existing.brandsByNorm.get(candidate);
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

function shouldUpdateBrandDisplay(existingName: string, incoming: string): boolean {
  if (existingName === incoming) {
    return false;
  }
  return Object.values(ARABAM_BRAND_CANONICAL).includes(incoming);
}

function emptyReport(snapshot: CatalogSnapshot, dryRun: boolean): CatalogSnapshotImportReport {
  return {
    dryRun,
    writeSkipped: dryRun,
    snapshotVersion: snapshot.version,
    snapshotHash: snapshot.catalogHash,
    brandsCreate: 0,
    brandsMatch: 0,
    brandsUpdate: 0,
    seriesCreate: 0,
    seriesMatch: 0,
    brandAliasesCreate: 0,
    brandAliasesMatch: 0,
    seriesAliasesCreate: 0,
    seriesAliasesMatch: 0,
    conflicts: [],
    ignored: 0,
  };
}

export async function previewCatalogSnapshotImport(
  snapshot: CatalogSnapshot,
): Promise<CatalogSnapshotImportReport> {
  const validation = validateCatalogSnapshot(snapshot);
  if (!validation.ok) {
    const report = emptyReport(snapshot, true);
    report.conflicts = validation.errors;
    report.ignored = validation.errors.length;
    return report;
  }

  const existing = await loadExistingCatalog();
  const report = emptyReport(snapshot, true);
  const claimedBrandIds = new Set<string>();

  for (const brand of snapshot.brands) {
    const found = resolveExistingBrand(existing, brand);
    if (!found) {
      report.brandsCreate += 1;
      report.brandAliasesCreate += 1;
      report.seriesCreate += brand.series.length;
      report.seriesAliasesCreate += brand.series.length;
      continue;
    }
    if (claimedBrandIds.has(found.id)) {
      report.conflicts.push(`brandCollision:${brand.sourceSlug}`);
      continue;
    }
    claimedBrandIds.add(found.id);
    report.brandsMatch += 1;
    if (shouldUpdateBrandDisplay(found.name, brand.canonicalName)) {
      report.brandsUpdate += 1;
    }
    if (!existing.brandAliasBySlug.has(brand.sourceSlug)) {
      report.brandAliasesCreate += 1;
    } else {
      report.brandAliasesMatch += 1;
    }
    const seriesMap =
      existing.seriesByBrandNorm.get(found.normalizedName) ??
      existing.seriesByBrandNorm.get(brand.normalizedName) ??
      new Map();
    for (const series of brand.series) {
      const seriesHit = seriesMap.get(series.normalizedName);
      if (!seriesHit) {
        report.seriesCreate += 1;
      } else {
        report.seriesMatch += 1;
      }
      if (!existing.seriesAliasBySlug.has(series.sourceSlug)) {
        report.seriesAliasesCreate += 1;
      } else {
        report.seriesAliasesMatch += 1;
      }
    }
  }

  return report;
}

export async function importCatalogSnapshot(
  snapshot: CatalogSnapshot,
  options: { dryRun?: boolean } = {},
): Promise<CatalogSnapshotImportReport> {
  if (options.dryRun !== false) {
    return previewCatalogSnapshotImport(snapshot);
  }

  const validation = validateCatalogSnapshot(snapshot);
  if (!validation.ok) {
    const report = emptyReport(snapshot, false);
    report.writeSkipped = true;
    report.conflicts = validation.errors;
    report.ignored = validation.errors.length;
    return report;
  }

  const report = emptyReport(snapshot, false);
  report.writeSkipped = false;

  for (const brand of snapshot.brands) {
    const before = await prisma.vehicleBrand.findFirst({
      where: {
        OR: catalogNormalizedCandidates(brand.canonicalName).map((normalizedName) => ({
          normalizedName,
        })),
      },
      select: { name: true },
    });
    const upserted = await vehicleCatalogService.upsertBrand(brand.canonicalName);
    if (!upserted) {
      report.conflicts.push(`brandUnresolved:${brand.sourceSlug}`);
      continue;
    }
    if (upserted.created) {
      report.brandsCreate += 1;
    } else {
      report.brandsMatch += 1;
      if (before && before.name !== upserted.name) {
        report.brandsUpdate += 1;
      }
    }
    const brandAlias = await vehicleCatalogAliasService.upsertBrandAlias({
      platform: PLATFORM,
      sourceLabel: brand.sourceLabel,
      sourceSlug: brand.sourceSlug,
      brandId: upserted.id,
    });
    if (brandAlias === "created") {
      report.brandAliasesCreate += 1;
    } else {
      report.brandAliasesMatch += 1;
    }
    for (const series of brand.series) {
      const seriesRow = await vehicleCatalogService.upsertSeries(
        brand.canonicalName,
        series.canonicalName,
      );
      if (!seriesRow) {
        report.conflicts.push(`seriesUnresolved:${series.sourceSlug}`);
        continue;
      }
      if (seriesRow.created) {
        report.seriesCreate += 1;
      } else {
        report.seriesMatch += 1;
      }
      const seriesAlias = await vehicleCatalogAliasService.upsertSeriesAlias({
        platform: PLATFORM,
        sourceLabel: series.sourceLabel,
        sourceSlug: series.sourceSlug,
        brandId: upserted.id,
        seriesId: seriesRow.id,
      });
      if (seriesAlias === "created") {
        report.seriesAliasesCreate += 1;
      } else {
        report.seriesAliasesMatch += 1;
      }
    }
  }

  await warmArabamAliasCache();
  return report;
}
