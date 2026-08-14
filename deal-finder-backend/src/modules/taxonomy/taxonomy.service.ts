import { prisma } from "../../lib/prisma.js";
import { normalizeMatchText } from "../../lib/text-normalize.js";

export interface TaxonomyItem {
  value: string;
  label: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/** Non-empty, non-whitespace string. */
function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Collapse case/spacing duplicates while keeping a stable display label
 * (prefer Title Case-ish / first-seen non-all-caps when possible).
 */
export function dedupeTaxonomyValues(
  values: Array<string | null | undefined>,
  q?: string | null,
  limit = DEFAULT_LIMIT,
): TaxonomyItem[] {
  const query = normalizeMatchText(q);
  const byKey = new Map<string, string>();

  for (const raw of values) {
    if (!isPresent(raw)) {
      continue;
    }
    const trimmed = raw.trim();
    const key = normalizeMatchText(trimmed);
    if (!key) {
      continue;
    }
    if (query && !key.includes(query)) {
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, trimmed);
      continue;
    }

    // Prefer mixed/title case over ALL CAPS or all-lowercase when replacing.
    const existingAllCaps = existing === existing.toLocaleUpperCase("tr-TR");
    const nextAllCaps = trimmed === trimmed.toLocaleUpperCase("tr-TR");
    if (existingAllCaps && !nextAllCaps) {
      byKey.set(key, trimmed);
    }
  }

  const items = [...byKey.entries()]
    .map(([_, label]) => ({ value: label, label }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, "tr-TR", { sensitivity: "base" }),
    );

  const capped = Math.min(Math.max(limit, 1), MAX_LIMIT);
  return items.slice(0, capped);
}

