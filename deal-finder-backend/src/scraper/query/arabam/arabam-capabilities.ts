/**
 * Arabam SOURCE capabilities — verified via live UI audit (Aug 2026).
 *
 * Taxonomy path: /ikinci-el/{category}/{brand-series[-city]}
 * Query params: minYear, maxYear, minPrice, maxPrice, take
 *
 * NOT SOURCE (matcher-only until separately verified):
 * district, mileage, trim, fuelType, transmission, sellerType
 *
 * Sort: taxonomy pages use default "Gelişmiş Sıralama" — date.desc not verified.
 */
export const ARABAM_VERIFIED_SOURCE_FIELDS = [
  "brand",
  "series",
  "keywords",
  "city",
  "minYear",
  "maxYear",
  "minPrice",
  "maxPrice",
] as const;
