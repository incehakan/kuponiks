import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import {
  VEHICLE_CATALOG_BRANDS,
  VEHICLE_CATALOG_SERIES,
} from "./vehicle-catalog.seed.js";

export interface CatalogListingInput {
  brand?: string | null;
  series?: string | null;
  trim?: string | null;
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Prefer mixed/title case over ALL CAPS / all-lowercase for display labels.
 */
export function preferCatalogDisplayName(
  existing: string,
  incoming: string,
): string {
  const existingAllCaps = existing === existing.toLocaleUpperCase("tr-TR");
  const nextAllCaps = incoming === incoming.toLocaleUpperCase("tr-TR");
  if (existingAllCaps && !nextAllCaps) {
    return incoming;
  }
  return existing;
}

export class VehicleCatalogService {
  async upsertBrand(rawName: string): Promise<{ id: string; name: string; created: boolean } | null> {
    const name = rawName.trim();
    const normalizedName = normalizeMatchText(name);
    if (!normalizedName) {
      return null;
    }

    const existing = await prisma.vehicleBrand.findUnique({
      where: { normalizedName },
    });
    if (existing) {
      const nextName = preferCatalogDisplayName(existing.name, name);
      if (nextName !== existing.name) {
        await prisma.vehicleBrand.update({
          where: { id: existing.id },
          data: { name: nextName },
        });
      }
      return { id: existing.id, name: nextName, created: false };
    }

    try {
      const created = await prisma.vehicleBrand.create({
        data: { name, normalizedName, isActive: true },
      });
      return { id: created.id, name: created.name, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await prisma.vehicleBrand.findUnique({
          where: { normalizedName },
        });
        if (raced) {
          return { id: raced.id, name: raced.name, created: false };
        }
      }
      throw error;
    }
  }

  async upsertSeries(
    brandName: string,
    seriesName: string,
  ): Promise<{ id: string; name: string; created: boolean } | null> {
    const brand = await this.upsertBrand(brandName);
    if (!brand) {
      return null;
    }
    const name = seriesName.trim();
    const normalizedName = normalizeMatchText(name);
    if (!normalizedName) {
      return null;
    }

    const existing = await prisma.vehicleSeries.findUnique({
      where: {
        brandId_normalizedName: {
          brandId: brand.id,
          normalizedName,
        },
      },
    });
    if (existing) {
      const nextName = preferCatalogDisplayName(existing.name, name);
      if (nextName !== existing.name) {
        await prisma.vehicleSeries.update({
          where: { id: existing.id },
          data: { name: nextName },
        });
      }
      return { id: existing.id, name: nextName, created: false };
    }

    try {
      const created = await prisma.vehicleSeries.create({
        data: {
          brandId: brand.id,
          name,
          normalizedName,
          isActive: true,
        },
      });
      return { id: created.id, name: created.name, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await prisma.vehicleSeries.findUnique({
          where: {
            brandId_normalizedName: {
              brandId: brand.id,
              normalizedName,
            },
          },
        });
        if (raced) {
          return { id: raced.id, name: raced.name, created: false };
        }
      }
      throw error;
    }
  }

  async upsertTrim(
    brandName: string,
    seriesName: string,
    trimName: string,
  ): Promise<{ id: string; name: string; created: boolean } | null> {
    const series = await this.upsertSeries(brandName, seriesName);
    if (!series) {
      return null;
    }
    const name = trimName.trim();
    const normalizedName = normalizeMatchText(name);
    if (!normalizedName) {
      return null;
    }

    const existing = await prisma.vehicleTrim.findUnique({
      where: {
        seriesId_normalizedName: {
          seriesId: series.id,
          normalizedName,
        },
      },
    });
    if (existing) {
      const nextName = preferCatalogDisplayName(existing.name, name);
      if (nextName !== existing.name) {
        await prisma.vehicleTrim.update({
          where: { id: existing.id },
          data: { name: nextName },
        });
      }
      return { id: existing.id, name: nextName, created: false };
    }

    try {
      const created = await prisma.vehicleTrim.create({
        data: {
          seriesId: series.id,
          name,
          normalizedName,
          isActive: true,
        },
      });
      return { id: created.id, name: created.name, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await prisma.vehicleTrim.findUnique({
          where: {
            seriesId_normalizedName: {
              seriesId: series.id,
              normalizedName,
            },
          },
        });
        if (raced) {
          return { id: raced.id, name: raced.name, created: false };
        }
      }
      throw error;
    }
  }

