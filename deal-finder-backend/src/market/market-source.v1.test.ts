import { describe, expect, it } from "vitest";
import {
  confidenceToScore,
  dealScoreService,
  priceAdvantageToScore,
} from "../analyzer/deal-score.service.js";
import { listingPlatformLabel } from "../lib/platform-label.js";
import { listingMatchesFilter } from "../filters/filter-match.engine.js";
import { buildOpportunityNotificationCopy } from "../notifications/notification-eligibility.js";
import { findCrossPlatformDuplicateCandidates } from "./market-duplicate-audit.js";
import {
  MarketIntelligenceService,
  type CandidateQuery,
} from "./market-intelligence.service.js";
import type {
  ComparableListingRow,
  MarketAnalysisResult,
} from "./market-intelligence.types.js";
import { marketSourceCaption } from "./market-source-caption.js";
import {
  classifyMarketDiversity,
  computeMarketSourceDiversity,
} from "./market-source-diversity.js";
import {
  attachMarketSourceToRawDetails,
  parseMarketSourceFromRawDetails,
} from "./market-source-persist.js";

function row(
  partial: Partial<ComparableListingRow> & {
    id: string;
    externalId: string;
    price: number;
  },
): ComparableListingRow {
  return {
    platform: "arabam",
    currency: "TRY",
    brand: "Honda",
    model: "Honda Civic",
    series: "Civic",
    trim: null,
    year: 2017,
    mileage: 120_000,
    city: "İstanbul",
    lastSeenAt: new Date(),
    ...partial,
  };
}

function subject() {
  return {
    id: "subject",
    externalId: "562995",
    platform: "otoplus",
    price: 1_200_000,
    currency: "TRY",
    category: "Vasıta > Otomobil",
    brand: "Honda",
    model: "Honda Civic",
    series: "Civic",
    trim: null,
    year: 2017,
    mileage: 120_000,
    city: "İzmir",
  };
}

const readyMarket = (
  extra: Partial<MarketAnalysisResult> = {},
): MarketAnalysisResult => ({
  status: "READY",
  marketMedianPrice: 1_439_000,
  sampleSize: 93,
  priceAdvantagePct: 14,
  confidence: "HIGH",
  segmentLevel: "L4_SERIES",
  dispersionPct: 20,
  calculatedAt: new Date(),
  sourceCount: 2,
  sourceDistribution: [
    { platform: "arabam", sampleSize: 92 },
    { platform: "otoplus", sampleSize: 1 },
  ],
  dominantSourcePct: 98.9,
  diversity: "MULTI_SOURCE_LOW",
  ...extra,
});

