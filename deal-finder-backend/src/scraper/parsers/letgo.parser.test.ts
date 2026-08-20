import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SubscriptionPlan } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildLetgoItemUrl,
  isLetgoBotChallenge,
  isLetgoPlaceholderImage,
  parseLetgoListingId,
  parseLetgoSearchJson,
  parseLetgoSearchPayload,
  parseLetgoSubTitle,
  resolveLetgoNextPageUrl,
} from "./letgo.parser.js";
import { buildLetgoQuery } from "../query/planners/letgo-query-builder.js";
import { planFromSearchIntent } from "../query/scrape-query-plan.js";
import { buildSearchIntentFromFilter } from "../../coverage/search-intent-builder.js";
import { listingMatchesFilter } from "../../filters/filter-match.engine.js";
import { criterionRole } from "../../coverage/platform-capability-v2.js";
import { fieldRole } from "../query/platform-capabilities.js";
import {
  applyProviderResult,
  emptyReliabilityState,
} from "../../coverage/provider-reliability.js";
import { evaluatePlatformCoverage } from "../../coverage/coverage-engine.js";
import { groupActiveFilters } from "../scheduler/canonical-query.js";
import { toListingDto, listingDtoToRaw } from "../scraper.manager.js";
import { MarketIntelligenceService } from "../../market/market-intelligence.service.js";
import type { ComparableListingRow } from "../../market/market-intelligence.types.js";
import type { SchedulerFilterInput } from "../query/scrape-query-plan.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/letgo-search-items.sample.json",
);
const FIXTURE = readFileSync(fixturePath, "utf8");

const hondaIntent = () =>
  buildSearchIntentFromFilter({
    category: "Vasıta > Otomobil",
    brand: "Honda",
    series: "Civic",
    minYear: 2016,
    maxYear: 2018,
    city: "Tüm Türkiye",
    minDealScore: 50,
  });

describe("Letgo parser", () => {
  it("parses stable iid, price, brand/series, year, mileage, city, image", () => {
    const { listings, nextPageUrl } = parseLetgoSearchJson(FIXTURE);
    expect(listings.length).toBe(3);
    expect(listings[0]?.externalId).toBe("1728564686");
    expect(listings[0]?.url).toContain("iid-1728564686");
    expect(listings[0]?.price).toBe(264999);
    expect(listings[0]?.currency).toBe("TRY");
    expect(listings[0]?.brand).toBe("Honda");
    expect(listings[0]?.series).toBe("Civic");
    expect(listings[0]?.year).toBe(1997);
    expect(listings[0]?.mileage).toBe(243000);
    expect(listings[0]?.city).toBe("Sivas");
    expect(listings[0]?.imageUrl).toContain("imvm.letgo.com");
    expect(nextPageUrl).toContain("search_after=");
    expect(parseLetgoListingId(listings[0]!.url)).toBe("1728564686");
  });

  it("skips placeholder images", () => {
    const { listings } = parseLetgoSearchJson(FIXTURE);
    const civic2016 = listings.find((row) => row.year === 2016);
    expect(civic2016).toBeTruthy();
    expect(civic2016?.imageUrl).toBeNull();
    expect(isLetgoPlaceholderImage("https://imvm.letgo.com/placeholder/x")).toBe(
      true,
    );
  });

  it("skips invalid items without dropping the page", () => {
    const parsed = parseLetgoSearchPayload({
      data: [
        null,
        { id: "bad" },
        { id: "1732888522", title: "Honda CIVIC", price: { value: { raw: 980000, display: "980.000 TL" } } },
        { title: "no id", price: { value: { raw: 1, display: "1 TL" } } },
      ],
      metadata: {},
    });
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]?.externalId).toBe("1732888522");
  });

  it("empty page and malformed JSON return no listings", () => {
    expect(parseLetgoSearchPayload({ data: [], empty: true }).listings).toEqual(
      [],
    );
    expect(parseLetgoSearchJson("not-json").listings).toEqual([]);
    expect(isLetgoBotChallenge('<html><meta name="bm-verify">')).toBe(true);
  });

  it("parses subtitle year/mileage and item url", () => {
    expect(parseLetgoSubTitle("2009 - 167.850 KM")).toEqual({
      year: 2009,
      mileage: 167850,
    });
    expect(buildLetgoItemUrl("1732888522", "Honda CIVIC")).toBe(
      "https://www.letgo.com/item/honda-civic-iid-1732888522",
    );
    expect(
      resolveLetgoNextPageUrl("category_id=15706&search_after=abc"),
    ).toContain("/api/search/items?category_id=15706");
  });

  it("dedups pagination overlap by externalId", () => {
    const page1 = parseLetgoSearchJson(FIXTURE).listings;
    const page2 = parseLetgoSearchPayload({
      data: [
        { id: "1728564686", title: "Honda CIVIC", price: { value: { raw: 1, display: "1 TL" } } },
        { id: "1739999999", title: "Honda CIVIC", price: { value: { raw: 2, display: "2 TL" } } },
      ],
    }).listings;
    const seen = new Set(page1.map((row) => row.externalId));
    const merged = [...page1];
    for (const row of page2) {
      if (!seen.has(row.externalId)) {
        merged.push(row);
      }
    }
    expect(merged.filter((row) => row.externalId === "1728564686")).toHaveLength(1);
    expect(merged.some((row) => row.externalId === "1739999999")).toBe(true);
  });
});

