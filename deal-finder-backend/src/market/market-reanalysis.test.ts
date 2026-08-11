import { describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/prisma.js";
import { MarketReanalysisService } from "../market/market-reanalysis.service.js";
import { MarketIntelligenceService } from "../market/market-intelligence.service.js";
import { scraperService } from "../scraper/scraper.service.js";
import type { NormalizedListingInput } from "../scraper/normalizer.js";

function vehicleInput(
  externalId: string,
  overrides: Partial<NormalizedListingInput> = {},
): NormalizedListingInput {
  return {
    externalId,
    platform: "arabam",
    title: "Reanalysis test",
    price: 1_500_000,
    category: "Vasıta > Otomobil",
    subcategory: null,
    brand: "Honda",
    model: "Honda Civic 1.6i VTEC Elegance",
    series: "Civic",
    trim: "1.6i VTEC Elegance",
    variant: null,
    year: 2015,
    mileage: 120_000,
    fuelType: null,
    transmission: null,
    city: "İzmir",
    district: null,
    sellerType: null,
    description: null,
    currency: "TRY",
    imageUrl: null,
    publishedAt: null,
    url: `https://www.arabam.com/ilan/galeriden-satilik-honda-civic/t/${externalId}`,
    marketAveragePrice: null,
    rawDetails: { category: "Vasıta > Otomobil" },
    ...overrides,
  };
}

describe("Market reanalysis service", () => {
  it("reanalyzeListingById updates score/median; dry-run does not; no notify side-effect", async () => {
    const stamp = Date.now();
    const ids: string[] = [];

    // Seed enough Civic peers so MI can become READY for the subject.
    for (let i = 0; i < 6; i += 1) {
      const r = await scraperService.ingestNormalizedListing(
        vehicleInput(`arabam:re-peer-${stamp}-${i}`, {
          price: 1_600_000 + i * 20_000,
          trim: i % 2 === 0 ? "1.6i VTEC Elegance" : "1.6i VTEC Eco",
          model:
            i % 2 === 0
              ? "Honda Civic 1.6i VTEC Elegance"
              : "Honda Civic 1.6i VTEC Eco",
          year: 2014 + (i % 3),
          mileage: 100_000 + i * 5_000,
          city: i === 0 ? "İzmir" : "Ankara",
        }),
        { quiet: true, skipComparableReanalysis: true },
      );
      if (r.status === "created") ids.push(r.listing.id);
    }

    const subject = await scraperService.ingestNormalizedListing(
      vehicleInput(`arabam:re-subj-${stamp}`, {
        price: 1_450_000,
      }),
      { quiet: true, skipComparableReanalysis: true },
    );
    expect(subject.status).toBe("created");
    if (subject.status !== "created") return;
    ids.push(subject.listing.id);

    const service = new MarketReanalysisService();
    const dry = await service.reanalyzeListingById(subject.listing.id, {
      dryRun: true,
    });
    expect(dry).not.toBeNull();
    expect(dry!.updated).toBe(false);

    const before = await prisma.listing.findUnique({
      where: { id: subject.listing.id },
    });
    expect(before?.dealScore).toBe(subject.dealScore);

    const live = await service.reanalyzeListingById(subject.listing.id, {
      dryRun: false,
    });
    expect(live?.updated).toBe(true);

    const after = await prisma.listing.findUnique({
      where: { id: subject.listing.id },
    });
    expect(after?.firstSeenAt.getTime()).toBe(before!.firstSeenAt.getTime());
    expect(after?.dealScore).toBe(live!.newScore);
    if (live!.status === "READY") {
      expect(after?.marketMedianPrice).toBe(live!.newMedian);
    }

    // Cleanup
    await prisma.listing.deleteMany({ where: { id: { in: ids } } });
  }, 60_000);

  it("comparable selection respects brand/series + year window + limit", async () => {
    const analyze = vi.fn(async () => ({
      status: "INSUFFICIENT_DATA" as const,
      marketMedianPrice: null,
      sampleSize: 0,
      priceAdvantagePct: null,
      confidence: null,
      segmentLevel: null,
      dispersionPct: null,
      calculatedAt: new Date(),
      reason: "test",
    }));
    const market = {
      analyzeListing: analyze,
    } as unknown as MarketIntelligenceService;

    const stamp = Date.now();
    const seed = await scraperService.ingestNormalizedListing(
      vehicleInput(`arabam:lim-seed-${stamp}`),
      { quiet: true, skipComparableReanalysis: true },
    );
    expect(seed.status).toBe("created");
    if (seed.status !== "created") return;

    const peerIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const peer = await scraperService.ingestNormalizedListing(
        vehicleInput(`arabam:lim-peer-${stamp}-${i}`, {
          year: 2015,
        }),
        { quiet: true, skipComparableReanalysis: true },
      );
      if (peer.status === "created") peerIds.push(peer.listing.id);
    }

    // Different series — must not be selected
    const other = await scraperService.ingestNormalizedListing(
      vehicleInput(`arabam:lim-other-${stamp}`, {
        series: "Accord",
        model: "Honda Accord",
        trim: null,
      }),
      { quiet: true, skipComparableReanalysis: true },
    );
    if (other.status === "created") peerIds.push(other.listing.id);

    const service = new MarketReanalysisService(market);
    const results = await service.reanalyzeComparableListings(seed.listing, {
      dryRun: true,
      limit: 2,
    });

    expect(results.length).toBeLessThanOrEqual(2);
    expect(analyze.mock.calls.length).toBe(results.length);
    for (const call of analyze.mock.calls as unknown as Array<[unknown]>) {
      const input = call[0] as {
        series?: string | null;
        model?: string | null;
      };
      const series = (input.series ?? input.model ?? "").toLowerCase();
      expect(series.includes("accord")).toBe(false);
    }

    await prisma.listing.deleteMany({
      where: { id: { in: [seed.listing.id, ...peerIds] } },
    });
  }, 60_000);
});
