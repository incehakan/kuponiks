import { describe, expect, it } from "vitest";
import {
  mapArabamLdVehicle,
  parseArabamUrlTaxonomy,
} from "../scraper/utils/arabam-structured.js";
import { parseMileage } from "../scraper/utils/parse-number.js";
import { normalizeScrapedListing } from "../scraper/normalizer.js";
import { listingDtoToRaw, toListingDto } from "../scraper/scraper.manager.js";
import { prisma } from "../lib/prisma.js";
import { scraperService } from "../scraper/scraper.service.js";

describe("Arabam V2.2 structured brand/mileage", () => {
  it("Car JSON-LD image array prefers 580x435 and skips placeholders", () => {
    const vehicle = mapArabamLdVehicle({
      "@type": "Car",
      url: "https://www.arabam.com/ilan/sahibinden-satilik-honda-civic/x/42819518",
      brand: { "@type": "Brand", name: "Honda" },
      image: [
        "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
        "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/42819518/a_image_for_silan_42819518_580x435.jpg",
      ],
    });
    expect(vehicle.imageUrl).toContain("_580x435.jpg");
  });

  it("1. explicit JSON-LD brand -> Listing.brand", () => {
    const vehicle = mapArabamLdVehicle({
      "@type": "Vehicle",
      url: "https://www.arabam.com/ilan/galeriden-satilik-honda-civic/x/1",
      brand: { "@type": "Brand", name: "Honda" },
      mileageFromOdometer: { "@type": "QuantitativeValue", value: 120000 },
    });
    expect(vehicle.brand).toBe("Honda");
    expect(vehicle.brandSource).toBe("json-ld");

    const dto = toListingDto("arabam", {
      externalId: "1",
      title: "Test",
      priceText: "100.000 TL",
      url: vehicle.url,
      brand: vehicle.brand,
      brandSource: vehicle.brandSource,
      category: "Vasıta > Otomobil",
    });
    expect(dto?.brand).toBe("Honda");
    const normalized = normalizeScrapedListing(listingDtoToRaw(dto!));
    expect(normalized?.brand).toBe("Honda");
  });

  it("2. explicit URL taxonomy brand -> Listing.brand", () => {
    const parsed = parseArabamUrlTaxonomy(
      "https://www.arabam.com/ilan/galeriden-satilik-bmw-320i/baslik-slug/123",
    );
    expect(parsed.brand).toBe("BMW");
    expect(parsed.series).toBe("320i");
    expect(parsed.brandSource).toBe("url-taxonomy");
    expect(parsed.sellerType).toBe("Galeriden");
  });

  it("3. ambiguous slug -> brand null", () => {
    const parsed = parseArabamUrlTaxonomy(
      "https://www.arabam.com/ilan/random-freeform-slug-only/12345",
    );
    expect(parsed.brand).toBeNull();
    expect(parsed.brandSource).toBeNull();
  });

  it("4. model field stays platform taxonomy line (not title-split)", () => {
    const dto = toListingDto("arabam", {
      externalId: "9",
      title: "ACİL SATILIK HATASIZ",
      priceText: "900.000 TL",
      url: "https://www.arabam.com/ilan/galeriden-satilik-honda-civic/x/9",
      model: "Honda Civic 1.6i VTEC Elegance",
      brand: "Honda",
      category: "Vasıta > Otomobil",
    });
    expect(dto?.model).toBe("Honda Civic 1.6i VTEC Elegance");
    expect(dto?.brand).toBe("Honda");
  });

  it("5-7. mileage parsers", () => {
    expect(parseMileage("98.500 km")).toBe(98_500);
    expect(parseMileage("98 500 km")).toBe(98_500);
    expect(parseMileage("98500 km")).toBe(98_500);
    expect(parseMileage("98 bin km")).toBe(98_000);
  });

  it("8. invalid km -> null", () => {
    expect(parseMileage("km bilgisi yok")).toBeNull();
    expect(parseMileage("-")).toBeNull();
    expect(parseMileage("bilinmiyor")).toBeNull();
  });

  it("JSON-LD mileage maps to numeric mileage", () => {
    const vehicle = mapArabamLdVehicle({
      "@type": "Vehicle",
      url: "https://www.arabam.com/ilan/sahibinden-satilik-honda-civic/x/2",
      brand: { name: "Honda" },
      mileageFromOdometer: { value: 65000, unitCode: "KMT" },
    });
    expect(vehicle.mileage).toBe(65_000);
    expect(vehicle.mileageSource).toBe("json-ld");
  });
});

describe("Arabam V2.2 re-scrape brand/mileage update", () => {
  it("9-12. re-scrape fills brand/mileage, keeps firstSeenAt, no duplicate", async () => {
    const externalId = `arabam:v22-${Date.now()}`;
    const baseUrl = `https://www.arabam.com/ilan/galeriden-satilik-honda-civic/test/${externalId.split(":")[1]}`;

    const created = await scraperService.ingestNormalizedListing({
      externalId,
      platform: "arabam",
      title: "V2.2 brand mileage test",
      price: 1_000_000,
      category: "Vasıta > Otomobil",
      subcategory: null,
      brand: null,
      model: "Honda Civic",
      series: null,
      trim: null,
      variant: null,
      year: 2018,
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
      url: baseUrl,
      marketAveragePrice: 1_000_000,
      rawDetails: { category: "Vasıta > Otomobil" },
    }, { quiet: true, skipComparableReanalysis: true });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const firstSeenAt = created.listing.firstSeenAt.getTime();
    await new Promise((r) => setTimeout(r, 30));

    const updated = await scraperService.ingestNormalizedListing({
      externalId,
      platform: "arabam",
      title: "V2.2 brand mileage test",
      price: 990_000,
      category: "Vasıta > Otomobil",
      subcategory: null,
      brand: "Honda",
      model: "Honda Civic",
      series: "Civic",
      trim: null,
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
      marketAveragePrice: 990_000,
      rawDetails: {
        category: "Vasıta > Otomobil",
        sourceBrand: "Honda",
        brandSource: "json-ld",
        sourceMileage: 98_500,
        mileageSource: "json-ld",
      },
    }, { quiet: true, skipComparableReanalysis: true });

    expect(updated.status).toBe("updated");
    if (updated.status !== "updated") return;

    expect(updated.listing.brand).toBe("Honda");
    expect(updated.listing.mileage).toBe(98_500);
    expect(updated.listing.firstSeenAt.getTime()).toBe(firstSeenAt);
    expect(updated.listing.lastSeenAt.getTime()).toBeGreaterThan(firstSeenAt);

    const rows = await prisma.listing.findMany({ where: { externalId } });
    expect(rows).toHaveLength(1);

    await prisma.listing.delete({ where: { id: created.listing.id } });
  }, 30_000);
});
