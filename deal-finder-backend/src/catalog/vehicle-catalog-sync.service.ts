import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import {
  discoverArabamBrands,
  discoverArabamSeriesForBrand,
  type ArabamDiscoveredBrand,
  type ArabamDiscoveredSeries,
  type DiscoveryFetchStats,
} from "./arabam-taxonomy-discovery.js";
import {
  ARABAM_CONTROLLED_BRANDS,
  SPECIAL_REVIEW_BRANDS,
  isAllowedCatalogSeries,
  catalogNormalizedCandidates,
  normalizeCatalogIdentity,
  resolveCanonicalBrandLabel,
  isGarbageBrandSlug,
  isInvalidCatalogValue,
  looksLikeSlugDisplay,
  seriesSlugToDisplayLabel,
} from "./catalog-source-rules.js";
import {
  evaluateCatalogQualityGate,
  type CatalogBrandReview,
  type CatalogQualityGate,
  type CatalogSeriesReview,
} from "./catalog-quality-gate.js";
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
  writeSkipped: boolean;
  requestCount: number;
  fetchFailureCount: number;
  failedPaths: string[];
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
  brandReviews: CatalogBrandReview[];
  seriesIgnoredSample: CatalogSeriesReview[];
  specialBrandReview: Array<{
    expected: string;
    found: CatalogBrandReview | null;
  }>;
  qualityGate: CatalogQualityGate;
  brandMappingPct: number | null;
  seriesMappingPct: number | null;
}

interface ClassifiedBrand {
  source: ArabamDiscoveredBrand;
  review: CatalogBrandReview;
  canonicalLabel: string;
  existingId: string | null;
}

interface ClassifiedSeries {
  sourceBrand: ArabamDiscoveredBrand;
  source: ArabamDiscoveredSeries;
  review: CatalogSeriesReview;
  canonicalBrandLabel: string;
  canonicalSeriesLabel: string;
}

