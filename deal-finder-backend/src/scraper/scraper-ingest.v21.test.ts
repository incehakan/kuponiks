import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { scraperService } from "../scraper/scraper.service.js";
import type { NormalizedListingInput } from "../scraper/normalizer.js";

function sampleListing(
  externalId: string,
  overrides: Partial<NormalizedListingInput> = {},
): NormalizedListingInput {
  return {
    externalId,
    platform: "arabam",
    title: "V2.1 ingest test listing",
    price: 1_200_000,
    category: "Vasıta > Otomobil",
    subcategory: null,
    brand: "Honda",
    model: "Civic",
    variant: null,
    year: 2020,
    mileage: 80_000,
    fuelType: null,
    transmission: null,
    city: "İzmir",
    district: "Bornova",
    sellerType: null,
    description: "test",
    currency: "TRY",
    imageUrl: null,
    publishedAt: null,
    url: `https://www.arabam.com/ilan/${externalId.replace(/:/g, "-")}`,
    marketAveragePrice: 1_200_000,
    rawDetails: { category: "Vasıta > Otomobil" },
    ...overrides,
  };
}

describe("ScraperService firstSeenAt / lastSeenAt / dedup", () => {
  it("creates listing with firstSeenAt+lastSeenAt; re-ingest keeps firstSeenAt and bumps lastSeenAt; no duplicate row", async () => {
    const externalId = `arabam:v21-test-${Date.now()}`;
    const created = await scraperService.ingestNormalizedListing(
      sampleListing(externalId),
    );
    expect(created.status).toBe("created");
    if (created.status !== "created") {
      return;
    }

    const firstSeenAt = created.listing.firstSeenAt.getTime();
    const lastSeenAt = created.listing.lastSeenAt.getTime();
    expect(firstSeenAt).toBeGreaterThan(0);
    expect(lastSeenAt).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const updated = await scraperService.ingestNormalizedListing(
      sampleListing(externalId, {
        title: "V2.1 ingest test listing UPDATED",
        price: 1_150_000,
      }),
    );
    expect(updated.status).toBe("updated");
    if (updated.status !== "updated") {
      return;
    }

    expect(updated.listing.firstSeenAt.getTime()).toBe(firstSeenAt);
    expect(updated.listing.lastSeenAt.getTime()).toBeGreaterThan(lastSeenAt);
    expect(updated.listing.title).toContain("UPDATED");

    const rows = await prisma.listing.findMany({
      where: { externalId },
    });
    expect(rows).toHaveLength(1);

    await prisma.listing.delete({ where: { id: created.listing.id } });
  }, 30_000);
});
