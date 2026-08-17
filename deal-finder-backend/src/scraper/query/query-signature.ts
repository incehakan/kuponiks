import { createHash } from "node:crypto";
import type { ScrapePlatform } from "../../queues/scraper.queue.js";

/**
 * Deterministic fold for signature components (Turkish-safe, whitespace-normalized).
 */
export function foldQueryToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable serialization: sorted keys, explicit k=v pairs.
 * Field order in the input object does NOT affect the signature.
 */
export function buildSourceSignature(
  platform: ScrapePlatform,
  sourceCriteria: Record<string, string | number>,
): string {
  const parts: string[] = [platform];
  const keys = Object.keys(sourceCriteria).sort();
  for (const key of keys) {
    const raw = sourceCriteria[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const text = foldQueryToken(String(raw));
    if (!text) {
      continue;
    }
    parts.push(`${key}=${text}`);
  }
  return parts.join("|");
}

export function hashSourceSignature(signature: string): string {
  return createHash("sha1").update(signature).digest("hex").slice(0, 12);
}

/** Turkish slug helper for display/logging (not used for unverified URL paths). */
export function slugifyQueryToken(value: string): string {
  return foldQueryToken(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
