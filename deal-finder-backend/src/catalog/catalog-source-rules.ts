import { normalizeMatchText } from "../lib/text-normalize.js";

const INVALID_EXACT = new Set([
  "-",
  "--",
  "diğer",
  "diger",
  "bilinmiyor",
  "bilinmeyen",
  "seçiniz",
  "seciniz",
  "null",
  "undefined",
  "n/a",
  "na",
  "yok",
  "other",
  "unknown",
  "seç",
  "sec",
]);

/** Reject obvious garbage catalog/source values. */
export function isInvalidCatalogValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return true;
  }
  const norm = normalizeMatchText(trimmed);
  if (!norm) {
    return true;
  }
  return INVALID_EXACT.has(norm);
}

/** Verified Arabam brand sidebar/title label → canonical display. */
export const ARABAM_BRAND_CANONICAL: Record<string, string> = {
  "mercedes - benz": "Mercedes-Benz",
  "mercedes-benz": "Mercedes-Benz",
  "mercedes benz": "Mercedes-Benz",
  "land rover": "Land Rover",
  "alfa romeo": "Alfa Romeo",
  "ds automobiles": "DS Automobiles",
  mini: "MINI",
};

/**
 * Explicit Mercedes-Benz letter series slug → canonical series label.
 * Verified from Arabam taxonomy (no fuzzy merge).
 */
export const ARABAM_MERCEDES_LETTER_SERIES: Record<string, string> = {
  a: "A Serisi",
  b: "B Serisi",
  c: "C Serisi",
  e: "E Serisi",
  s: "S Serisi",
  g: "G Serisi",
  r: "R Serisi",
  cla: "CLA",
  cls: "CLS",
  glc: "GLC",
  gle: "GLE",
  gla: "GLA",
};

export function canonicalBrandLabelFromArabam(label: string): string {
  const norm = normalizeMatchText(label);
  return ARABAM_BRAND_CANONICAL[norm] ?? label.trim().replace(/\s+/g, " ");
}

export function seriesSlugToDisplayLabel(slug: string): string {
  const s = slug.trim();
  if (!s) {
    return "";
  }
  if (s.length <= 3 && /^[a-z]+$/i.test(s)) {
    return s.toUpperCase();
  }
  if (/^[a-z0-9]+-[a-z0-9]+$/i.test(s)) {
    return s
      .split("-")
      .map((part) => part.toUpperCase())
      .join("-");
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const ARABAM_SERIES_NOISE_SUFFIXES = [
  "sahibinden",
  "galeriden",
  "yetkili-bayiden",
] as const;

export function isArabamSeriesNoiseSlug(seriesPart: string): boolean {
  const lower = seriesPart.toLocaleLowerCase("tr-TR");
  return ARABAM_SERIES_NOISE_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`-${suffix}`),
  );
}

/** Series slug part must not look like engine/trim facet (contains digits). */
export function isArabamSeriesFacetSlug(seriesPart: string): boolean {
  return /\d/.test(seriesPart);
}

export const ARABAM_CONTROLLED_BRANDS = [
  "honda",
  "toyota",
  "volkswagen",
  "renault",
  "fiat",
  "ford",
  "hyundai",
  "peugeot",
  "opel",
  "bmw",
  "mercedes-benz",
  "audi",
  "nissan",
  "dacia",
  "skoda",
] as const;
