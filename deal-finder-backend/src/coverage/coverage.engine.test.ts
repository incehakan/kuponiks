import { describe, expect, it } from "vitest";
import { buildSearchIntentFromFilter } from "./search-intent-builder.js";
import {
  countMonitoredPlatforms,
  defaultAvailabilityMap,
  evaluateCoverage,
  evaluatePlatformCoverage,
  formatCoverageLogLine,
  isSchedulableCoverage,
} from "./coverage-engine.js";
import { buildFilterCoverageSnapshot } from "./coverage-engine.js";
import { planFromSearchIntent } from "../scraper/query/scrape-query-plan.js";

const hondaCivic = () =>
  buildSearchIntentFromFilter({
    category: "Vasıta > Otomobil",
    brand: "Honda",
    series: "Civic",
    minYear: 2016,
    maxYear: 2018,
    city: "Tüm Türkiye",
    minMileage: null,
    maxMileage: null,
    minDealScore: 50,
    notifyPush: true,
  });

describe("Platform coverage engine", () => {
  it("8. Arabam Honda Civic is FULL", () => {
    const rows = evaluateCoverage(hondaCivic(), defaultAvailabilityMap());
    const arabam = rows.find((row) => row.platform === "arabam");
    expect(arabam?.coverage).toBe("FULL");
    expect(arabam?.availability).toBe("AVAILABLE");
    expect(arabam?.schedulable).toBe(true);
  });

  it("9. Arabam mileage is matcher-only", () => {
    const intent = buildSearchIntentFromFilter({
      ...hondaCivic(),
      minMileage: 40_000,
      maxMileage: 120_000,
    });
    const arabam = evaluatePlatformCoverage(intent, "arabam");
    expect(arabam.coverage).toBe("FULL");
    expect(arabam.matcherCriteria).toEqual(
      expect.arrayContaining(["minMileage", "maxMileage"]),
    );
    expect(arabam.sourceCriteria).not.toContain("minMileage");
  });

  it("10. Arabam trim is matcher-only", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: "Elegance",
    });
    const arabam = evaluatePlatformCoverage(intent, "arabam");
    expect(arabam.coverage).toBe("FULL");
    expect(arabam.matcherCriteria).toContain("trim");
    const plan = planFromSearchIntent("arabam", intent);
    expect(plan.deferredCriteria).toContain("trim");
  });

  it("11. Arabam is unsupported for realty", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Emlak > Konut",
      city: "İstanbul",
    });
    const arabam = evaluatePlatformCoverage(intent, "arabam");
    expect(arabam.coverage).toBe("UNSUPPORTED");
    expect(arabam.status).toBe("UNSUPPORTED");
    expect(arabam.schedulable).toBe(false);
  });

  it("12. Letgo Honda Civic is PARTIAL", () => {
    const letgo = evaluatePlatformCoverage(
      hondaCivic(),
      "letgo",
      { availability: "DEGRADED", reason: "empty" },
    );
    expect(letgo.coverage).toBe("PARTIAL");
    expect(letgo.availability).toBe("DEGRADED");
    expect(letgo.schedulable).toBe(true);
  });

  it("13. Sahibinden is unavailable (Cloudflare)", () => {
    const row = evaluatePlatformCoverage(
      hondaCivic(),
      "sahibinden",
      { availability: "UNAVAILABLE", reason: "cloudflare" },
    );
    expect(row.coverage).toBe("FULL");
    expect(row.availability).toBe("UNAVAILABLE");
    expect(row.status).toBe("UNAVAILABLE");
    expect(row.schedulable).toBe(false);
    expect(row.availabilityReason).toBe("cloudflare");
  });

  it("14. capability vs availability stay distinct", () => {
    const row = evaluatePlatformCoverage(
      hondaCivic(),
      "sahibinden",
      { availability: "UNAVAILABLE", reason: "cloudflare" },
    );
    expect(row.coverage).toBe("FULL");
    expect(row.availability).toBe("UNAVAILABLE");
    expect(row.coverage).not.toBe(row.availability);
  });

  it("15. critical criterion unsupported → UNSUPPORTED", () => {
    const intent = hondaCivic();
    const hepsiemlak = evaluatePlatformCoverage(intent, "hepsiemlak");
    expect(hepsiemlak.coverage).toBe("UNSUPPORTED");
    expect(hepsiemlak.availabilityReason).toBe("unsupported_category");
    expect(hepsiemlak.schedulable).toBe(false);
  });

  it("16. optional criterion unsupported stays queryable", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: "Elegance",
    });
    const letgo = evaluatePlatformCoverage(intent, "letgo", {
      availability: "DEGRADED",
      reason: "empty",
    });
    expect(letgo.unsupportedCriteria).toContain("trim");
    expect(letgo.coverage).toBe("PARTIAL");
    expect(letgo.schedulable).toBe(true);
  });

  it("17. monitoredPlatformCount ignores UNAVAILABLE", () => {
    const rows = evaluateCoverage(hondaCivic(), defaultAvailabilityMap());
    expect(countMonitoredPlatforms(rows)).toBe(2);
    expect(rows.filter((row) => row.schedulable).map((row) => row.platform).sort()).toEqual(
      ["arabam", "letgo"],
    );
  });

  it("18. unsupported platform is not schedulable", () => {
    expect(
      isSchedulableCoverage({
        coverage: "UNSUPPORTED",
        availability: "AVAILABLE",
      }),
    ).toBe(false);
  });

  it("19. unavailable platform is not schedulable", () => {
    expect(
      isSchedulableCoverage({
        coverage: "FULL",
        availability: "UNAVAILABLE",
      }),
    ).toBe(false);
  });

  it("20. coverage output is deterministic", () => {
    const a = evaluateCoverage(hondaCivic(), defaultAvailabilityMap());
    const b = evaluateCoverage(hondaCivic(), defaultAvailabilityMap());
    expect(a).toEqual(b);
    const snapshot = buildFilterCoverageSnapshot("f1", hondaCivic(), a);
    expect(formatCoverageLogLine("f1", snapshot)).toBe(
      formatCoverageLogLine("f1", snapshot),
    );
    expect(formatCoverageLogLine("f1", snapshot)).toContain("arabam=FULL/AVAILABLE");
    expect(formatCoverageLogLine("f1", snapshot)).toContain("letgo=PARTIAL/DEGRADED");
    expect(formatCoverageLogLine("f1", snapshot)).toContain("sahibinden=FULL/UNAVAILABLE");
    expect(formatCoverageLogLine("f1", snapshot)).toContain("monitored=2");
  });

  it("hepsiemlak is unsupported for vehicle intents", () => {
    const rows = evaluateCoverage(hondaCivic(), defaultAvailabilityMap());
    expect(rows.some((row) => row.platform === "hepsiemlak")).toBe(false);
  });
});
