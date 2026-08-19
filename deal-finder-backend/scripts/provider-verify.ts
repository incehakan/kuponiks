#!/usr/bin/env tsx
/**
 * Read-only provider fetch/parse — no DB, match, MI, or notifications.
 *
 *   npm run provider:verify -- --platform=otoplus --limit=20
 *   npm run provider:verify -- --platform=otoplus --brand=Honda --series=Civic --limit=20
 */
process.env.ENABLE_MOCK_LISTINGS = "false";

import { resolveScraperAdapter } from "../src/scraper/adapters/index.js";
import { runAdapterPipeline } from "../src/scraper/scraper.manager.js";
import { buildPlatformQuery } from "../src/scraper/query/scrape-query-planner.js";
import type { ScrapePlatform } from "../src/queues/scraper.queue.js";
import type { SchedulerFilterInput } from "../src/scraper/query/scrape-query-plan.js";
import { SubscriptionPlan } from "@prisma/client";

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function pct(
  rows: Array<Record<string, unknown>>,
  key: string,
): number {
  if (rows.length === 0) return 0;
  const ok = rows.filter((row) => {
    const value = row[key];
    if (value == null || value === "") return false;
    if (typeof value === "number") return Number.isFinite(value);
    return true;
  }).length;
  return Math.round((ok / rows.length) * 1000) / 10;
}

async function probeHttp(url: string) {
  const started = Date.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "tr-TR,tr;q=0.9",
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const html = buf.toString("utf8");
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return {
    status: res.status,
    finalUrl: res.url,
    bytes: buf.length,
    ms: Date.now() - started,
    title,
    vehicleLd: (html.match(/"@type"\s*:\s*"Vehicle"/g) || []).length,
  };
}

async function main() {
  const platform = (arg("platform", "otoplus") || "otoplus") as ScrapePlatform;
  const limit = Math.min(20, Math.max(1, Number(arg("limit", "20")) || 20));
  const brand = arg("brand") || null;
  const series = arg("series") || null;
  const filter: SchedulerFilterInput = {
    id: "verify",
    isActive: true,
    category: "Vasıta > Otomobil",
    brand,
    series,
    trim: null,
    city: null,
    minYear: arg("minYear") ? Number(arg("minYear")) : null,
    maxYear: arg("maxYear") ? Number(arg("maxYear")) : null,
    keywords: [],
    plan: SubscriptionPlan.VIP,
  };
  const built = buildPlatformQuery(platform, filter).built;
  const scrapeUrl = arg("url") || built.url;
  const http = await probeHttp(scrapeUrl);
  const adapter = resolveScraperAdapter(platform);
  if (!adapter) {
    console.log(JSON.stringify({ platform, error: "no_adapter", http, scrapeUrl }));
    process.exit(2);
  }
  const { rawCount, normalized, error } = await runAdapterPipeline(adapter, {
    query: [brand, series].filter(Boolean).join(" ") || platform,
    category: "Vasıta > Otomobil",
    limit,
    scrapeUrl,
  });
  const sample = normalized.slice(0, limit);
  const years = [
    ...new Set(
      sample
        .map((row) => row.year)
        .filter((year): year is number => typeof year === "number"),
    ),
  ].sort((a, b) => a - b);
  const cities = [
    ...new Set(
      sample
        .map((row) => row.city)
        .filter((city): city is string => Boolean(city)),
    ),
  ];
  const report = {
    platform,
    scrapeUrl,
    http,
    raw: rawCount,
    parsed: sample.length,
    error: error?.message ?? null,
    completeness: {
      externalId: pct(sample as never, "externalId"),
      url: pct(sample as never, "url"),
      price: pct(sample as never, "price"),
      brand: pct(sample as never, "brand"),
      series: pct(sample as never, "series"),
      year: pct(sample as never, "year"),
      mileage: pct(sample as never, "mileage"),
      city: pct(sample as never, "city"),
      image: pct(sample as never, "imageUrl"),
    },
    years,
    cities,
  };
  console.log(JSON.stringify(report, null, 2));
  if (http.status !== 200 || rawCount <= 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
