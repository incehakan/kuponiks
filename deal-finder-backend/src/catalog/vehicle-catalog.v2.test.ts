import { SubscriptionPlan } from "@prisma/client";
import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import {
  extractBrandPaths,
  extractSeriesPaths,
} from "./arabam-taxonomy-discovery.js";
import {
  canonicalBrandLabelFromArabam,
  isInvalidCatalogValue,
  seriesSlugToDisplayLabel,
} from "./catalog-source-rules.js";
import { TaxonomyService } from "../modules/taxonomy/taxonomy.service.js";
import { buildArabamQuery } from "../scraper/query/planners/arabam-query-builder.js";
import { planFromFilter } from "../scraper/query/scrape-query-plan.js";
import { vehicleCatalogAliasService } from "./vehicle-catalog-alias.service.js";
import {
  clearArabamAliasCacheForTests,
  resolveArabamTaxonomySlugs,
  resolveCanonicalSeriesLabel,
  warmArabamAliasCache,
} from "./platform-taxonomy.service.js";
import { vehicleCatalogService } from "./vehicle-catalog.service.js";

const taxonomy = new TaxonomyService();

const BRAND_INDEX_HTML = `
<a href="/ikinci-el/otomobil/honda">Honda</a>
<a href="/ikinci-el/otomobil/mercedes-benz">Mercedes</a>
<a href="/ikinci-el/otomobil/honda-civic">noise</a>
`;

const HONDA_SERIES_HTML = `
<a href="/ikinci-el/otomobil/honda-civic">Civic</a>
<a href="/ikinci-el/otomobil/honda-civic-sahibinden">noise</a>
<a href="/ikinci-el/otomobil/honda-civic-1-6">trim</a>
<a href="/ikinci-el/otomobil/honda-city">City</a>
`;

