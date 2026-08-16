import { SubscriptionPlan } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  isSchedulerAutoStartEnabled,
  runSchedulerCycle,
} from "./scheduler.service.js";
import { getSchedulerHealth } from "./scheduler-state.js";
import { ScraperScheduler } from "../scraper.scheduler.js";
import type { SchedulerFilterInput } from "./canonical-query.js";

const honda: SchedulerFilterInput = {
  id: "f1",
  isActive: true,
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null,
  city: "Tüm Türkiye",
  keywords: [],
  plan: SubscriptionPlan.VIP,
};

describe("Scheduler V2 cycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPlatformCircuitOpen).mockResolvedValue(false);
    vi.mocked(redisSetNxEx).mockResolvedValue("OK");
    vi.mocked(enqueueScrapeJob).mockResolvedValue("job-1");
  });

  it("queues nothing when there are no active filters", async () => {
    const result = await runSchedulerCycle({
      enqueue: true,
      acquireLock: false,
      filters: [],
    });
    expect(result.queryGroups).toBe(0);
    expect(result.queued).toBe(0);
    expect(enqueueScrapeJob).not.toHaveBeenCalled();
  });

  it("skips the cycle when Redis lock is not acquired", async () => {
    vi.mocked(redisSetNxEx).mockResolvedValue(null);
    const result = await runSchedulerCycle({
      enqueue: true,
      acquireLock: true,
      filters: [honda],
    });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("lock");
    expect(enqueueScrapeJob).not.toHaveBeenCalled();
  });

  it("dedups identical job enqueue as skipped", async () => {
    vi.mocked(enqueueScrapeJob).mockResolvedValue(undefined);
    const result = await runSchedulerCycle({
      enqueue: true,
      acquireLock: false,
      filters: [honda],
    });
    expect(result.queued).toBe(0);
    expect(result.dedupSkipped).toBeGreaterThan(0);
  });

  it("does not enqueue a platform when its circuit is open", async () => {
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

  it("dry-run produces Honda Civic groups without enqueue", async () => {
    const result = await runSchedulerCycle({
      enqueue: false,
      filters: [
        honda,
        { ...honda, id: "f2", plan: SubscriptionPlan.FREE },
        {
          ...honda,
          id: "f3",
          brand: "Renault",
          series: "Clio",
          plan: SubscriptionPlan.PRO,
        },
      ],
    });
    expect(result.activeFilters).toBe(3);
    const arabam = result.groups.filter((group) => group.platform === "arabam");
    expect(arabam).toHaveLength(2);
    expect(enqueueScrapeJob).not.toHaveBeenCalled();
  });

  it("exposes scheduler health snapshot after a cycle", async () => {
    await runSchedulerCycle({
      enqueue: false,
      filters: [honda],
    });
    const health = getSchedulerHealth();
    expect(health.lastCycleAt).toBeTruthy();
    expect(health.activeFilterCount).toBe(1);
    expect(health.queryGroupCount).toBeGreaterThan(0);
  });

  it("does not auto-start an interval loop in test env", () => {
    expect(isSchedulerAutoStartEnabled()).toBe(false);
    const scheduler = new ScraperScheduler(60_000);
    scheduler.start();
    scheduler.stop();
  });

  it("treats SCHEDULER_ENABLED=false as disabled", () => {
    const previous = process.env.SCHEDULER_ENABLED;
    process.env.SCHEDULER_ENABLED = "false";
    expect(isSchedulerAutoStartEnabled()).toBe(false);
    process.env.SCHEDULER_ENABLED = previous;
  });
});
