/**
 * Optional numeric UserFilter fields.
 *
 * Defense layers:
 * 1) Route schema must use type:["integer","null"] (NOT integer-first anyOf).
 *    anyOf+[coerceTypes] coerces JSON null → 0 (Number(null)===0).
 * 2) preValidation: "" / whitespace → null before schema validation.
 * 3) Service toNullableOptionalNumber: empty → null; explicit 0 stays 0.
 */

export const OPTIONAL_NUMERIC_FILTER_KEYS = [
  "minYear",
  "maxYear",
  "minMileage",
  "maxMileage",
  "minPrice",
  "maxPrice",
] as const;

export type OptionalNumericFilterKey =
  (typeof OPTIONAL_NUMERIC_FILTER_KEYS)[number];

/**
 * In-place: "" / whitespace → null, before schema coercion.
 */
export function normalizeEmptyNumericFilterFields(body: unknown): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return;
  }
  const record = body as Record<string, unknown>;
  for (const key of OPTIONAL_NUMERIC_FILTER_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim() === "") {
      record[key] = null;
    }
  }
}

/**
 * Parse optional numeric filter input.
 * "" / "   " → undefined
 * "0" / 0 → 0
 * invalid → NaN
 */
export function parseOptionalNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : Number.NaN;
  }
  if (typeof raw !== "string") {
    return Number.NaN;
  }
  const trimmed = raw.trim().replace(/\./g, "").replace(/,/g, "");
  if (!trimmed) {
    return undefined;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Persist helper: empty → null, keep 0, reject NaN via caller. */
export function toNullableOptionalNumber(
  raw: unknown,
): number | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  const parsed = parseOptionalNumber(raw);
  if (parsed === undefined) {
    return null;
  }
  return parsed;
}

export function hasNumericFilterValue(
  value: number | null | undefined,
): boolean {
  return value != null && Number.isFinite(value);
}
