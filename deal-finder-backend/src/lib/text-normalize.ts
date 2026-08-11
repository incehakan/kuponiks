/**
 * Shared Turkish-aware text normalization for matching and comparisons.
 */

/** Turkish-aware trim + lowercase for comparable strings. */
export function normalizeMatchText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}
