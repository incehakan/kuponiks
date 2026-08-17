import { createHash } from "node:crypto";
import { SubscriptionPlan } from "@prisma/client";
import { getScrapeIntervalMs } from "../../lib/subscription-plan.js";
import type { ScrapePlatform } from "../../queues/scraper.queue.js";
import { buildPlatformQuery } from "../query/scrape-query-planner.js";
import {
  brandSeriesQueryText,
  normalizeSchedulerCity,
  type SchedulerFilterInput,
} from "../query/scrape-query-plan.js";
import {
  buildSourceSignature,
  foldQueryToken,
  hashSourceSignature,
} from "../query/query-signature.js";

export type { SchedulerFilterInput };
export { normalizeSchedulerCity, brandSeriesQueryText as scrapeQueryText };

const ALL_PLATFORMS: readonly ScrapePlatform[] = [
  "sahibinden",
  "arabam",
  "letgo",
  "hepsiemlak",
];

export interface CanonicalQueryGroup {
  /** Deterministic source signature (platform + SOURCE criteria). */
  key: string;
  signature: string;
  queryHash: string;
  platform: ScrapePlatform;
  query: string;
  category: string;
  city?: string;
  scrapeUrl: string;
  appliedCriteria: string[];
  deferredCriteria: string[];
  filterIds: string[];
  bestPlan: SubscriptionPlan;
  intervalMs: number;
  priority: number;
}

export function platformsForCategory(category: string): ScrapePlatform[] {
  const c = category.toLocaleLowerCase("tr-TR");

  if (
    c.includes("emlak") ||
    c.includes("konut") ||
    c.includes("daire") ||
    c.includes("arsa") ||
    c.includes("işyeri") ||
    c.includes("isyeri")
  ) {
    return ["hepsiemlak", "sahibinden"];
  }

  if (
    c.includes("vasıta") ||
    c.includes("vasita") ||
    c.includes("otomobil") ||
    c.includes("motosiklet") ||
    c.includes("araba") ||
    c.includes("suv") ||
    c.includes("ticari")
  ) {
    return ["arabam", "sahibinden", "letgo"];
  }

  if (
    c.includes("elektronik") ||
    c.includes("telefon") ||
    c.includes("bilgisayar") ||
    c.includes("tablet")
  ) {
    return ["sahibinden", "letgo"];
  }

  return [...ALL_PLATFORMS];
}

/** @deprecated Legacy key format — prefer buildSourceSignature for grouping. */
export function buildCanonicalKey(input: {
  platform: ScrapePlatform;
  category: string;
  query: string;
  city?: string;
}): string {
  const parts = [
    input.platform,
    foldQueryToken(input.category),
    foldQueryToken(input.query),
    foldQueryToken(input.city ?? "all"),
  ];
  return parts.join(":");
}

/** @deprecated Legacy hash — prefer hashSourceSignature. */
export function hashCanonicalKey(key: string): string {
  return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

export function planPriority(plan: SubscriptionPlan): number {
  if (plan === SubscriptionPlan.VIP) return 1;
  if (plan === SubscriptionPlan.PRO) return 5;
  return 10;
}

function betterPlan(
  a: SubscriptionPlan,
  b: SubscriptionPlan,
): SubscriptionPlan {
  return planPriority(a) < planPriority(b) ? a : b;
}

/**
 * Groups active filters into one scrape job per platform × SOURCE signature.
 * Matcher-only / notify fields never affect grouping.
 */
export function groupActiveFilters(
  filters: SchedulerFilterInput[],
): CanonicalQueryGroup[] {
  const groups = new Map<string, CanonicalQueryGroup>();

  for (const filter of filters) {
    if (!filter.isActive) {
      continue;
    }
    const displayQuery = brandSeriesQueryText(filter);
    if (!displayQuery) {
      continue;
    }
    const platforms = platformsForCategory(filter.category);

    for (const platform of platforms) {
      const { plan, built } = buildPlatformQuery(platform, filter);
      const signature = buildSourceSignature(platform, plan.sourceCriteria);
      const existing = groups.get(signature);
      if (existing) {
        if (!existing.filterIds.includes(filter.id)) {
          existing.filterIds.push(filter.id);
        }
        existing.bestPlan = betterPlan(existing.bestPlan, filter.plan);
        existing.intervalMs = getScrapeIntervalMs(existing.bestPlan);
        existing.priority = planPriority(existing.bestPlan);
        continue;
      }
      groups.set(signature, {
        key: signature,
        signature,
        queryHash: hashSourceSignature(signature),
        platform,
        query: built.displayQuery,
        category: filter.category,
        ...(built.city ? { city: built.city } : {}),
        scrapeUrl: built.url,
        appliedCriteria: built.appliedCriteria,
        deferredCriteria: built.deferredCriteria,
        filterIds: [filter.id],
        bestPlan: filter.plan,
        intervalMs: getScrapeIntervalMs(filter.plan),
        priority: planPriority(filter.plan),
      });
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.priority - b.priority || a.key.localeCompare(b.key),
  );
}

export function timeBucket(nowMs: number, intervalMs: number): number {
  return Math.floor(nowMs / intervalMs);
}

export function buildScrapeJobId(input: {
  platform: ScrapePlatform;
  queryHash: string;
  intervalMs: number;
  nowMs?: number;
}): string {
  const bucket = timeBucket(input.nowMs ?? Date.now(), input.intervalMs);
  return `scrape-${input.platform}-${input.queryHash}-${bucket}`;
}
