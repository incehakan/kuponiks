import { SubscriptionPlan } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: { userFilter: { findMany: vi.fn() } },
}));
vi.mock("../../lib/redis.js", () => ({
  redisSetNxEx: vi.fn(),
  redisGet: vi.fn(),
  redisSetEx: vi.fn(),
  redisIncrBy: vi.fn().mockResolvedValue(1),
}));
vi.mock("../../queues/scraper.queue.js", () => ({
  enqueueScrapeJob: vi.fn(),
}));
vi.mock("./circuit-breaker.js", () => ({
  isPlatformCircuitOpen: vi.fn(),
}));

import { redisSetNxEx } from "../../lib/redis.js";
import { enqueueScrapeJob } from "../../queues/scraper.queue.js";
import { isPlatformCircuitOpen } from "./circuit-breaker.js";
import { runSchedulerCycle } from "./scheduler.service.js";
import { groupActiveFilters } from "./canonical-query.js";
import { getScrapeIntervalMs } from "../../lib/subscription-plan.js";
import type { SchedulerFilterInput } from "./canonical-query.js";
import { defaultAvailabilityMap } from "../../coverage/coverage-engine.js";
import { isPlatformCoverageRoutingEnabled } from "../../coverage/coverage-routing.js";

const honda: SchedulerFilterInput = {
  id: "f1",
  isActive: true,
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null,
  city: "Tüm Türkiye",
  minYear: 2016,
  maxYear: 2018,
  keywords: [],
  plan: SubscriptionPlan.VIP,
};

describe("Coverage scheduler routing", () => {
  const previous = process.env.PLATFORM_COVERAGE_ROUTING_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPlatformCircuitOpen).mockResolvedValue(false);
    vi.mocked(redisSetNxEx).mockResolvedValue("OK");
    vi.mocked(enqueueScrapeJob).mockResolvedValue("job-1");
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.PLATFORM_COVERAGE_ROUTING_ENABLED;
    } else {
      process.env.PLATFORM_COVERAGE_ROUTING_ENABLED = previous;
    }
  });

  it("26. coverage routing disabled → old 3-platform behavior", () => {
    const groups = groupActiveFilters([honda], { routingEnabled: false });
    const platforms = [...new Set(groups.map((g) => g.platform))].sort();
    expect(platforms).toEqual(["arabam", "letgo", "otoplus", "sahibinden"]);
  });

  it("27. enabled → only supported/usable groups", () => {
    const groups = groupActiveFilters([honda], {
      routingEnabled: true,
      availability: defaultAvailabilityMap(),
    });
    const platforms = [...new Set(groups.map((g) => g.platform))].sort();
    expect(platforms).toEqual(["arabam", "letgo", "otoplus"]);
    expect(platforms).not.toContain("sahibinden");
    expect(platforms).not.toContain("hepsiemlak");
  });

  it("28. Arabam remains scheduled", () => {
    const groups = groupActiveFilters([honda], { routingEnabled: true });
    expect(groups.some((g) => g.platform === "arabam")).toBe(true);
  });

  it("29. unsupported Letgo produces no letgo job", () => {
    const realty: SchedulerFilterInput = {
      ...honda,
      category: "Emlak > Konut",
      brand: null,
      series: null,
      keywords: ["3+1"],
    };
    const groups = groupActiveFilters([realty], { routingEnabled: true });
    expect(groups.some((g) => g.platform === "letgo")).toBe(false);
  });

  it("30. Sahibinden circuit is respected when still grouped", async () => {
    process.env.PLATFORM_COVERAGE_ROUTING_ENABLED = "false";
    vi.mocked(isPlatformCircuitOpen).mockImplementation(async (platform) => {
      return platform === "sahibinden";
    });
    const result = await runSchedulerCycle({
      enqueue: true,
      acquireLock: false,
      filters: [honda],
    });
    expect(result.circuitSkipped).toBeGreaterThan(0);
    const platforms = vi.mocked(enqueueScrapeJob).mock.calls.map(
      (call) => call[0]?.platform,
    );
    expect(platforms).not.toContain("sahibinden");
    expect(platforms).toContain("arabam");
  });

  it("31. identical supported queries still merge", () => {
    const groups = groupActiveFilters(
      [honda, { ...honda, id: "f2" }],
      { routingEnabled: true },
    );
    expect(groups.filter((g) => g.platform === "arabam")).toHaveLength(1);
    expect(groups.find((g) => g.platform === "arabam")?.filterIds).toEqual([
      "f1",
      "f2",
    ]);
  });

  it("32. cadence is unchanged", () => {
    const groups = groupActiveFilters([honda], { routingEnabled: true });
    const arabam = groups.find((g) => g.platform === "arabam");
    expect(arabam?.intervalMs).toBe(getScrapeIntervalMs(SubscriptionPlan.VIP));
    expect(arabam?.priority).toBe(1);
  });

  it("23. scheduler grouping unchanged for healthy", () => {
    const groups = groupActiveFilters([honda], {
      routingEnabled: true,
      reliability: { arabam: "HEALTHY", letgo: "NO_DATA" },
    });
    const platforms = [...new Set(groups.map((g) => g.platform))].sort();
    expect(platforms).toEqual(["arabam", "letgo", "otoplus"]);
    expect(groups.find((g) => g.platform === "arabam")?.intervalMs).toBe(
      getScrapeIntervalMs(SubscriptionPlan.VIP),
    );
  });

  it("21-22. Letgo NO_DATA uses reduced probe; recovery restores VIP cadence", () => {
    const previous = process.env.PROVIDER_PROBE_CADENCE_ENABLED;
    process.env.PROVIDER_PROBE_CADENCE_ENABLED = "true";
    process.env.PROVIDER_DEGRADED_PROBE_MINUTES = "30";
    try {
      const noData = groupActiveFilters([honda], {
        routingEnabled: true,
        reliability: { arabam: "HEALTHY", letgo: "NO_DATA" },
      });
      expect(noData.find((g) => g.platform === "letgo")?.intervalMs).toBe(
        30 * 60 * 1000,
      );
      expect(noData.find((g) => g.platform === "arabam")?.intervalMs).toBe(
        getScrapeIntervalMs(SubscriptionPlan.VIP),
      );

      const recovered = groupActiveFilters([honda], {
        routingEnabled: true,
        reliability: { arabam: "HEALTHY", letgo: "HEALTHY" },
      });
      expect(recovered.find((g) => g.platform === "letgo")?.intervalMs).toBe(
        getScrapeIntervalMs(SubscriptionPlan.VIP),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.PROVIDER_PROBE_CADENCE_ENABLED;
      } else {
        process.env.PROVIDER_PROBE_CADENCE_ENABLED = previous;
      }
    }
  });

  it("flag defaults off in production", () => {
    expect(
      isPlatformCoverageRoutingEnabled({ NODE_ENV: "production" }),
    ).toBe(false);
    expect(
      isPlatformCoverageRoutingEnabled({ NODE_ENV: "test" }),
    ).toBe(true);
  });
});
