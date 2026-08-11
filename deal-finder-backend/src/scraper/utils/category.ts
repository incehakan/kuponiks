/**
 * Light category alias layer for matching consistency.
 * Does NOT rewrite persisted Listing.category values.
 */

import { normalizeMatchText } from "../../lib/text-normalize.js";

const ALIASES: Record<string, string> = {
  vehicle: "vasıta > otomobil",
  otomobil: "vasıta > otomobil",
  "vasita > otomobil": "vasıta > otomobil",
  araba: "vasıta > otomobil",
  real_estate: "emlak",
  emlak: "emlak",
  electronics: "elektronik",
  elektronik: "elektronik",
  other: "genel",
  genel: "genel",
};

/**
 * Returns a comparable category key (tr-TR lowercased + light alias map).
 */
export function canonicalizeCategoryForMatch(
  value: string | null | undefined,
): string {
  const norm = normalizeMatchText(value);
  if (!norm) {
    return "";
  }
  return ALIASES[norm] ?? norm;
}

/**
 * True when filter and listing categories refer to the same bucket.
 */
export function categoriesMatchForFilter(
  filterCategory: string,
  listingCategory: string,
): boolean {
  const left = canonicalizeCategoryForMatch(filterCategory);
  const right = canonicalizeCategoryForMatch(listingCategory);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  // Soft leaf match: "Vasıta > Otomobil" vs "Otomobil"
  const leftLeaf = left.split(">").pop()?.trim() ?? left;
  const rightLeaf = right.split(">").pop()?.trim() ?? right;
  return leftLeaf === rightLeaf;
}
