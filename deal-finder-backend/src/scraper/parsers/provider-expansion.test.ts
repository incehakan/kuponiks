import { describe, expect, it } from "vitest";
import { parseArabamListHtml } from "./arabam-http.js";
import { parseOtoplusListHtml, parseOtoplusExternalId } from "./otoplus.parser.js";
import { VEHICLE_DISCOVERY_PLATFORMS } from "../../coverage/provider-registry.js";
import { buildOtoplusQuery } from "../query/planners/otoplus-query-builder.js";
import { planFromSearchIntent } from "../query/scrape-query-plan.js";
import { buildSearchIntentFromFilter } from "../../coverage/search-intent-builder.js";
import {
  defaultAvailabilityMap,
  evaluateCoverage,
  evaluatePlatformCoverage,
} from "../../coverage/coverage-engine.js";
import { listingMatchesFilter } from "../../filters/filter-match.engine.js";
import { criterionRole } from "../../coverage/platform-capability-v2.js";
import {
  applyProviderResult,
  emptyReliabilityState,
  resolveEffectiveStatus,
} from "../../coverage/provider-reliability.js";
import { toListingDto, listingDtoToRaw } from "../scraper.manager.js";
import { MarketIntelligenceService } from "../../market/market-intelligence.service.js";
import type { ComparableListingRow } from "../../market/market-intelligence.types.js";

const ARABAM_FIXTURE = `<html><head><title>Honda Civic</title></head><body>
<table><tr class="listing-list-item" id="listing42905284" data-imp-id="42905284">
<td class="listing-modelname pr"><div class="listing-text-new">Honda Civic 1.6i VTEC Eco Elegance</div></td>
<td class="horizontal-half-padder-minus pr"><h3><span class="listing-text-new listing-title-lines">Galeriden Honda Civic 2016 Model Antalya</span></h3></td>
<td class="listing-text">2016</td>
<td class="listing-text">235.000</td>
<td><span class="listing-price">1.145.000 TL</span></td>
<td class="listing-text"><span title="Antalya">Antalya</span></td>
<a class="link-overlay" href="/ilan/galeriden-satilik-honda-civic-1-6i-vtec-eco-elegance/galeriden-honda-civic-2016-antalya/42905284"></a>
</tr></table>
<script type="application/ld+json">{"@type":"Vehicle","name":"Galeriden Honda Civic 2016 Model Antalya","url":"https://www.arabam.com/ilan/galeriden-satilik-honda-civic-1-6i-vtec-eco-elegance/galeriden-honda-civic-2016-antalya/42905284","brand":{"@type":"Brand","name":"Honda"},"model":"Civic","modelDate":2016,"mileageFromOdometer":{"value":235000},"offers":{"@type":"Offer","price":1145000},"image":"https://arbstorage.mncdn.com/ilanfotograf/orj/42905284/1.jpg"}</script>
</body></html>`;

const CHALLENGE_FIXTURE = `<html><head><title>Bir dakika lütfen...</title></head><body>cf</body></html>`;

const OTOPLUS_FIXTURE = `<html><head><title>Honda Civic</title></head><body>
<script type="application/ld+json">[{"@type":"Vehicle","name":"2017 Honda CIVIC CIVIC SEDAN EXECUTIVE 1.6 (125) OV","url":"https://www.otoplus.com/honda/civic/civic-sedan-executive-1.6-(125)-ov/sahibinden-2017-otomatik-benzin-99910km-ekspertizli-İzmir-1510000tl-562995","brand":{"@type":"Brand","name":"Honda"},"modelDate":2017,"mileageFromOdometer":{"@type":"QuantitativeValue","value":99910},"offers":{"@type":"Offer","price":1510000},"image":"https://cdn.otoplus.com/cars/562995.jpg"}]</script>
</body></html>`;

describe("Arabam incident HTTP parser", () => {
  it("parses listing row + JSON-LD year/price/id", () => {
    const rows = parseArabamListHtml(ARABAM_FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.externalId).toBe("42905284");
    expect(rows[0]?.year).toBe("2016");
    expect(rows[0]?.brand).toBe("Honda");
    expect(rows[0]?.series).toBe("Civic");
    expect(rows[0]?.priceText).toMatch(/1\.145\.000/);
  });

  it("returns empty on interstitial/challenge HTML", () => {
    expect(parseArabamListHtml(CHALLENGE_FIXTURE)).toEqual([]);
  });
});

