import { describe, expect, it, vi } from "vitest";
import {
  applyProviderResult,
  applyReliabilityToCoverage,
  attemptsFromOutcomes,
  classifyReliability,
  countEffectiveSources,
  pushBoundedAttempt,
  resolveEffectiveStatus,
  summarizeWindow,
  userLabelForEffective,
} from "./provider-reliability.js";
import { DEFAULT_RELIABILITY_THRESHOLDS } from "./provider-reliability-config.js";
import {
  createMemoryReliabilityStore,
  recordProviderResult,
} from "./provider-reliability-store.js";
import { reliabilityRedisKey } from "./provider-reliability-config.js";
import {
  getDegradedProbeIntervalMs,
  isProviderProbeCadenceEnabled,
  resolveProviderScrapeIntervalMs,
  shouldEnqueueDegradedProbe,
} from "./provider-probe-cadence.js";
import { SubscriptionPlan } from "@prisma/client";
import { getScrapeIntervalMs } from "../lib/subscription-plan.js";
import { buildSearchIntentFromFilter } from "./search-intent-builder.js";
import {
  defaultAvailabilityMap,
  evaluateCoverage,
  buildFilterCoverageSnapshot,
} from "./coverage-engine.js";
import { toCoverageApiResponse } from "./coverage.service.js";
import { providerHealthLabel } from "./provider-reliability-report.js";
import { redisSetEx } from "../lib/redis.js";

vi.mock("../lib/redis.js", () => ({
  redisGet: vi.fn(),
  redisSetEx: vi.fn(),
}));

const hondaIntent = () =>
  buildSearchIntentFromFilter({
    category: "Vasıta > Otomobil",
    brand: "Honda",
    series: "Civic",
    minYear: 2016,
    maxYear: 2018,
    city: "Tüm Türkiye",
    minDealScore: 50,
    notifyPush: true,
  });

function nTimes<T>(n: number, value: T): T[] {
  return Array.from({ length: n }, () => value);
}

