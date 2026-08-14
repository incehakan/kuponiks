/**
 * Controlled Vehicle Catalog V1 seed (TR common brands + a few known series).
 * No invented trim/package rows.
 */

export const VEHICLE_CATALOG_BRANDS: string[] = [
  "Alfa Romeo",
  "Audi",
  "BMW",
  "Citroen",
  "Dacia",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Kia",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Renault",
  "Seat",
  "Skoda",
  "Toyota",
  "Volkswagen",
  "Volvo",
];

/** Brand display name → series/model display names. */
export const VEHICLE_CATALOG_SERIES: Record<string, string[]> = {
  Honda: ["Civic", "City", "Accord", "Jazz", "CR-V", "HR-V"],
  BMW: ["1 Serisi", "2 Serisi", "3 Serisi", "4 Serisi", "5 Serisi", "X1", "X3", "X5"],
  Toyota: ["Corolla", "Yaris", "C-HR", "RAV4", "Hilux"],
  Volkswagen: ["Polo", "Golf", "Passat", "Tiguan", "T-Roc"],
  Renault: ["Clio", "Megane", "Captur", "Austral"],
  Fiat: ["Egea", "500", "Panda", "Doblo"],
  Ford: ["Focus", "Fiesta", "Puma", "Courier"],
  Hyundai: ["i20", "i30", "Tucson", "Bayon"],
  Kia: ["Ceed", "Sportage", "Picanto"],
  "Mercedes-Benz": ["A Serisi", "C Serisi", "E Serisi", "GLC"],
  Opel: ["Corsa", "Astra", "Mokka"],
  Peugeot: ["208", "308", "2008", "3008"],
  Nissan: ["Qashqai", "Juke", "Micra"],
  Dacia: ["Duster", "Sandero", "Jogger"],
  Seat: ["Ibiza", "Leon", "Arona"],
  Skoda: ["Octavia", "Fabia", "Superb", "Kamiq"],
  Audi: ["A3", "A4", "A6", "Q3"],
  Volvo: ["XC40", "XC60", "S60"],
  Citroen: ["C3", "C4", "C5 Aircross"],
  "Alfa Romeo": ["Giulietta", "Stelvio"],
};

export const VEHICLE_CATALOG_BRAND_COUNT = VEHICLE_CATALOG_BRANDS.length;

export const VEHICLE_CATALOG_SERIES_COUNT = Object.values(
  VEHICLE_CATALOG_SERIES,
).reduce((sum, list) => sum + list.length, 0);