export class VehicleCatalogSyncService {
  async syncFromArabam(options: CatalogSyncOptions = {}): Promise<CatalogSyncReport> {
    const startedAt = new Date().toISOString();
    const stats: DiscoveryFetchStats = {
      requestCount: 0,
      failureCount: 0,
      failedPaths: [],
    };

    const discoverOpts: Parameters<typeof discoverArabamBrands>[0] = { stats };
    if (options.brand) {
      discoverOpts.brandFilter = options.brand;
    } else if (options.controlledOnly !== false) {
      discoverOpts.brandSlugs = [...ARABAM_CONTROLLED_BRANDS];
    } else if (options.limitBrands != null) {
      discoverOpts.limitBrands = options.limitBrands;
    }

    let discoveredBrands: ArabamDiscoveredBrand[] = [];
    try {
      discoveredBrands = await discoverArabamBrands(discoverOpts);
    } catch {
      stats.failureCount += 1;
      stats.failedPaths.push("/ikinci-el/otomobil");
    }

    const classifiedBrands: ClassifiedBrand[] = [];
    const classifiedSeries: ClassifiedSeries[] = [];

    for (const sourceBrand of discoveredBrands) {
      const classified = await this.classifyBrand(sourceBrand);
      classifiedBrands.push(classified);
      if (classified.review.status === "IGNORED" || classified.review.status === "UNRESOLVED") {
        continue;
      }
      try {
        const seriesList = await discoverArabamSeriesForBrand(sourceBrand, {
          filterSeries: (part) => isAllowedCatalogSeries(part),
          stats,
        });
        const existingNames = classified.existingId
          ? (
              await prisma.vehicleSeries.findMany({
                where: { brandId: classified.existingId, isActive: true },
                select: { name: true },
              })
            ).map((s) => s.name)
          : [];
        for (const sourceSeries of seriesList) {
          classifiedSeries.push(
            this.classifySeries(sourceBrand, sourceSeries, classified, existingNames),
          );
        }
      } catch {
        continue;
      }
    }

    const brandReviews = classifiedBrands.map((b) => b.review);
    const seriesReviews = classifiedSeries.map((s) => s.review);
    const qualityGate = evaluateCatalogQualityGate({
      brands: brandReviews,
      series: seriesReviews,
      fetchRequestCount: stats.requestCount,
      fetchFailureCount: stats.failureCount,
    });

    const report = this.emptyReport(startedAt, options, stats, discoveredBrands.length);
    report.sourceSeriesFound = classifiedSeries.filter(
      (s) => s.review.status === "NEW" || s.review.status === "MATCHED",
    ).length;
    report.brandsMatched = brandReviews.filter((b) => b.status === "MATCHED").length;
    report.brandsCreated = brandReviews.filter((b) => b.status === "NEW").length;
    report.seriesMatched = seriesReviews.filter((s) => s.status === "MATCHED").length;
    report.seriesCreated = seriesReviews.filter((s) => s.status === "NEW").length;
    report.ignored =
      brandReviews.filter((b) => b.status === "IGNORED").length +
      seriesReviews.filter((s) => s.status === "IGNORED").length;
    report.unresolved = [
      ...brandReviews
        .filter((b) => b.status === "UNRESOLVED")
        .map((b) => `brand:${b.sourceSlug}`),
      ...seriesReviews
        .filter((s) => s.status === "UNRESOLVED")
        .map((s) => `series:${s.sourceSlug}`),
    ];
    report.brandReviews = brandReviews;
    report.seriesIgnoredSample = seriesReviews
      .filter((s) => s.status === "IGNORED" || s.status === "UNRESOLVED")
      .slice(0, 40);
    report.specialBrandReview = SPECIAL_REVIEW_BRANDS.map((expected) => {
      const found =
        brandReviews.find(
          (b) => normalizeMatchText(b.canonicalMatch ?? "") === normalizeMatchText(expected),
        ) ?? null;
      return { expected, found };
    });
    report.sampleBrands = brandReviews
      .filter((b) => b.status === "NEW" || b.status === "MATCHED")
      .slice(0, 15)
      .map((b) => `${b.sourceSlug} → ${b.canonicalMatch}`);
    report.sampleSeries = seriesReviews
      .filter((s) => s.status === "NEW" || s.status === "MATCHED")
      .slice(-20)
      .map((s) => `${s.sourceSlug} → ${s.canonicalMatch}`);
    report.qualityGate = qualityGate;

    const wouldWriteBrands = classifiedBrands.filter(
      (b) => b.review.status === "NEW" || b.review.status === "MATCHED",
    );
    const wouldWriteSeries = classifiedSeries.filter(
      (s) => s.review.status === "NEW" || s.review.status === "MATCHED",
    );
    if (options.dryRun) {
      report.brandAliasesCreated = wouldWriteBrands.length;
      report.seriesAliasesCreated = wouldWriteSeries.length;
      report.completedAt = new Date().toISOString();
      await this.attachMappingPct(report);
      return report;
    }

    if (!qualityGate.pass) {
      report.writeSkipped = true;
      report.completedAt = new Date().toISOString();
      await this.attachMappingPct(report);
      return report;
    }

    for (const item of wouldWriteBrands) {
      const brand = await vehicleCatalogService.upsertBrand(item.canonicalLabel);
      if (!brand) {
        report.unresolved.push(`brand:${item.source.sourceSlug}`);
        continue;
      }
      const aliasResult = await vehicleCatalogAliasService.upsertBrandAlias({
        platform: PLATFORM,
        sourceLabel: item.source.sourceLabel,
        sourceSlug: item.source.sourceSlug,
        brandId: brand.id,
      });
      if (aliasResult === "created") {
        report.brandAliasesCreated += 1;
      } else if (aliasResult === "updated") {
        report.brandAliasesUpdated += 1;
      }
      item.existingId = brand.id;
    }

    const brandIdBySlug = new Map(
      wouldWriteBrands
        .filter((b) => b.existingId)
        .map((b) => [b.source.sourceSlug, b.existingId!]),
    );

    for (const item of wouldWriteSeries) {
      const series = await vehicleCatalogService.upsertSeries(
        item.canonicalBrandLabel,
        item.canonicalSeriesLabel,
      );
      if (!series) {
        report.unresolved.push(`series:${item.source.sourceSlug}`);
        continue;
      }
      const brandId = brandIdBySlug.get(item.sourceBrand.sourceSlug);
      if (!brandId) {
        continue;
      }
      const aliasResult = await vehicleCatalogAliasService.upsertSeriesAlias({
        platform: PLATFORM,
        sourceLabel: item.canonicalSeriesLabel,
        sourceSlug: item.source.sourceSlug,
        brandId,
        seriesId: series.id,
      });
      if (aliasResult === "created") {
        report.seriesAliasesCreated += 1;
      } else if (aliasResult === "updated") {
        report.seriesAliasesUpdated += 1;
      }
    }

    await warmArabamAliasCache();
    report.completedAt = new Date().toISOString();
    await this.attachMappingPct(report);
    return report;
  }

  private emptyReport(
    startedAt: string,
    options: CatalogSyncOptions,
    stats: DiscoveryFetchStats,
    sourceBrandsFound: number,
  ): CatalogSyncReport {
    return {
      startedAt,
      completedAt: startedAt,
      source: PLATFORM,
      dryRun: Boolean(options.dryRun),
      writeSkipped: false,
      requestCount: stats.requestCount,
      fetchFailureCount: stats.failureCount,
      failedPaths: stats.failedPaths,
      sourceBrandsFound,
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
      brandReviews: [],
      seriesIgnoredSample: [],
      specialBrandReview: [],
      qualityGate: {
        pass: false,
        reasons: [],
        garbageDetected: 0,
        duplicateCandidates: 0,
        fetchFailureRate: 0,
        unresolvedBrands: 0,
        unresolvedSeries: 0,
        ignoredBrands: 0,
        ignoredSeries: 0,
      },
      brandMappingPct: null,
      seriesMappingPct: null,
    };
  }

