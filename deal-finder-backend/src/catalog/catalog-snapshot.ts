import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const CATALOG_SNAPSHOT_VERSION = 1;
export const CATALOG_SNAPSHOT_SOURCE = "arabam";
export const CATALOG_SNAPSHOT_CATEGORY = "automobile";
export const CATALOG_SNAPSHOT_FILENAME = "arabam-automobile-v1.json";

export interface CatalogSnapshotSeries {
  canonicalName: string;
  normalizedName: string;
  sourceLabel: string;
  sourceSlug: string;
}

export interface CatalogSnapshotBrand {
  canonicalName: string;
  normalizedName: string;
  sourceLabel: string;
  sourceSlug: string;
  series: CatalogSnapshotSeries[];
}

export interface CatalogSnapshot {
  version: number;
  source: "arabam";
  category: "automobile";
  generatedAt: string;
  catalogHash: string;
  brands: CatalogSnapshotBrand[];
}

export function defaultCatalogSnapshotPath(): string {
  return fileURLToPath(new URL(`./snapshots/${CATALOG_SNAPSHOT_FILENAME}`, import.meta.url));
}

export function sortSnapshotInPlace(snapshot: CatalogSnapshot): void {
  snapshot.brands.sort((a, b) => a.sourceSlug.localeCompare(b.sourceSlug, "en"));
  for (const brand of snapshot.brands) {
    brand.series.sort((a, b) => a.sourceSlug.localeCompare(b.sourceSlug, "en"));
  }
}

/** Canonical payload used for hashing — excludes generatedAt and catalogHash. */
export function snapshotHashPayload(snapshot: CatalogSnapshot): unknown {
  return {
    version: snapshot.version,
    source: snapshot.source,
    category: snapshot.category,
    brands: snapshot.brands.map((brand) => ({
      canonicalName: brand.canonicalName,
      normalizedName: brand.normalizedName,
      sourceLabel: brand.sourceLabel,
      sourceSlug: brand.sourceSlug,
      series: brand.series.map((series) => ({
        canonicalName: series.canonicalName,
        normalizedName: series.normalizedName,
        sourceLabel: series.sourceLabel,
        sourceSlug: series.sourceSlug,
      })),
    })),
  };
}

export function computeCatalogHash(snapshot: CatalogSnapshot): string {
  const json = JSON.stringify(snapshotHashPayload(snapshot));
  return createHash("sha256").update(json).digest("hex");
}

export function finalizeCatalogSnapshot(
  snapshot: Omit<CatalogSnapshot, "catalogHash"> & { catalogHash?: string },
): CatalogSnapshot {
  const next: CatalogSnapshot = {
    version: snapshot.version,
    source: snapshot.source,
    category: snapshot.category,
    generatedAt: snapshot.generatedAt,
    catalogHash: "",
    brands: snapshot.brands,
  };
  sortSnapshotInPlace(next);
  next.catalogHash = computeCatalogHash(next);
  return next;
}

export function serializeCatalogSnapshot(snapshot: CatalogSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
