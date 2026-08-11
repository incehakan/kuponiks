import { describe, expect, it } from "vitest";
import {
  confidenceToScore,
  dataCompletenessScore,
  dealScoreService,
  priceAdvantageToScore,
} from "../analyzer/deal-score.service.js";
import { resolveMarketConfidence } from "./market-confidence.js";
import {
  MarketIntelligenceService,
  type CandidateQuery,
} from "./market-intelligence.service.js";
import type {
  ComparableListingRow,
  MarketAnalysisResult,
} from "./market-intelligence.types.js";
import {
  dispersionPct,
  filterIqrOutliers,
  median,
  priceAdvantagePct,
} from "./market-stats.js";
import { listingMatchesFilter } from "../filters/filter-match.engine.js";
import {
  applySegmentConfidencePenalty,
  mileageToleranceKm,
} from "./vehicle-segment.js";

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
    brand: "BMW",
    model: "BMW 320i M Sport",
    series: "320i",
    trim: "M Sport",
    year: 2021,
    mileage: 80_000,
    city: "İstanbul",
    lastSeenAt: new Date(),
    ...partial,
  };
}

function subjectListing() {
  return {
    id: "subject",
    externalId: "subj-1",
    platform: "arabam",
    price: 1_590_000,
    currency: "TRY",
    category: "Vasıta > Otomobil",
    brand: "BMW",
    model: "BMW 320i M Sport",
    series: "320i",
    trim: "M Sport",
    year: 2021,
    mileage: 80_000,
    city: "İstanbul",
  };
}

