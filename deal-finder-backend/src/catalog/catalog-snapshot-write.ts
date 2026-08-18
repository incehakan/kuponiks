import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogQualityGate } from "./catalog-quality-gate.js";
import type { CatalogSnapshot } from "./catalog-snapshot.js";
import { serializeCatalogSnapshot } from "./catalog-snapshot.js";
import { validateCatalogSnapshot } from "./catalog-snapshot-validator.js";

export async function writeSnapshotIfPassing(input: {
  outputPath: string;
  snapshot: CatalogSnapshot;
  qualityGate: CatalogQualityGate;
}): Promise<{ written: boolean; reason?: string }> {
  if (!input.qualityGate.pass) {
    return { written: false, reason: input.qualityGate.reasons.join(",") || "qualityGate.fail" };
  }
  const validation = validateCatalogSnapshot(input.snapshot);
  if (!validation.ok) {
    return { written: false, reason: validation.errors.join(",") };
  }

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const tmpPath = `${input.outputPath}.tmp`;
  await writeFile(tmpPath, serializeCatalogSnapshot(input.snapshot), "utf8");
  await rename(tmpPath, input.outputPath);
  return { written: true };
}

export async function readCatalogSnapshotFile(filePath: string): Promise<CatalogSnapshot> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as CatalogSnapshot;
}
