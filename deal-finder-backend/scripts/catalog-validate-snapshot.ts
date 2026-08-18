import { readCatalogSnapshotFile } from "../src/catalog/catalog-snapshot-write.js";
import { validateCatalogSnapshot } from "../src/catalog/catalog-snapshot-validator.js";
import { computeCatalogHash, defaultCatalogSnapshotPath } from "../src/catalog/catalog-snapshot.js";

async function main(): Promise<void> {
  const snapshot = await readCatalogSnapshotFile(defaultCatalogSnapshotPath());
  const validation = validateCatalogSnapshot(snapshot);
  console.log(
    JSON.stringify(
      {
        ok: validation.ok,
        errors: validation.errors,
        version: snapshot.version,
        catalogHash: snapshot.catalogHash,
        recomputed: computeCatalogHash(snapshot),
        brands: snapshot.brands.length,
        series: snapshot.brands.reduce((n, b) => n + b.series.length, 0),
      },
      null,
      2,
    ),
  );
  if (!validation.ok) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
