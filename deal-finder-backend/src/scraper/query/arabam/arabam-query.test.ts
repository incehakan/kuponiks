import { describe, expect, it } from "vitest";
import { buildArabamFilterParams } from "./arabam-filter-params.js";
import {
  slugifyArabamBrand,
  slugifyArabamCity,
  slugifyArabamSeries,
  slugifyArabamToken,
} from "./arabam-slug.js";
import { buildArabamTaxonomyPath, resolveArabamCategorySlug } from "./arabam-taxonomy.js";

describe("arabam slug normalization", () => {
  it("normalizes Honda Civic brand-series path segment", () => {
    expect(slugifyArabamBrand("Honda")).toBe("honda");
    expect(slugifyArabamSeries("Civic")).toBe("civic");
    expect(
      buildArabamTaxonomyPath({
        category: "Vasıta > Otomobil",
        brand: "Honda",
        series: "Civic",
      }),
    ).toBe("/ikinci-el/otomobil/honda-civic");
  });

  it("normalizes Mercedes-Benz and C Serisi (drops serisi suffix)", () => {
    expect(slugifyArabamBrand("Mercedes-Benz")).toBe("mercedes-benz");
    expect(slugifyArabamSeries("C Serisi")).toBe("c");
    expect(
      buildArabamTaxonomyPath({
        category: "Vasıta > Otomobil",
        brand: "Mercedes-Benz",
        series: "C Serisi",
      }),
    ).toBe("/ikinci-el/otomobil/mercedes-benz-c");
  });

  it("normalizes Turkish city slugs", () => {
    expect(slugifyArabamCity("Kayseri")).toBe("kayseri");
    expect(slugifyArabamCity("İstanbul")).toBe("istanbul");
    expect(
      buildArabamTaxonomyPath({
        category: "Vasıta > Otomobil",
        brand: "Honda",
        series: "Civic",
        city: "Kayseri",
      }),
    ).toBe("/ikinci-el/otomobil/honda-civic-kayseri");
  });

  it("maps SUV category slug", () => {
    expect(resolveArabamCategorySlug("Vasıta > Arazi, SUV & Pick-up")).toBe(
      "arazi-suv-pick-up",
    );
  });

  it("Citroën maps to citroen slug", () => {
    expect(slugifyArabamToken("Citroën")).toBe("citroen");
  });
});

describe("arabam filter params", () => {
  it("builds verified year and price query params", () => {
    const { params, applied } = buildArabamFilterParams({
      minYear: 2016,
      maxYear: 2018,
      minPrice: 700_000,
      maxPrice: 1_200_000,
      take: 50,
    });
    expect(params).toEqual({
      minYear: "2016",
      maxYear: "2018",
      minPrice: "700000",
      maxPrice: "1200000",
      take: "50",
    });
    expect(applied).toEqual([
      "minYear",
      "maxYear",
      "minPrice",
      "maxPrice",
      "take",
    ]);
  });

  it("supports minYear-only and maxPrice-only", () => {
    const minOnly = buildArabamFilterParams({ minYear: 2016, take: 20 });
    expect(minOnly.params).toEqual({ minYear: "2016", take: "20" });

    const maxOnly = buildArabamFilterParams({ maxPrice: 900_000, take: 20 });
    expect(maxOnly.params).toEqual({ maxPrice: "900000", take: "20" });
  });
});
