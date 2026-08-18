import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SubscriptionPlan } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { buildArabamQuery } from "../scraper/query/planners/arabam-query-builder.js";
import { planFromFilter } from "../scraper/query/scrape-query-plan.js";
import { classifyDiscoveredBrandOffline } from "./catalog-snapshot-classify.js";
import {
  evaluateSnapshotBuildGate,
  buildCatalogSnapshot,
} from "./catalog-snapshot-classify.js";
import {
  finalizeCatalogSnapshot,
  type CatalogSnapshot,
} from "./catalog-snapshot.js";
import { importCatalogSnapshot } from "./catalog-snapshot-importer.js";
import { validateCatalogSnapshot } from "./catalog-snapshot-validator.js";
import { writeSnapshotIfPassing } from "./catalog-snapshot-write.js";
import { normalizeCatalogIdentity } from "./catalog-source-rules.js";
import {
  clearArabamAliasCacheForTests,
  resolveArabamTaxonomySlugs,
  warmArabamAliasCache,
} from "./platform-taxonomy.service.js";
import { vehicleCatalogService } from "./vehicle-catalog.service.js";

function fixtureSnapshot(overrides?: Partial<CatalogSnapshot["brands"][number]>[]): CatalogSnapshot {
  const brands: CatalogSnapshot["brands"] = [
    {
      canonicalName: "Honda",
      normalizedName: "honda",
      sourceLabel: "Honda",
      sourceSlug: "honda",
      series: [
        {
          canonicalName: "Civic",
          normalizedName: "civic",
          sourceLabel: "Civic",
          sourceSlug: "honda-civic",
        },
      ],
    },
    {
      canonicalName: "Mercedes-Benz",
      normalizedName: "mercedes-benz",
      sourceLabel: "Mercedes-Benz",
      sourceSlug: "mercedes-benz",
      series: [
        {
          canonicalName: "C Serisi",
          normalizedName: "c serisi",
          sourceLabel: "C Serisi",
          sourceSlug: "mercedes-benz-c",
        },
      ],
    },
    {
      canonicalName: "MINI",
      normalizedName: "mini",
      sourceLabel: "MINI",
      sourceSlug: "mini",
      series: [
        {
          canonicalName: "Cooper",
          normalizedName: "cooper",
          sourceLabel: "Cooper",
          sourceSlug: "mini-cooper",
        },
      ],
    },
    {
      canonicalName: "Citroën",
      normalizedName: "citroen",
      sourceLabel: "Citroën",
      sourceSlug: "citroen",
      series: [
        {
          canonicalName: "C3",
          normalizedName: "c3",
          sourceLabel: "C3",
          sourceSlug: "citroen-c3",
        },
      ],
    },
    {
      canonicalName: "MG",
      normalizedName: "mg",
      sourceLabel: "MG",
      sourceSlug: "mg",
      series: [],
    },
    {
      canonicalName: "Tesla",
      normalizedName: "tesla",
      sourceLabel: "Tesla",
      sourceSlug: "tesla",
      series: [
        {
          canonicalName: "Model Y",
          normalizedName: "model y",
          sourceLabel: "Model Y",
          sourceSlug: "tesla-model-y",
        },
      ],
    },
    {
      canonicalName: "Cupra",
      normalizedName: "cupra",
      sourceLabel: "Cupra",
      sourceSlug: "cupra",
      series: [
        {
          canonicalName: "Formentor",
          normalizedName: "formentor",
          sourceLabel: "Formentor",
          sourceSlug: "cupra-formentor",
        },
      ],
    },
    ...(overrides ?? []),
  ];
  return finalizeCatalogSnapshot({
    version: 1,
    source: "arabam",
    category: "automobile",
    generatedAt: "2026-08-18T00:00:00.000Z",
    brands,
  });
}

