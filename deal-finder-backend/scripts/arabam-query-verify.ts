#!/usr/bin/env tsx
/**
 * Read-only Arabam query verification — no DB, MI, match, or notifications.
 *
 * Usage:
 *   npm run arabam:query-verify -- --brand=Honda --series=Civic
 *   npx tsx scripts/arabam-query-verify.ts --brand=Honda --series=Civic --city=Kayseri --minYear=2016 --maxYear=2018
 */
import puppeteer from "puppeteer";
import { SubscriptionPlan } from "@prisma/client";
import { ARABAM_EXTRACT_SCRIPT } from "../src/scraper/parsers/arabam.parser.js";
import { buildArabamQuery } from "../src/scraper/query/planners/arabam-query-builder.js";
import {
  planFromFilter,
  type SchedulerFilterInput,
} from "../src/scraper/query/scrape-query-plan.js";
import { cleanPrice } from "../src/scraper/utils/clean-price.js";

interface CliOptions {
  brand?: string;
  series?: string;
  city?: string;
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  take: number;
}

interface ExtractedListing {
  year: number | null;
  price: number | null;
  city: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { take: 20 };
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, raw] = m;
    switch (key) {
      case "brand":
        opts.brand = raw;
        break;
      case "series":
        opts.series = raw;
        break;
      case "city":
        opts.city = raw;
        break;
      case "minYear":
        opts.minYear = Number(raw);
        break;
      case "maxYear":
        opts.maxYear = Number(raw);
        break;
      case "minPrice":
        opts.minPrice = Number(raw);
        break;
      case "maxPrice":
        opts.maxPrice = Number(raw);
        break;
      case "take":
        opts.take = Number(raw);
        break;
      default:
        break;
    }
  }
  return opts;
}

function foldCity(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

async function fetchListings(url: string): Promise<{
  status: number;
  listings: ExtractedListing[];
}> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await new Promise((r) => setTimeout(r, 2_000));
    const raw = await page.evaluate(ARABAM_EXTRACT_SCRIPT);
    const rows = Array.isArray(raw) ? raw : [];
    const listings: ExtractedListing[] = rows.map((row) => {
      const item = row as {
        year?: string | null;
        priceText?: string | null;
        city?: string | null;
      };
      const yearParsed = item.year ? Number(item.year) : null;
      return {
        year: Number.isFinite(yearParsed) ? yearParsed : null,
        price: cleanPrice(item.priceText ?? null),
        city: item.city ?? null,
      };
    });
    return { status: response?.status() ?? 0, listings };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cli = parseArgs(argv);
  const filter: SchedulerFilterInput = {
    id: "verify-script",
    isActive: true,
    category: "Vasıta > Otomobil",
    brand: cli.brand ?? null,
    series: cli.series ?? null,
    trim: null,
    city: cli.city ?? "Tüm Türkiye",
    minYear: cli.minYear ?? null,
    maxYear: cli.maxYear ?? null,
    minPrice: cli.minPrice ?? null,
    maxPrice: cli.maxPrice ?? null,
    keywords: [],
    plan: SubscriptionPlan.FREE,
  };

  const plan = planFromFilter("arabam", filter);
  const built = buildArabamQuery(plan);

  console.log("URL:", built.url);
  console.log("applied:", built.appliedCriteria.join(", ") || "-");
  console.log("deferred:", built.deferredCriteria.join(", ") || "-");
  if (built.sourceDebug) {
    console.log("taxonomyPath:", built.sourceDebug.taxonomyPath ?? "-");
    console.log("queryParams:", JSON.stringify(built.sourceDebug.queryParams));
  }

  let listings: ExtractedListing[] = [];
  try {
    const fetched = await fetchListings(built.url);
    listings = fetched.listings;
    console.log("httpStatus:", fetched.status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("FETCH_FAIL:", msg);
    process.exitCode = 1;
    return;
  }

  console.log("rawCount:", listings.length);

  const years = listings.map((l) => l.year).filter((y): y is number => y != null);
  const prices = listings.map((l) => l.price).filter((p): p is number => p != null);
  const cities = [...new Set(listings.map((l) => l.city).filter(Boolean))];

  const yearMin = years.length ? Math.min(...years) : null;
  const yearMax = years.length ? Math.max(...years) : null;
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;

  console.log("yearObserved:", yearMin ?? "-", "–", yearMax ?? "-");
  console.log("priceObserved:", priceMin ?? "-", "–", priceMax ?? "-");
  console.log("citiesObserved:", cities.join(", ") || "-");

  const failures: string[] = [];

  if ((cli.minYear != null || cli.maxYear != null) && years.length === 0) {
    failures.push("year filter active but no years parsed");
  }
  if (cli.minYear != null && years.some((y) => y < cli.minYear!)) {
    failures.push(`year below minYear (${cli.minYear})`);
  }
  if (cli.maxYear != null && years.some((y) => y > cli.maxYear!)) {
    failures.push(`year above maxYear (${cli.maxYear})`);
  }
  if ((cli.minPrice != null || cli.maxPrice != null) && prices.length === 0) {
    failures.push("price filter active but no prices parsed");
  }
  if (cli.minPrice != null && prices.some((p) => p < cli.minPrice!)) {
    failures.push(`price below minPrice (${cli.minPrice})`);
  }
  if (cli.maxPrice != null && prices.some((p) => p > cli.maxPrice!)) {
    failures.push(`price above maxPrice (${cli.maxPrice})`);
  }
  if (
    cli.city &&
    cli.city.trim().toLocaleLowerCase("tr-TR") !== "tüm türkiye" &&
    cli.city.trim().toLocaleLowerCase("tr-TR") !== "tum turkiye"
  ) {
    const expected = foldCity(cli.city);
    const mismatched = listings.filter(
      (l) => l.city && foldCity(l.city) !== expected,
    );
    if (mismatched.length > 0) {
      failures.push(`city mismatch (${mismatched.length} rows)`);
    }
  }

  if (listings.length === 0) {
    failures.push("no listing rows parsed");
  }

  const status = failures.length === 0 ? "PASS" : "FAIL";
  console.log("validation:", status);
  if (failures.length) {
    console.log("failures:", failures.join("; "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