function parseLimit(raw: unknown): number {
  if (raw == null || raw === "") {
    return DEFAULT_LIMIT;
  }
  const n = typeof raw === "number" ? raw : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Vehicle taxonomy: master catalog primary, Listing structured fields as
 * read-only fallback/union. GET handlers never mutate catalog.
 */
export class TaxonomyService {
  async listVehicleBrands(options: {
    q?: string | null | undefined;
    limit?: unknown;
  } = {}): Promise<TaxonomyItem[]> {
    const [catalogRows, listingRows] = await Promise.all([
      prisma.vehicleBrand.findMany({
        where: { isActive: true },
        select: { name: true },
        take: MAX_LIMIT * 2,
      }),
      prisma.listing.findMany({
        where: {
          platform: { not: "mock" },
          brand: { not: null },
          NOT: { brand: "" },
        },
        select: { brand: true },
        distinct: ["brand"],
        take: MAX_LIMIT * 2,
      }),
    ]);

    return dedupeTaxonomyValues(
      [...catalogRows.map((r) => r.name), ...listingRows.map((r) => r.brand)],
      options.q,
      parseLimit(options.limit),
    );
  }

  async listVehicleSeries(options: {
    brand: string;
    q?: string | null | undefined;
    limit?: unknown;
  }): Promise<TaxonomyItem[]> {
    const brand = options.brand?.trim();
    if (!brand) {
      return [];
    }

    const brandNorm = normalizeMatchText(brand);
    const [catalogBrand, listingRows] = await Promise.all([
      prisma.vehicleBrand.findFirst({
        where: { normalizedName: brandNorm, isActive: true },
        select: { id: true },
      }),
      prisma.listing.findMany({
        where: {
          platform: { not: "mock" },
          series: { not: null },
          NOT: { series: "" },
          brand: { not: null },
        },
        select: { brand: true, series: true },
        take: 5000,
      }),
    ]);

    const catalogSeries = catalogBrand
      ? await prisma.vehicleSeries.findMany({
          where: { brandId: catalogBrand.id, isActive: true },
          select: { name: true },
        })
      : [];

    const listingSeries = listingRows
      .filter((r) => normalizeMatchText(r.brand) === brandNorm)
      .map((r) => r.series);

    return dedupeTaxonomyValues(
      [...catalogSeries.map((r) => r.name), ...listingSeries],
      options.q,
      parseLimit(options.limit),
    );
  }

  async listVehicleTrims(options: {
    brand: string;
    series: string;
    q?: string | null | undefined;
    limit?: unknown;
  }): Promise<TaxonomyItem[]> {
    const brand = options.brand?.trim();
    const series = options.series?.trim();
    if (!brand || !series) {
      return [];
    }

    const brandNorm = normalizeMatchText(brand);
    const seriesNorm = normalizeMatchText(series);

    const [catalogBrand, listingRows] = await Promise.all([
      prisma.vehicleBrand.findFirst({
        where: { normalizedName: brandNorm, isActive: true },
        select: { id: true },
      }),
      prisma.listing.findMany({
        where: {
          platform: { not: "mock" },
          trim: { not: null },
          NOT: { trim: "" },
          brand: { not: null },
          series: { not: null },
        },
        select: { brand: true, series: true, trim: true },
        take: 5000,
      }),
    ]);

    let catalogTrims: Array<{ name: string }> = [];
    if (catalogBrand) {
      const catalogSeries = await prisma.vehicleSeries.findFirst({
        where: {
          brandId: catalogBrand.id,
          normalizedName: seriesNorm,
          isActive: true,
        },
        select: { id: true },
      });
      if (catalogSeries) {
        catalogTrims = await prisma.vehicleTrim.findMany({
          where: { seriesId: catalogSeries.id, isActive: true },
          select: { name: true },
        });
      }
    }

    const listingTrims = listingRows
      .filter(
        (r) =>
          normalizeMatchText(r.brand) === brandNorm &&
          normalizeMatchText(r.series) === seriesNorm,
      )
      .map((r) => r.trim);

    return dedupeTaxonomyValues(
      [...catalogTrims.map((r) => r.name), ...listingTrims],
      options.q,
      parseLimit(options.limit),
    );
  }

  async listVehicleFuelTypes(options: {
    q?: string | null | undefined;
    limit?: unknown;
  } = {}): Promise<TaxonomyItem[]> {
    const rows = await prisma.listing.findMany({
      where: {
        platform: { not: "mock" },
        fuelType: { not: null },
        NOT: { fuelType: "" },
      },
      select: { fuelType: true },
      distinct: ["fuelType"],
      take: MAX_LIMIT * 2,
    });

    return dedupeTaxonomyValues(
      rows.map((r) => r.fuelType),
      options.q,
      parseLimit(options.limit),
    );
  }

  async listVehicleTransmissions(options: {
    q?: string | null | undefined;
    limit?: unknown;
  } = {}): Promise<TaxonomyItem[]> {
    const rows = await prisma.listing.findMany({
      where: {
        platform: { not: "mock" },
        transmission: { not: null },
        NOT: { transmission: "" },
      },
      select: { transmission: true },
      distinct: ["transmission"],
      take: MAX_LIMIT * 2,
    });

    return dedupeTaxonomyValues(
      rows.map((r) => r.transmission),
      options.q,
      parseLimit(options.limit),
    );
  }

  async listVehicleSellerTypes(options: {
    q?: string | null | undefined;
    limit?: unknown;
  } = {}): Promise<TaxonomyItem[]> {
    const rows = await prisma.listing.findMany({
      where: {
        platform: { not: "mock" },
        sellerType: { not: null },
        NOT: { sellerType: "" },
      },
      select: { sellerType: true },
      distinct: ["sellerType"],
      take: MAX_LIMIT * 2,
    });

    const items = dedupeTaxonomyValues(
      rows.map((r) => r.sellerType),
      options.q,
      parseLimit(options.limit),
    );

    // Keep stored value for matching; polish label for UI when known.
    return items.map((item) => ({
      value: item.value,
      label: sellerTypeLabel(item.value),
    }));
  }

  async listDistricts(options: {
    city?: string | null | undefined;
    q?: string | null | undefined;
    limit?: unknown;
  } = {}): Promise<TaxonomyItem[]> {
    const city = options.city?.trim();
    const rows = await prisma.listing.findMany({
      where: {
        platform: { not: "mock" },
        district: { not: null },
        NOT: { district: "" },
        ...(city
          ? {
              city: { not: null },
            }
          : {}),
      },
      select: { city: true, district: true },
      take: 5000,
    });

    const cityNorm = city ? normalizeMatchText(city) : "";
    const districts = rows
      .filter((r) => {
        if (!cityNorm) {
          return true;
        }
        return normalizeMatchText(r.city) === cityNorm;
      })
      .map((r) => r.district);

    return dedupeTaxonomyValues(
      districts,
      options.q,
      parseLimit(options.limit),
    );
  }
}

function sellerTypeLabel(value: string): string {
  const key = normalizeMatchText(value);
  if (key.includes("galeri") || key.includes("kurum") || key.includes("dealer")) {
    return "Galeriden";
  }
  if (
    key.includes("sahibinden") ||
    key.includes("bireysel") ||
    key.includes("individual") ||
    key.includes("özel") ||
    key.includes("ozel")
  ) {
    return "Sahibinden";
  }
  return value.trim();
}

export const taxonomyService = new TaxonomyService();
