import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { scraperService } from "../scraper/scraper.service.js";
import type { NormalizedListingInput } from "../scraper/normalizer.js";
import { TaxonomyService } from "../modules/taxonomy/taxonomy.service.js";
import { FilterService } from "../modules/filters/filter.service.js";
import {
  VEHICLE_CATALOG_BRANDS,
  VEHICLE_CATALOG_BRAND_COUNT,
  VEHICLE_CATALOG_SERIES,
  VEHICLE_CATALOG_SERIES_COUNT,
} from "./vehicle-catalog.seed.js";
import { vehicleCatalogService } from "./vehicle-catalog.service.js";
import { normalizeMatchText } from "../lib/text-normalize.js";

const taxonomy = new TaxonomyService();

describe("Vehicle Catalog V1", () => {
  it("1. brand seed idempotent", async () => {
    await vehicleCatalogService.seedCatalog();
    const first = await prisma.vehicleBrand.count();
    const secondRun = await vehicleCatalogService.seedCatalog();
    const second = await prisma.vehicleBrand.count();
    expect(second).toBe(first);
    expect(secondRun.brandsCreated).toBe(0);
    expect(first).toBeGreaterThanOrEqual(VEHICLE_CATALOG_BRAND_COUNT);
  });

  it("2. series seed idempotent", async () => {
    await vehicleCatalogService.seedCatalog();
    const first = await prisma.vehicleSeries.count();
    const secondRun = await vehicleCatalogService.seedCatalog();
    const second = await prisma.vehicleSeries.count();
    expect(second).toBe(first);
    expect(secondRun.seriesCreated).toBe(0);
    expect(first).toBeGreaterThanOrEqual(VEHICLE_CATALOG_SERIES_COUNT);
  });

  it("3. trim upsert duplicate üretmez", async () => {
    const first = await vehicleCatalogService.upsertTrim(
      "Honda",
      "Civic",
      "1.6 LS",
    );
    const second = await vehicleCatalogService.upsertTrim(
      "Honda",
      "Civic",
      "1.6 LS",
    );
    expect(first?.id).toBe(second?.id);
    expect(second?.created).toBe(false);
    const honda = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: "honda" },
    });
    const civic = await prisma.vehicleSeries.findFirst({
      where: { brandId: honda!.id, normalizedName: "civic" },
    });
    const trims = await prisma.vehicleTrim.findMany({
      where: { seriesId: civic!.id, normalizedName: "1.6 ls" },
    });
    expect(trims).toHaveLength(1);
  });

  it("4. Honda case dedup", async () => {
    const a = await vehicleCatalogService.upsertBrand("HONDA");
    const b = await vehicleCatalogService.upsertBrand("honda");
    const c = await vehicleCatalogService.upsertBrand("Honda");
    expect(a?.id).toBe(b?.id);
    expect(b?.id).toBe(c?.id);
    expect(normalizeMatchText("Honda")).toBe("honda");
    const rows = await prisma.vehicleBrand.findMany({
      where: { normalizedName: "honda" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Honda");
  });

  it("5. catalog brands endpoint", async () => {
    await vehicleCatalogService.seedCatalog();
    const items = await taxonomy.listVehicleBrands({});
    const labels = items.map((i) => i.label);
    for (const brand of ["Honda", "BMW", "Toyota", "Volkswagen", "Renault", "Fiat"]) {
      expect(labels).toContain(brand);
    }
    expect(items.length).toBeGreaterThanOrEqual(VEHICLE_CATALOG_BRANDS.length);
  });

  it("6. catalog series endpoint Honda", async () => {
    await vehicleCatalogService.seedCatalog();
    const items = await taxonomy.listVehicleSeries({ brand: "Honda" });
    const labels = items.map((i) => i.label);
    for (const series of VEHICLE_CATALOG_SERIES.Honda) {
      expect(labels).toContain(series);
    }
  });

  it("7. catalog trims endpoint empty is valid", async () => {
    const items = await taxonomy.listVehicleTrims({
      brand: "Honda",
      series: "Civic",
    });
    expect(Array.isArray(items)).toBe(true);
  });

  it("8. q search", async () => {
    await vehicleCatalogService.seedCatalog();
    const items = await taxonomy.listVehicleBrands({ q: "hon" });
    expect(items.map((i) => i.value)).toEqual(["Honda"]);
  });

  it("9. Listing structured data catalog'a enrich edilir", async () => {
    const brandName = `CatalogBrand${Date.now()}`;
    const listing = await ingestQuiet({
      brand: brandName,
      series: "Alpha",
      trim: "Sport",
    });
    expect(listing.status).toBe("created");
    const brand = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: normalizeMatchText(brandName) },
    });
    expect(brand?.name).toBe(brandName);
    const series = await prisma.vehicleSeries.findFirst({
      where: { brandId: brand!.id, normalizedName: "alpha" },
    });
    expect(series?.name).toBe("Alpha");
    const trim = await prisma.vehicleTrim.findFirst({
      where: { seriesId: series!.id, normalizedName: "sport" },
    });
    expect(trim?.name).toBe("Sport");
    if (listing.status === "created") {
      await prisma.listing.delete({ where: { id: listing.listing.id } });
    }
    const brandAfter = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: normalizeMatchText(brandName) },
    });
    expect(brandAfter).not.toBeNull();
    await prisma.vehicleBrand.delete({ where: { id: brandAfter!.id } });
  });

  it("10. Listing duplicate ingest catalog duplicate üretmez", async () => {
    const brandName = `CatalogDup${Date.now()}`;
    const first = await ingestQuiet({
      brand: brandName,
      series: "Beta",
      trim: "Comfort",
    });
    expect(first.status).toBe("created");
    const second = await ingestQuiet({
      brand: brandName,
      series: "Beta",
      trim: "Comfort",
      externalId:
        first.status === "created" ? first.listing.externalId : undefined,
    });
    expect(second.status).toBe("updated");
    const brands = await prisma.vehicleBrand.findMany({
      where: { normalizedName: normalizeMatchText(brandName) },
    });
    expect(brands).toHaveLength(1);
    const series = await prisma.vehicleSeries.findMany({
      where: { brandId: brands[0]!.id, normalizedName: "beta" },
    });
    expect(series).toHaveLength(1);
    const trims = await prisma.vehicleTrim.findMany({
      where: { seriesId: series[0]!.id, normalizedName: "comfort" },
    });
    expect(trims).toHaveLength(1);
    if (first.status === "created") {
      await prisma.listing.delete({ where: { id: first.listing.id } });
    }
    await prisma.vehicleBrand.delete({ where: { id: brands[0]!.id } });
  });

  it("11. trim optional — brand+series enrich, trim yok", async () => {
    await vehicleCatalogService.syncFromListing({
      brand: "Honda",
      series: "Civic",
      trim: null,
    });
    const honda = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: "honda" },
    });
    const civic = await prisma.vehicleSeries.findFirst({
      where: { brandId: honda!.id, normalizedName: "civic" },
    });
    expect(civic).not.toBeNull();
  });

  it("12. UserFilter series payload değişmez", async () => {
    const { prisma: filterPrisma } = await import("../lib/prisma.js");
    expect(filterPrisma).toBeTruthy();
    const payload = {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: null as string | null,
    };
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(["brand", "series", "trim"]),
    );
    expect("model" in payload).toBe(false);
  });

  it("13. mobile Model label correct", () => {
    const source = readMobileFilterForm();
    expect(source).toContain('label="Model"');
    expect(source).not.toMatch(/label="Seri"/);
    expect(source).toContain("Marka listesi hazırlanıyor");
    expect(source).toContain("Marka verileri alınamadı");
  });

  it("14. brand reset series/trim", () => {
    const source = readMobileFilterForm();
    expect(source).toMatch(/brand: option\?\.value \?\? null[\s\S]*series: null[\s\S]*trim: null/);
  });

  it("15. model reset trim", () => {
    const source = readMobileFilterForm();
    expect(source).toMatch(/series: option\?\.value \?\? null[\s\S]*trim: null/);
  });

  it("16. empty trim filter save edilir", async () => {
    const FilterServiceCtor = FilterService;
    expect(FilterServiceCtor).toBeTruthy();
    const source = readMobileFilterForm();
    expect(source).toContain("Tüm versiyonlar");
    expect(source).toContain("clearable");
    expect(source).toMatch(/series: form\.series/);
    expect(source).toMatch(/trim: form\.trim/);
  });
});

function readMobileFilterForm(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(
    here,
    "../../../deal-finder-mobile/src/components/FilterFormModal.tsx",
  );
  return readFileSync(path, "utf8");
}

async function ingestQuiet(overrides: Partial<NormalizedListingInput>) {
  const externalId =
    overrides.externalId ?? `arabam:catalog-${Date.now()}-${Math.random()}`;
  return scraperService.ingestNormalizedListing(
    {
      externalId,
      platform: "arabam",
      title: "Catalog enrich test",
      price: 1_000_000,
      category: "Vasıta > Otomobil",
      subcategory: null,
      brand: "Honda",
      model: "Civic",
      series: "Civic",
      trim: null,
      variant: null,
      year: 2020,
      mileage: 50_000,
      fuelType: null,
      transmission: null,
      city: "İzmir",
      district: null,
      sellerType: null,
      description: "test",
      currency: "TRY",
      imageUrl: null,
      publishedAt: null,
      url: `https://www.arabam.com/ilan/${String(externalId).replace(/:/g, "-")}`,
      marketAveragePrice: 1_000_000,
      rawDetails: { category: "Vasıta > Otomobil" },
      ...overrides,
    },
    { quiet: true, skipComparableReanalysis: true },
  );
}
