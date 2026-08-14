import { SubscriptionPlan } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalKey,
  buildScrapeJobId,
  groupActiveFilters,
  hashCanonicalKey,
  scrapeQueryText,
  type SchedulerFilterInput,
} from "./canonical-query.js";

const hondaA: SchedulerFilterInput = {
  id: "filter-a",
  isActive: true,
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null,
  city: "Tüm Türkiye",
  keywords: [],
  plan: SubscriptionPlan.VIP,
};

const hondaB: SchedulerFilterInput = {
  ...hondaA,
  id: "filter-b",
  plan: SubscriptionPlan.FREE,
};

const clio: SchedulerFilterInput = {
  id: "filter-c",
  isActive: true,
  category: "Vasıta > Otomobil",
  brand: "Renault",
  series: "Clio",
  trim: null,
  city: "Tüm Türkiye",
  keywords: [],
  plan: SubscriptionPlan.PRO,
};

describe("Scheduler V2 canonical query grouping", () => {
  it("ignores inactive filters", () => {
    const groups = groupActiveFilters([
      { ...hondaA, isActive: false },
    ]);
    expect(groups).toHaveLength(0);
  });

  it("groups identical Honda Civic filters into one query per platform", () => {
    const groups = groupActiveFilters([hondaA, hondaB]);
    const arabam = groups.filter((group) => group.platform === "arabam");
    expect(arabam).toHaveLength(1);
    expect(arabam[0]?.filterIds).toEqual(["filter-a", "filter-b"]);
    expect(arabam[0]?.query).toBe("Honda Civic");
    expect(arabam[0]?.bestPlan).toBe(SubscriptionPlan.VIP);
  });

  it("splits Honda Civic and Renault Clio into different query groups", () => {
    const groups = groupActiveFilters([hondaA, hondaB, clio]);
    const arabam = groups.filter((group) => group.platform === "arabam");
    expect(arabam).toHaveLength(2);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps canonical keys stable regardless of filter order", () => {
    const a = groupActiveFilters([hondaA, clio]).map((group) => group.key);
    const b = groupActiveFilters([clio, hondaA]).map((group) => group.key);
    expect([...a].sort()).toEqual([...b].sort());
    expect(
      buildCanonicalKey({
        platform: "arabam",
        category: "Vasıta > Otomobil",
        query: "Honda Civic",
      }),
    ).toBe(
      buildCanonicalKey({
        platform: "arabam",
        category: "Vasıta > Otomobil",
        query: "Honda  Civic",
      }),
    );
  });

  it("hashes canonical keys deterministically", () => {
    const key = buildCanonicalKey({
      platform: "arabam",
      category: "Vasıta > Otomobil",
      query: "Honda Civic",
    });
    expect(hashCanonicalKey(key)).toBe(hashCanonicalKey(key));
    expect(hashCanonicalKey(key)).toHaveLength(12);
  });

  it("builds time-bucketed job ids", () => {
    const interval = 5 * 60 * 1000;
    const first = buildScrapeJobId({
      platform: "arabam",
      queryHash: "abc123",
      intervalMs: interval,
      nowMs: 1_000,
    });
    const sameBucket = buildScrapeJobId({
      platform: "arabam",
      queryHash: "abc123",
      intervalMs: interval,
      nowMs: interval - 1,
    });
    const nextBucket = buildScrapeJobId({
      platform: "arabam",
      queryHash: "abc123",
      intervalMs: interval,
      nowMs: interval,
    });
    expect(first).toBe(sameBucket);
    expect(nextBucket).not.toBe(first);
    expect(first).not.toContain(":");
  });

  it("uses brand+series as scrape query text", () => {
    expect(scrapeQueryText(hondaA)).toBe("Honda Civic");
  });
});
