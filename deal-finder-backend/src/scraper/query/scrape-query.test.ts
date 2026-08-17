import { SubscriptionPlan } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildArabamQuery } from "../query/planners/arabam-query-builder.js";
import { buildPlatformQuery } from "../query/scrape-query-planner.js";
import {
  planFromFilter,
  type SchedulerFilterInput,
} from "../query/scrape-query-plan.js";
import {
  buildSourceSignature,
  foldQueryToken,
  hashSourceSignature,
  slugifyQueryToken,
} from "../query/query-signature.js";
import {
  groupActiveFilters,
  planPriority,
} from "../scheduler/canonical-query.js";

const hondaBase: SchedulerFilterInput = {
  id: "filter-honda",
  isActive: true,
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null,
  city: "Tüm Türkiye",
  keywords: [],
  plan: SubscriptionPlan.FREE,
};

function honda(overrides: Partial<SchedulerFilterInput> = {}): SchedulerFilterInput {
  return { ...hondaBase, ...overrides };
}

describe("ArabamQueryBuilder", () => {
  it("1. builds Honda Civic taxonomy URL", () => {
    const { built } = buildPlatformQuery("arabam", honda());
    expect(built.url).toBe(
      "https://www.arabam.com/ikinci-el/otomobil/honda-civic?take=50",
    );
    expect(built.displayQuery).toBe("Honda Civic");
    expect(built.appliedCriteria).toEqual(["brand", "series", "take"]);
    expect(built.sourceDebug?.taxonomyPath).toBe("/ikinci-el/otomobil/honda-civic");
  });

  it("2. year range is applied as SOURCE query params", () => {
    const { plan, built } = buildPlatformQuery(
      "arabam",
      honda({ minYear: 2016, maxYear: 2018 }),
    );
    expect(built.url).toContain("minYear=2016");
    expect(built.url).toContain("maxYear=2018");
    expect(plan.deferredCriteria).not.toContain("minYear");
    expect(plan.deferredCriteria).not.toContain("maxYear");
    expect(built.deferredCriteria).not.toContain("minYear");
    expect(built.appliedCriteria).toContain("minYear");
    expect(built.appliedCriteria).toContain("maxYear");
  });

  it("3. minYear only appears in Arabam URL", () => {
    const { built } = buildPlatformQuery("arabam", honda({ minYear: 2016 }));
    expect(built.url).toContain("minYear=2016");
    expect(built.url).not.toContain("maxYear=");
  });

  it("4. maxYear only appears in Arabam URL", () => {
    const { built } = buildPlatformQuery("arabam", honda({ maxYear: 2018 }));
    expect(built.url).toContain("maxYear=2018");
    expect(built.url).not.toContain("minYear=");
  });

  it("5. price range is applied as SOURCE query params", () => {
    const { built, plan } = buildPlatformQuery(
      "arabam",
      honda({ minPrice: 500_000, maxPrice: 900_000 }),
    );
    expect(built.url).toContain("minPrice=500000");
    expect(built.url).toContain("maxPrice=900000");
    expect(plan.deferredCriteria).not.toContain("minPrice");
    expect(plan.deferredCriteria).not.toContain("maxPrice");
  });

  it('6. "Tüm Türkiye" removes city from source query', () => {
    const { plan, built } = buildPlatformQuery("arabam", honda());
    expect(plan.city).toBeUndefined();
    expect(built.url).not.toMatch(/kayseri|izmir|istanbul/i);
    expect(built.sourceCriteria.city).toBeUndefined();
  });

  it("7. real city is applied in taxonomy path", () => {
    const { plan, built } = buildPlatformQuery(
      "arabam",
      honda({ city: "İzmir" }),
    );
    expect(plan.city).toBe("İzmir");
    expect(built.url).toContain("/honda-civic-izmir");
    expect(built.appliedCriteria).toContain("city");
    expect(built.deferredCriteria).not.toContain("city");
  });

  it("8. null mileage is not coerced to 0 in query plan", () => {
    const { plan } = buildPlatformQuery(
      "arabam",
      honda({ minMileage: null, maxMileage: null }),
    );
    expect(plan.minMileage).toBeUndefined();
    expect(plan.maxMileage).toBeUndefined();
    expect(plan.sourceCriteria.minMileage).toBeUndefined();
    expect(plan.sourceCriteria.maxMileage).toBeUndefined();
  });

  it("9. trim is matcher-only and not in Arabam URL", () => {
    const { plan, built } = buildPlatformQuery(
      "arabam",
      honda({ trim: "Elegance" }),
    );
    expect(plan.deferredCriteria).toContain("trim");
    expect(built.url).not.toMatch(/elegance/i);
  });

  it("10. combined city + year + price taxonomy URL", () => {
    const { built } = buildPlatformQuery(
      "arabam",
      honda({
        city: "Kayseri",
        minYear: 2016,
        maxYear: 2018,
        minPrice: 700_000,
        maxPrice: 1_200_000,
      }),
    );
    expect(built.url).toBe(
      "https://www.arabam.com/ikinci-el/otomobil/honda-civic-kayseri?minYear=2016&maxYear=2018&minPrice=700000&maxPrice=1200000&take=50",
    );
  });

  it("11. null numeric fields are omitted from URL", () => {
    const { built } = buildPlatformQuery(
      "arabam",
      honda({ minYear: null, maxYear: null, minPrice: null, maxPrice: null }),
    );
    expect(built.url).not.toMatch(/minYear|maxYear|minPrice|maxPrice/);
  });

  it("12. Mercedes-Benz special brand slug in path", () => {
    const { built } = buildPlatformQuery(
      "arabam",
      honda({ brand: "Mercedes-Benz", series: "C Serisi" }),
    );
    expect(built.url).toContain("/ikinci-el/otomobil/mercedes-benz-c?");
  });

  it("13. Turkish slug normalization is deterministic", () => {
    expect(slugifyQueryToken("Honda  Civic")).toBe("honda-civic");
    expect(slugifyQueryToken("İstanbul")).toBe("istanbul");
    expect(slugifyQueryToken("Şehir / Bölge")).toBe("şehir-bölge");
  });

  it("14. source signature is deterministic", () => {
    const plan = planFromFilter("arabam", honda());
    const sigA = buildSourceSignature("arabam", plan.sourceCriteria);
    const sigB = buildSourceSignature("arabam", plan.sourceCriteria);
    expect(sigA).toBe(sigB);
    expect(hashSourceSignature(sigA)).toBe(hashSourceSignature(sigB));
  });

  it("15. field order does not change signature", () => {
    const a = buildSourceSignature("arabam", {
      brand: "Honda",
      series: "Civic",
    });
    const b = buildSourceSignature("arabam", {
      series: "Civic",
      brand: "Honda",
    });
    expect(a).toBe(b);
  });

  it("16. year range changes signature", () => {
    const a = buildSourceSignature("arabam", {
      brand: "Honda",
      series: "Civic",
      minYear: 2016,
      maxYear: 2018,
    });
    const b = buildSourceSignature("arabam", {
      brand: "Honda",
      series: "Civic",
      minYear: 2019,
      maxYear: 2021,
    });
    expect(a).not.toBe(b);
  });
});

