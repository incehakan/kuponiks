/**
 * Shared numeric parsers for Turkish marketplace listing text.
 * Invalid / ambiguous values return null — never NaN or Infinity.
 */

const INVALID_NUMERIC_HINT =
  /fiyat\s*sorun|takasa?\s*a[cç][iı]k|bilinmiyor|sorunuz|anla[sş][iı]l[iı]r|görüşülür|^\s*[-–—.]+\s*$/i;

function hasInvalidHint(value: string): boolean {
  return INVALID_NUMERIC_HINT.test(value);
}

/**
 * Parses price strings such as "1.850.000 TL" / "1,850,000 TL".
 * Rejects non-price phrases.
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (!trimmed || hasInvalidHint(trimmed)) {
    return null;
  }

  const stripped = trimmed
    .replace(/TL/gi, "")
    .replace(/₺/g, "")
    .replace(/USD|EUR|\$|€/gi, "")
    .trim();

  const digits = stripped.replace(/[^\d.,]/g, "");
  if (!digits || !/\d/.test(digits)) {
    return null;
  }

  let normalized = digits;
  if (digits.includes(",") && digits.includes(".")) {
    normalized = digits.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(digits)) {
    normalized = digits.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(digits)) {
    normalized = digits.replace(/,/g, "");
  } else if (digits.includes(",")) {
    const parts = digits.split(",");
    normalized =
      parts.length === 2 && (parts[1]?.length ?? 0) <= 2
        ? `${parts[0]!.replace(/\./g, "")}.${parts[1]}`
        : digits.replace(/,/g, "");
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * Parses mileage strings such as "98.500 km" / "98 500 KM".
 */
export function parseMileage(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return Math.round(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (!trimmed || hasInvalidHint(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

/**
 * Parses a vehicle year from an explicit year field (not from free-form titles).
 */
export function parseYear(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const year = Math.round(value);
    return year >= 1950 && year <= 2100 ? year : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (!trimmed || hasInvalidHint(trimmed)) {
    return null;
  }

  // Accept plain "2021" or "2021 Model" when the year field itself carries it.
  const match = trimmed.match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[0]!, 10);
  return year >= 1950 && year <= 2100 ? year : null;
}
