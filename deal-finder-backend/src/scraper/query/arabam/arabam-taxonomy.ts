import {
  slugifyArabamBrand,
  slugifyArabamCity,
  slugifyArabamSeries,
} from "./arabam-slug.js";

/** Verified Arabam ikinci-el category path slugs. */
export function resolveArabamCategorySlug(category: string): string {
  const c = category.toLocaleLowerCase("tr-TR");
  if (
    c.includes("arazi") ||
    c.includes("suv") ||
    c.includes("pick") ||
    c.includes("pick-up") ||
    c.includes("pickup")
  ) {
    return "arazi-suv-pick-up";
  }
  if (c.includes("ticari")) {
    return "ticari";
  }
  if (c.includes("motosiklet") || c.includes("motor")) {
    return "motosiklet";
  }
  if (
    c.includes("otomobil") ||
    c.includes("vasıta") ||
    c.includes("vasita") ||
    c.includes("araba")
  ) {
    return "otomobil";
  }
  return "otomobil";
}

export interface ArabamTaxonomyInput {
  category: string;
  brand?: string;
  series?: string;
  city?: string;
  /** Verified slug override from platform taxonomy resolver. */
  slugOverride?: {
    brandSlug: string;
    seriesSlugPart?: string;
    modelSlug: string;
  };
}

/**
 * Builds verified taxonomy path under /ikinci-el/.
 * Examples (live-verified):
 * - /ikinci-el/otomobil/honda-civic
 * - /ikinci-el/otomobil/honda-civic-kayseri
 */
export function buildArabamTaxonomyPath(input: ArabamTaxonomyInput): string | null {
  const categorySlug = resolveArabamCategorySlug(input.category);

  let brandSlug: string;
  let modelSlug: string;

  if (input.slugOverride?.brandSlug) {
    brandSlug = input.slugOverride.brandSlug;
    modelSlug = input.slugOverride.modelSlug;
  } else {
    brandSlug = input.brand ? slugifyArabamBrand(input.brand) : "";
    if (!brandSlug) {
      return null;
    }
    modelSlug = brandSlug;
    if (input.series?.trim()) {
      const seriesSlug = slugifyArabamSeries(input.series);
      if (seriesSlug) {
        modelSlug = `${brandSlug}-${seriesSlug}`;
      }
    }
  }

  if (!brandSlug) {
    return null;
  }

  if (input.city?.trim()) {
    const citySlug = slugifyArabamCity(input.city);
    if (citySlug) {
      modelSlug = `${modelSlug}-${citySlug}`;
    }
  }

  return `/ikinci-el/${categorySlug}/${modelSlug}`;
}
