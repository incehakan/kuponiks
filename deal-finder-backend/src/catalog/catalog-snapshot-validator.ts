import { normalizeMatchText } from "../lib/text-normalize.js";
import {
  isGarbageBrandSlug,
  isInvalidCatalogValue,
  isWellFormedArabamSlug,
  looksLikeSlugDisplay,
  normalizeCatalogIdentity,
} from "./catalog-source-rules.js";
import type { CatalogSnapshot, CatalogSnapshotBrand } from "./catalog-snapshot.js";
import { computeCatalogHash } from "./catalog-snapshot.js";

export interface CatalogSnapshotValidation {
  ok: boolean;
  errors: string[];
}

function pushIf(errors: string[], cond: boolean, message: string): void {
  if (cond) {
    errors.push(message);
  }
}

function findBrand(
  snapshot: CatalogSnapshot,
  slugOrName: string,
): CatalogSnapshotBrand | undefined {
  const identity = normalizeCatalogIdentity(slugOrName);
  return snapshot.brands.find(
    (b) =>
      b.sourceSlug === slugOrName ||
      normalizeCatalogIdentity(b.canonicalName) === identity ||
      b.normalizedName === identity,
  );
}

export function validateCatalogSnapshot(snapshot: CatalogSnapshot): CatalogSnapshotValidation {
  const errors: string[] = [];

  if (snapshot.version !== 1) {
    errors.push(`unsupportedVersion=${snapshot.version}`);
  }
  if (snapshot.source !== "arabam") {
    errors.push(`unsupportedSource=${snapshot.source}`);
  }
  if (snapshot.category !== "automobile") {
    errors.push(`unsupportedCategory=${snapshot.category}`);
  }
  if (!snapshot.catalogHash || snapshot.catalogHash !== computeCatalogHash(snapshot)) {
    errors.push("catalogHashMismatch");
  }

  const brandIdentities = new Set<string>();
  const brandSlugs = new Set<string>();
  const seriesSlugs = new Set<string>();

  for (const brand of snapshot.brands) {
    if (isInvalidCatalogValue(brand.canonicalName) || looksLikeSlugDisplay(brand.canonicalName, brand.sourceSlug)) {
      errors.push(`invalidBrandLabel:${brand.sourceSlug}`);
    }
    if (!isWellFormedArabamSlug(brand.sourceSlug) || isGarbageBrandSlug(brand.sourceSlug)) {
      errors.push(`invalidBrandSlug:${brand.sourceSlug}`);
    }
    if (brand.normalizedName !== normalizeCatalogIdentity(brand.canonicalName)) {
      errors.push(`brandIdentityMismatch:${brand.sourceSlug}`);
    }
    if (brandIdentities.has(brand.normalizedName)) {
      errors.push(`duplicateCanonicalBrand:${brand.normalizedName}`);
    }
    brandIdentities.add(brand.normalizedName);
    if (brandSlugs.has(brand.sourceSlug)) {
      errors.push(`duplicateBrandSourceSlug:${brand.sourceSlug}`);
    }
    brandSlugs.add(brand.sourceSlug);

    const seriesNorms = new Set<string>();
    for (const series of brand.series) {
      if (isInvalidCatalogValue(series.canonicalName) || looksLikeSlugDisplay(series.canonicalName, series.sourceSlug)) {
        errors.push(`invalidSeriesLabel:${series.sourceSlug}`);
      }
      if (!isWellFormedArabamSlug(series.sourceSlug)) {
        errors.push(`invalidSeriesSlug:${series.sourceSlug}`);
      }
      if (series.normalizedName !== normalizeMatchText(series.canonicalName)) {
        errors.push(`seriesIdentityMismatch:${series.sourceSlug}`);
      }
      if (seriesNorms.has(series.normalizedName)) {
        errors.push(`duplicateCanonicalSeries:${brand.sourceSlug}:${series.normalizedName}`);
      }
      seriesNorms.add(series.normalizedName);
      if (seriesSlugs.has(series.sourceSlug)) {
        errors.push(`duplicateSeriesSourceSlug:${series.sourceSlug}`);
      }
      seriesSlugs.add(series.sourceSlug);
    }
  }

  const mini = findBrand(snapshot, "mini");
  if (!mini) {
    errors.push("missingMINI");
  } else {
    pushIf(errors, mini.canonicalName !== "MINI", `miniDisplay=${mini.canonicalName}`);
    pushIf(errors, mini.normalizedName !== "mini", `miniIdentity=${mini.normalizedName}`);
    pushIf(errors, mini.sourceSlug !== "mini", `miniSlug=${mini.sourceSlug}`);
    pushIf(errors, mini.normalizedName.includes("ı") || mini.normalizedName.includes("İ"), "miniTurkishIdentity");
  }

  const citroenMatches = snapshot.brands.filter(
    (b) =>
      normalizeCatalogIdentity(b.canonicalName) === "citroen" ||
      b.sourceSlug === "citroen",
  );
  if (citroenMatches.length !== 1) {
    errors.push(`citroenCount=${citroenMatches.length}`);
  } else {
    const citroen = citroenMatches[0]!;
    pushIf(errors, citroen.canonicalName !== "Citroën", `citroenDisplay=${citroen.canonicalName}`);
    pushIf(errors, citroen.normalizedName !== "citroen", `citroenIdentity=${citroen.normalizedName}`);
  }

  return { ok: errors.length === 0, errors };
}
