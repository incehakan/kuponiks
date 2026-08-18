import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import {
  discoverArabamBrands,
  discoverArabamSeriesForBrand,
  type ArabamDiscoveredBrand,
  type ArabamDiscoveredSeries,
} from "./arabam-taxonomy-discovery.js";
import {
  ARABAM_CONTROLLED_BRANDS,
  canonicalBrandLabelFromArabam,
  isArabamSeriesFacetSlug,
  isArabamSeriesNoiseSlug,
  isInvalidCatalogValue,
  seriesSlugToDisplayLabel,
} from "./catalog-source-rules.js";
import { vehicleCatalogAliasService } from "./vehicle-catalog-alias.service.js";
import {
  resolveCanonicalSeriesLabel,
  warmArabamAliasCache,
} from "./platform-taxonomy.service.js";
import { vehicleCatalogService } from "./vehicle-catalog.service.js";

const PLATFORM = "arabam";

export interface CatalogSyncOptions {
  dryRun?: boolean;
  brand?: string;
  limitBrands?: number;
  controlledOnly?: boolean;
}

export interface CatalogSyncReport {
  startedAt: string;
  completedAt: string;
  source: typeof PLATFORM;
  dryRun: boolean;
  requestCount: number;
  sourceBrandsFound: number;
  sourceSeriesFound: number;
  brandsCreated: number;
  brandsMatched: number;
  brandsUnchanged: number;
  seriesCreated: number;
  seriesMatched: number;
  seriesUnchanged: number;
  brandAliasesCreated: number;
  brandAliasesUpdated: number;
  seriesAliasesCreated: number;
  seriesAliasesUpdated: number;
  unresolved: string[];
  ignored: number;
  sampleBrands: string[];
  sampleSeries: string[];
}

function defaultSeriesFilter(seriesPart: string): boolean {
  if (isArabamSeriesNoiseSlug(seriesPart)) {
    return false;
  }
  if (isArabamSeriesFacetSlug(seriesPart)) {
    return false;
  }
  if (seriesPart.includes("-") && seriesPart.split("-").length > 2) {
    return false;
  }
  return true;
}

export class VehicleCatalogSyncService {
  async syncFromArabam(options: CatalogSyncOptions = {}): Promise<CatalogSyncReport> {
    const startedAt = new Date().toISOString();
    let requestCount = 0;

    const discoverOpts: Parameters<typeof discoverArabamBrands>[0] = {};
    if (options.brand) {
      discoverOpts.brandFilter = options.brand;
    } else if (options.controlledOnly !== false) {
      discoverOpts.brandSlugs = [...ARABAM_CONTROLLED_BRANDS];
    } else if (options.limitBrands != null) {
      discoverOpts.limitBrands = options.limitBrands;
    }

    requestCount += 1;
    const discoveredBrands = await discoverArabamBrands(discoverOpts);
    requestCount += discoveredBrands.length;

    const report: CatalogSyncReport = {
      startedAt,
      completedAt: startedAt,
      source: PLATFORM,
      dryRun: Boolean(options.dryRun),
      requestCount,
      sourceBrandsFound: discoveredBrands.length,
      sourceSeriesFound: 0,
      brandsCreated: 0,
      brandsMatched: 0,
      brandsUnchanged: 0,
      seriesCreated: 0,
      seriesMatched: 0,
      seriesUnchanged: 0,
      brandAliasesCreated: 0,
      brandAliasesUpdated: 0,
      seriesAliasesCreated: 0,
      seriesAliasesUpdated: 0,
      unresolved: [],
      ignored: 0,
      sampleBrands: [],
      sampleSeries: [],
    };

    for (const sourceBrand of discoveredBrands) {
      await this.syncBrand(sourceBrand, report, options);
    }

    if (!options.dryRun) {
      await warmArabamAliasCache();
    }

    report.completedAt = new Date().toISOString();
    return report;
  }