describe("market-stats", () => {
  it("odd sample median", () => {
    expect(median([100, 200, 300])).toBe(200);
  });

  it("even sample median", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it("IQR removes outliers", () => {
    const prices = [100, 110, 120, 130, 140, 1000];
    const filtered = filterIqrOutliers(prices, 5);
    expect(filtered).not.toContain(1000);
    expect(filtered.length).toBeGreaterThanOrEqual(5);
  });

  it("priceAdvantagePct positive and negative", () => {
    expect(priceAdvantagePct(1_590_000, 1_750_000)).toBe(9.14);
    expect(priceAdvantagePct(1_900_000, 1_750_000)).toBeLessThan(0);
  });

  it("dispersionPct", () => {
    const sorted = [100, 110, 120, 130, 140];
    const d = dispersionPct(sorted);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
  });
});

describe("MarketIntelligenceService V1.1", () => {
  it("L1 same trim works", async () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      row({
        id: `t${i}`,
        externalId: `t${i}`,
        price: 1_700_000 + i * 10_000,
        series: "320i",
        trim: "M Sport",
        city: "İstanbul",
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    const result = await service.analyzeListing(subjectListing());
    expect(result.status).toBe("READY");
    expect(result.segmentLevel).toBe("L1");
  });

  it("L2 same trim nationwide when city sparse", async () => {
    const istanbul = Array.from({ length: 2 }, (_, i) =>
      row({
        id: `i${i}`,
        externalId: `i${i}`,
        city: "İstanbul",
        price: 1_700_000 + i * 10_000,
      }),
    );
    const ankara = Array.from({ length: 6 }, (_, i) =>
      row({
        id: `n${i}`,
        externalId: `n${i}`,
        city: "Ankara",
        price: 1_700_000 + i * 10_000,
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [...istanbul, ...ankara],
    });
    const result = await service.analyzeListing(subjectListing());
    expect(result.status).toBe("READY");
    expect(result.segmentLevel).toBe("L2");
  });

  it("trim sample insufficient → L3_SERIES fallback", async () => {
    const sameTrim = Array.from({ length: 2 }, (_, i) =>
      row({
        id: `t${i}`,
        externalId: `t${i}`,
        trim: "M Sport",
        price: 1_700_000 + i * 10_000,
      }),
    );
    const otherTrim = Array.from({ length: 6 }, (_, i) =>
      row({
        id: `o${i}`,
        externalId: `o${i}`,
        trim: "Sport Line",
        price: 1_700_000 + i * 10_000,
        city: "Ankara",
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [...sameTrim, ...otherTrim],
    });
    const result = await service.analyzeListing(subjectListing());
    expect(result.status).toBe("READY");
    expect(result.segmentLevel).toBe("L3_SERIES");
  });

  it("L3 does not use different series", async () => {
    const pool = Array.from({ length: 8 }, (_, i) =>
      row({
        id: `s${i}`,
        externalId: `s${i}`,
        series: "520i",
        model: "BMW 520i",
        trim: null,
        price: 1_700_000 + i * 10_000,
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    expect((await service.analyzeListing(subjectListing())).status).toBe(
      "INSUFFICIENT_DATA",
    );
  });

  it("L4 does not use different brand", async () => {
    const pool = Array.from({ length: 8 }, (_, i) =>
      row({
        id: `b${i}`,
        externalId: `b${i}`,
        brand: "Audi",
        series: "320i",
        price: 1_700_000 + i * 10_000,
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    expect((await service.analyzeListing(subjectListing())).status).toBe(
      "INSUFFICIENT_DATA",
    );
  });

  it("series fallback median correct + segment persist label", async () => {
    const pool = [
      row({ id: "a", externalId: "a", trim: "Sport Line", price: 1_720_000 }),
      row({ id: "b", externalId: "b", trim: "Sport Line", price: 1_750_000 }),
      row({ id: "c", externalId: "c", trim: "Luxury", price: 1_790_000 }),
      row({ id: "d", externalId: "d", trim: "Luxury", price: 1_810_000 }),
      row({ id: "e", externalId: "e", trim: "Base", price: 1_730_000 }),
    ];
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    const result = await service.analyzeListing({
      ...subjectListing(),
      trim: "M Sport",
    });
    expect(result.status).toBe("READY");
    expect(result.segmentLevel).toBe("L3_SERIES");
    expect(result.marketMedianPrice).toBe(1_750_000);
  });

  it("series-level confidence penalty applied", () => {
    expect(applySegmentConfidencePenalty("HIGH", "L3_SERIES")).toBe("MEDIUM");
    expect(applySegmentConfidencePenalty("HIGH", "L4_SERIES")).toBe("LOW");
    expect(applySegmentConfidencePenalty("MEDIUM", "L1")).toBe("MEDIUM");
  });

  it("excludes current listing from sample", async () => {
    const pool = [
      row({ id: "subject", externalId: "subj-1", price: 1_000_000 }),
      row({ id: "a", externalId: "a", price: 1_720_000 }),
      row({ id: "b", externalId: "b", price: 1_750_000 }),
      row({ id: "c", externalId: "c", price: 1_790_000 }),
      row({ id: "d", externalId: "d", price: 1_810_000 }),
      row({ id: "e", externalId: "e", price: 1_730_000 }),
    ];
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    const result = await service.analyzeListing(subjectListing());
    expect(result.status).toBe("READY");
    expect(result.sampleSize).toBe(5);
    expect(result.marketMedianPrice).toBe(1_750_000);
  });

  it("rejects different currency", async () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      row({
        id: `a${i}`,
        externalId: `a${i}`,
        currency: "USD",
        price: 1_700_000 + i * 10_000,
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    expect((await service.analyzeListing(subjectListing())).status).toBe(
      "INSUFFICIENT_DATA",
    );
  });

  it("legacy model fallback when series null (skip trim L1)", async () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      row({
        id: `l${i}`,
        externalId: `l${i}`,
        series: null,
        trim: null,
        model: "BMW 320i Legacy",
        price: 1_700_000 + i * 10_000,
        city: "Ankara",
      }),
    );
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => pool,
    });
    const result = await service.analyzeListing({
      ...subjectListing(),
      series: null,
      trim: null,
      model: "BMW 320i Legacy",
    });
    expect(result.status).toBe("READY");
    expect(result.segmentLevel).toBe("L3_SERIES");
  });

  it("year fallback widens on later levels", async () => {
    const queries: CandidateQuery[] = [];
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async (q) => {
        queries.push(q);
        if (q.yearMin === 2020 && q.yearMax === 2022) {
          return [];
        }
        return Array.from({ length: 6 }, (_, i) =>
          row({
            id: `y${i}`,
            externalId: `y${i}`,
            year: 2019,
            trim: null,
            price: 1_700_000 + i * 10_000,
            city: "Ankara",
          }),
        );
      },
    });
    const result = await service.analyzeListing({
      ...subjectListing(),
      trim: "M Sport",
    });
    expect(result.status).toBe("READY");
    expect(result.segmentLevel).toBe("L3_SERIES");
    expect(queries.some((q) => q.yearMin === 2019 && q.yearMax === 2023)).toBe(
      true,
    );
  });

  it("mileage fallback widens", async () => {
    const farMileage = 80_000 + mileageToleranceKm(80_000, 1) + 5_000;
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async (q) => {
        if (q.mileageMax < farMileage) {
          return [];
        }
        return Array.from({ length: 6 }, (_, i) =>
          row({
            id: `m${i}`,
            externalId: `m${i}`,
            mileage: farMileage,
            trim: null,
            price: 1_700_000 + i * 10_000,
            city: "Ankara",
          }),
        );
      },
    });
    const result = await service.analyzeListing(subjectListing());
    expect(result.status).toBe("READY");
    expect(["L3_SERIES", "L4_SERIES"]).toContain(result.segmentLevel);
  });

  it("sampleSize < minimum => INSUFFICIENT_DATA", async () => {
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [
        row({ id: "a", externalId: "a", price: 1_700_000 }),
        row({ id: "b", externalId: "b", price: 1_710_000 }),
      ],
    });
    expect((await service.analyzeListing(subjectListing())).status).toBe(
      "INSUFFICIENT_DATA",
    );
  });

  it("excludes mock platform", async () => {
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () =>
        Array.from({ length: 6 }, (_, i) =>
          row({
            id: `m${i}`,
            externalId: `m${i}`,
            platform: "mock",
            price: 1_700_000 + i * 10_000,
          }),
        ),
    });
    expect((await service.analyzeListing(subjectListing())).status).toBe(
      "INSUFFICIENT_DATA",
    );
  });

  it("lookback excludes old listings via query window", async () => {
    let seenSince: Date | null = null;
    const service = new MarketIntelligenceService({
      minSample: 5,
      lookbackDays: 90,
      findCandidates: async (q) => {
        seenSince = q.lookbackSince;
        return [];
      },
    });
    await service.analyzeListing(subjectListing());
    expect(seenSince).not.toBeNull();
    const ageMs = Date.now() - seenSince!.getTime();
    expect(ageMs).toBeGreaterThan(80 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(100 * 24 * 60 * 60 * 1000);
  });

  it("outlier cleanup then insufficient", async () => {
    const tight = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [
        row({ id: "a", externalId: "a", price: 100 }),
        row({ id: "b", externalId: "b", price: 101 }),
        row({ id: "c", externalId: "c", price: 102 }),
        row({ id: "d", externalId: "d", price: 103 }),
        row({ id: "o", externalId: "o", price: 10_000 }),
      ],
    });
    expect((await tight.analyzeListing(subjectListing())).status).toBe(
      "INSUFFICIENT_DATA",
    );
  });

  it("IQR outlier removed while keeping enough sample", async () => {
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [
        row({ id: "a", externalId: "a", price: 1_700_000 }),
        row({ id: "b", externalId: "b", price: 1_720_000 }),
        row({ id: "c", externalId: "c", price: 1_740_000 }),
        row({ id: "d", externalId: "d", price: 1_760_000 }),
        row({ id: "e", externalId: "e", price: 1_780_000 }),
        row({ id: "f", externalId: "f", price: 1_800_000 }),
        row({ id: "o", externalId: "o", price: 9_000_000 }),
      ],
    });
    const result = await service.analyzeListing(subjectListing());
    expect(result.status).toBe("READY");
    expect(result.marketMedianPrice).toBeLessThan(2_000_000);
  });

  it("currency null => INSUFFICIENT_DATA", async () => {
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [],
    });
    const result = await service.analyzeListing({
      ...subjectListing(),
      currency: null,
    });
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });

  it("hepsiemlak unsupported", async () => {
    const service = new MarketIntelligenceService({
      findCandidates: async () => [],
    });
    const result = await service.analyzeListing({
      ...subjectListing(),
      category: "Emlak > Konut",
    });
    expect(result.status).toBe("UNSUPPORTED_CATEGORY");
  });

  it("confidence LOW MEDIUM HIGH", () => {
    expect(resolveMarketConfidence(5, 40)).toBe("LOW");
    expect(resolveMarketConfidence(10, 20)).toBe("MEDIUM");
    expect(resolveMarketConfidence(16, 20)).toBe("HIGH");
  });
});

