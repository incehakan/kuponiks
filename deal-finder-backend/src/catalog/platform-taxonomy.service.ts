import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import {
  deriveArabamSlugsFromCanonical,
} from "./arabam-taxonomy-discovery.js";
import {
  ARABAM_BMW_NUMBER_SERIES,
  ARABAM_MERCEDES_LETTER_SERIES,
  normalizeCatalogIdentity,
  seriesSlugToDisplayLabel,
} from "./catalog-source-rules.js";

export interface PlatformTaxonomyResolution {
  platform: "arabam";
  canonicalBrand: string;
  canonicalSeries?: string;
  sourceBrandLabel?: string;
  sourceSeriesLabel?: string;
  brandSlug: string;
  seriesSlugPart?: string;
  modelSlug: string;
  mappingSource: "alias" | "derived";
}

interface ArabamAliasCache {
  brandByCanonical: Map<string, { brandSlug: string; sourceLabel: string }>;
  seriesByCanonical: Map<
    string,
    { modelSlug: string; seriesSlugPart: string; sourceLabel: string }
  >;
  loadedAt: number | null;
}

const cache: ArabamAliasCache = {
  brandByCanonical: new Map(),
  seriesByCanonical: new Map(),
  loadedAt: null,
};

function seriesCacheKey(brandNorm: string, seriesNorm: string): string {
  return `${brandNorm}|${seriesNorm}`;
}

export function clearArabamAliasCacheForTests(): void {
  cache.brandByCanonical.clear();
  cache.seriesByCanonical.clear();
  cache.loadedAt = null;
}

export async function warmArabamAliasCache(): Promise<void> {
  const [brandAliases, seriesAliases] = await Promise.all([
    prisma.vehicleBrandAlias.findMany({
      where: { platform: "arabam" },
      include: { brand: { select: { normalizedName: true, name: true } } },
    }),
    prisma.vehicleSeriesAlias.findMany({
      where: { platform: "arabam" },
      include: {
        series: { select: { normalizedName: true, name: true } },
        brand: { select: { normalizedName: true, name: true } },
      },
    }),
  ]);

  cache.brandByCanonical.clear();
  cache.seriesByCanonical.clear();

  for (const row of brandAliases) {
    const payload = {
      brandSlug: row.sourceSlug,
      sourceLabel: row.sourceLabel,
    };
    cache.brandByCanonical.set(row.brand.normalizedName, payload);
    cache.brandByCanonical.set(normalizeMatchText(row.brand.name), payload);
    cache.brandByCanonical.set(normalizeCatalogIdentity(row.brand.name), payload);
  }

  for (const row of seriesAliases) {
    const brandSlug =
      cache.brandByCanonical.get(row.brand.normalizedName)?.brandSlug ??
      row.sourceSlug.split("-")[0] ??
      "";
    const part =
      brandSlug && row.sourceSlug.startsWith(`${brandSlug}-`)
        ? row.sourceSlug.slice(brandSlug.length + 1)
        : row.sourceSlug;
    const payload = {
      modelSlug: row.sourceSlug,
      seriesSlugPart: part,
      sourceLabel: row.sourceLabel,
    };
    const keys = [
      seriesCacheKey(row.brand.normalizedName, row.series.normalizedName),
      seriesCacheKey(normalizeMatchText(row.brand.name), normalizeMatchText(row.series.name)),
      seriesCacheKey(normalizeCatalogIdentity(row.brand.name), normalizeMatchText(row.series.name)),
    ];
    for (const key of keys) {
      cache.seriesByCanonical.set(key, payload);
    }
  }

  cache.loadedAt = Date.now();
}

/**
 * Resolve canonical brand/series → verified Arabam taxonomy slugs.
 * Uses alias cache when warm; falls back to deterministic slug derivation.
 */
