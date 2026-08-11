/**
 * Controlled V2.1 live data-quality scrape (local, low volume).
 * ENABLE_MOCK_LISTINGS forced false.
 * Persists via quiet ScraperService (no listing-match / notification enqueue).
 */
process.env.ENABLE_MOCK_LISTINGS = "false";

import { prisma } from "../src/lib/prisma.js";
import { resolveScraperAdapter } from "../src/scraper/adapters/index.js";
import type { NormalizedListingInput } from "../src/scraper/normalizer.js";
import { runAdapterPipeline } from "../src/scraper/scraper.manager.js";
import type { ScrapePlatform } from "../src/queues/scraper.queue.js";

const FIELDS = [
  "category",
  "subcategory",
  "brand",
  "model",
  "variant",
  "year",
  "mileage",
  "fuelType",
  "transmission",
  "city",
  "district",
  "sellerType",
  "description",
  "currency",
  "publishedAt",
  "imageUrl",
] as const;

type Field = (typeof FIELDS)[number];

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return true;
}

function pct(filled: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((filled / total) * 100)}%`;
}

async function platformCounts(): Promise<Record<string, number>> {
  const rows = await prisma.listing.groupBy({
    by: ["platform"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const row of rows) out[row.platform] = row._count._all;
  return out;
}

async function fillRates(where: {
  platform?: string;
  id?: { in: string[] };
}) {
  const listings = await prisma.listing.findMany({
    where,
    select: {
      id: true,
      category: true,
      subcategory: true,
      brand: true,
      model: true,
      variant: true,
      year: true,
      mileage: true,
      fuelType: true,
      transmission: true,
      city: true,
      district: true,
      sellerType: true,
      description: true,
      currency: true,
      publishedAt: true,
      imageUrl: true,
    },
  });
  const rates = {} as Record<Field, { filled: number; pct: string }>;
  for (const field of FIELDS) {
    const filled = listings.filter((l) => isFilled(l[field])).length;
    rates[field] = { filled, pct: pct(filled, listings.length) };
  }
  return { total: listings.length, rates };
}

function printRates(
  label: string,
  total: number,
  rates: Record<Field, { filled: number; pct: string }>,
): void {
  console.log(`\n=== ${label} (n=${total}) ===`);
  if (total === 0) {
    console.log("(no rows)");
    return;
  }
  for (const field of FIELDS) {
    const r = rates[field];
    console.log(`  ${field}=${r.filled}/${total} (${r.pct})`);
  }
}

/**
 * Same create/update semantics as ScraperService, without notification enqueue.
 */
async function ingestQuiet(input: NormalizedListingInput): Promise<{
  status: "created" | "updated" | "skipped";
  listingId?: string;
  dealScore?: number;
  reason?: string;
}> {
  try {
    const { scraperService } = await import("../src/scraper/scraper.service.js");
    const result = await scraperService.ingestNormalizedListing(input, {
      quiet: true,
    });
    if (result.status === "created" || result.status === "updated") {
      return {
        status: result.status,
        listingId: result.listing.id,
        dealScore: result.dealScore,
      };
    }
    return { status: "skipped", reason: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "skipped", reason: message };
  }
}

async function main(): Promise<void> {
  console.log("[ENV] ENABLE_MOCK_LISTINGS forced=false");
  console.log(
    "[ENV] NODE_ENV=",
    process.env.NODE_ENV ?? "development(default)",
  );
  console.log("[SAFETY] Quiet ingest — listing-match/notification enqueue YOK");

  const PLATFORMS: Array<{
    platform: ScrapePlatform;
    query?: string;
    category?: string;
    city?: string;
    limit: number;
  }> = [
    {
      platform: "arabam",
      query: "Honda Civic",
      category: "Vasıta > Otomobil",
      city: "İzmir",
      limit: 20,
    },
    {
      platform: "hepsiemlak",
      query: "satılık",
      category: "Emlak",
      city: "İzmir",
      limit: 20,
    },
    {
      platform: "letgo",
      query: "iPhone",
      category: "Elektronik",
      city: "İzmir",
      limit: 15,
    },
    {
      platform: "sahibinden",
      query: "Honda Civic",
      category: "Vasıta > Otomobil",
      city: "İzmir",
      limit: 15,
    },
  ];

  const beforeCounts = await platformCounts();
  const beforeTotal = await prisma.listing.count();
  console.log("\n=== PRE-TEST COUNTS ===");
  console.log(JSON.stringify({ beforeTotal, beforeCounts }, null, 2));

  const beforeAll = await fillRates({});
  printRates("PRE-TEST ALL listings", beforeAll.total, beforeAll.rates);

  const runResults: Record<string, unknown> = {};
  let firstSeenProbe: Record<string, unknown> | null = null;

  for (const cfg of PLATFORMS) {
    console.log(
      `\n########## SCRAPE ${cfg.platform} limit=${cfg.limit} ##########`,
    );
    const adapter = resolveScraperAdapter(cfg.platform);
    if (!adapter) {
      runResults[cfg.platform] = { ok: false, error: "adapter missing" };
      continue;
    }

    try {
      const { rawCount, normalized, error } = await runAdapterPipeline(
        adapter,
        {
          limit: cfg.limit,
          ...(cfg.query ? { query: cfg.query } : {}),
          ...(cfg.category ? { category: cfg.category } : {}),
          ...(cfg.city ? { city: cfg.city } : {}),
        },
      );

      if (error) {
        console.error(`[${cfg.platform}] pipeline error: ${error.message}`);
      }

      if (rawCount === 0 && normalized.length === 0) {
        const accessNote =
          cfg.platform === "sahibinden"
            ? "erişim yok / veri kalitesi ölçülemedi (boş sonuç — Cloudflare/login olabilir)"
            : "boş sonuç";
        runResults[cfg.platform] = {
          ok: false,
          error: error?.message ?? "no listings returned",
          rawCount,
          normalized: 0,
          created: 0,
          updated: 0,
          accessNote,
        };
        console.warn(`[${cfg.platform}] ${accessNote}`);
        continue;
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const processedIds: string[] = [];

      for (const item of normalized) {
        const result = await ingestQuiet(item);
        if (result.status === "created" && result.listingId) {
          created += 1;
          processedIds.push(result.listingId);
        } else if (result.status === "updated" && result.listingId) {
          updated += 1;
          processedIds.push(result.listingId);
        } else {
          skipped += 1;
        }
      }

      const samplePrices = normalized.map((n) => n.price).slice(0, 12);
      const kelepirHits = samplePrices.filter((p) => p === 920_000).length;
      const touched = await fillRates({ id: { in: processedIds } });
      printRates(
        `${cfg.platform} NEW+UPDATED this run`,
        touched.total,
        touched.rates,
      );

      runResults[cfg.platform] = {
        ok: true,
        rawCount,
        normalized: normalized.length,
        created,
        updated,
        skipped,
        processedCount: processedIds.length,
        samplePrices,
        kelepirPriceHits: kelepirHits,
        rates: touched.rates,
        accessNote:
          kelepirHits > 0
            ? `UYARI: ${kelepirHits} örnekte 920000 KELEPIR fiyatı`
            : undefined,
      };

      if (
        cfg.platform === "arabam" &&
        normalized.length > 0 &&
        !firstSeenProbe
      ) {
        const target = normalized[0]!;
        const existing = await prisma.listing.findFirst({
          where: {
            platform: target.platform,
            externalId: target.externalId,
          },
        });
        if (existing) {
          const beforeFirst = existing.firstSeenAt;
          const beforeLast = existing.lastSeenAt;
          await new Promise((r) => setTimeout(r, 40));
          const again = await ingestQuiet(target);
          if (again.status === "updated" && again.listingId) {
            const after = await prisma.listing.findUniqueOrThrow({
              where: { id: again.listingId },
            });
            const rowCount = await prisma.listing.count({
              where: { externalId: target.externalId },
            });
            firstSeenProbe = {
              externalId: target.externalId,
              firstSeenUnchanged:
                after.firstSeenAt.getTime() === beforeFirst.getTime(),
              lastSeenAdvanced:
                after.lastSeenAt.getTime() > beforeLast.getTime(),
              firstSeenAtBefore: beforeFirst.toISOString(),
              lastSeenAtBefore: beforeLast.toISOString(),
              firstSeenAtAfter: after.firstSeenAt.toISOString(),
              lastSeenAtAfter: after.lastSeenAt.toISOString(),
              rowCount,
            };
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${cfg.platform}] FATAL: ${message}`);
      runResults[cfg.platform] = {
        ok: false,
        error: message,
        accessNote: /cloudflare|captcha|login|403|timeout/i.test(message)
          ? "erişim yok / veri kalitesi ölçülemedi"
          : message,
      };
    }
  }

  const afterCounts = await platformCounts();
  const afterTotal = await prisma.listing.count();
  const afterAll = await fillRates({});
  printRates("POST-TEST ALL listings", afterAll.total, afterAll.rates);

  console.log("\n========== SUMMARY JSON ==========");
  console.log(
    JSON.stringify(
      {
        beforeTotal,
        afterTotal,
        delta: afterTotal - beforeTotal,
        beforeCounts,
        afterCounts,
        notificationsEnqueued: 0,
        quietIngest: true,
        firstSeenProbe,
        runResults,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
