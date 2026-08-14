import { describe, expect, it } from "vitest";
import {
  listingMatchesFilter,
  type MatchableFilter,
  type MatchableListing,
} from "./filter-match.engine.js";
import {
  isGlobalDealHighlight,
  shouldEnqueueListingForUserMatching,
} from "./match-eligibility.js";

const baseListing = (
  overrides: Partial<MatchableListing> = {},
): MatchableListing => ({
  title: "Honda Civic 1.6i VTEC Elegance hatasız boyasız",
  price: 1_200_000,
  dealScore: 80,
  category: "Vasıta > Otomobil",
  brand: "Honda",
  model: "Civic 1.6i VTEC Elegance",
  series: "Civic",
  trim: "1.6i VTEC Elegance",
  year: 2020,
  mileage: 80_000,
  fuelType: "Benzin",
  transmission: "Otomatik",
  city: "İzmir",
  district: "Bornova",
  sellerType: "Galeriden",
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

describe("Filters V3 matcher — brand/series/trim + ranges", () => {
  it("1. brand match", () => {
    expect(
      listingMatchesFilter(baseListing(), baseFilter({ brand: "Honda" })),
    ).toBe(true);
  });

  it("2. brand mismatch", () => {
    expect(
      listingMatchesFilter(baseListing(), baseFilter({ brand: "BMW" })),
    ).toBe(false);
  });

  it("3. series match", () => {
    expect(
      listingMatchesFilter(
        baseListing(),
        baseFilter({ brand: "Honda", series: "Civic" }),
      ),
    ).toBe(true);
  });

  it("4. series mismatch", () => {
    expect(
      listingMatchesFilter(
        baseListing({ series: "Accord" }),
        baseFilter({ series: "Civic" }),
      ),
    ).toBe(false);
  });

  it("5. listing.series null → legacy model fallback", () => {
    expect(
      listingMatchesFilter(
        baseListing({ series: null, model: "Civic" }),
        baseFilter({ series: "Civic" }),
      ),
    ).toBe(true);
    expect(
      listingMatchesFilter(
        baseListing({ series: null, model: "Accord" }),
        baseFilter({ series: "Civic" }),
      ),
    ).toBe(false);
  });

  it("6. trim match", () => {
    expect(
      listingMatchesFilter(
        baseListing(),
        baseFilter({ trim: "1.6i VTEC Elegance" }),
      ),
    ).toBe(true);
  });

  it("7. trim mismatch", () => {
    expect(
      listingMatchesFilter(
        baseListing(),
        baseFilter({ trim: "1.6i VTEC Eco Elegance" }),
      ),
    ).toBe(false);
  });

  it("8. trim filter null → tüm trims accepted", () => {
    expect(
      listingMatchesFilter(
        baseListing({ trim: "1.6 LS" }),
        baseFilter({ brand: "Honda", series: "Civic", trim: null }),
      ),
    ).toBe(true);
  });

  it("9. minYear", () => {
    expect(
      listingMatchesFilter(baseListing({ year: 2017 }), baseFilter({ minYear: 2018 })),
    ).toBe(false);
    expect(
      listingMatchesFilter(baseListing({ year: 2018 }), baseFilter({ minYear: 2018 })),
    ).toBe(true);
  });

  it("10. maxYear", () => {
    expect(
      listingMatchesFilter(baseListing({ year: 2023 }), baseFilter({ maxYear: 2022 })),
    ).toBe(false);
  });

  it("11. minMileage", () => {
    expect(
      listingMatchesFilter(
        baseListing({ mileage: 5_000 }),
        baseFilter({ minMileage: 10_000 }),
      ),
    ).toBe(false);
  });

  it("12. maxMileage", () => {
    expect(
      listingMatchesFilter(
        baseListing({ mileage: 150_000 }),
        baseFilter({ maxMileage: 120_000 }),
      ),
    ).toBe(false);
  });

  it("13. minPrice", () => {
    expect(
      listingMatchesFilter(
        baseListing({ price: 700_000 }),
        baseFilter({ minPrice: 800_000 }),
      ),
    ).toBe(false);
  });

  it("14. maxPrice", () => {
    expect(
      listingMatchesFilter(
        baseListing({ price: 1_600_000 }),
        baseFilter({ maxPrice: 1_500_000 }),
      ),
    ).toBe(false);
  });

  it("14b. subcategory Otomobil + listing.subcategory null (Arabam)", () => {
    expect(
      listingMatchesFilter(
        baseListing({ subcategory: null }),
        baseFilter({
          brand: "Honda",
          series: "Civic",
          subcategory: "Otomobil",
          city: "Tüm Türkiye",
          minDealScore: 50,
        }),
      ),
    ).toBe(true);
  });

  it("15. city", () => {
    expect(
      listingMatchesFilter(baseListing({ city: "Ankara" }), baseFilter({ city: "İzmir" })),
    ).toBe(false);
  });

  it("16. district", () => {
    expect(
      listingMatchesFilter(
        baseListing({ district: "Karşıyaka" }),
        baseFilter({ district: "Bornova" }),
      ),
    ).toBe(false);
  });

  it("17. sellerType", () => {
    expect(
      listingMatchesFilter(
        baseListing({ sellerType: "Sahibinden" }),
        baseFilter({ sellerType: "Galeriden" }),
      ),
    ).toBe(false);
  });

  it("18. keywords AND", () => {
    expect(
      listingMatchesFilter(
        baseListing(),
        baseFilter({ keywords: ["hatasız", "boyasız"] }),
      ),
    ).toBe(true);
    expect(
      listingMatchesFilter(
        baseListing(),
        baseFilter({ keywords: ["hatasız", "pert"] }),
      ),
    ).toBe(false);
  });

  it("19. excludedKeywords", () => {
    expect(
      listingMatchesFilter(
        baseListing({ title: "Honda Civic ağır hasarlı" }),
        baseFilter({ excludedKeywords: ["ağır hasarlı", "pert"] }),
      ),
    ).toBe(false);
  });

  it("20. minDealScore", () => {
    expect(
      listingMatchesFilter(
        baseListing({ dealScore: 60 }),
        baseFilter({ minDealScore: 70 }),
      ),
    ).toBe(false);
    expect(
      listingMatchesFilter(
        baseListing({ dealScore: 75 }),
        baseFilter({ minDealScore: 70 }),
      ),
    ).toBe(true);
  });

  it("21. inactive filter is service-gated (engine ignores isActive)", () => {
    // Engine is pure criteria — isActive enforced by FilterMatchingService Prisma where.
    expect(
      listingMatchesFilter(baseListing(), baseFilter({ minDealScore: 70 })),
    ).toBe(true);
  });

  it("22. eski model-only filter halen çalışıyor", () => {
    expect(
      listingMatchesFilter(
        baseListing({
          model: "Civic 1.6i VTEC Elegance",
          series: "Civic",
        }),
        baseFilter({ brand: "Honda", model: "Civic 1.6i VTEC Elegance" }),
      ),
    ).toBe(true);
    expect(
      listingMatchesFilter(
        baseListing({ model: "Accord" }),
        baseFilter({ model: "Civic 1.6i VTEC Elegance" }),
      ),
    ).toBe(false);
  });
});

describe("Global DEAL_SCORE_THRESHOLD vs UserFilter.minDealScore", () => {
  it("score=60 / global=70 / user=50 → user match TRUE, global highlight FALSE", () => {
    const listing = baseListing({ dealScore: 60 });
    expect(isGlobalDealHighlight(60, 70)).toBe(false);
    expect(
      listingMatchesFilter(listing, baseFilter({ minDealScore: 50 })),
    ).toBe(true);
    expect(shouldEnqueueListingForUserMatching({ platform: "arabam" })).toBe(
      true,
    );
  });

  it("user minDealScore=80 + listing score=60 → FALSE", () => {
    expect(
      listingMatchesFilter(
        baseListing({ dealScore: 60 }),
        baseFilter({ minDealScore: 80 }),
      ),
    ).toBe(false);
  });

  it("mock platform is not enqueued for user matching", () => {
    expect(shouldEnqueueListingForUserMatching({ platform: "mock" })).toBe(
      false,
    );
  });
});

describe("Production Honda Civic filter shape (measured 2026-08-14)", () => {
  const prodFilter = (): MatchableFilter => ({
    category: "Vasıta > Otomobil",
    subcategory: "Otomobil",
    brand: "Honda",
    model: null,
    series: "Civic",
    trim: null,
    city: "Tüm Türkiye",
    district: null,
    minPrice: null,
    maxPrice: null,
    minYear: null,
    maxYear: null,
    minMileage: null,
    maxMileage: null,
    minDealScore: 50,
    keywords: [],
    excludedKeywords: [],
  });

  it("subcategory leaf + nationwide city + listing subcategory null → PASS when score>=50", () => {
    expect(
      listingMatchesFilter(
        baseListing({
          subcategory: null,
          city: "Konya",
          dealScore: 90,
          brand: "Honda",
          series: "Civic",
          model: "Honda Civic 1.6i VTEC LS",
          trim: "1.6i VTEC LS",
        }),
        prodFilter(),
      ),
    ).toBe(true);
  });

  it("same shape with dealScore 49 → FAIL only on score", () => {
    expect(
      listingMatchesFilter(
        baseListing({
          subcategory: null,
          city: "Ankara",
          dealScore: 49,
          brand: "Honda",
          series: "Civic",
        }),
        prodFilter(),
      ),
    ).toBe(false);
    expect(
      listingMatchesFilter(
        baseListing({
          subcategory: null,
          city: "Ankara",
          dealScore: 50,
          brand: "Honda",
          series: "Civic",
        }),
        prodFilter(),
      ),
    ).toBe(true);
  });
});
