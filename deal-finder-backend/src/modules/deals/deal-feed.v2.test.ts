import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http-error.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    userListingMatch: {
      findMany: vi.fn(),
    },
    listing: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { DealService } from "./deal.service.js";

const mocked = prisma as unknown as {
  userListingMatch: { findMany: ReturnType<typeof vi.fn> };
  listing: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
};

const listing = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Honda Civic",
  city: "İzmir",
  district: "Bornova",
  price: 955_000,
  currency: "TRY",
  marketAveragePrice: 1_050_000,
  marketMedianPrice: 1_050_000,
  priceAdvantagePct: 9.05,
  marketSampleSize: 12,
  marketConfidence: "MEDIUM",
  marketSegmentLevel: "L3_SERIES",
  marketStatus: "READY",
  brand: "Honda",
  model: "Civic",
  series: "Civic",
  trim: "1.6i VTEC Elegance",
  year: 2019,
  mileage: 80_000,
  sellerType: "Galeriden",
  description: "Temiz",
  imageUrl: null,
  dealScore: 82,
  url: "https://www.arabam.com/ilan/x",
  platform: "arabam",
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  firstSeenAt: new Date("2026-08-01T10:00:00.000Z"),
  publishedAt: null,
  rawDetails: {
    _kuponiksMarketSource: {
      sourceCount: 2,
      sourceDistribution: [
        { platform: "arabam", sampleSize: 92 },
        { platform: "otoplus", sampleSize: 1 },
      ],
      dominantSourcePct: 98.9,
      diversity: "MULTI_SOURCE_LOW",
    },
  },
};

describe("Deal Feed V2 user-specific API", () => {
  const service = new DealService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. user sees own matched listing once with matchedFilterCount=2", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date("2026-08-02T10:00:00.000Z"),
        listing,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
      {
        listingId: listing.id,
        matchedAt: new Date("2026-08-01T10:00:00.000Z"),
        listing,
        filter: {
          id: "f2",
          name: "İzmir araçlar",
          category: "Vasıta > Otomobil",
          brand: null,
          series: null,
        },
      },
    ]);

    const page = await service.getUserMatchedDeals("user-a", { limit: 20 });
    expect(page.deals).toHaveLength(1);
    expect(page.deals[0]?.matchedFilterCount).toBe(2);
    expect(page.deals[0]?.marketMedianPrice).toBe(1_050_000);
  });

  it("2. another user detail → 404", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([]);
    await expect(
      service.getUserDealById("user-b", listing.id),
    ).rejects.toMatchObject({ statusCode: 404 } satisfies Partial<HttpError>);
  });

  it("3. owner detail 200 with matched filters", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date(),
        listing,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const deal = await service.getUserDealById("user-a", listing.id);
    expect(deal.id).toBe(listing.id);
    expect(deal.matchedFilters?.[0]?.name).toBe("Honda Civic");
    expect(deal.listingUrl).toContain("arabam.com");
    expect(deal.platform).toBe("arabam");
  });

  it("otoplus listing platform is passed through Deal Feed DTO", async () => {
    const otoplusListing = {
      ...listing,
      id: "22222222-2222-2222-2222-222222222222",
      platform: "otoplus",
      url: "https://www.otoplus.com/honda/civic/x-562995",
    };
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: otoplusListing.id,
        matchedAt: new Date(),
        listing: otoplusListing,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const page = await service.getUserMatchedDeals("user-a", { limit: 20 });
    expect(page.deals[0]?.platform).toBe("otoplus");
    expect(page.deals[0]?.platformLabel).toBe("Otoplus");
    expect(page.deals[0]?.listingUrl).toContain("otoplus.com");
  });

  it("4. insufficient market does not expose fake median", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date(),
        listing: {
          ...listing,
          marketStatus: "INSUFFICIENT_DATA",
          marketMedianPrice: 1_050_000,
          priceAdvantagePct: 9,
        },
        filter: {
          id: "f1",
          name: null,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const page = await service.getUserMatchedDeals("user-a");
    expect(page.deals[0]?.marketMedianPrice).toBeNull();
    expect(page.deals[0]?.priceAdvantagePct).toBeNull();
    expect(page.deals[0]?.marketAverage).toBe(0);
  });

  it("5. stabilization: multi-filter matches still return one feed row", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date("2026-08-01T10:00:00.000Z"),
        listing,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
      {
        listingId: listing.id,
        matchedAt: new Date("2026-08-03T10:00:00.000Z"),
        listing,
        filter: {
          id: "f2",
          name: "Kuponiks Smoke Test Filter2",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const page = await service.getUserMatchedDeals("user-a", { limit: 20 });
    expect(page.deals).toHaveLength(1);
    expect(page.deals[0]?.matchedFilterCount).toBe(2);
  });

  it("6. presentation minScore=80 hides lower-score matches without UserFilter", async () => {
    const low = { ...listing, id: "22222222-2222-2222-2222-222222222222", dealScore: 71 };
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date("2026-08-02T10:00:00.000Z"),
        listing,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
      {
        listingId: low.id,
        matchedAt: new Date("2026-08-02T09:00:00.000Z"),
        listing: low,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);

    const page = await service.getUserMatchedDeals("user-a", {
      limit: 20,
      minScore: 80,
    });
    expect(page.deals).toHaveLength(1);
    expect(page.deals[0]?.dealScore).toBe(82);
  });

  it("7. noImage listing URLs are not exposed as real photos", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date(),
        listing: {
          ...listing,
          imageUrl:
            "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
        },
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const page = await service.getUserMatchedDeals("user-a");
    expect(page.deals[0]?.imageUrl).toBeNull();
  });

  it("11. Deal API mapping includes additive source metadata", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date(),
        listing,
        filter: {
          id: "f1",
          name: "Honda Civic",
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const page = await service.getUserMatchedDeals("user-a");
    expect(page.deals[0]?.marketSourceCount).toBe(2);
    expect(page.deals[0]?.marketDominantSourcePct).toBe(98.9);
    expect(page.deals[0]?.marketDiversity).toBe("MULTI_SOURCE_LOW");
    expect(page.deals[0]?.marketSourceDistribution).toEqual([
      { platform: "arabam", platformLabel: "Arabam", sampleSize: 92 },
      { platform: "otoplus", platformLabel: "Otoplus", sampleSize: 1 },
    ]);
    expect(page.deals[0]?.marketSourceCaption).toContain("Arabam ve Otoplus");
  });

  it("12. Deal Detail mapping includes source metadata", async () => {
    mocked.listing.findUnique.mockResolvedValue(listing);
    const deal = await service.getDealById(listing.id);
    expect(deal.marketSourceCount).toBe(2);
    expect(deal.marketDiversity).toBe("MULTI_SOURCE_LOW");
  });

  it("insufficient market hides source metadata", async () => {
    mocked.userListingMatch.findMany.mockResolvedValue([
      {
        listingId: listing.id,
        matchedAt: new Date(),
        listing: { ...listing, marketStatus: "INSUFFICIENT_DATA" },
        filter: {
          id: "f1",
          name: null,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
        },
      },
    ]);
    const page = await service.getUserMatchedDeals("user-a");
    expect(page.deals[0]?.marketSourceCount).toBeNull();
    expect(page.deals[0]?.marketSourceCaption).toBeNull();
  });
});
