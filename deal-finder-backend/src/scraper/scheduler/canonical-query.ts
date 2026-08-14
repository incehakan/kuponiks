import { createHash } from "node:crypto";
import { SubscriptionPlan } from "@prisma/client";
import { getScrapeIntervalMs } from "../../lib/subscription-plan.js";
import type { ScrapePlatform } from "../../queues/scraper.queue.js";

const ALL_PLATFORMS: readonly ScrapePlatform[] = [
  "sahibinden",
  "arabam",
  "letgo",
  "hepsiemlak",
];

export interface SchedulerFilterInput {
  id: string;
  isActive: boolean;
  category: string;
  brand: string | null;
  series: string | null;
  trim: string | null;
  city: string | null;
  keywords: string[];
  plan: SubscriptionPlan;
}

export interface CanonicalQueryGroup {
  key: string;
  queryHash: string;
  platform: ScrapePlatform;
  query: string;
  category: string;
  city?: string;
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

export function normalizeSchedulerCity(
  city: string | null | undefined,
): string | undefined {
  const value = city?.trim();
  if (!value) {
    return undefined;
  }
  const lower = value.toLocaleLowerCase("tr-TR");
  if (
    lower === "all" ||
    lower === "tüm türkiye" ||
    lower === "tum turkiye" ||
    lower === "türkiye" ||
    lower === "turkiye"
  ) {
    return undefined;
  }
  return value;
}

export function scrapeQueryText(filter: {
  category: string;
  brand: string | null;
  series: string | null;
  keywords: string[];
}): string {
  const brandSeries = [filter.brand, filter.series]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ")
    .trim();
  if (brandSeries) {
    return brandSeries;
  }
  const keyword = filter.keywords
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  if (keyword) {
    return keyword;
  }
  return filter.category.trim();
}

function fold(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

export function buildCanonicalKey(input: {
  platform: ScrapePlatform;
  category: string;
  query: string;
  city?: string;
}): string {
  const parts = [
    input.platform,
    fold(input.category),
    fold(input.query),
    fold(input.city ?? "all"),
  ];
  return parts.join(":");
}

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
 * Groups active filters into one scrape job per platform × query × city.
 * Inactive filters are ignored. Adapter-unsupported ranges are matcher-only.
 */
export function groupActiveFilters(
  filters: SchedulerFilterInput[],
): CanonicalQueryGroup[] {
  const groups = new Map<string, CanonicalQueryGroup>();

  for (const filter of filters) {
    if (!filter.isActive) {
      continue;
    }
    const query = scrapeQueryText(filter);
    if (!query) {
      continue;
    }
    const city = normalizeSchedulerCity(filter.city);
    const platforms = platformsForCategory(filter.category);

    for (const platform of platforms) {
      const key = buildCanonicalKey({
        platform,
        category: filter.category,
        query,
        ...(city ? { city } : {}),
      });
      const existing = groups.get(key);
      if (existing) {
        if (!existing.filterIds.includes(filter.id)) {
          existing.filterIds.push(filter.id);
        }
        existing.bestPlan = betterPlan(existing.bestPlan, filter.plan);
        existing.intervalMs = getScrapeIntervalMs(existing.bestPlan);
        existing.priority = planPriority(existing.bestPlan);
        continue;
      }
      groups.set(key, {
        key,
        queryHash: hashCanonicalKey(key),
        platform,
        query,
        category: filter.category,
        ...(city ? { city } : {}),
        filterIds: [filter.id],
        bestPlan: filter.plan,
        intervalMs: getScrapeIntervalMs(filter.plan),
        priority: planPriority(filter.plan),
      });
    }
  }

  return [...groups.values()].sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
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