export function resolveArabamTaxonomySlugs(
  brand: string,
  series?: string,
): {
  brandSlug: string;
  seriesSlugPart?: string;
  modelSlug: string;
  mappingSource: "alias" | "derived";
} | null {
  const brandNorm = normalizeMatchText(brand);
  const brandIdentity = normalizeCatalogIdentity(brand);
  if (!brandNorm && !brandIdentity) {
    return null;
  }

  const brandAlias =
    cache.brandByCanonical.get(brandNorm) ??
    cache.brandByCanonical.get(brandIdentity);
  const seriesNorm = series?.trim() ? normalizeMatchText(series) : "";
  const seriesAlias = seriesNorm
    ? cache.seriesByCanonical.get(seriesCacheKey(brandNorm, seriesNorm)) ??
      cache.seriesByCanonical.get(seriesCacheKey(brandIdentity, seriesNorm))
    : undefined;

  if (brandAlias && (!seriesNorm || seriesAlias)) {
    const brandSlug = brandAlias.brandSlug;
    if (!seriesNorm) {
      return {
        brandSlug,
        modelSlug: brandSlug,
        mappingSource: "alias",
      };
    }
    if (seriesAlias) {
      return {
        brandSlug,
        seriesSlugPart: seriesAlias.seriesSlugPart,
        modelSlug: seriesAlias.modelSlug,
        mappingSource: "alias",
      };
    }
  }

  const derived = deriveArabamSlugsFromCanonical(brand, series);
  if (!derived) {
    return null;
  }
  return { ...derived, mappingSource: "derived" };
}

export async function resolvePlatformTaxonomy(input: {
  platform: "arabam";
  brand: string;
  series?: string;
}): Promise<PlatformTaxonomyResolution | null> {
  if (cache.loadedAt == null) {
    await warmArabamAliasCache();
  }

  const brandNorm = normalizeMatchText(input.brand);
  if (!brandNorm) {
    return null;
  }

  const slugs = resolveArabamTaxonomySlugs(input.brand, input.series);
  if (!slugs) {
    return null;
  }

  const brandRow = await prisma.vehicleBrand.findFirst({
    where: { normalizedName: brandNorm, isActive: true },
    select: { name: true },
  });

  let canonicalSeries: string | undefined;
  if (input.series?.trim()) {
    const seriesNorm = normalizeMatchText(input.series);
    const seriesRow = brandRow
      ? await prisma.vehicleSeries.findFirst({
          where: {
            brand: { normalizedName: brandNorm },
            normalizedName: seriesNorm,
            isActive: true,
          },
          select: { name: true },
        })
      : null;
    canonicalSeries = seriesRow?.name ?? input.series.trim();
  }

  const brandAlias = cache.brandByCanonical.get(brandNorm);
  const seriesAlias =
    input.series?.trim() && brandNorm
      ? cache.seriesByCanonical.get(
          seriesCacheKey(brandNorm, normalizeMatchText(input.series)),
        )
      : undefined;

  return {
    platform: "arabam",
    canonicalBrand: brandRow?.name ?? input.brand.trim(),
    ...(canonicalSeries ? { canonicalSeries } : {}),
    ...(brandAlias?.sourceLabel ? { sourceBrandLabel: brandAlias.sourceLabel } : {}),
    ...(seriesAlias?.sourceLabel ? { sourceSeriesLabel: seriesAlias.sourceLabel } : {}),
    brandSlug: slugs.brandSlug,
    ...(slugs.seriesSlugPart ? { seriesSlugPart: slugs.seriesSlugPart } : {}),
    modelSlug: slugs.modelSlug,
    mappingSource: slugs.mappingSource,
  };
}

/** Match existing series row for Arabam discovered slug (exact / explicit only). */
export function resolveCanonicalSeriesLabel(input: {
  brandNormalizedName: string;
  brandDisplayName: string;
  seriesSlugPart: string;
  existingSeriesNames: string[];
}): string {
  const derived = seriesSlugToDisplayLabel(input.seriesSlugPart);
  const derivedNorm = normalizeMatchText(derived);

  for (const name of input.existingSeriesNames) {
    if (normalizeMatchText(name) === derivedNorm) {
      return name;
    }
  }

  if (input.brandNormalizedName === "mercedes-benz") {
    const letter = input.seriesSlugPart.toLocaleLowerCase("tr-TR");
    const explicit = ARABAM_MERCEDES_LETTER_SERIES[letter];
    if (explicit) {
      for (const name of input.existingSeriesNames) {
        if (normalizeMatchText(name) === normalizeMatchText(explicit)) {
          return name;
        }
      }
      return explicit;
    }
  }

  if (input.brandNormalizedName === "bmw") {
    const key = input.seriesSlugPart.toLocaleLowerCase("tr-TR");
    const explicit = ARABAM_BMW_NUMBER_SERIES[key];
    if (explicit) {
      for (const name of input.existingSeriesNames) {
        if (normalizeMatchText(name) === normalizeMatchText(explicit)) {
          return name;
        }
      }
      return explicit;
    }
  }

  return derived;
}