describe("Otoplus parser / query / coverage", () => {
  it("parses JSON-LD vehicle with stable numeric id", () => {
    const rows = parseOtoplusListHtml(OTOPLUS_FIXTURE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe("562995");
    expect(parseOtoplusExternalId(rows[0]!.url)).toBe("562995");
    expect(rows[0]?.brand).toBe("Honda");
    expect(rows[0]?.series?.toLowerCase()).toContain("civic");
    expect(rows[0]?.year).toBe(2017);
    expect(rows[0]?.price).toBe(1510000);
    expect(rows[0]?.mileage).toBe(99910);
    expect(rows[0]?.city).toMatch(/zmir/i);
  });

  it("builds Honda Civic taxonomy path from SearchIntent", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      minYear: 2016,
      maxYear: 2018,
    });
    const plan = planFromSearchIntent("otoplus", intent);
    const built = buildOtoplusQuery(plan);
    expect(built.url).toBe("https://www.otoplus.com/honda/civic");
    expect(built.appliedCriteria).toEqual(expect.arrayContaining(["brand", "series"]));
    expect(built.deferredCriteria).toEqual(
      expect.arrayContaining(["minYear", "maxYear"]),
    );
  });

  it("Honda Civic coverage is FULL (year MATCHER_ONLY, structured) and AVAILABLE", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      minYear: 2016,
      maxYear: 2018,
    });
    const row = evaluatePlatformCoverage(intent, "otoplus", {
      availability: "AVAILABLE",
      reason: "none",
    });
    expect(row.coverage).toBe("FULL");
    expect(row.matcherCriteria).toEqual(
      expect.arrayContaining(["minYear", "maxYear"]),
    );
    expect(row.sourceCriteria).toEqual(expect.arrayContaining(["brand", "series"]));
    expect(row.availability).toBe("AVAILABLE");
    expect(row.schedulable).toBe(true);
    expect(VEHICLE_DISCOVERY_PLATFORMS).toContain("otoplus");
    const rows = evaluateCoverage(intent, defaultAvailabilityMap());
    expect(rows.some((item) => item.platform === "otoplus")).toBe(true);
  });

  it("year/city/price are MATCHER_ONLY; brand/series SOURCE", () => {
    expect(criterionRole("otoplus", "brand")).toBe("SOURCE");
    expect(criterionRole("otoplus", "series")).toBe("SOURCE");
    expect(criterionRole("otoplus", "minYear")).toBe("MATCHER_ONLY");
    expect(criterionRole("otoplus", "city")).toBe("MATCHER_ONLY");
    expect(criterionRole("otoplus", "minPrice")).toBe("MATCHER_ONLY");
  });

  it("Honda Civic 2017 fixture passes production-like matcher", () => {
    const parsed = parseOtoplusListHtml(OTOPLUS_FIXTURE)[0]!;
    expect(
      listingMatchesFilter(
        {
          title: parsed.title,
          price: parsed.price!,
          dealScore: 0,
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
          minDealScore: 0,
        },
      ),
    ).toBe(true);
  });

  it("normalizer produces ingest contract with stable otoplus:id", () => {
    const parsed = parseOtoplusListHtml(OTOPLUS_FIXTURE)[0]!;
    const dto = toListingDto(
      "otoplus",
      {
        externalId: parsed.externalId,
        title: parsed.title,
        priceText: `${parsed.price} TL`,
        city: parsed.city,
        url: parsed.url,
        category: "Vasıta > Otomobil",
        brand: parsed.brand,
        series: parsed.series,
        year: parsed.year,
        mileage: parsed.mileage,
        imageUrl: parsed.imageUrl,
        sellerType: parsed.sellerType,
      },
      { category: "Vasıta > Otomobil" },
    );
    expect(dto?.externalId).toBe("otoplus:562995");
    expect(dto?.platform).toBe("otoplus");
    expect(listingDtoToRaw(dto!).platform).toBe("otoplus");
  });

  it("initial reliability stays UNKNOWN (not fake HEALTHY)", () => {
    const empty = emptyReliabilityState();
    expect(empty.reliability).toBe("UNKNOWN");
    const once = applyProviderResult(empty, {
      outcome: "success",
      rawCount: 12,
    });
    expect(once.next.reliability).toBe("UNKNOWN");
    expect(
      resolveEffectiveStatus({
        coverage: "FULL",
        availability: "AVAILABLE",
        schedulable: true,
        reliability: "UNKNOWN",
      }),
    ).toBe("LIMITED");
  });

  it("MI comparable pool accepts otoplus next to arabam", async () => {
    const bmw = (
      partial: Partial<ComparableListingRow> & {
        id: string;
        externalId: string;
        price: number;
      },
    ): ComparableListingRow => ({
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
    });
    const service = new MarketIntelligenceService({
      minSample: 5,
      findCandidates: async () => [
        bmw({ id: "a1", externalId: "a1", price: 1_600_000 }),
        bmw({ id: "a2", externalId: "a2", price: 1_610_000 }),
        bmw({ id: "a3", externalId: "a3", price: 1_620_000 }),
        bmw({
          id: "o1",
          externalId: "o1",
          platform: "otoplus",
          price: 1_630_000,
        }),
        bmw({
          id: "o2",
          externalId: "o2",
          platform: "otoplus",
          price: 1_640_000,
        }),
      ],
    });
    const result = await service.analyzeListing({
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
    });
    expect(result.status).toBe("READY");
    expect(result.sampleSize).toBeGreaterThanOrEqual(5);
  });
});
