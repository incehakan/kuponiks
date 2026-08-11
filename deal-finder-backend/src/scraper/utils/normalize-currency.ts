/**
 * Canonical currency codes without conversion.
 */

export type CanonicalCurrency = "TRY" | "USD" | "EUR";

/**
 * Maps TL/₺/TRY/$/USD/€/EUR style tokens to TRY | USD | EUR.
 * Unknown → null (caller may default).
 */
export function normalizeCurrency(value: unknown): CanonicalCurrency | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const raw = String(value).replace(/\u00a0/g, " ").trim();
  if (!raw) {
    return null;
  }

  const upper = raw.toLocaleUpperCase("tr-TR");

  if (
    upper === "TRY" ||
    upper === "TL" ||
    upper === "TRL" ||
    raw.includes("₺") ||
    /\bTL\b/i.test(raw)
  ) {
    return "TRY";
  }

  if (upper === "USD" || upper === "US$" || raw.includes("$") || /\bDOLAR\b/i.test(raw)) {
    return "USD";
  }

  if (upper === "EUR" || raw.includes("€") || /\bEURO\b/i.test(raw)) {
    return "EUR";
  }

  return null;
}

/**
 * Infers currency from a price display string when an explicit currency field is absent.
 */
export function inferCurrencyFromPriceText(
  priceText: string | null | undefined,
): CanonicalCurrency | null {
  if (!priceText?.trim()) {
    return null;
  }
  return normalizeCurrency(priceText);
}