describe("DealScore V2", () => {
  const ready = (
    advantage: number,
    confidence: MarketAnalysisResult["confidence"] = "HIGH",
  ): MarketAnalysisResult => ({
    status: "READY",
    marketMedianPrice: 1_750_000,
    sampleSize: 15,
    priceAdvantagePct: advantage,
    confidence,
    segmentLevel: "L2",
    dispersionPct: 10,
    calculatedAt: new Date(),
  });

  const complete = {
    brand: "BMW",
    model: "320i",
    year: 2021,
    mileage: 80_000,
    price: 1_590_000,
    currency: "TRY",
    city: "İstanbul",
  };

  it("advantage <= 0 => price score 0", () => {
    expect(priceAdvantageToScore(0)).toBe(0);
    expect(priceAdvantageToScore(-5)).toBe(0);
  });

  it("%5 / %10 / %15 / %25 advantage bands", () => {
    expect(priceAdvantageToScore(5)).toBe(25);
    expect(priceAdvantageToScore(10)).toBe(50);
    expect(priceAdvantageToScore(15)).toBe(65);
    expect(priceAdvantageToScore(25)).toBe(75);
    expect(priceAdvantageToScore(50)).toBe(75);
  });

  it("confidence points", () => {
    expect(confidenceToScore("LOW")).toBe(5);
    expect(confidenceToScore("MEDIUM")).toBe(10);
    expect(confidenceToScore("HIGH")).toBe(15);
  });

  it("completeness full vs partial", () => {
    expect(dataCompletenessScore(complete)).toBe(10);
    expect(
      dataCompletenessScore({
        price: 1_000_000,
        brand: "BMW",
        model: null,
        year: null,
        mileage: null,
        currency: "TRY",
        city: null,
      }),
    ).toBeLessThan(10);
  });

  it("total score 0-100 and ~9.14% advantage pipeline", () => {
    const score = dealScoreService.calculateFromMarket(complete, ready(9.14));
    expect(score.dealScore).toBeGreaterThanOrEqual(0);
    expect(score.dealScore).toBeLessThanOrEqual(100);
    expect(score.priceScore).toBeGreaterThanOrEqual(40);
    expect(score.priceScore).toBeLessThanOrEqual(50);
    expect(score.dealScore).toBe(
      score.priceScore + score.confidenceScore + score.completenessScore,
    );
  });

  it("insufficient market data does not invent high score", () => {
    const score = dealScoreService.calculateFromMarket(complete, {
      status: "INSUFFICIENT_DATA",
      marketMedianPrice: null,
      sampleSize: 2,
      priceAdvantagePct: null,
      confidence: null,
      segmentLevel: null,
      dispersionPct: null,
      calculatedAt: new Date(),
    });
    expect(score.dealScore).toBe(0);
    expect(score.isDeal).toBe(false);
  });

  it("minDealScore filter matches V2 score", () => {
    const score = dealScoreService.calculateFromMarket(complete, ready(9.14));
    const matched = listingMatchesFilter(
      {
        dealScore: score.dealScore,
        price: complete.price,
        category: "Vasıta > Otomobil",
        brand: "BMW",
        model: "320i",
        year: 2021,
        mileage: 80_000,
        city: "İstanbul",
        title: "BMW 320i",
        description: null,
      },
      {
        category: "Vasıta > Otomobil",
        minDealScore: 70,
      },
    );
    expect(matched).toBe(score.dealScore >= 70);
  });
});
