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

const GARBAGE_BRAND_SLUGS = new Set([
  "otomobil",
  "vasita",
  "vasıta",
  "ikinci-el",
  "arac",
  "araç",
]);

const SERIES_NOISE_EXACT = new Set([
  "manuel",
  "otomatik",
  "automatic",
  "benzin",
  "dizel",
  "diesel",
  "lpg",
  "elektrik",
  "hybrid",
  "hibrit",
  "istanbul",
  "ankara",
  "izmir",
  "bursa",
  "antalya",
  "sahibinden",
  "galeriden",
  "yetkili-bayiden",
  "kampanya",
  "sponsored",
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
  if (/^\d+$/.test(norm)) {
    return true;
  }
  return INVALID_EXACT.has(norm);
}

export function isGarbageBrandSlug(slug: string): boolean {
  const lower = slug.trim().toLocaleLowerCase("tr-TR");
  if (!lower || GARBAGE_BRAND_SLUGS.has(lower)) {
    return true;
  }
  if (/^\d+$/.test(lower)) {
    return true;
  }
  return !isWellFormedArabamSlug(lower);
}

export function isWellFormedArabamSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Display looks like a URL slug rather than a user-facing label. */
export function looksLikeSlugDisplay(label: string, sourceSlug?: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) {
    return true;
  }
  if (sourceSlug && trimmed === sourceSlug) {
    return true;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/.test(trimmed);
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
  "citroen": "Citroën",
  "citroën": "Citroën",
  skoda: "Skoda",
  "škoda": "Skoda",
  cupra: "Cupra",
  tesla: "Tesla",
  mg: "MG",
  byd: "BYD",
  chery: "Chery",
  bmw: "BMW",
};

export const SPECIAL_REVIEW_BRANDS = [
  "Mercedes-Benz",
  "Alfa Romeo",
  "Land Rover",
  "Citroën",
  "Skoda",
  "DS Automobiles",
  "MINI",
  "BMW",
  "Cupra",
  "Tesla",
  "MG",
  "BYD",
  "Chery",
] as const;

/**
 * Hyphenated Arabam brand slugs — never treat these as series of a shorter prefix.
 */
export const ARABAM_COMPOUND_BRAND_SLUGS = new Set([
  "mercedes-benz",
  "alfa-romeo",
  "land-rover",
  "ds-automobiles",
  "aston-martin",
  "rolls-royce",
  "great-wall",
]);

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

/** Explicit BMW numbered series slugs — digits here are not engine facets. */
export const ARABAM_BMW_NUMBER_SERIES: Record<string, string> = {
  "1-serisi": "1 Serisi",
  "2-serisi": "2 Serisi",
  "3-serisi": "3 Serisi",
  "4-serisi": "4 Serisi",
  "5-serisi": "5 Serisi",
  "6-serisi": "6 Serisi",
  "7-serisi": "7 Serisi",
  "8-serisi": "8 Serisi",
};

export function canonicalBrandLabelFromArabam(label: string): string {
  const norm = normalizeMatchText(label);
  return ARABAM_BRAND_CANONICAL[norm] ?? label.trim().replace(/\s+/g, " ");
}

/**
 * Locale-independent catalog/source identity normalization.
 * Keeps display labels untouched while avoiding Turkish-I drift (MINI -> mını).
 */
export function normalizeCatalogIdentity(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Derive user-facing brand label when Arabam only exposes a URL slug. */
export function brandSlugToDisplayLabel(slug: string): string {
  const lower = slug.trim().toLocaleLowerCase("tr-TR");
  if (!lower) {
    return "";
  }
  const spaced = lower.replace(/-/g, " ");
  const fromMap =
    ARABAM_BRAND_CANONICAL[spaced] ?? ARABAM_BRAND_CANONICAL[lower];
  if (fromMap) {
    return fromMap;
  }
  if (lower.length <= 3 && /^[a-z]+$/.test(lower)) {
    return lower.toUpperCase();
  }
  if (lower.includes("-")) {
    return spaced
      .split(" ")
      .map((part) => {
        if (part.length <= 3 && /^[a-z]+$/.test(part)) {
          return part.toUpperCase();
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Exact plus ASCII-folded forms so Citroën matches existing Citroen. */
export function catalogNormalizedCandidates(label: string): string[] {
  const identity = normalizeCatalogIdentity(label);
  const legacy = normalizeMatchText(label);
  if (!identity && !legacy) {
    return [];
  }
  const out = new Set<string>();
  if (identity) out.add(identity);
  if (legacy) out.add(legacy);
  const legacyAscii = legacy.normalize("NFD").replace(/\p{M}/gu, "");
  if (legacyAscii) out.add(legacyAscii);
  return [...out];
}

export function resolveCanonicalBrandLabel(
  sourceLabel: string,
  sourceSlug: string,
): string {
  const fromLabel = canonicalBrandLabelFromArabam(sourceLabel);
  const labelLooksLikeSlug =
    normalizeMatchText(fromLabel) === normalizeMatchText(sourceSlug) ||
    looksLikeSlugDisplay(fromLabel, sourceSlug);
  if (labelLooksLikeSlug) {
    return brandSlugToDisplayLabel(sourceSlug);
  }
  return fromLabel;
}

export function seriesSlugToDisplayLabel(slug: string): string {
  const s = slug.trim().toLocaleLowerCase("tr-TR");
  if (!s) {
    return "";
  }
  if (/^\d+-serisi$/.test(s)) {
    return `${s.split("-")[0]} Serisi`;
  }
  if (s.length <= 3 && /^[a-z]+$/.test(s)) {
    return s.toUpperCase();
  }
  if (/^[a-z]{1,3}\d{1,2}[a-z]?$/.test(s)) {
    return s.toUpperCase();
  }
  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.every((p) => p.length <= 3 && /^[a-z0-9]+$/.test(p))) {
      return parts.map((p) => p.toUpperCase()).join("-");
    }
    return parts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
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
  if (SERIES_NOISE_EXACT.has(lower)) {
    return true;
  }
  return ARABAM_SERIES_NOISE_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`-${suffix}`),
  );
}

/**
 * Engine/trim/year facets — not family series.
 * Allows BMW `3-serisi` and Audi `a4`.
 */
export function isArabamSeriesFacetSlug(seriesPart: string): boolean {
  const lower = seriesPart.toLocaleLowerCase("tr-TR");
  if (/^\d+-serisi$/.test(lower)) {
    return false;
  }
  if (/^model-[a-z0-9]+$/.test(lower)) {
    return false;
  }
  if (/^[a-z]{1,3}\d{1,2}[a-z]?$/.test(lower)) {
    return false;
  }
  return /\d/.test(lower);
}

export function isAllowedCatalogSeries(seriesPart: string): boolean {
  if (!seriesPart || isInvalidCatalogValue(seriesPart)) {
    return false;
  }
  if (isArabamSeriesNoiseSlug(seriesPart) || isArabamSeriesFacetSlug(seriesPart)) {
    return false;
  }
  if (seriesPart.includes("-") && seriesPart.split("-").length > 2) {
    return false;
  }
  return true;
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
