/**
 * Controlled Arabam-only V2.2 live quality scrape (quiet ingest).
 */
process.env.ENABLE_MOCK_LISTINGS = "false";

import { prisma } from "../src/lib/prisma.js";
import { arabamAdapter } from "../src/scraper/adapters/arabam.adapter.js";
import type { NormalizedListingInput } from "../src/scraper/normalizer.js";
import { runAdapterPipeline } from "../src/scraper/scraper.manager.js";

const FIELDS = [
  "brand",
  "model",
  "year",
  "mileage",
  "city",
  "district",
  "currency",
  "imageUrl",
  "sellerType",
] as const;

async function ingestQuiet(input: NormalizedListingInput) {
  const { scraperService } = await import("../src/scraper/scraper.service.js");
  const result = await scraperService.ingestNormalizedListing(input, {
    quiet: true,
  });
  if (result.status === "created" || result.status === "updated") {
    return { status: result.status, listing: result.listing };
  }
  throw new Error(`quiet ingest failed: ${result.status}`);
}

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

async function main() {
  console.log("[SAFETY] quiet arabam scrape, ENABLE_MOCK_LISTINGS=false");
  const { rawCount, normalized, error } = await runAdapterPipeline(
    arabamAdapter,
    {
      query: "Honda Civic",
      category: "Vasıta > Otomobil",
      limit: 25,
    },
  );
  if (error) console.error(error.message);
  console.log(`raw=${rawCount} normalized=${normalized.length}`);

  const ids: string[] = [];
  let created = 0;
  let updated = 0;
  for (const item of normalized) {
    const r = await ingestQuiet(item);
    ids.push(r.listing.id);
    if (r.status === "created") created += 1;
    else updated += 1;
  }

  // firstSeen probe
  let firstSeenProbe = null;
  if (normalized[0]) {
    const target = normalized[0];
    const before = await prisma.listing.findFirst({
      where: { externalId: target.externalId, platform: "arabam" },
    });
    if (before) {
      await new Promise((r) => setTimeout(r, 40));
      const again = await ingestQuiet(target);
      firstSeenProbe = {
        externalId: target.externalId,
        firstSeenUnchanged:
          again.listing.firstSeenAt.getTime() === before.firstSeenAt.getTime(),
        lastSeenAdvanced:
          again.listing.lastSeenAt.getTime() > before.lastSeenAt.getTime(),
        rowCount: await prisma.listing.count({
          where: { externalId: target.externalId },
        }),
      };
    }
  }

  const rows = await prisma.listing.findMany({
    where: { id: { in: ids } },
    select: {
      externalId: true,
      title: true,
      brand: true,
      model: true,
      year: true,
      mileage: true,
      price: true,
      city: true,
      district: true,
      currency: true,
      imageUrl: true,
      sellerType: true,
      rawDetails: true,
    },
  });

  const n = rows.length;
  const rates: Record<string, string> = {};
  for (const f of FIELDS) {
    const c = rows.filter((r) => filled(r[f])).length;
    rates[f] = `${c}/${n} (${Math.round((c / Math.max(n, 1)) * 100)}%)`;
  }

  const samples = rows.slice(0, 5).map((r) => {
    const raw =
      r.rawDetails && typeof r.rawDetails === "object" && !Array.isArray(r.rawDetails)
        ? (r.rawDetails as Record<string, unknown>)
        : {};
    return {
      externalId: r.externalId,
      title: r.title,
      brand: r.brand,
      model: r.model,
      year: r.year,
      mileage: r.mileage,
      price: r.price,
      city: r.city,
      district: r.district,
      brandSource: raw.brandSource ?? null,
      mileageSource: raw.mileageSource ?? null,
    };
  });

  console.log(
    JSON.stringify(
      {
        created,
        updated,
        processed: n,
        rates,
        firstSeenProbe,
        samples,
        totalListings: await prisma.listing.count(),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
