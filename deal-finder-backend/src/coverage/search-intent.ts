/**
 * Platform-independent search intent derived from a UserFilter.
 * Notification prefs and minDealScore are not part of discovery intent.
 */

export interface SearchIntent {
  category: string;
  subcategory: string | null;
  brand: string | null;
  series: string | null;
  trim: string | null;
  minYear: number | null;
  maxYear: number | null;
  minMileage: number | null;
  maxMileage: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  district: string | null;
  fuelType: string | null;
  transmission: string | null;
  sellerType: string | null;
  keywords: string[];
}

/** Filter-shaped input; extras (notify*, minDealScore) are ignored by the builder. */
export interface SearchIntentSource {
  category: string;
  subcategory?: string | null;
  brand?: string | null;
  series?: string | null;
  model?: string | null;
  trim?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minMileage?: number | null;
  maxMileage?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  city?: string | null;
  district?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  sellerType?: string | null;
  keywords?: string[] | null;
  minDealScore?: number | null;
  notifyPush?: boolean;
  notifyTelegram?: boolean;
  notifyWhatsapp?: boolean;
  isActive?: boolean;
}

export function isNationwideCity(city: string | null | undefined): boolean {
  const value = city?.trim();
  if (!value) {
    return true;
  }
  const lower = value.toLocaleLowerCase("tr-TR");
  return (
    lower === "all" ||
    lower === "tüm türkiye" ||
    lower === "tum turkiye" ||
    lower === "türkiye" ||
    lower === "turkiye"
  );
}

export function isVehicleCategory(category: string): boolean {
  const c = category.toLocaleLowerCase("tr-TR");
  return (
    c.includes("vasıta") ||
    c.includes("vasita") ||
    c.includes("otomobil") ||
    c.includes("motosiklet") ||
    c.includes("araba") ||
    c.includes("suv") ||
    c.includes("ticari")
  );
}

export function isRealtyCategory(category: string): boolean {
  const c = category.toLocaleLowerCase("tr-TR");
  return (
    c.includes("emlak") ||
    c.includes("konut") ||
    c.includes("daire") ||
    c.includes("arsa") ||
    c.includes("işyeri") ||
    c.includes("isyeri")
  );
}