describe("Letgo query builder / coverage / scheduler", () => {
  it("maps SearchIntent Honda Civic to category 15706 + marka/model filter", () => {
    const plan = planFromSearchIntent("letgo", hondaIntent());
    const built = buildLetgoQuery(plan);
    expect(built.url).toContain("/api/search/items");
    expect(built.url).toContain("category_id=15706");
    expect(decodeURIComponent(built.url)).toContain("marka:honda");
    expect(decodeURIComponent(built.url)).toContain("model:civic");
    expect(built.appliedCriteria).toEqual(
      expect.arrayContaining(["brand", "series", "category"]),
    );
    expect(built.deferredCriteria).toEqual(
      expect.arrayContaining(["minYear", "maxYear"]),
    );
    expect(built.url).not.toContain("/tr-tr");
  });

  it("falls back to q= keywords when brand/series missing", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      keywords: ["Honda Civic"],
    });
    const built = buildLetgoQuery(planFromSearchIntent("letgo", intent));
    expect(built.url).toContain("q=Honda+Civic");
    expect(built.appliedCriteria).toContain("keywords");
  });

  it("capability matrix matches verified source contract", () => {
    expect(fieldRole("letgo", "brand")).toBe("SOURCE");
    expect(fieldRole("letgo", "series")).toBe("SOURCE");
    expect(fieldRole("letgo", "category")).toBe("SOURCE");
    expect(fieldRole("letgo", "city")).toBe("MATCHER_ONLY");
    expect(fieldRole("letgo", "minYear")).toBe("MATCHER_ONLY");
    expect(criterionRole("letgo", "trim")).toBe("UNSUPPORTED");
    expect(criterionRole("letgo", "minMileage")).toBe("MATCHER_ONLY");
    expect(criterionRole("letgo", "fuelType")).toBe("MATCHER_ONLY");
    expect(criterionRole("letgo", "sellerType")).toBe("MATCHER_ONLY");
  });

  it("Honda Civic coverage is FULL (years MATCHER_ONLY + structured)", () => {
    const row = evaluatePlatformCoverage(hondaIntent(), "letgo", {
      availability: "AVAILABLE",
      reason: "none",
    });
    expect(row.coverage).toBe("FULL");
    expect(row.schedulable).toBe(true);
    expect(row.matcherCriteria).toEqual(
      expect.arrayContaining(["minYear", "maxYear"]),
    );
    expect(row.unsupportedCriteria).toEqual([]);
  });

  it("scheduler group uses JSON search URL", () => {
    const filter: SchedulerFilterInput = {
      id: "f-letgo",
      isActive: true,
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: null,
      city: "Tüm Türkiye",
      keywords: [],
      plan: SubscriptionPlan.VIP,
      minYear: 2016,
      maxYear: 2018,
    };
    const groups = groupActiveFilters([filter]);
    const letgo = groups.find((group) => group.platform === "letgo");
    expect(letgo?.scrapeUrl).toContain("/api/search/items");
    expect(letgo?.query).toBe("Honda Civic");
  });
});