describe("Provider reliability classification", () => {
  it("1. healthy classification", () => {
    const attempts = attemptsFromOutcomes(
      nTimes(10, { outcome: "success", rawCount: 50 }),
    );
    expect(classifyReliability(attempts)).toBe("HEALTHY");
  });

  it("2. repeated empty -> NO_DATA", () => {
    const attempts = attemptsFromOutcomes(
      nTimes(10, { outcome: "empty", rawCount: 0 }),
    );
    expect(classifyReliability(attempts)).toBe("NO_DATA");
  });

  it("3. one empty does not kill healthy", () => {
    const attempts = attemptsFromOutcomes([
      ...nTimes(9, { outcome: "success", rawCount: 50 }),
      { outcome: "empty", rawCount: 0 },
    ]);
    expect(classifyReliability(attempts, "HEALTHY")).toBe("HEALTHY");
  });

  it("4. repeated failures -> FAILING", () => {
    const attempts = attemptsFromOutcomes(
      nTimes(10, { outcome: "failure", rawCount: 0 }),
    );
    expect(classifyReliability(attempts)).toBe("FAILING");
  });

  it("5. insufficient sample -> UNKNOWN", () => {
    const attempts = attemptsFromOutcomes([
      { outcome: "success", rawCount: 50 },
      { outcome: "empty", rawCount: 0 },
    ]);
    expect(classifyReliability(attempts)).toBe("UNKNOWN");
  });

  it("6. recovery hysteresis NO_DATA -> DEGRADED -> HEALTHY", () => {
    let state = applyProviderResult(null, {
      outcome: "empty",
      rawCount: 0,
    }).next;
    for (let i = 0; i < 9; i += 1) {
      state = applyProviderResult(state, {
        outcome: "empty",
        rawCount: 0,
      }).next;
    }
    expect(state.reliability).toBe("NO_DATA");

    state = applyProviderResult(state, {
      outcome: "success",
      rawCount: 12,
    }).next;
    expect(state.reliability).toBe("DEGRADED");

    state = applyProviderResult(state, {
      outcome: "success",
      rawCount: 20,
    }).next;
    expect(state.reliability).toBe("DEGRADED");

    state = applyProviderResult(state, {
      outcome: "success",
      rawCount: 30,
    }).next;
    expect(state.reliability).toBe("HEALTHY");
  });

  it("7. Arabam sample healthy", () => {
    const attempts = attemptsFromOutcomes(
      nTimes(10, { outcome: "success", rawCount: 50 }),
    );
    expect(classifyReliability(attempts)).toBe("HEALTHY");
    const rows = applyReliabilityToCoverage(
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam: "HEALTHY", letgo: "NO_DATA", sahibinden: "FAILING" },
    );
    expect(rows.find((row) => row.platform === "arabam")?.effectiveStatus).toBe(
      "ACTIVE",
    );
  });

  it("8. Letgo sample no_data", () => {
    const attempts = attemptsFromOutcomes(
      nTimes(10, { outcome: "empty", rawCount: 0 }),
    );
    expect(classifyReliability(attempts)).toBe("NO_DATA");
    const rows = applyReliabilityToCoverage(
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam: "HEALTHY", letgo: "NO_DATA", sahibinden: "FAILING" },
    );
    expect(rows.find((row) => row.platform === "letgo")?.effectiveStatus).toBe(
      "NO_DATA",
    );
  });

  it("9. Sahibinden unavailable", () => {
    const rows = applyReliabilityToCoverage(
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam: "HEALTHY", letgo: "NO_DATA", sahibinden: "FAILING" },
    );
    const sahibinden = rows.find((row) => row.platform === "sahibinden");
    expect(sahibinden?.availability).toBe("UNAVAILABLE");
    expect(sahibinden?.effectiveStatus).toBe("UNAVAILABLE");
    expect(sahibinden?.reliability).toBe("FAILING");
  });

  it("10-13. source counts — no_data is not active", () => {
    const rows = applyReliabilityToCoverage(
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam: "HEALTHY", letgo: "NO_DATA", sahibinden: "FAILING" },
    );
    const counts = countEffectiveSources(rows);
    expect(counts.activeSourceCount).toBe(1);
    expect(rows.find((row) => row.platform === "otoplus")?.effectiveStatus).toBe(
      "LIMITED",
    );
    expect(counts.limitedSourceCount).toBe(2);
    expect(counts.unavailableSourceCount).toBe(1);
    expect(counts.statusLabel).toBe("1 kaynak aktif");
    expect(counts.statusLabel).not.toContain("2/3");
  });

  it("14. API DTO includes reliability + effectiveStatus", () => {
    const snapshot = buildFilterCoverageSnapshot(
      "f1",
      hondaIntent(),
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam: "HEALTHY", letgo: "NO_DATA", sahibinden: "FAILING" },
    );
    const dto = toCoverageApiResponse(snapshot);
    expect(dto.activeSourceCount).toBe(1);
    expect(dto.limitedSourceCount).toBe(2);
    expect(dto.monitoredPlatformCount).toBe(1);
    expect(dto.statusLabel).toBe("1 kaynak aktif");
    const letgo = dto.platforms.find((row) => row.platform === "letgo");
    expect(letgo?.capability).toBe("FULL");
    expect(letgo?.reliability).toBe("NO_DATA");
    expect(letgo?.effectiveStatus).toBe("NO_DATA");
    expect(letgo?.userLabel).toBe("Şu anda veri alınamıyor");
  });

  it("15. raw internal reason hidden", () => {
    const snapshot = buildFilterCoverageSnapshot(
      "f1",
      hondaIntent(),
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam: "HEALTHY", letgo: "NO_DATA", sahibinden: "FAILING" },
    );
    const dto = toCoverageApiResponse(snapshot);
    const raw = JSON.stringify(dto);
    expect(raw).not.toMatch(/cloudflare|circuit_open|JWT|REDIS_URL/i);
    const sahibinden = dto.platforms.find((row) => row.platform === "sahibinden");
    expect(sahibinden?.availabilityReason).toBe("temporarily_unavailable");
  });

  it("16. provider status script shape", () => {
    const label = providerHealthLabel("DEGRADED", "NO_DATA");
    expect(label).toBe("no_data");
    expect(providerHealthLabel("UNAVAILABLE", "UNKNOWN")).toBe("unavailable");
    expect(providerHealthLabel("AVAILABLE", "HEALTHY")).toBe("healthy");
  });
});

