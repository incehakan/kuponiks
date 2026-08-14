/**
 * Idempotent Vehicle Catalog seed. Safe to re-run.
 *
 * Usage: npx tsx scripts/seed-vehicle-catalog.ts
 */
import { vehicleCatalogService } from "../src/catalog/vehicle-catalog.service.js";
import { disconnectPrisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const result = await vehicleCatalogService.seedCatalog();
  console.log(
    JSON.stringify(
      {
        ok: true,
        brandsCreated: result.brandsCreated,
        seriesCreated: result.seriesCreated,
        note: "existing rows skipped (idempotent)",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