describe("Letgo matcher / MI / reliability", () => {
  it("2016 Civic fixture PASSes production Honda Civic 2016-2018 minDealScore=50", () => {
    const parsed = parseLetgoSearchJson(FIXTURE).listings.find(
      (row) => row.year === 2016,
    )!;
    expect(
      listingMatchesFilter(
        {
          title: parsed.title,
          price: parsed.price!,
          dealScore: 70,
          category: "Vasıta > Otomobil",
          brand: parsed.brand,
          series: parsed.series,
          year: parsed.year,
          mileage: parsed.mileage,
          city: parsed.city,
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          minYear: 2016,
          maxYear: 2018,
          minDealScore: 50,
        },
      ),
    ).toBe(true);
  });

  it("1997 Civic fixture FAILs year window", () => {
    const parsed = parseLetgoSearchJson(FIXTURE).listings[0]!;
    expect(
      listingMatchesFilter(
        {
          title: parsed.title,
          price: parsed.price!,
          dealScore: 70,
          category: "Vasıta > Otomobil",
          brand: parsed.brand,
          series: parsed.series,
          year: parsed.year,
          mileage: parsed.mileage,
          city: parsed.city,
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          minYear: 2016,
          maxYear: 2018,
          minDealScore: 50,
        },
      ),
    ).toBe(false);
  });

  it("normalizer emits letgo:iid", () => {
    const parsed = parseLetgoSearchJson(FIXTURE).listings[0]!;
    const dto = toListingDto(
      "letgo",
      {
        externalId: parsed.externalId,
        title: parsed.title,
        price: parsed.price,
        city: parsed.city,
        url: parsed.url,
        category: "Vasıta > Otomobil",
        brand: parsed.brand,
        series: parsed.series,
        year: parsed.year,
        mileage: parsed.mileage,
        imageUrl: parsed.imageUrl,
      },
      { category: "Vasıta > Otomobil" },
    );
    expect(dto?.externalId).toBe("letgo:1728564686");
    expect(listingDtoToRaw(dto!).platform).toBe("letgo");
  });

  it("MI comparable pool accepts letgo next to arabam+otoplus", async () => {
    const civic = (
      partial: Partial<ComparableListingRow> & {
        id: string;
        externalId: string;
        price: number;
      },
    ): ComparableListingRow => ({
      platform: "arabam",
      currency: "TRY",
      brand: "Honda",
      model: "Honda Civic",
      series: "Civic",
      trim: null,
      year: 2017,
      mileage: 90_000,
      city: "İstanbul",
      lastSeenAt: new Date(),
      ...partial,
    });
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [
        civic({ id: "a1", externalId: "a1", price: 1_300_000 }),
        civic({ id: "a2", externalId: "a2", price: 1_310_000 }),
        civic({
          id: "o1",
          externalId: "o1",
          platform: "otoplus",
          price: 1_320_000,
        }),
        civic({
          id: "o2",
          externalId: "o2",
          platform: "otoplus",
          price: 1_330_000,
        }),
        civic({
          id: "l1",
          externalId: "letgo:1730002016",
          platform: "letgo",
          price: 1_315_000,
        }),
      ],
    });
    const result = await service.analyzeListing({
      id: "subject",
      externalId: "subj-letgo",
      platform: "letgo",
      price: 1_315_000,
      currency: "TRY",
      category: "Vasıta > Otomobil",
      brand: "Honda",
      model: "Honda Civic",
      series: "Civic",
      trim: null,
      year: 2017,
      mileage: 91_000,
      city: "İstanbul",
    });
    expect(result.status).toBe("READY");
    expect(result.sampleSize).toBeGreaterThanOrEqual(5);
  });

  it("reliability recovers NO_DATA → DEGRADED → HEALTHY on raw>0 cycles", () => {
    let state = emptyReliabilityState();
    for (let i = 0; i < 10; i += 1) {
      state = applyProviderResult(state, {
        outcome: "empty",
        rawCount: 0,
      }).next;
    }
    expect(state.reliability).toBe("NO_DATA");
    state = applyProviderResult(state, {
      outcome: "success",
      rawCount: 15,
    }).next;
    expect(state.reliability).toBe("DEGRADED");
    state = applyProviderResult(state, {
      outcome: "success",
      rawCount: 18,
    }).next;
    state = applyProviderResult(state, {
      outcome: "success",
      rawCount: 20,
    }).next;
    expect(state.reliability).toBe("HEALTHY");
  });
});
