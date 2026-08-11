import { describe, expect, it } from "vitest";
import {
  deriveTrimFromDomModel,
  mapArabamLdVehicle,
  parseArabamUrlTaxonomy,
  resolveArabamSeriesTrim,
} from "../scraper/utils/arabam-structured.js";
import { normalizeScrapedListing } from "../scraper/normalizer.js";
import { listingDtoToRaw, toListingDto } from "../scraper/scraper.manager.js";
import { prisma } from "../lib/prisma.js";
import { scraperService } from "../scraper/scraper.service.js";

describe("Vehicle Taxonomy V1 — Arabam series/trim", () => {
  it("1. JSON-LD model maps as series candidate", () => {
    const vehicle = mapArabamLdVehicle({
      "@type": "Vehicle",
      url: "https://www.arabam.com/ilan/galeriden-satilik-honda/x/1",
      brand: { name: "Honda" },
      model: "Civic",
    });
    expect(vehicle.model).toBe("Civic");
    expect(vehicle.modelSource).toBe("json-ld");

    const resolved = resolveArabamSeriesTrim({
      brand: "Honda",
      urlSeries: null,
      ldModel: vehicle.model,
      domModel: "Honda Civic 1.6i VTEC Elegance",
    });
    expect(resolved.series).toBe("Civic");
    expect(resolved.seriesSource).toBe("json-ld");
    expect(resolved.trim).toBe("1.6i VTEC Elegance");
    expect(resolved.trimSource).toBe("dom-model");
  });

  it("2. DOM model + URL series → trim", () => {
    const trim = deriveTrimFromDomModel(
      "Honda Civic 1.6i VTEC Elegance",
      "Honda",
      "Civic",
    );
    expect(trim).toBe("1.6i VTEC Elegance");
  });

  it("3. URL taxonomy series fallback", () => {
    const parsed = parseArabamUrlTaxonomy(
      "https://www.arabam.com/ilan/galeriden-satilik-honda-civic/baslik/123",
    );
    expect(parsed.brand).toBe("Honda");
    expect(parsed.series).toBe("Civic");
    expect(parsed.seriesSource).toBe("url-taxonomy");
  });

  it("4. title is not used for series/trim", () => {
    const dto = toListingDto("arabam", {
      externalId: "tax-1",
      title: "ACİL SATILIK HATASIZ KELEPİR",
      priceText: "900.000 TL",
      url: "https://www.arabam.com/ilan/galeriden-satilik-honda-civic/x/1",
      model: "Honda Civic 1.6i VTEC Elegance",
      brand: "Honda",
      series: "Civic",
      trim: "1.6i VTEC Elegance",
      category: "Vasıta > Otomobil",
    });
    expect(dto?.title).toBe("ACİL SATILIK HATASIZ KELEPİR");
    expect(dto?.series).toBe("Civic");
    expect(dto?.trim).toBe("1.6i VTEC Elegance");
    // Title tokens must not leak into series
    expect(dto?.series).not.toContain("ACİL");
  });

  it("5. series missing → legacy model fallback", () => {
    const resolved = resolveArabamSeriesTrim({
      brand: "Honda",
      urlSeries: null,
      ldModel: null,
      domModel: "Honda Civic 1.6i VTEC Elegance",
    });
    expect(resolved.series).toBe("Honda Civic 1.6i VTEC Elegance");
    expect(resolved.seriesSource).toBe("legacy-model");
    expect(resolved.trim).toBeNull();
  });

  it("6. trim null when model does not align with series", () => {
    const trim = deriveTrimFromDomModel("Completely Different Line", "Honda", "Civic");
    expect(trim).toBeNull();
  });

  it("7-9. re-scrape series/trim update, firstSeenAt kept, no duplicate", async () => {
    const externalId = `arabam:tax-${Date.now()}`;
    const baseUrl = `https://www.arabam.com/ilan/galeriden-satilik-honda-civic/test/${externalId.split(":")[1]}`;

    const created = await scraperService.ingestNormalizedListing(
      {
        externalId,
        platform: "arabam",
        title: "Taxonomy test",
        price: 1_000_000,
        category: "Vasıta > Otomobil",
        subcategory: null,
        brand: "Honda",
        model: "Honda Civic 1.6i VTEC Elegance",
        series: null,
        trim: null,
        variant: null,
        year: 2018,
        mileage: 90_000,
        fuelType: null,
        transmission: null,
        city: "İzmir",
        district: null,
        sellerType: null,
        description: null,
        currency: "TRY",
        imageUrl: null,
        publishedAt: null,
        url: baseUrl,
        marketAveragePrice: null,
        rawDetails: { category: "Vasıta > Otomobil" },
      },
      { quiet: true, skipComparableReanalysis: true },
    );
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const firstSeenAt = created.listing.firstSeenAt.getTime();
    await new Promise((r) => setTimeout(r, 30));

    const updated = await scraperService.ingestNormalizedListing(
      {
        externalId,
        platform: "arabam",
        title: "Taxonomy test",
        price: 990_000,
        category: "Vasıta > Otomobil",
        subcategory: null,
        brand: "Honda",
        model: "Honda Civic 1.6i VTEC Elegance",
        series: "Civic",
        trim: "1.6i VTEC Elegance",
        variant: null,
        year: 2018,
        mileage: 98_500,
        fuelType: null,
        transmission: null,
        city: "İzmir",
        district: "Bornova",
        sellerType: "Galeriden",
        description: null,
        currency: "TRY",
        imageUrl: null,
        publishedAt: null,
        url: baseUrl,
        marketAveragePrice: null,
        rawDetails: {
          category: "Vasıta > Otomobil",
          sourceSeries: "Civic",
          seriesSource: "url-taxonomy",
          sourceTrim: "1.6i VTEC Elegance",
          trimSource: "dom-model",
        },
      },
      { quiet: true, skipComparableReanalysis: true },
    );

    expect(updated.status).toBe("updated");
    if (updated.status !== "updated") return;
    expect(updated.listing.series).toBe("Civic");
    expect(updated.listing.trim).toBe("1.6i VTEC Elegance");
    expect(updated.listing.firstSeenAt.getTime()).toBe(firstSeenAt);

    const rows = await prisma.listing.findMany({ where: { externalId } });
    expect(rows).toHaveLength(1);
    await prisma.listing.delete({ where: { id: created.listing.id } });
  }, 30_000);

  it("provenance rawDetails for series/trim", () => {
    const dto = toListingDto("arabam", {
      externalId: "p1",
      title: "T",
      priceText: "100.000 TL",
      url: "https://www.arabam.com/ilan/galeriden-satilik-honda-civic/x/1",
      brand: "Honda",
      model: "Honda Civic 1.6i VTEC Elegance",
      series: "Civic",
      trim: "1.6i VTEC Elegance",
      seriesSource: "url-taxonomy",
      trimSource: "dom-model",
      category: "Vasıta > Otomobil",
    });
    const raw = listingDtoToRaw(dto!);
    const normalized = normalizeScrapedListing(raw);
    expect(normalized?.series).toBe("Civic");
    expect(normalized?.trim).toBe("1.6i VTEC Elegance");
    expect(normalized?.rawDetails.seriesSource).toBe("url-taxonomy");
    expect(normalized?.rawDetails.trimSource).toBe("dom-model");
  });
});