describe("market source diversity helpers", () => {
  it("1. single source distribution", () => {
    const result = computeMarketSourceDiversity(Array(10).fill("arabam"));
    expect(result.sourceCount).toBe(1);
    expect(result.sourceDistribution).toEqual([
      { platform: "arabam", sampleSize: 10 },
    ]);
    expect(result.diversity).toBe("SINGLE_SOURCE");
  });

  it("2. two source distribution", () => {
    const result = computeMarketSourceDiversity([
      ...Array(92).fill("arabam"),
      "otoplus",
    ]);
    expect(result.sourceCount).toBe(2);
    expect(result.sourceDistribution[0]).toEqual({
      platform: "arabam",
      sampleSize: 92,
    });
    expect(result.sourceDistribution[1]).toEqual({
      platform: "otoplus",
      sampleSize: 1,
    });
  });

  it("3. source count distinct", () => {
    const result = computeMarketSourceDiversity([
      "arabam",
      "ARABAM",
      "otoplus",
      "letgo",
    ]);
    expect(result.sourceCount).toBe(3);
  });

  it("4. mock excluded", () => {
    const result = computeMarketSourceDiversity([
      "arabam",
      "arabam",
      "mock",
      "mock-seeder",
      "otoplus",
    ]);
    expect(result.sourceCount).toBe(2);
    expect(result.sourceDistribution.some((r) => r.platform.includes("mock"))).toBe(
      false,
    );
  });

  it("5. dominant source pct", () => {
    const result = computeMarketSourceDiversity([
      ...Array(92).fill("arabam"),
      "otoplus",
    ]);
    expect(result.dominantSourcePct).toBe(98.9);
  });

  it("6. diversity single", () => {
    expect(classifyMarketDiversity(1, 100)).toBe("SINGLE_SOURCE");
  });

  it("7. diversity low", () => {
    expect(classifyMarketDiversity(2, 98.9)).toBe("MULTI_SOURCE_LOW");
  });

  it("8. diversity balanced", () => {
    expect(classifyMarketDiversity(2, 55)).toBe("MULTI_SOURCE_BALANCED");
  });

  it("9. deterministic ordering", () => {
    const a = computeMarketSourceDiversity(["otoplus", "arabam", "arabam"]);
    const b = computeMarketSourceDiversity(["arabam", "otoplus", "arabam"]);
    expect(a.sourceDistribution).toEqual(b.sourceDistribution);
    expect(a.sourceDistribution.map((r) => r.platform)).toEqual([
      "arabam",
      "otoplus",
    ]);
  });

  it("13. new provider automatically counted", () => {
    const result = computeMarketSourceDiversity([
      "arabam",
      "future-cars",
      "future-cars",
    ]);
    expect(result.sourceCount).toBe(2);
    expect(result.sourceDistribution.some((r) => r.platform === "future-cars")).toBe(
      true,
    );
  });
});

describe("MI result additive metadata", () => {
  it("10. MI result additive metadata on READY", async () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) =>
        row({
          id: `a${i}`,
          externalId: `a${i}`,
          platform: "arabam",
          price: 1_400_000 + i * 5_000,
        }),
      ),
      row({
        id: "o1",
        externalId: "o1",
        platform: "otoplus",
        price: 1_430_000,
      }),
    ];
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    const result = await service.analyzeListing(subject());
    expect(result.status).toBe("READY");
    expect(result.sourceCount).toBe(2);
    expect(result.sourceDistribution?.map((r) => r.platform).sort()).toEqual([
      "arabam",
      "otoplus",
    ]);
    expect(result.diversity).toBe("MULTI_SOURCE_LOW");
  });

  it("14. insufficient data semantics unchanged", async () => {
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [
        row({ id: "a", externalId: "a", price: 1_400_000 }),
      ],
    });
    const result = await service.analyzeListing(subject());
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.marketMedianPrice).toBeNull();
    expect(result.priceAdvantagePct).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.sourceCount).toBe(0);
  });

  it("does not query by hardcoded arabam+otoplus only", async () => {
    const seen: CandidateQuery[] = [];
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async (query) => {
        seen.push(query);
        return Array.from({ length: 6 }, (_, i) =>
          row({
            id: `x${i}`,
            externalId: `x${i}`,
            platform: i === 0 ? "brand-new-site" : "arabam",
            price: 1_400_000 + i * 1_000,
          }),
        );
      },
    });
    const result = await service.analyzeListing(subject());
    expect(result.status).toBe("READY");
    expect(result.sourceCount).toBe(2);
    expect(seen.every((q) => !("platformIn" in q))).toBe(true);
  });
});