describe("Vehicle Catalog V2", () => {
  beforeEach(() => {
    clearArabamAliasCacheForTests();
  });

  it("1. invalid source values ignored", () => {
    expect(isInvalidCatalogValue("-")).toBe(true);
    expect(isInvalidCatalogValue("Diğer")).toBe(true);
    expect(isInvalidCatalogValue("Honda")).toBe(false);
  });

  it("2. brand sync idempotent via upsert", async () => {
    const a = await vehicleCatalogService.upsertBrand("Toyota");
    const b = await vehicleCatalogService.upsertBrand("Toyota");
    expect(a?.id).toBe(b?.id);
    expect(b?.created).toBe(false);
  });

  it("3. series sync idempotent via upsert", async () => {
    const a = await vehicleCatalogService.upsertSeries("Toyota", "Corolla");
    const b = await vehicleCatalogService.upsertSeries("Toyota", "Corolla");
    expect(a?.id).toBe(b?.id);
  });

  it("4. brand alias idempotent", async () => {
    const suffix = `${Date.now()}`;
    const brand = await vehicleCatalogService.upsertBrand(`AliasBrand${suffix}`);
    const first = await vehicleCatalogAliasService.upsertBrandAlias({
      platform: "arabam",
      sourceLabel: `AliasBrand${suffix}`,
      sourceSlug: `alias-brand-${suffix}`,
      brandId: brand!.id,
    });
    const second = await vehicleCatalogAliasService.upsertBrandAlias({
      platform: "arabam",
      sourceLabel: `AliasBrand${suffix}`,
      sourceSlug: `alias-brand-${suffix}`,
      brandId: brand!.id,
    });
    expect(first).toBe("created");
    expect(second).toBe("unchanged");
  });

  it("5. series alias idempotent", async () => {
    const suffix = `${Date.now()}`;
    const brand = await vehicleCatalogService.upsertBrand(`AliasBrand${suffix}`);
    const series = await vehicleCatalogService.upsertSeries(
      `AliasBrand${suffix}`,
      `AliasSeries${suffix}`,
    );
    const first = await vehicleCatalogAliasService.upsertSeriesAlias({
      platform: "arabam",
      sourceLabel: `AliasSeries${suffix}`,
      sourceSlug: `alias-brand-${suffix}-alias-series-${suffix}`,
      brandId: brand!.id,
      seriesId: series!.id,
    });
    const second = await vehicleCatalogAliasService.upsertSeriesAlias({
      platform: "arabam",
      sourceLabel: `AliasSeries${suffix}`,
      sourceSlug: `alias-brand-${suffix}-alias-series-${suffix}`,
      brandId: brand!.id,
      seriesId: series!.id,
    });
    expect(first).toBe("created");
    expect(second).toBe("unchanged");
  });

  it("6. exact normalized brand match", async () => {
    await vehicleCatalogService.upsertBrand("Skoda");
    const row = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: "skoda" },
    });
    expect(row?.name).toBe("Skoda");
  });

  it("7. explicit alias brand match Mercedes-Benz", () => {
    expect(canonicalBrandLabelFromArabam("Mercedes - Benz")).toBe("Mercedes-Benz");
  });

  it("8. ambiguous unresolved stays separate series under brands", async () => {
    await vehicleCatalogService.upsertSeries("Honda", "Civic");
    await vehicleCatalogService.upsertSeries("Renault", "Civic");
    const honda = await taxonomy.listVehicleSeries({ brand: "Honda" });
    const renault = await taxonomy.listVehicleSeries({ brand: "Renault" });
    expect(honda.map((i) => i.value)).toContain("Civic");
    expect(renault.map((i) => i.value)).toContain("Civic");
  });

  it("9. Honda Civic Arabam mapping via alias cache", async () => {
    const brand = await vehicleCatalogService.upsertBrand("Honda");
    const series = await vehicleCatalogService.upsertSeries("Honda", "Civic");
    await vehicleCatalogAliasService.upsertBrandAlias({
      platform: "arabam",
      sourceLabel: "Honda",
      sourceSlug: "honda",
      brandId: brand!.id,
    });
    await vehicleCatalogAliasService.upsertSeriesAlias({
      platform: "arabam",
      sourceLabel: "civic",
      sourceSlug: "honda-civic",
      brandId: brand!.id,
      seriesId: series!.id,
    });
    await warmArabamAliasCache();
    const slugs = resolveArabamTaxonomySlugs("Honda", "Civic");
    expect(slugs?.modelSlug).toBe("honda-civic");
    expect(slugs?.mappingSource).toBe("alias");
  });

  it("10. Mercedes-Benz C Serisi explicit letter mapping", () => {
    const label = resolveCanonicalSeriesLabel({
      brandNormalizedName: "mercedes-benz",
      brandDisplayName: "Mercedes-Benz",
      seriesSlugPart: "c",
      existingSeriesNames: ["A Serisi", "C Serisi", "E Serisi"],
    });
    expect(label).toBe("C Serisi");
  });

  it("11. Alfa Romeo slug label", () => {
    expect(seriesSlugToDisplayLabel("giulietta")).toBe("Giulietta");
  });

  it("12. Land Rover slug label", () => {
    expect(seriesSlugToDisplayLabel("range-rover")).toBe("Range Rover");
  });

  it("13. Citroen canonical brand", () => {
    expect(normalizeMatchText("Citroën")).toBe("citroën");
  });

  it("14. listing sync does not duplicate trim", async () => {
    await vehicleCatalogService.syncFromListing({
      brand: "Honda",
      series: "Civic",
      trim: "Elegance",
    });
    await vehicleCatalogService.syncFromListing({
      brand: "Honda",
      series: "Civic",
      trim: "Elegance",
    });
    const brand = await prisma.vehicleBrand.findUnique({
      where: { normalizedName: "honda" },
    });
    const series = await prisma.vehicleSeries.findFirst({
      where: { brandId: brand!.id, normalizedName: "civic" },
    });
    const trims = await prisma.vehicleTrim.findMany({
      where: { seriesId: series!.id, normalizedName: "elegance" },
    });
    expect(trims).toHaveLength(1);
  });

  it("15. taxonomy endpoint returns seeded Honda", async () => {
    await vehicleCatalogService.seedCatalog();
    const brands = await taxonomy.listVehicleBrands({});
    expect(brands.map((b) => b.value)).toContain("Honda");
  });

  it("16. q search still works", async () => {
    await vehicleCatalogService.seedCatalog();
    const items = await taxonomy.listVehicleBrands({ q: "mer" });
    expect(items.map((i) => i.value)).toContain("Mercedes-Benz");
  });

  it("17. canonical UserFilter values not slugs", async () => {
    const plan = planFromFilter("arabam", {
      id: "x",
      isActive: true,
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: null,
      city: "Tüm Türkiye",
      keywords: [],
      plan: SubscriptionPlan.FREE,
    });
    expect(plan.brand).toBe("Honda");
    expect(plan.series).toBe("Civic");
    expect(plan.brand).not.toMatch(/honda-civic/);
  });

  it("18. HTML brand path extraction", () => {
    const paths = extractBrandPaths(BRAND_INDEX_HTML);
    expect(paths).toEqual(["/ikinci-el/otomobil/honda", "/ikinci-el/otomobil/mercedes-benz"]);
  });

  it("19. HTML series path extraction filters noise slugs", () => {
    const paths = extractSeriesPaths(HONDA_SERIES_HTML, "honda");
    expect(paths).toContain("/ikinci-el/otomobil/honda-civic");
    expect(paths).toContain("/ikinci-el/otomobil/honda-city");
    expect(paths.some((p) => p.includes("sahibinden"))).toBe(false);
  });

  it("20. smart query uses alias mapping when cache warm", async () => {
    const brand = await vehicleCatalogService.upsertBrand("Mercedes-Benz");
    const series = await vehicleCatalogService.upsertSeries("Mercedes-Benz", "C Serisi");
    await vehicleCatalogAliasService.upsertBrandAlias({
      platform: "arabam",
      sourceLabel: "Mercedes - Benz",
      sourceSlug: "mercedes-benz",
      brandId: brand!.id,
    });
    await vehicleCatalogAliasService.upsertSeriesAlias({
      platform: "arabam",
      sourceLabel: "C",
      sourceSlug: "mercedes-benz-c",
      brandId: brand!.id,
      seriesId: series!.id,
    });
    await warmArabamAliasCache();
    const plan = planFromFilter("arabam", {
      id: "x",
      isActive: true,
      category: "Vasıta > Otomobil",
      brand: "Mercedes-Benz",
      series: "C Serisi",
      trim: null,
      city: "Tüm Türkiye",
      keywords: [],
      plan: SubscriptionPlan.FREE,
    });
    const built = buildArabamQuery(plan);
    expect(built.url).toContain("/ikinci-el/otomobil/mercedes-benz-c");
  });

  it("21. missing mapping falls back to derived slug", () => {
    const slugs = resolveArabamTaxonomySlugs("Honda", "Civic");
    expect(slugs?.modelSlug).toBe("honda-civic");
    expect(slugs?.mappingSource).toBe("derived");
  });

  it("22. invalid brand rejected on upsert", async () => {
    const result = await vehicleCatalogService.upsertBrand("-");
    expect(result).toBeNull();
  });
});