describe("Redis bounded history", () => {
  it("17. bounded Redis history", async () => {
    const store = createMemoryReliabilityStore();
    for (let i = 0; i < 15; i += 1) {
      await recordProviderResult({
        platform: "letgo",
        outcome: "empty",
        rawCount: 0,
        store,
      });
    }
    const state = await store.get("letgo");
    expect(state?.attempts).toHaveLength(
      DEFAULT_RELIABILITY_THRESHOLDS.windowSize,
    );
  });

  it("18. TTL/fixed-size behavior", async () => {
    expect(reliabilityRedisKey("letgo")).toBe("provider:reliability:letgo");
    await recordProviderResult({
      platform: "arabam",
      outcome: "success",
      rawCount: 50,
    });
    expect(vi.mocked(redisSetEx)).toHaveBeenCalledWith(
      "provider:reliability:arabam",
      expect.any(String),
      DEFAULT_RELIABILITY_THRESHOLDS.ttlSeconds,
    );
    const payload = JSON.parse(
      String(vi.mocked(redisSetEx).mock.calls.at(-1)?.[1]),
    ) as { attempts: unknown[] };
    expect(payload.attempts.length).toBeLessThanOrEqual(
      DEFAULT_RELIABILITY_THRESHOLDS.windowSize,
    );
  });
});

describe("Probe cadence", () => {
  it("19. degraded probe cadence", () => {
    expect(
      resolveProviderScrapeIntervalMs(SubscriptionPlan.VIP, "NO_DATA", {
        PROVIDER_PROBE_CADENCE_ENABLED: "true",
        PROVIDER_DEGRADED_PROBE_MINUTES: "30",
      }),
    ).toBe(30 * 60 * 1000);
  });

  it("20. Arabam normal cadence preserved", () => {
    expect(
      resolveProviderScrapeIntervalMs(SubscriptionPlan.VIP, "HEALTHY", {
        PROVIDER_PROBE_CADENCE_ENABLED: "true",
      }),
    ).toBe(getScrapeIntervalMs(SubscriptionPlan.VIP));
  });

  it("21. Letgo reduced probe cadence", () => {
    const letgo = resolveProviderScrapeIntervalMs(SubscriptionPlan.VIP, "NO_DATA", {
      PROVIDER_PROBE_CADENCE_ENABLED: "true",
      PROVIDER_DEGRADED_PROBE_MINUTES: "30",
    });
    expect(letgo).toBe(getDegradedProbeIntervalMs({
      PROVIDER_DEGRADED_PROBE_MINUTES: "30",
    }));
    expect(letgo).toBeGreaterThan(getScrapeIntervalMs(SubscriptionPlan.VIP));
  });

  it("22. provider recovery restores normal cadence", () => {
    expect(
      resolveProviderScrapeIntervalMs(SubscriptionPlan.VIP, "HEALTHY", {
        PROVIDER_PROBE_CADENCE_ENABLED: "true",
      }),
    ).toBe(5 * 60 * 1000);
  });

  it("probeDue=false until nextProbeAt for NO_DATA", () => {
    const lastAttemptAt = "2026-08-18T18:00:00.000Z";
    const nowMs = Date.parse("2026-08-18T18:10:00.000Z");
    const env = {
      PROVIDER_PROBE_CADENCE_ENABLED: "true",
      PROVIDER_DEGRADED_PROBE_MINUTES: "30",
    };
    const skipped = shouldEnqueueDegradedProbe({
      reliability: "NO_DATA",
      lastAttemptAt,
      nowMs,
      env,
    });
    expect(skipped.due).toBe(false);
    expect(skipped.nextProbeAt).toBe("2026-08-18T18:30:00.000Z");

    const due = shouldEnqueueDegradedProbe({
      reliability: "NO_DATA",
      lastAttemptAt,
      nowMs: Date.parse("2026-08-18T18:30:00.000Z"),
      env,
    });
    expect(due.due).toBe(true);

    const healthy = shouldEnqueueDegradedProbe({
      reliability: "HEALTHY",
      lastAttemptAt,
      nowMs,
      env,
    });
    expect(healthy.due).toBe(true);
    expect(healthy.nextProbeAt).toBeNull();

    const flagOff = shouldEnqueueDegradedProbe({
      reliability: "NO_DATA",
      lastAttemptAt,
      nowMs,
      env: { PROVIDER_PROBE_CADENCE_ENABLED: "false" },
    });
    expect(flagOff.due).toBe(true);
    expect(flagOff.nextProbeAt).toBeNull();
  });

  it("probe flag defaults off in production", () => {
    expect(
      isProviderProbeCadenceEnabled({ NODE_ENV: "production" }),
    ).toBe(false);
    expect(isProviderProbeCadenceEnabled({ NODE_ENV: "test" })).toBe(true);
  });
});