  async getBrands(): Promise<string[]> {
    const rows = await prisma.vehicleBrand.findMany({
      where: { isActive: true },
      select: { name: true },
      take: 1000,
    });
    return rows.map((row) => row.name);
  }

  async getSeriesByBrand(brandName: string): Promise<string[]> {
    const brandNorm = normalizeMatchText(brandName);
    if (!brandNorm) {
      return [];
    }
    const brand = await prisma.vehicleBrand.findFirst({
      where: { normalizedName: brandNorm, isActive: true },
      select: { id: true },
    });
    if (!brand) {
      return [];
    }
    const rows = await prisma.vehicleSeries.findMany({
      where: { brandId: brand.id, isActive: true },
      select: { name: true },
    });
    return rows.map((row) => row.name);
  }

  async getTrimsBySeries(
    brandName: string,
    seriesName: string,
  ): Promise<string[]> {
    const brandNorm = normalizeMatchText(brandName);
    const seriesNorm = normalizeMatchText(seriesName);
    if (!brandNorm || !seriesNorm) {
      return [];
    }
    const brand = await prisma.vehicleBrand.findFirst({
      where: { normalizedName: brandNorm, isActive: true },
      select: { id: true },
    });
    if (!brand) {
      return [];
    }
    const series = await prisma.vehicleSeries.findFirst({
      where: {
        brandId: brand.id,
        normalizedName: seriesNorm,
        isActive: true,
      },
      select: { id: true },
    });
    if (!series) {
      return [];
    }
    const rows = await prisma.vehicleTrim.findMany({
      where: { seriesId: series.id, isActive: true },
      select: { name: true },
    });
    return rows.map((row) => row.name);
  }

  /**
   * Best-effort catalog upsert from a listing. Never throws.
   */
  async syncFromListing(listing: CatalogListingInput): Promise<void> {
    try {
      if (!isPresent(listing.brand)) {
        return;
      }
      await this.upsertBrand(listing.brand);
      if (!isPresent(listing.series)) {
        return;
      }
      await this.upsertSeries(listing.brand, listing.series);
      if (!isPresent(listing.trim)) {
        return;
      }
      await this.upsertTrim(listing.brand, listing.series, listing.trim);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown catalog sync error";
      console.warn(`[VehicleCatalog] listing enrich skipped: ${message}`);
    }
  }

  async seedCatalog(): Promise<{ brandsCreated: number; seriesCreated: number }> {
    let brandsCreated = 0;
    let seriesCreated = 0;

    for (const brandName of VEHICLE_CATALOG_BRANDS) {
      const brand = await this.upsertBrand(brandName);
      if (brand?.created) {
        brandsCreated += 1;
      }
    }

    for (const [brandName, seriesList] of Object.entries(VEHICLE_CATALOG_SERIES)) {
      for (const seriesName of seriesList) {
        const series = await this.upsertSeries(brandName, seriesName);
        if (series?.created) {
          seriesCreated += 1;
        }
      }
    }

    return { brandsCreated, seriesCreated };
  }

  async syncFromExistingListings(): Promise<{
    scanned: number;
    brandsTouched: number;
  }> {
    const rows = await prisma.listing.findMany({
      where: {
        platform: { not: "mock" },
        brand: { not: null },
        NOT: { brand: "" },
      },
      select: { brand: true, series: true, trim: true },
    });

    const brandKeys = new Set<string>();
    for (const row of rows) {
      await this.syncFromListing(row);
      const key = normalizeMatchText(row.brand);
      if (key) {
        brandKeys.add(key);
      }
    }

    return { scanned: rows.length, brandsTouched: brandKeys.size };
  }
}

export const vehicleCatalogService = new VehicleCatalogService();