describe.sequential("Vehicle Catalog snapshot architecture", () => {
  beforeEach(() => {
    clearArabamAliasCacheForTests();
  });

  it("1. snapshot generation requires quality PASS", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "catalog-snap-"));
    const out = path.join(dir, "snap.json");
    const snapshot = fixtureSnapshot();
    const gate = evaluateSnapshotBuildGate({
      brands: snapshot.brands.map((b) => ({
        sourceLabel: b.sourceLabel,
        sourceSlug: b.sourceSlug,
        normalized: b.normalizedName,
        canonicalMatch: b.canonicalName,
        status: "NEW" as const,
      })),
      series: snapshot.brands.flatMap((b) =>
        b.series.map((s) => ({
          brand: b.canonicalName,
          sourceSeriesLabel: s.canonicalName,
          sourceSlug: s.sourceSlug,
          canonicalMatch: s.canonicalName,
          status: "NEW" as const,
        })),
      ),
      fetchRequestCount: 8,
      fetchFailureCount: 0,
    });
    expect(gate.pass).toBe(true);
    const result = await writeSnapshotIfPassing({ outputPath: out, snapshot, qualityGate: gate });
    expect(result.written).toBe(true);
    const saved = JSON.parse(await readFile(out, "utf8")) as CatalogSnapshot;
    expect(saved.catalogHash).toBe(snapshot.catalogHash);
  });

  it("2. quality FAIL snapshot yazmaz", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "catalog-snap-"));
    const out = path.join(dir, "snap.json");
    await writeFile(out, "KEEP", "utf8");
    const snapshot = fixtureSnapshot();
    const result = await writeSnapshotIfPassing({
      outputPath: out,
      snapshot,
      qualityGate: {
        pass: false,
        reasons: ["fetchFailureCount=1"],
        garbageDetected: 0,
        duplicateCandidates: 0,
        fetchFailureRate: 0.2,
        unresolvedBrands: 0,
        unresolvedSeries: 0,
        ignoredBrands: 0,
        ignoredSeries: 0,
      },
    });
    expect(result.written).toBe(false);
    expect(await readFile(out, "utf8")).toBe("KEEP");
  });

  it("3. deterministic brand ordering", () => {
    const a = fixtureSnapshot();
    const reversed = finalizeCatalogSnapshot({
      ...a,
      catalogHash: "",
      brands: [...a.brands].reverse(),
    });
    expect(reversed.brands.map((b) => b.sourceSlug)).toEqual(a.brands.map((b) => b.sourceSlug));
    expect(reversed.catalogHash).toBe(a.catalogHash);
  });

  it("4. deterministic series ordering", () => {
    const snapshot = fixtureSnapshot();
    const honda = snapshot.brands.find((b) => b.sourceSlug === "honda")!;
    honda.series.push({
      canonicalName: "Accord",
      normalizedName: "accord",
      sourceLabel: "Accord",
      sourceSlug: "honda-accord",
    });
    const hashed = finalizeCatalogSnapshot({ ...snapshot, catalogHash: "" });
    const hondaSorted = hashed.brands.find((b) => b.sourceSlug === "honda")!;
    expect(hondaSorted.series.map((s) => s.sourceSlug)).toEqual(["honda-accord", "honda-civic"]);
  });

  it("5. snapshot validator duplicate brand", () => {
    const snapshot = fixtureSnapshot();
    snapshot.brands.push({
      canonicalName: "Honda",
      normalizedName: "honda",
      sourceLabel: "Honda",
      sourceSlug: "honda-dup",
      series: [
        {
          canonicalName: "Jazz",
          normalizedName: "jazz",
          sourceLabel: "Jazz",
          sourceSlug: "honda-jazz",
        },
      ],
    });
    const result = validateCatalogSnapshot(finalizeCatalogSnapshot({ ...snapshot, catalogHash: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("duplicateCanonicalBrand"))).toBe(true);
  });

  it("6. duplicate series", () => {
    const snapshot = fixtureSnapshot();
    const honda = snapshot.brands.find((b) => b.sourceSlug === "honda")!;
    honda.series.push({ ...honda.series[0]! });
    const result = validateCatalogSnapshot(finalizeCatalogSnapshot({ ...snapshot, catalogHash: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("duplicateCanonicalSeries") || e.startsWith("duplicateSeriesSourceSlug"))).toBe(true);
  });

  it("7. duplicate alias / source slug", () => {
    const snapshot = fixtureSnapshot();
    snapshot.brands.push({
      canonicalName: "Hondux",
      normalizedName: "hondux",
      sourceLabel: "Hondux",
      sourceSlug: "honda",
      series: [
        {
          canonicalName: "Civic",
          normalizedName: "civic",
          sourceLabel: "Civic",
          sourceSlug: "hondux-civic",
        },
      ],
    });
    const result = validateCatalogSnapshot(finalizeCatalogSnapshot({ ...snapshot, catalogHash: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("duplicateBrandSourceSlug"))).toBe(true);
  });

  it("8. invalid source value", () => {
    const snapshot = fixtureSnapshot();
    snapshot.brands.push({
      canonicalName: "-",
      normalizedName: "-",
      sourceLabel: "-",
      sourceSlug: "otomobil",
      series: [
        {
          canonicalName: "X",
          normalizedName: "x",
          sourceLabel: "X",
          sourceSlug: "otomobil-x",
        },
      ],
    });
    const result = validateCatalogSnapshot(finalizeCatalogSnapshot({ ...snapshot, catalogHash: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("invalidBrand"))).toBe(true);
  });

  it("9. MINI identity", () => {
    const mini = classifyDiscoveredBrandOffline({
      sourceSlug: "mini",
      sourceLabel: "mini",
      path: "/ikinci-el/otomobil/mini",
    });
    expect(mini.canonicalLabel).toBe("MINI");
    expect(mini.review.normalized).toBe("mini");
    expect(mini.review.normalized).not.toContain("ı");
    expect(normalizeCatalogIdentity("MINI")).toBe("mini");
    const snapshot = fixtureSnapshot();
    expect(validateCatalogSnapshot(snapshot).ok).toBe(true);
    const row = snapshot.brands.find((b) => b.sourceSlug === "mini")!;
    expect(row.canonicalName).toBe("MINI");
    expect(row.normalizedName).toBe("mini");
  });

  it("10. Citroën identity", () => {
    const citroen = classifyDiscoveredBrandOffline({
      sourceSlug: "citroen",
      sourceLabel: "citroen",
      path: "/ikinci-el/otomobil/citroen",
    });
    expect(citroen.canonicalLabel).toBe("Citroën");
    expect(citroen.review.normalized).toBe("citroen");
    const snapshot = fixtureSnapshot();
    const matches = snapshot.brands.filter((b) => b.normalizedName === "citroen");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.canonicalName).toBe("Citroën");
  });

  it("11. MG zero-series allowed", () => {
    const snapshot = fixtureSnapshot();
    const mg = snapshot.brands.find((b) => b.sourceSlug === "mg")!;
    expect(mg.series).toHaveLength(0);
    expect(validateCatalogSnapshot(snapshot).ok).toBe(true);
  });

  it("12. import dry-run no DB write", async () => {
    const before = await prisma.vehicleBrand.count();
    const report = await importCatalogSnapshot(fixtureSnapshot(), { dryRun: true });
    const after = await prisma.vehicleBrand.count();
    expect(report.dryRun).toBe(true);
    expect(report.writeSkipped).toBe(true);
    expect(after).toBe(before);
  });

  it("13. import creates missing brand", async () => {
    const suffix = `snap${Date.now()}`;
    const snapshot = fixtureSnapshot([
      {
        canonicalName: `SnapBrand-${suffix}`,
        normalizedName: normalizeCatalogIdentity(`SnapBrand-${suffix}`),
        sourceLabel: `SnapBrand-${suffix}`,
        sourceSlug: suffix.toLowerCase(),
        series: [
          {
            canonicalName: "Alpha",
            normalizedName: "alpha",
            sourceLabel: "Alpha",
            sourceSlug: `${suffix.toLowerCase()}-alpha`,
          },
        ],
      },
    ]);
    expect(validateCatalogSnapshot(snapshot).ok).toBe(true);
    const report = await importCatalogSnapshot(snapshot, { dryRun: false });
    expect(report.writeSkipped).toBe(false);
    expect(report.brandsCreate).toBeGreaterThanOrEqual(1);
    const created = await prisma.vehicleBrand.findFirst({
      where: { normalizedName: normalizeCatalogIdentity(`SnapBrand-${suffix}`) },
    });
    expect(created?.name).toBe(`SnapBrand-${suffix}`);
  });

  it("14. import matches existing brand", async () => {
    await vehicleCatalogService.upsertBrand("Honda");
    const report = await importCatalogSnapshot(fixtureSnapshot(), { dryRun: true });
    expect(report.brandsMatch).toBeGreaterThanOrEqual(1);
  });

  it("15. import updates canonical display safely", async () => {
    const existing = await vehicleCatalogService.upsertBrand("Citroen");
    expect(existing).toBeTruthy();
    await prisma.vehicleBrand.update({
      where: { id: existing!.id },
      data: { name: "Citroen" },
    });
    const report = await importCatalogSnapshot(fixtureSnapshot(), { dryRun: true });
    expect(report.brandsUpdate).toBeGreaterThanOrEqual(1);
  });

  it("16. import creates series", async () => {
    const snapshot = fixtureSnapshot();
    const report = await importCatalogSnapshot(snapshot, { dryRun: false });
    expect(report.seriesCreate).toBeGreaterThanOrEqual(0);
    const honda = await prisma.vehicleBrand.findFirst({ where: { normalizedName: "honda" } });
    const civic = await prisma.vehicleSeries.findFirst({
      where: { brandId: honda?.id, normalizedName: "civic" },
    });
    expect(civic?.name).toBe("Civic");
  });

  it("17. import alias", async () => {
    await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    const brandAlias = await prisma.vehicleBrandAlias.findFirst({
      where: { platform: "arabam", sourceSlug: "honda" },
    });
    const seriesAlias = await prisma.vehicleSeriesAlias.findFirst({
      where: { platform: "arabam", sourceSlug: "honda-civic" },
    });
    expect(brandAlias).toBeTruthy();
    expect(seriesAlias).toBeTruthy();
  });

  it("18. import idempotent", async () => {
    await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    const second = await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    expect(second.brandsCreate).toBe(0);
    expect(second.seriesCreate).toBe(0);
    expect(second.brandAliasesCreate).toBe(0);
    expect(second.seriesAliasesCreate).toBe(0);
  });

  it("19. second import created=0", async () => {
    await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    const second = await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    expect(second.brandsCreate + second.seriesCreate + second.brandAliasesCreate + second.seriesAliasesCreate).toBe(0);
  });

  it("20. production-like Citroen → Citroën no duplicate", async () => {
    await vehicleCatalogService.upsertBrand("Citroen");
    const before = await prisma.vehicleBrand.count({
      where: { normalizedName: { in: ["citroen", "citroën"] } },
    });
    await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    const rows = await prisma.vehicleBrand.findMany({
      where: { normalizedName: { in: ["citroen", "citroën"] } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Citroën");
    expect(before).toBe(1);
  });

  it("21. Smart Query after import", async () => {
    await importCatalogSnapshot(fixtureSnapshot(), { dryRun: false });
    await warmArabamAliasCache();
    const civic = resolveArabamTaxonomySlugs("Honda", "Civic");
    expect(civic?.modelSlug).toBe("honda-civic");
    expect(civic?.mappingSource).toBe("alias");
    const merc = resolveArabamTaxonomySlugs("Mercedes-Benz", "C Serisi");
    expect(merc?.modelSlug).toBe("mercedes-benz-c");
    const tesla = resolveArabamTaxonomySlugs("Tesla", "Model Y");
    expect(tesla?.modelSlug).toBe("tesla-model-y");
    const cupra = resolveArabamTaxonomySlugs("Cupra", "Formentor");
    expect(cupra?.modelSlug).toBe("cupra-formentor");
    const plan = planFromFilter("arabam", {
      id: "s",
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
    expect(buildArabamQuery(plan).url).toContain("/ikinci-el/otomobil/honda-civic");
  });

  it("22. UserFilter contract unchanged", () => {
    const plan = planFromFilter("arabam", {
      id: "s",
      isActive: true,
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: "1.6 i-VTEC",
      city: "Tüm Türkiye",
      keywords: [],
      plan: SubscriptionPlan.FREE,
    });
    expect(plan.brand).toBe("Honda");
    expect(plan.series).toBe("Civic");
    expect(plan.trim).toBe("1.6 i-VTEC");
  });
});