describe("Effective status mapping", () => {
  it("user labels are Turkish and non-technical", () => {
    expect(userLabelForEffective("ACTIVE")).toBe("Aktif");
    expect(userLabelForEffective("NO_DATA")).toBe("Şu anda veri alınamıyor");
    expect(userLabelForEffective("UNAVAILABLE")).toBe(
      "Geçici olarak kullanılamıyor",
    );
  });

  it("UNKNOWN schedulable is not ACTIVE", () => {
    expect(
      resolveEffectiveStatus({
        coverage: "FULL",
        availability: "AVAILABLE",
        schedulable: true,
        reliability: "UNKNOWN",
      }),
    ).toBe("LIMITED");
  });
});

describe("Window metrics", () => {
  it("summarizeWindow tracks lastNonEmptyAt", () => {
    const attempts = attemptsFromOutcomes([
      { outcome: "success", rawCount: 50 },
      { outcome: "empty", rawCount: 0 },
    ]);
    const metrics = summarizeWindow(attempts);
    expect(metrics.attempts).toBe(2);
    expect(metrics.successCount).toBe(1);
    expect(metrics.emptyCount).toBe(1);
    expect(metrics.lastNonEmptyAt).toBe(attempts[0]?.at);
    expect(pushBoundedAttempt(attempts, attempts[0]!, 2)).toHaveLength(2);
  });
});

describe("27. production-like replay", () => {
  it("Honda Civic: Arabam HEALTHY, Letgo NO_DATA, activeSourceCount=1", () => {
    const arabam = classifyReliability(
      attemptsFromOutcomes(nTimes(10, { outcome: "success", rawCount: 50 })),
    );
    const letgo = classifyReliability(
      attemptsFromOutcomes(nTimes(10, { outcome: "empty", rawCount: 0 })),
    );
    const sahibinden = classifyReliability(
      attemptsFromOutcomes(nTimes(10, { outcome: "failure", rawCount: 0 })),
    );
    expect(arabam).toBe("HEALTHY");
    expect(letgo).toBe("NO_DATA");
    expect(sahibinden).toBe("FAILING");

    const snapshot = buildFilterCoverageSnapshot(
      "honda",
      hondaIntent(),
      evaluateCoverage(hondaIntent(), defaultAvailabilityMap()),
      { arabam, letgo, sahibinden },
    );
    expect(snapshot.activeSourceCount).toBe(1);
    expect(snapshot.limitedSourceCount).toBe(2);
    expect(snapshot.unavailableSourceCount).toBe(1);
    expect(snapshot.statusLabel).toBe("1 kaynak aktif");
  });
});
