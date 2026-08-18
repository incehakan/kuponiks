import { SubscriptionPlan } from "@prisma/client";
import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "../lib/prisma.js";
import { extractBrandPaths, extractSeriesPaths } from "./arabam-taxonomy-discovery.js";
import {
  brandSlugToDisplayLabel,
  canonicalBrandLabelFromArabam,
  catalogNormalizedCandidates,
  isAllowedCatalogSeries,
  isArabamSeriesFacetSlug,
  looksLikeSlugDisplay,
  normalizeCatalogIdentity,
  resolveCanonicalBrandLabel,
  seriesSlugToDisplayLabel,
} from "./catalog-source-rules.js";
import { evaluateCatalogQualityGate } from "./catalog-quality-gate.js";
import { TaxonomyService } from "../modules/taxonomy/taxonomy.service.js";
import { buildArabamQuery } from "../scraper/query/planners/arabam-query-builder.js";
import { planFromFilter } from "../scraper/query/scrape-query-plan.js";
import {
  clearArabamAliasCacheForTests,
  resolveArabamTaxonomySlugs,
  resolveCanonicalSeriesLabel,
} from "./platform-taxonomy.service.js";
import { vehicleCatalogService } from "./vehicle-catalog.service.js";

const taxonomy = new TaxonomyService();

