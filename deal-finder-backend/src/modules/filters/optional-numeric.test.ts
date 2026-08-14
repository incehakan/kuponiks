import { describe, expect, it } from "vitest";
import { formatFilterSummary } from "../../../../deal-finder-mobile/src/utils/filterForm.ts";
import { listingMatchesFilter } from "../../filters/filter-match.engine.js";
import {
  normalizeEmptyNumericFilterFields,
  parseOptionalNumber,
} from "./optional-numeric.js";

describe("Optional numeric filter semantics", () => {
  it("1. empty maxMileage string → undefined", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("   ")).toBeUndefined();
  });

  it("2. explicit 0 minMileage stays 0", () => {
    expect(parseOptionalNumber("0")).toBe(0);
    expect(parseOptionalNumber(0)).toBe(0);
  });

  it("3. 120000 maxMileage parses", () => {
    expect(parseOptionalNumber("120000")).toBe(120000);
  });

  it("4. empty maxPrice → undefined", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
  });

  it("5. empty minYear → undefined", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
  });

  it("6. backend empty string numeric → null before coerce", () => {
    const body = {
      maxMileage: "",
      minYear: "  ",
      minMileage: "0",
      maxPrice: "",
    };
    normalizeEmptyNumericFilterFields(body);
    expect(body.maxMileage).toBeNull();
    expect(body.minYear).toBeNull();
    expect(body.minMileage).toBe("0");
    expect(body.maxPrice).toBeNull();
  });

  it("7. maxMileage null matcher ignores mileage", () => {
    expect(
      listingMatchesFilter(
        {
          title: "Honda Civic",
          price: 1_000_000,
          dealScore: 80,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          mileage: 90_000,
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          maxMileage: null,
          minDealScore: 70,
        },
      ),
    ).toBe(true);
  });

  it("8. maxMileage 0 rejects listing with mileage > 0", () => {
    expect(
      listingMatchesFilter(
        {
          title: "Honda Civic",
          price: 1_000_000,
          dealScore: 80,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          mileage: 1,
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          maxMileage: 0,
          minDealScore: 70,
        },
      ),
    ).toBe(false);
  });

  it("9. filter summary hides null mileage", () => {
    const summary = formatFilterSummary({
      id: "f1",
      name: "Honda Civic",
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      maxMileage: null,
      city: "Tüm Türkiye",
      minDealScore: 70,
    });
    expect(summary).toBe("Honda Civic · Tüm Türkiye · Skor ≥70");
    expect(summary).not.toContain("km");
  });

  it("10. existing legacy payload still accepted (category + city + prices)", () => {
    const body = {
      category: "Emlak > Konut",
      city: "İstanbul",
      minPrice: 1_000_000,
      maxPrice: 5_000_000,
    };
    normalizeEmptyNumericFilterFields(body);
    expect(body.minPrice).toBe(1_000_000);
    expect(body.maxPrice).toBe(5_000_000);
    expect(body.category).toBe("Emlak > Konut");
  });
});
