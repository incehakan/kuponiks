/**
 * Shared Turkish / locale price cleaner for all scraper adapters.
 * Strips TL/₺, thousand separators, and returns a positive number.
 *
 * Examples:
 * - "1.250.000 TL" → 1250000
 * - "920.000₺" → 920000
 * - "1,250,000.50" → 1250000.5
 * - 650000 → 650000
 */
export function cleanPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const stripped = value
    .replace(/TL/gi, "")
    .replace(/₺/g, "")
    .replace(/\u00a0/g, " ")
    .trim();

  const digits = stripped.replace(/[^\d.,]/g, "");
  if (!digits) {
    return null;
  }

  let normalized = digits;
  if (digits.includes(",") && digits.includes(".")) {
    // TR: 1.250.000,50 or US mixed
    normalized = digits.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
    // TR thousands: 1.250.000
    normalized = digits.replace(/\./g, "");
  } else if (digits.includes(",")) {
    const parts = digits.split(",");
    normalized =
      parts.length === 2 && (parts[1]?.length ?? 0) <= 2
        ? `${parts[0]!.replace(/\./g, "")}.${parts[1]}`
        : digits.replace(/,/g, "");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** @deprecated Prefer `cleanPrice` — kept for call-site compatibility. */
export const parsePrice = cleanPrice;