describe("Scrape query grouping", () => {
  it("17. minDealScore does not affect signature", () => {
    const a = buildPlatformQuery("arabam", honda({ id: "a" }));
    const b = buildPlatformQuery("arabam", honda({ id: "b" }));
    const sigA = buildSourceSignature("arabam", a.plan.sourceCriteria);
    const sigB = buildSourceSignature("arabam", b.plan.sourceCriteria);
    expect(sigA).toBe(sigB);
  });

  it("18. notifyPush is not part of source signature", () => {
    const groups = groupActiveFilters([
      honda({ id: "a", plan: SubscriptionPlan.FREE }),
      honda({ id: "b", plan: SubscriptionPlan.FREE }),
    ]);
    const arabam = groups.filter((g) => g.platform === "arabam");
    expect(arabam).toHaveLength(1);
    expect(arabam[0]?.signature).not.toMatch(/notify/i);
  });

  it("19. notification channels are not in signature", () => {
    const sig = buildSourceSignature("arabam", {
      brand: "Honda",
      series: "Civic",
    });
    expect(sig).not.toMatch(/telegram|push|whatsapp/i);
  });

  it("20. identical source filters merge into one group", () => {
    const groups = groupActiveFilters([
      honda({ id: "a" }),
      honda({ id: "b" }),
    ]);
    const arabam = groups.filter((g) => g.platform === "arabam");
    expect(arabam).toHaveLength(1);
    expect(arabam[0]?.filterIds).toEqual(["a", "b"]);
  });

  it("21. different minDealScore still one group", () => {
    const groups = groupActiveFilters([
      honda({ id: "a" }),
      honda({ id: "b" }),
    ]);
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(1);
  });

  it("22. different notification settings still one group", () => {
    const groups = groupActiveFilters([
      honda({ id: "a", plan: SubscriptionPlan.FREE }),
      honda({ id: "b", plan: SubscriptionPlan.FREE }),
    ]);
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(1);
  });

  it("23. matcher-only trim difference keeps one group", () => {
    const groups = groupActiveFilters([
      honda({ id: "a", trim: "Elegance" }),
      honda({ id: "b", trim: "Sport" }),
    ]);
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(1);
  });

  it("24. source-level year splits groups", () => {
    const groups = groupActiveFilters([
      honda({ id: "a", minYear: 2016, maxYear: 2018 }),
      honda({ id: "b", minYear: 2019, maxYear: 2021 }),
    ]);
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(2);
  });

  it("25. VIP + FREE same query keeps VIP cadence", () => {
    const groups = groupActiveFilters([
      honda({ id: "a", plan: SubscriptionPlan.FREE }),
      honda({ id: "b", plan: SubscriptionPlan.VIP }),
    ]);
    const arabam = groups.find((g) => g.platform === "arabam");
    expect(arabam?.bestPlan).toBe(SubscriptionPlan.VIP);
    expect(arabam?.priority).toBe(planPriority(SubscriptionPlan.VIP));
  });

  it("26. Civic and Clio are separate groups", () => {
    const groups = groupActiveFilters([
      honda({ id: "a" }),
      honda({
        id: "b",
        brand: "Renault",
        series: "Clio",
      }),
    ]);
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(2);
  });

  it("27. duplicate Honda Civic + Tüm Türkiye filters merge", () => {
    const groups = groupActiveFilters([
      honda({ id: "a", city: "Tüm Türkiye" }),
      honda({ id: "b", city: "Tüm Türkiye" }),
    ]);
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(1);
  });

  it("28. inactive filter produces no group", () => {
    const groups = groupActiveFilters([honda({ isActive: false })]);
    expect(groups).toHaveLength(0);
  });

  it("29. zero active filters produces zero jobs", () => {
    expect(groupActiveFilters([])).toHaveLength(0);
  });
});

describe("buildArabamQuery direct", () => {
  it("uses taxonomy path and take=50", () => {
    const plan = planFromFilter("arabam", honda());
    const built = buildArabamQuery(plan);
    const url = new URL(built.url);
    expect(url.pathname).toBe("/ikinci-el/otomobil/honda-civic");
    expect(url.searchParams.get("take")).toBe("50");
    expect(url.searchParams.get("searchText")).toBeNull();
  });

  it("falls back to searchText when brand missing", () => {
    const plan = planFromFilter("arabam", {
      ...honda(),
      brand: null,
      series: null,
      keywords: ["Honda Civic"],
    });
    const built = buildArabamQuery(plan);
    expect(built.url).toContain("searchText=Honda+Civic");
  });

  it("foldQueryToken normalizes whitespace", () => {
    expect(foldQueryToken("Honda   Civic")).toBe("honda civic");
  });
});
