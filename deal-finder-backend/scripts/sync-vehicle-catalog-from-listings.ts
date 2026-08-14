/**
 * READ listings → UPSERT vehicle catalog. Does not mutate listings/market/notify.
 *
 * Usage: npx tsx scripts/sync-vehicle-catalog-from-listings.ts
 */
import { vehicleCatalogService } from "../src/catalog/vehicle-catalog.service.js";
import { disconnectPrisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const result = await vehicleCatalogService.syncFromExistingListings();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
