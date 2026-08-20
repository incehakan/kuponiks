import { SubscriptionPlan } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildSearchIntentFromFilter } from "../../coverage/search-intent-builder.js";
import {
  defaultAvailabilityMap,
  evaluateCoverage,
} from "../../coverage/coverage-engine.js";
import { applyReliabilityToCoverage } from "../../coverage/provider-reliability.js";
import { groupActiveFilters } from "../scheduler/canonical-query.js";
import { buildPlatformQuery } from "../query/scrape-query-planner.js";
import { listingMatchesFilter } from "../../filters/filter-match.engine.js";
import { canNotifyUserForListing } from "../../notifications/notification-eligibility.js";
import { listingPlatformLabel } from "../../lib/platform-label.js";
import type { SchedulerFilterInput } from "../scheduler/canonical-query.js";

const hondaFilter = {
  id: "f-honda",
  isActive: true,
  category: "Vasıta > Otomobil",
  subcategory: "Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null as string | null,
  city: "Tüm Türkiye",
  minYear: 2016,
  maxYear: 2018,
  minMileage: null as number | null,
  maxMileage: null as number | null,
  minDealScore: 50,
  notifyPush: true,
  notifyTelegram: false,
  notifyWhatsapp: false,
  keywords: [] as string[],
  plan: SubscriptionPlan.VIP,
};

describe("Multi-provider UserFilter E2E V1 regressions", () => {
  it("1. one active vehicle filter → three schedulable providers", () => {
    const availability = defaultAvailabilityMap();
    const groups = groupActiveFilters([hondaFilter], {
      routingEnabled: true,
      availability,
      reliability: {
        arabam: "HEALTHY",
        letgo: "HEALTHY",
        otoplus: "HEALTHY",
        sahibinden: "UNKNOWN",
      },
    });
    const platforms = [...new Set(groups.map((g) => g.platform))].sort();
    expect(platforms).toEqual(["arabam", "letgo", "otoplus"]);
  });

  it("2. Sahibinden excluded when UNAVAILABLE", () => {
    const intent = buildSearchIntentFromFilter(hondaFilter);
    const rows = applyReliabilityToCoverage(
      evaluateCoverage(intent, defaultAvailabilityMap()),
      { sahibinden: "UNKNOWN" },
    );
    const sh = rows.find((r) => r.platform === "sahibinden");
    expect(sh?.availability).toBe("UNAVAILABLE");
    expect(sh?.effectiveStatus).toBe("UNAVAILABLE");
    const groups = groupActiveFilters([hondaFilter], { routingEnabled: true });
    expect(groups.some((g) => g.platform === "sahibinden")).toBe(false);
  });

  it("3. provider queries from same SearchIntent (not notify/minDealScore)", () => {
    const intent = buildSearchIntentFromFilter(hondaFilter);
    expect(intent).not.toHaveProperty("notifyPush");
    expect(intent).not.toHaveProperty("minDealScore");
    expect(intent.brand).toBe("Honda");
    expect(intent.series).toBe("Civic");

    const arabam = buildPlatformQuery("arabam", hondaFilter).built;
    const letgo = buildPlatformQuery("letgo", hondaFilter).built;
    const otoplus = buildPlatformQuery("otoplus", hondaFilter).built;
    expect(arabam.url).toContain("honda-civic");
    expect(arabam.url).toContain("minYear=2016");
    expect(letgo.url).toContain("/api/search/items");
    expect(letgo.url).toContain("marka%3Ahonda");
    expect(otoplus.url).toContain("/honda/civic");
    expect(arabam.deferredCriteria).toEqual(
      expect.arrayContaining(["minDealScore", "notifyPush"]),
    );
  });

  it("4. matcher is platform-independent (same engine)", () => {
    const listingBase = {
      title: "Honda Civic",
      price: 1_200_000,
      dealScore: 70,
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      year: 2017,
      mileage: 100_000,
      city: "İzmir",
    };
    expect(listingMatchesFilter({ ...listingBase }, hondaFilter)).toBe(true);
    expect(
      listingMatchesFilter(
        { ...listingBase, dealScore: 40 },
        hondaFilter,
      ),
    ).toBe(false);
  });

  it("5. match aggregation concept by platform keys", () => {
    const rows = [
      { platform: "arabam" },
      { platform: "arabam" },
      { platform: "letgo" },
      { platform: "otoplus" },
    ];
    const by: Record<string, number> = {};
    for (const row of rows) {
      by[row.platform] = (by[row.platform] ?? 0) + 1;
    }
    expect(by).toEqual({ arabam: 2, letgo: 1, otoplus: 1 });
  });

  it("6. feed platform labels are user-facing", () => {
    expect(listingPlatformLabel("arabam")).toBe("Arabam");
    expect(listingPlatformLabel("letgo")).toBe("Letgo");
    expect(listingPlatformLabel("otoplus")).toBe("Otoplus");
    expect(listingPlatformLabel("arabam")).not.toBe("arabam");
  });

  it("7. new filter generic model builds non-Honda queries", () => {
    const corolla: SchedulerFilterInput = {
      id: "f-corolla",
      isActive: true,
      category: "Vasıta > Otomobil",
      brand: "Toyota",
      series: "Corolla",
      trim: null,
      city: "Tüm Türkiye",
      minYear: 2015,
      maxYear: 2020,
      keywords: [],
      plan: SubscriptionPlan.VIP,
    };
    const arabam = buildPlatformQuery("arabam", corolla).built.url;
    const letgo = buildPlatformQuery("letgo", corolla).built.url;
    const otoplus = buildPlatformQuery("otoplus", corolla).built.url;
    expect(arabam.toLowerCase()).toContain("toyota-corolla");
    expect(arabam.toLowerCase()).not.toContain("civic");
    expect(letgo).toContain("toyota");
    expect(letgo).toContain("corolla");
    expect(otoplus).toContain("/toyota/corolla");
  });

  it("8. provider failure isolation — Sahibinden down does not drop others", () => {
    const availability = {
      ...defaultAvailabilityMap(),
      sahibinden: {
        availability: "UNAVAILABLE" as const,
        reason: "cloudflare" as const,
      },
    };
    const groups = groupActiveFilters([hondaFilter], {
      routingEnabled: true,
      availability,
      reliability: {
        arabam: "HEALTHY",
        letgo: "HEALTHY",
        otoplus: "HEALTHY",
        sahibinden: "FAILING",
      },
    });
    const platforms = new Set(groups.map((g) => g.platform));
    expect(platforms.has("arabam")).toBe(true);
    expect(platforms.has("letgo")).toBe(true);
    expect(platforms.has("otoplus")).toBe(true);
    expect(platforms.has("sahibinden")).toBe(false);
  });

  it("9. notification eligibility is platform-independent", () => {
    const listing = {
      dealScore: 70,
      marketStatus: "READY",
      category: "Vasıta > Otomobil",
    };
    const a = canNotifyUserForListing(listing, hondaFilter);
    const b = canNotifyUserForListing(listing, hondaFilter);
    expect(a).toEqual(b);
    expect(a.eligible).toBe(true);
    expect(
      canNotifyUserForListing(
        { ...listing, dealScore: 10 },
        hondaFilter,
      ).eligible,
    ).toBe(false);
  });

  it("10. no active filter → no monitoring groups", () => {
    expect(groupActiveFilters([]).length).toBe(0);
    expect(
      groupActiveFilters([{ ...hondaFilter, isActive: false }]).length,
    ).toBe(0);
  });
});