describe("DealScore / matcher / notification unchanged", () => {
  const complete = {
    brand: "Honda",
    model: "Civic",
    year: 2017,
    mileage: 120_000,
    price: 1_200_000,
    currency: "TRY",
    city: "İzmir",
  };

  it("15. DealScore unchanged by diversity", () => {
    const without = dealScoreService.calculateFromMarket(complete, {
      ...readyMarket(),
      sourceCount: undefined,
      sourceDistribution: undefined,
      dominantSourcePct: undefined,
      diversity: undefined,
    });
    const withDiv = dealScoreService.calculateFromMarket(complete, readyMarket());
    expect(withDiv.dealScore).toBe(without.dealScore);
    expect(withDiv.priceScore).toBe(priceAdvantageToScore(14));
    expect(withDiv.confidenceScore).toBe(confidenceToScore("HIGH"));
  });

  it("16. matcher unchanged", () => {
    const listing = {
      dealScore: 19,
      price: 1_200_000,
      category: "Vasıta > Otomobil",
      brand: "Honda",
      model: "Civic",
      series: "Civic",
      year: 2017,
      mileage: 120_000,
      city: "İzmir",
      title: "Honda Civic",
      description: null,
    };
    const filter = {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      minYear: 2016,
      maxYear: 2018,
      minDealScore: 50,
    };
    expect(listingMatchesFilter(listing, filter)).toBe(false);
    expect(listingMatchesFilter({ ...listing, dealScore: 55 }, filter)).toBe(true);
  });

  it("17. notification copy has no source count", () => {
    const copy = buildOpportunityNotificationCopy({
      title: "Honda Civic",
      price: 1_200_000,
      dealScore: 70,
      priceAdvantagePct: 14,
      marketMedianPrice: 1_439_000,
      platform: "otoplus",
    });
    expect(copy.message).not.toMatch(/sourceCount|MULTI_SOURCE|2 kaynak/i);
    expect(copy.telegramMessage).not.toMatch(/sourceCount|dominantSourcePct/i);
  });
});

describe("18. platform display labels", () => {
  it("maps raw slugs", () => {
    expect(listingPlatformLabel("arabam")).toBe("Arabam");
    expect(listingPlatformLabel("otoplus")).toBe("Otoplus");
    expect(marketSourceCaption(1, [{ platform: "arabam", sampleSize: 10 }])).toBe(
      "Analiz Arabam ilanlarından oluşturuldu.",
    );
    expect(
      marketSourceCaption(2, [
        { platform: "arabam", sampleSize: 92 },
        { platform: "otoplus", sampleSize: 1 },
      ]),
    ).toBe("Analiz Arabam ve Otoplus ilanlarından oluşturuldu.");
    expect(
      marketSourceCaption(2, [
        { platform: "arabam", sampleSize: 92 },
        { platform: "otoplus", sampleSize: 1 },
      ]),
    ).not.toMatch(/güçlü/i);
  });
});

describe("19. possible duplicate audit helper", () => {
  it("flags close cross-platform pair and ignores same platform", () => {
    const pairs = findCrossPlatformDuplicateCandidates([
      {
        platform: "arabam",
        externalId: "a1",
        title: "Honda Civic 1.6",
        brand: "Honda",
        series: "Civic",
        year: 2017,
        mileage: 120_000,
        price: 1_250_000,
        city: "İzmir",
      },
      {
        platform: "otoplus",
        externalId: "o1",
        title: "Honda Civic 1.6 Elegance",
        brand: "Honda",
        series: "Civic",
        year: 2017,
        mileage: 120_400,
        price: 1_255_000,
        city: "İzmir",
      },
      {
        platform: "arabam",
        externalId: "a2",
        brand: "Honda",
        series: "Civic",
        year: 2015,
        mileage: 80_000,
        price: 900_000,
        city: "Ankara",
      },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.left.platform).toBe("arabam");
    expect(pairs[0]?.right.platform).toBe("otoplus");
  });
});

describe("20. source audit persist snapshot is additive JSON", () => {
  it("round-trips through rawDetails without schema fields", () => {
    const raw = attachMarketSourceToRawDetails(
      { title: "keep-me" },
      readyMarket(),
    );
    expect(raw.title).toBe("keep-me");
    const parsed = parseMarketSourceFromRawDetails(raw);
    expect(parsed?.sourceCount).toBe(2);
    expect(parsed?.diversity).toBe("MULTI_SOURCE_LOW");
  });
});
