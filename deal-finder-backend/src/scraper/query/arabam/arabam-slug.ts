import { foldQueryToken } from "../query-signature.js";

/** Known brand label → verified Arabam path slug overrides. */
const BRAND_SLUG_OVERRIDES: Record<string, string> = {
  "mercedes-benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  "mercedes - benz": "mercedes-benz",
  skoda: "skoda",
  "citroen": "citroen",
  "citroën": "citroen",
  "land rover": "land-rover",
  "alfa romeo": "alfa-romeo",
};

/**
 * Deterministic Arabam taxonomy slug (path segment).
 * Verified against live arabam.com filter navigation (Aug 2026).
 */
export function slugifyArabamToken(value: string): string {
  const folded = foldQueryToken(value)
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!folded) {
    return "";
  }

  const override = BRAND_SLUG_OVERRIDES[folded];
  if (override) {
    return override;
  }

  return folded
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Series slug for combined model path segment.
 * Strips trailing "serisi" token (Arabam uses `mercedes-benz-c` not `c-serisi`).
 */
export function slugifyArabamSeries(value: string): string {
  let slug = slugifyArabamToken(value);
  if (/^\d+-serisi$/.test(slug)) {
    return slug;
  }
  slug = slug.replace(/-serisi$/u, "");
  return slug.replace(/^-+|-+$/g, "");
}

export function slugifyArabamCity(value: string): string {
  return slugifyArabamToken(value);
}

export function slugifyArabamBrand(value: string): string {
  return slugifyArabamToken(value);
}