  private async syncBrand(
    sourceBrand: ArabamDiscoveredBrand,
    report: CatalogSyncReport,
    options: CatalogSyncOptions,
  ): Promise<void> {
    if (isInvalidCatalogValue(sourceBrand.sourceLabel)) {
      report.ignored += 1;
      return;
    }

    const canonicalBrandLabel = canonicalBrandLabelFromArabam(sourceBrand.sourceLabel);
    report.sampleBrands.push(`${sourceBrand.sourceSlug} → ${canonicalBrandLabel}`);
    if (report.sampleBrands.length > 15) {
      report.sampleBrands.pop();
    }

    let brandId: string | null = null;
    let brandCreated = false;

    if (options.dryRun) {
      const existing = await prisma.vehicleBrand.findUnique({
        where: { normalizedName: normalizeMatchText(canonicalBrandLabel) },
      });
      if (existing) {
        report.brandsMatched += 1;
        brandId = existing.id;
      } else {
        report.brandsCreated += 1;
      }
    } else {
      const brand = await vehicleCatalogService.upsertBrand(canonicalBrandLabel);
      if (!brand) {
        report.unresolved.push(`brand:${sourceBrand.sourceSlug}`);
        return;
      }
      brandId = brand.id;
      brandCreated = brand.created;
      if (brand.created) {
        report.brandsCreated += 1;
      } else {
        report.brandsMatched += 1;
      }
    }

    if (!options.dryRun && brandId) {
      const aliasResult = await vehicleCatalogAliasService.upsertBrandAlias({
        platform: PLATFORM,
        sourceLabel: sourceBrand.sourceLabel,
        sourceSlug: sourceBrand.sourceSlug,
        brandId,
      });
      if (aliasResult === "created") {
        report.brandAliasesCreated += 1;
      } else if (aliasResult === "updated") {
        report.brandAliasesUpdated += 1;
      }
    } else if (options.dryRun) {
      report.brandAliasesCreated += 1;
    }

    report.requestCount += 1;
    const seriesList = await discoverArabamSeriesForBrand(sourceBrand, {
      filterSeries: defaultSeriesFilter,
    });
    report.sourceSeriesFound += seriesList.length;
    report.requestCount += 1;

    for (const sourceSeries of seriesList) {
      await this.syncSeries(sourceBrand, sourceSeries, canonicalBrandLabel, report, options, brandId, brandCreated);
    }
  }

  private async syncSeries(
    sourceBrand: ArabamDiscoveredBrand,
    sourceSeries: ArabamDiscoveredSeries,
    canonicalBrandLabel: string,
    report: CatalogSyncReport,
    options: CatalogSyncOptions,
    brandId: string | null,
    brandCreated: boolean,
  ): Promise<void> {
    const seriesLabel = seriesSlugToDisplayLabel(sourceSeries.seriesSlugPart);
    if (isInvalidCatalogValue(seriesLabel)) {
      report.ignored += 1;
      return;
    }

    let canonicalSeriesLabel = seriesLabel;
    if (!options.dryRun && brandId) {
      const existingSeries = await prisma.vehicleSeries.findMany({
        where: { brandId, isActive: true },
        select: { name: true },
      });
      canonicalSeriesLabel = resolveCanonicalSeriesLabel({
        brandNormalizedName: normalizeMatchText(canonicalBrandLabel),
        brandDisplayName: canonicalBrandLabel,
        seriesSlugPart: sourceSeries.seriesSlugPart,
        existingSeriesNames: existingSeries.map((s) => s.name),
      });
    } else if (sourceBrand.sourceSlug === "mercedes-benz") {
      canonicalSeriesLabel = resolveCanonicalSeriesLabel({
        brandNormalizedName: "mercedes-benz",
        brandDisplayName: canonicalBrandLabel,
        seriesSlugPart: sourceSeries.seriesSlugPart,
        existingSeriesNames: ["A Serisi", "C Serisi", "E Serisi", "GLC"],
      });
    }

    report.sampleSeries.push(`${sourceSeries.sourceSlug} → ${canonicalSeriesLabel}`);
    if (report.sampleSeries.length > 20) {
      report.sampleSeries.shift();
    }

    let seriesId: string | null = null;

    if (options.dryRun) {
      if (brandCreated) {
        report.seriesCreated += 1;
      } else {
        const brandNorm = normalizeMatchText(canonicalBrandLabel);
        const brand = await prisma.vehicleBrand.findUnique({
          where: { normalizedName: brandNorm },
        });
        const existing = brand
          ? await prisma.vehicleSeries.findFirst({
              where: {
                brandId: brand.id,
                normalizedName: normalizeMatchText(canonicalSeriesLabel),
              },
            })
          : null;
        if (existing) {
          report.seriesMatched += 1;
        } else {
          report.seriesCreated += 1;
        }
      }
      report.seriesAliasesCreated += 1;
      return;
    }

    const series = await vehicleCatalogService.upsertSeries(
      canonicalBrandLabel,
      canonicalSeriesLabel,
    );
    if (!series) {
      report.unresolved.push(`series:${sourceSeries.sourceSlug}`);
      return;
    }
    seriesId = series.id;
    if (series.created) {
      report.seriesCreated += 1;
    } else {
      report.seriesMatched += 1;
    }

    if (brandId && seriesId) {
      const aliasResult = await vehicleCatalogAliasService.upsertSeriesAlias({
        platform: PLATFORM,
        sourceLabel: seriesLabel,
        sourceSlug: sourceSeries.sourceSlug,
        brandId,
        seriesId,
      });
      if (aliasResult === "created") {
        report.seriesAliasesCreated += 1;
      } else if (aliasResult === "updated") {
        report.seriesAliasesUpdated += 1;
      }
    }
  }
}

export const vehicleCatalogSyncService = new VehicleCatalogSyncService();

export type { ArabamDiscoveredBrand, ArabamDiscoveredSeries };
