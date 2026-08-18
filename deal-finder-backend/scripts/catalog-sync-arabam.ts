#!/usr/bin/env tsx
/**
 * Sync Vehicle Catalog from Arabam public otomobil taxonomy.
 *
 * Usage:
 *   npm run catalog:sync:arabam -- --dry-run
 *   npm run catalog:sync:arabam -- --brand=Honda
 *   npm run catalog:sync:arabam -- --dry-run --all-brands
 *   npx tsx scripts/catalog-sync-arabam.ts --dry-run --all-brands
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { vehicleCatalogSyncService } from "../src/catalog/vehicle-catalog-sync.service.js";

function parseArgs(argv: string[]) {
  const opts: {
    dryRun: boolean;
    brand?: string;
    limitBrands?: number;
    allBrands: boolean;
  } = { dryRun: false, allBrands: false };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--all-brands") {
      opts.allBrands = true;
    } else {
      const m = /^--([^=]+)=(.*)$/.exec(arg);
      if (!m) continue;
      if (m[1] === "brand") opts.brand = m[2];
      if (m[1] === "limitBrands") opts.limitBrands = Number(m[2]);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const report = await vehicleCatalogSyncService.syncFromArabam({
    dryRun: opts.dryRun,
    ...(opts.brand ? { brand: opts.brand } : {}),
    ...(opts.limitBrands != null ? { limitBrands: opts.limitBrands } : {}),
    controlledOnly: !opts.allBrands && !opts.brand && opts.limitBrands == null,
  });

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