describe("Vehicle Catalog V2.1 quality gates", () => {
  beforeEach(() => {
    clearArabamAliasCacheForTests();
  });

  it("1. hyphenated brand kept; series path not a brand", () => {
    const html = `
<a href="/ikinci-el/otomobil/mercedes">Mercedes</a>
<a href="/ikinci-el/otomobil/mercedes-benz">Mercedes-Benz</a>
<a href="/ikinci-el/otomobil/mercedes-benz-c">C</a>
<a href="/ikinci-el/otomobil/honda">Honda</a>
<a href="/ikinci-el/otomobil/honda-civic">Civic</a>
`;
    const paths = extractBrandPaths(html);
    expect(paths).toContain("/ikinci-el/otomobil/mercedes-benz");
    expect(paths).toContain("/ikinci-el/otomobil/honda");
    expect(paths).not.toContain("/ikinci-el/otomobil/mercedes-benz-c");
    expect(paths).not.toContain("/ikinci-el/otomobil/honda-civic");
  });

  it("2. BMW 3-serisi is a series, engine facet is not", () => {
    expect(isArabamSeriesFacetSlug("3-serisi")).toBe(false);
    expect(isAllowedCatalogSeries("3-serisi")).toBe(true);
    expect(seriesSlugToDisplayLabel("3-serisi")).toBe("3 Serisi");
    expect(isArabamSeriesFacetSlug("civic-1-6")).toBe(true);
    expect(isAllowedCatalogSeries("civic-1-6")).toBe(false);
  });

  it("3. display labels are not source slugs", () => {
    expect(looksLikeSlugDisplay("honda-civic", "honda-civic")).toBe(true);
    expect(looksLikeSlugDisplay("Civic", "honda-civic")).toBe(false);
    expect(looksLikeSlugDisplay("C Serisi", "mercedes-benz-c")).toBe(false);
    expect(seriesSlugToDisplayLabel("golf")).toBe("Golf");
  });

  it("4. slug-only Arabam brand resolves to display label", () => {
    expect(resolveCanonicalBrandLabel("honda", "honda")).toBe("Honda");
    expect(resolveCanonicalBrandLabel("toyota", "toyota")).toBe("Toyota");
    expect(brandSlugToDisplayLabel("alfa-romeo")).toBe("Alfa Romeo");
    expect(brandSlugToDisplayLabel("ds-automobiles")).toBe("DS Automobiles");
    expect(brandSlugToDisplayLabel("mercedes-benz")).toBe("Mercedes-Benz");
    expect(brandSlugToDisplayLabel("xev")).toBe("XEV");
    expect(looksLikeSlugDisplay("Honda", "honda")).toBe(false);
  });

  it("5. special brand canonicals", () => {
    expect(canonicalBrandLabelFromArabam("Citroën")).toBe("Citroën");
    expect(canonicalBrandLabelFromArabam("MINI")).toBe("MINI");
    expect(canonicalBrandLabelFromArabam("Alfa Romeo")).toBe("Alfa Romeo");
    expect(canonicalBrandLabelFromArabam("Land Rover")).toBe("Land Rover");
    expect(canonicalBrandLabelFromArabam("Tesla")).toBe("Tesla");
    expect(canonicalBrandLabelFromArabam("Cupra")).toBe("Cupra");
    expect(canonicalBrandLabelFromArabam("MG")).toBe("MG");
    expect(canonicalBrandLabelFromArabam("BYD")).toBe("BYD");
    expect(canonicalBrandLabelFromArabam("Chery")).toBe("Chery");
    expect(canonicalBrandLabelFromArabam("DS Automobiles")).toBe("DS Automobiles");
    expect(catalogNormalizedCandidates("Citroën")).toContain("citroen");
    expect(normalizeCatalogIdentity("MINI")).toBe("mini");
    expect(normalizeCatalogIdentity("mini")).toBe("mini");
    expect(normalizeCatalogIdentity("Mini")).toBe("mini");
  });

  it("6. quality gate fails on unresolved brands", () => {
    const gate = evaluateCatalogQualityGate({
      brands: [
        {
          sourceLabel: "???",
          sourceSlug: "unknown-x",
          normalized: "???",
          canonicalMatch: null,
          status: "UNRESOLVED",
        },
      ],
      series: [],
      fetchRequestCount: 1,
      fetchFailureCount: 0,
    });
    expect(gate.pass).toBe(false);
    expect(gate.unresolvedBrands).toBe(1);
  });

  it("7. quality gate passes clean matched/new set", () => {
    const gate = evaluateCatalogQualityGate({
      brands: [
        {
          sourceLabel: "Honda",
          sourceSlug: "honda",
          normalized: "honda",
          canonicalMatch: "Honda",
          status: "MATCHED",
        },
      ],
      series: [
        {
          brand: "Honda",
          sourceSeriesLabel: "Civic",
          sourceSlug: "honda-civic",
          canonicalMatch: "Civic",
          status: "MATCHED",
        },
      ],
      fetchRequestCount: 2,
      fetchFailureCount: 0,
    });
    expect(gate.pass).toBe(true);
    expect(gate.garbageDetected).toBe(0);
  });

  it("8. same series name under different brands stays distinct", async () => {
    await vehicleCatalogService.upsertSeries("Tesla", "Model Y");
    await vehicleCatalogService.upsertSeries("Cupra", "Formentor");
    const tesla = await taxonomy.listVehicleSeries({ brand: "Tesla" });
    const cupra = await taxonomy.listVehicleSeries({ brand: "Cupra" });
    expect(tesla.map((i) => i.value)).toContain("Model Y");
    expect(cupra.map((i) => i.value)).toContain("Formentor");
  });

  it("9. BMW 3 Serisi explicit mapping", () => {
    expect(
      resolveCanonicalSeriesLabel({
        brandNormalizedName: "bmw",
        brandDisplayName: "BMW",
        seriesSlugPart: "3-serisi",
        existingSeriesNames: [],
      }),
    ).toBe("3 Serisi");
  });

  it("10. q search is case-insensitive", async () => {
    await vehicleCatalogService.seedCatalog();
    await vehicleCatalogService.upsertBrand("Tesla");
    await vehicleCatalogService.upsertBrand("Cupra");
    await vehicleCatalogService.upsertBrand("Citroën");
    const taxonomySvc = new TaxonomyService();
    const merc = await taxonomySvc.listVehicleBrands({ q: "merc" });
    const toy = await taxonomySvc.listVehicleBrands({ q: "toy" });
    const volk = await taxonomySvc.listVehicleBrands({ q: "volk" });
    const cit = await taxonomySvc.listVehicleBrands({ q: "cit" });
    const tes = await taxonomySvc.listVehicleBrands({ q: "tes" });
    const cup = await taxonomySvc.listVehicleBrands({ q: "cup" });
    expect(merc.map((i) => i.value)).toContain("Mercedes-Benz");
    expect(toy.map((i) => i.value)).toContain("Toyota");
    expect(volk.map((i) => i.value)).toContain("Volkswagen");
    expect(cit.map((i) => i.value)).toContain("Citroën");
    expect(tes.map((i) => i.value)).toContain("Tesla");
    expect(cup.map((i) => i.value)).toContain("Cupra");
    await vehicleCatalogService.upsertBrand("MINI");
    const mini = await taxonomySvc.listVehicleBrands({ q: "mini" });
    expect(mini.map((i) => i.value)).toContain("MINI");
  });

  it("11. Smart Query samples + missing mapping fallback", () => {
    const pairs: Array<[string, string, string]> = [
      ["Honda", "Civic", "honda-civic"],
      ["Toyota", "Corolla", "toyota-corolla"],
      ["Volkswagen", "Golf", "volkswagen-golf"],
      ["Renault", "Clio", "renault-clio"],
      ["Fiat", "Egea", "fiat-egea"],
      ["Mercedes-Benz", "C Serisi", "mercedes-benz-c"],
      ["BMW", "3 Serisi", "bmw-3-serisi"],
      ["Audi", "A4", "audi-a4"],
      ["Tesla", "Model Y", "tesla-model-y"],
      ["Cupra", "Formentor", "cupra-formentor"],
    ];
    for (const [brand, series, slug] of pairs) {
      const resolved = resolveArabamTaxonomySlugs(brand, series);
      expect(resolved?.modelSlug).toBe(slug);
      const plan = planFromFilter("arabam", {
        id: "s",
        isActive: true,
        category: "Vasıta > Otomobil",
        brand,
        series,
        trim: null,
        city: "Tüm Türkiye",
        keywords: [],
        plan: SubscriptionPlan.FREE,
      });
      const url = buildArabamQuery(plan).url;
      expect(url).toContain(`/ikinci-el/otomobil/${slug}`);
      expect(plan.brand).toBe(brand);
      expect(plan.series).toBe(series);
    }
    const missing = resolveArabamTaxonomySlugs("NoSuchBrandX", "NoSuchSeriesY");
    expect(missing?.mappingSource).toBe("derived");
    expect(missing?.modelSlug).toMatch(/^[a-z0-9-]+$/);
  });

  it("12. noise series still filtered from HTML", () => {
    const html = `
<a href="/ikinci-el/otomobil/bmw-3-serisi">3 Serisi</a>
<a href="/ikinci-el/otomobil/bmw-3-serisi-sahibinden">noise</a>
<a href="/ikinci-el/otomobil/bmw-320i">facet</a>
`;
    const paths = extractSeriesPaths(html, "bmw");
    expect(paths).toContain("/ikinci-el/otomobil/bmw-3-serisi");
    expect(paths.some((p) => p.includes("sahibinden"))).toBe(false);
    expect(paths.some((p) => p.endsWith("320i"))).toBe(false);
  });
});
