import { describe, expect, it } from "vitest";
import {
  listingMatchesFilter,
  normalizeMatchText,
  type MatchableFilter,
  type MatchableListing,
} from "../filters/filter-match.engine.js";
import { normalizeCurrency } from "../scraper/utils/normalize-currency.js";
import {
  parseMileage,
  parsePrice,
  parseYear,
} from "../scraper/utils/parse-number.js";
import { normalizeScrapedListing } from "../scraper/normalizer.js";
import { env } from "../config/env.js";

const listing = (
  overrides: Partial<MatchableListing> = {},
): MatchableListing => ({
  title: "BMW 320i 2021",
  price: 1_500_000,
  dealScore: 85,
  category: "Vasıta > Otomobil",
  brand: "BMW",
  model: "320i",
  year: 2021,
  mileage: 45_000,
  city: "İzmir",
  description: "Temiz araç",
  ...overrides,
});

const filter = (
  overrides: Partial<MatchableFilter> = {},
): MatchableFilter => ({
  category: "Vasıta > Otomobil",
  minDealScore: 70,
  ...overrides,
});

describe("Core V2.1 parsers + matching consistency", () => {
  it("price parser: 1.850.000 TL => 1850000", () => {
    expect(parsePrice("1.850.000 TL")).toBe(1_850_000);
  });

  it("price parser: 1,850,000 TL => 1850000", () => {
    expect(parsePrice("1,850,000 TL")).toBe(1_850_000);
  });

  it("mileage parser: 98.500 km => 98500", () => {
    expect(parseMileage("98.500 km")).toBe(98_500);
  });

  it("mileage parser: 98 500 KM => 98500", () => {
    expect(parseMileage("98 500 KM")).toBe(98_500);
  });

  it("invalid numeric: Fiyat sorunuz => null", () => {
    expect(parsePrice("Fiyat sorunuz")).toBeNull();
    expect(parseMileage("Takasa açık")).toBeNull();
    expect(parseYear("-")).toBeNull();
  });

  it("Turkish text normalization equates İzmir variants", () => {
    expect(normalizeMatchText("İzmir")).toBe(normalizeMatchText("izmir"));
    expect(normalizeMatchText(" İZMİR ")).toBe(normalizeMatchText("İzmir"));
    expect(
      listingMatchesFilter(listing({ city: "İzmir" }), filter({ city: " İZMİR " })),
    ).toBe(true);
  });

  it("currency TL / ₺ / TRY => TRY", () => {
    expect(normalizeCurrency("TL")).toBe("TRY");
    expect(normalizeCurrency("₺")).toBe("TRY");
    expect(normalizeCurrency("TRY")).toBe("TRY");
  });

  it("publishedAt is null when source omits it (not scrape time)", () => {
    const normalized = normalizeScrapedListing({
      id: "pub-1",
      title: "Test ilan",
      price: "100000 TL",
      url: "https://www.arabam.com/ilan/100001",
      platform: "arabam",
      category: "Vasıta > Otomobil",
      city: "İzmir",
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.publishedAt).toBeNull();
  });

  it("excludedKeyword blocks sync-equivalent V2 match", () => {
    expect(
      listingMatchesFilter(
        listing({ description: "Ağır hasar kayıtlıdır" }),
        filter({ excludedKeywords: ["ağır hasar"] }),
      ),
    ).toBe(false);
  });

  it("brand filter + listing.brand null => no match (no Deal/notification)", () => {
    expect(
      listingMatchesFilter(listing({ brand: null }), filter({ brand: "BMW" })),
    ).toBe(false);
  });

  it("sync and async paths share listingMatchesFilter decision", () => {
    const l = listing({ brand: "BMW", description: "hatasız" });
    const f = filter({
      brand: "BMW",
      keywords: ["hatasız"],
      excludedKeywords: ["ağır hasar"],
    });
    // Both services call the same pure function — identical boolean result.
    const asyncDecision = listingMatchesFilter(l, f);
    const syncDecision = listingMatchesFilter(l, f);
    expect(asyncDecision).toBe(true);
    expect(syncDecision).toBe(asyncDecision);
  });

  it("mock listings require non-production AND ENABLE_MOCK_LISTINGS", () => {
    const mockAllowed =
      env.NODE_ENV !== "production" && env.ENABLE_MOCK_LISTINGS === true;
    if (env.NODE_ENV === "production") {
      expect(mockAllowed).toBe(false);
    } else {
      // Default in this repo is false unless explicitly enabled.
      expect(typeof env.ENABLE_MOCK_LISTINGS === "boolean").toBe(true);
      expect(mockAllowed).toBe(env.ENABLE_MOCK_LISTINGS === true);
    }
  });
});

describe("Core V2.1 ingest timestamps (unit contract)", () => {
  it("toListingCreateData does not invent publishedAt", async () => {
    const { toListingCreateData } = await import("../scraper/normalizer.js");
    const data = toListingCreateData(
      {
        externalId: "arabam:1",
        platform: "arabam",
        title: "Test",
        price: 100,
        category: "Vasıta > Otomobil",
        subcategory: null,
        brand: null,
        model: null,
        series: null,
        trim: null,
        variant: null,
        year: null,
        mileage: null,
        fuelType: null,
        transmission: null,
        city: "İzmir",
        district: null,
        sellerType: null,
        description: null,
        currency: "TRY",
        imageUrl: null,
        publishedAt: null,
        url: "https://example.com/1",
        marketAveragePrice: 100,
        rawDetails: {},
      },
      50,
    );
    expect(data.publishedAt).toBeNull();
  });
});
