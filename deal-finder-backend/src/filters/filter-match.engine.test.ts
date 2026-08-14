import { describe, expect, it } from "vitest";
import {
  listingMatchesFilter,
  type MatchableFilter,
  type MatchableListing,
} from "./filter-match.engine.js";

const baseListing = (
  overrides: Partial<MatchableListing> = {},
): MatchableListing => ({
  title: "BMW 320i 2021 otomatik benzin",
  price: 1_500_000,
  dealScore: 80,
  category: "Vasıta > Otomobil",
  brand: "BMW",
  model: "320i",
  year: 2021,
  mileage: 45_000,
  fuelType: "Benzin",
  transmission: "Otomatik",
  city: "İzmir",
  district: "Bornova",
  description: "Hatası boyasız acil",
  ...overrides,
});

const baseFilter = (
  overrides: Partial<MatchableFilter> = {},
): MatchableFilter => ({
  category: "Vasıta > Otomobil",
  minDealScore: 70,
  ...overrides,
});

describe("listingMatchesFilter V2", () => {
  it("1. eski basit filtre (category + city + maxPrice + keywords) çalışır", () => {
    expect(
      listingMatchesFilter(
        baseListing(),
        baseFilter({
          city: "İzmir",
          maxPrice: 1_800_000,
          keywords: ["otomatik"],
        }),
      ),
    ).toBe(true);
  });

  it("2. BMW filtresi + BMW listing => match", () => {
    expect(
      listingMatchesFilter(baseListing({ brand: "BMW" }), baseFilter({ brand: "BMW" })),
    ).toBe(true);
  });

  it("3. BMW filtresi + Mercedes listing => no match", () => {
    expect(
      listingMatchesFilter(
        baseListing({ brand: "Mercedes", title: "Mercedes C200" }),
        baseFilter({ brand: "BMW" }),
      ),
    ).toBe(false);
  });

  it("4. BMW filtresi + listing.brand null => no match", () => {
    expect(
      listingMatchesFilter(baseListing({ brand: null }), baseFilter({ brand: "BMW" })),
    ).toBe(false);
  });

  it("5. minYear kontrolü", () => {
    expect(
      listingMatchesFilter(baseListing({ year: 2019 }), baseFilter({ minYear: 2020 })),
    ).toBe(false);
    expect(
      listingMatchesFilter(baseListing({ year: 2021 }), baseFilter({ minYear: 2020 })),
    ).toBe(true);
  });

  it("6. maxYear kontrolü", () => {
    expect(
      listingMatchesFilter(baseListing({ year: 2024 }), baseFilter({ maxYear: 2022 })),
    ).toBe(false);
  });

  it("7. maxMileage kontrolü", () => {
    expect(
      listingMatchesFilter(
        baseListing({ mileage: 120_000 }),
        baseFilter({ maxMileage: 100_000 }),
      ),
    ).toBe(false);
  });

  it("8. minPrice/maxPrice kontrolü", () => {
    expect(
      listingMatchesFilter(
        baseListing({ price: 2_000_000 }),
        baseFilter({ minPrice: 1_000_000, maxPrice: 1_800_000 }),
      ),
    ).toBe(false);
    expect(
      listingMatchesFilter(
        baseListing({ price: 1_500_000 }),
        baseFilter({ minPrice: 1_000_000, maxPrice: 1_800_000 }),
      ),
    ).toBe(true);
  });

  it("9. city kontrolü", () => {
    expect(
      listingMatchesFilter(baseListing({ city: "Ankara" }), baseFilter({ city: "İzmir" })),
    ).toBe(false);
    expect(
      listingMatchesFilter(
        baseListing({ city: "İzmir" }),
        baseFilter({ city: "İzmir, Ankara" }),
      ),
    ).toBe(true);
    expect(
      listingMatchesFilter(
        baseListing({ city: "İzmir" }),
        baseFilter({ city: "Tüm Türkiye" }),
      ),
    ).toBe(true);
  });

  it("10. district kontrolü", () => {
    expect(
      listingMatchesFilter(
        baseListing({ district: "Karşıyaka" }),
        baseFilter({ district: "Bornova" }),
      ),
    ).toBe(false);
  });

  it("11. fuelType kontrolü", () => {
    expect(
      listingMatchesFilter(
        baseListing({ fuelType: "Dizel" }),
        baseFilter({ fuelType: "Benzin" }),
      ),
    ).toBe(false);
  });

  it("12. transmission kontrolü", () => {
    expect(
      listingMatchesFilter(
        baseListing({ transmission: "Manuel" }),
        baseFilter({ transmission: "Otomatik" }),
      ),
    ).toBe(false);
  });

  it("13. keyword eşleşmesi", () => {
    expect(
      listingMatchesFilter(baseListing(), baseFilter({ keywords: ["BMW", "Bornova"] })),
    ).toBe(false);
    expect(
      listingMatchesFilter(baseListing(), baseFilter({ keywords: ["BMW", "otomatik"] })),
    ).toBe(true);
  });

  it("14. excludedKeyword eşleşmeyi engeller", () => {
    expect(
      listingMatchesFilter(
        baseListing({ title: "BMW 320i hasarlı kayıtlı" }),
        baseFilter({ excludedKeywords: ["hasarlı", "pert"] }),
      ),
    ).toBe(false);
  });

  it("15. birden fazla kriterin hepsi gerekir", () => {
    expect(
      listingMatchesFilter(
        baseListing({ brand: "BMW", year: 2018 }),
        baseFilter({ brand: "BMW", minYear: 2020, city: "İzmir" }),
      ),
    ).toBe(false);
  });

  it("16. optional kriter verilmemişse engellemez", () => {
    expect(
      listingMatchesFilter(
        baseListing({
          brand: null,
          model: null,
          year: null,
          mileage: null,
          fuelType: null,
          transmission: null,
          district: null,
        }),
        baseFilter({
          category: "Vasıta > Otomobil",
          maxPrice: 2_000_000,
        }),
      ),
    ).toBe(true);
  });
});