  private async classifyBrand(sourceBrand: ArabamDiscoveredBrand): Promise<ClassifiedBrand> {
    if (
      isGarbageBrandSlug(sourceBrand.sourceSlug) ||
      isInvalidCatalogValue(sourceBrand.sourceLabel)
    ) {
      return {
        source: sourceBrand,
        canonicalLabel: "",
        existingId: null,
        review: {
          sourceLabel: sourceBrand.sourceLabel,
          sourceSlug: sourceBrand.sourceSlug,
          normalized: normalizeMatchText(sourceBrand.sourceLabel),
          canonicalMatch: null,
          status: "IGNORED",
        },
      };
    }

    const canonicalLabel = resolveCanonicalBrandLabel(
      sourceBrand.sourceLabel,
      sourceBrand.sourceSlug,
    );
    if (
      isInvalidCatalogValue(canonicalLabel) ||
      looksLikeSlugDisplay(canonicalLabel, sourceBrand.sourceSlug)
    ) {
      return {
        source: sourceBrand,
        canonicalLabel,
        existingId: null,
        review: {
          sourceLabel: sourceBrand.sourceLabel,
          sourceSlug: sourceBrand.sourceSlug,
          normalized: normalizeCatalogIdentity(canonicalLabel),
          canonicalMatch: null,
          status: "UNRESOLVED",
        },
      };
    }

    const canonicalIdentity = normalizeCatalogIdentity(canonicalLabel);
    let existing = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: canonicalIdentity },
    });
    if (!existing) {
      for (const candidate of catalogNormalizedCandidates(canonicalLabel)) {
        if (candidate === canonicalIdentity) {
          continue;
        }
        existing = await prisma.vehicleBrand.findUnique({
          where: { normalizedName: candidate },
        });
        if (existing) {
          break;
        }
      }
    }
    return {
      source: sourceBrand,
      canonicalLabel,
      existingId: existing?.id ?? null,
      review: {
        sourceLabel: sourceBrand.sourceLabel,
        sourceSlug: sourceBrand.sourceSlug,
        normalized: canonicalIdentity,
        canonicalMatch: existing?.name ?? canonicalLabel,
        status: existing ? "MATCHED" : "NEW",
      },
    };
  }

  private classifySeries(
    sourceBrand: ArabamDiscoveredBrand,
    sourceSeries: ArabamDiscoveredSeries,
    brand: ClassifiedBrand,
    existingSeriesNames: string[],
  ): ClassifiedSeries {
    const derived = seriesSlugToDisplayLabel(sourceSeries.seriesSlugPart);
    if (!isAllowedCatalogSeries(sourceSeries.seriesSlugPart) || isInvalidCatalogValue(derived)) {
      return {
        sourceBrand,
        source: sourceSeries,
        canonicalBrandLabel: brand.canonicalLabel,
        canonicalSeriesLabel: derived,
        review: {
          brand: brand.canonicalLabel,
          sourceSeriesLabel: derived,
          sourceSlug: sourceSeries.sourceSlug,
          canonicalMatch: null,
          status: "IGNORED",
        },
      };
    }

    const canonicalSeriesLabel = resolveCanonicalSeriesLabel({
      brandNormalizedName: normalizeMatchText(brand.canonicalLabel),
      brandDisplayName: brand.canonicalLabel,
      seriesSlugPart: sourceSeries.seriesSlugPart,
      existingSeriesNames,
    });

    if (looksLikeSlugDisplay(canonicalSeriesLabel, sourceSeries.sourceSlug)) {
      return {
        sourceBrand,
        source: sourceSeries,
        canonicalBrandLabel: brand.canonicalLabel,
        canonicalSeriesLabel,
        review: {
          brand: brand.canonicalLabel,
          sourceSeriesLabel: derived,
          sourceSlug: sourceSeries.sourceSlug,
          canonicalMatch: null,
          status: "UNRESOLVED",
        },
      };
    }

    const existing = existingSeriesNames.find(
      (name) => normalizeMatchText(name) === normalizeMatchText(canonicalSeriesLabel),
    );
    return {
      sourceBrand,
      source: sourceSeries,
      canonicalBrandLabel: brand.canonicalLabel,
      canonicalSeriesLabel: existing ?? canonicalSeriesLabel,
      review: {
        brand: brand.canonicalLabel,
        sourceSeriesLabel: derived,
        sourceSlug: sourceSeries.sourceSlug,
        canonicalMatch: existing ?? canonicalSeriesLabel,
        status: existing ? "MATCHED" : "NEW",
      },
    };
  }

  private async attachMappingPct(report: CatalogSyncReport): Promise<void> {
    const [brands, series, brandAliases, seriesAliases] = await Promise.all([
      prisma.vehicleBrand.count({ where: { isActive: true } }),
      prisma.vehicleSeries.count({ where: { isActive: true } }),
      prisma.vehicleBrandAlias.count({ where: { platform: "arabam" } }),
      prisma.vehicleSeriesAlias.count({ where: { platform: "arabam" } }),
    ]);
    report.brandMappingPct =
      brands > 0 ? Math.round((brandAliases / brands) * 1000) / 10 : null;
    report.seriesMappingPct =
      series > 0 ? Math.round((seriesAliases / series) * 1000) / 10 : null;
  }
}

export const vehicleCatalogSyncService = new VehicleCatalogSyncService();

export type { ArabamDiscoveredBrand, ArabamDiscoveredSeries };
