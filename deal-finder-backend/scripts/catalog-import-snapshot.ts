#!/usr/bin/env tsx
/**
 * Import a versioned Vehicle Catalog snapshot into the database.
 * No external network. Default is --dry-run (no DB write).
 *
 *   npm run catalog:import:snapshot -- --dry-run
 *   npx tsx scripts/catalog-import-snapshot.ts --file=src/catalog/snapshots/arabam-automobile-v1.json --dry-run
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { defaultCatalogSnapshotPath } from "../src/catalog/catalog-snapshot.js";
import { importCatalogSnapshot } from "../src/catalog/catalog-snapshot-importer.js";
import { readCatalogSnapshotFile } from "../src/catalog/catalog-snapshot-write.js";

function parseArgs(argv: string[]): { file: string; dryRun: boolean } {
  let file = defaultCatalogSnapshotPath();
  let dryRun = true;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--write") {
      dryRun = false;
    } else {
      const m = /^--file=(.*)$/.exec(arg);
      if (m) {
        file = m[1]!;
      }
    }
  }
  return { file, dryRun };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshot = await readCatalogSnapshotFile(opts.file);
  const report = await importCatalogSnapshot(snapshot, { dryRun: opts.dryRun });
  console.log(JSON.stringify({ file: opts.file, ...report }, null, 2));
  if (report.conflicts.length > 0 && report.writeSkipped && !opts.dryRun) {
    process.exitCode = 3;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
