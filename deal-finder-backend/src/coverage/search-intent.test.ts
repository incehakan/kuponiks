import { describe, expect, it } from "vitest";
import { buildSearchIntentFromFilter } from "./search-intent-builder.js";

describe("SearchIntent builder", () => {
  it("1. UserFilter → SearchIntent", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      minYear: 2016,
      maxYear: 2018,
      city: "Tüm Türkiye",
    });
    expect(intent.category).toBe("Vasıta > Otomobil");
    expect(intent.brand).toBe("Honda");
    expect(intent.series).toBe("Civic");
    expect(intent.minYear).toBe(2016);
    expect(intent.maxYear).toBe(2018);
    expect(intent.city).toBe("Tüm Türkiye");
  });

  it("2. notification prefs do not enter intent", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      notifyPush: true,
      notifyTelegram: true,
      notifyWhatsapp: true,
    });
    expect(intent).not.toHaveProperty("notifyPush");
    expect(intent).not.toHaveProperty("notifyTelegram");
    expect(JSON.stringify(intent)).not.toMatch(/notify/i);
  });

  it("3. minDealScore is not a coverage/intent field", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      minDealScore: 50,
    });
    expect(intent).not.toHaveProperty("minDealScore");
    expect(JSON.stringify(intent)).not.toContain("50");
  });

  it("4. null numerics are preserved as null", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      minMileage: null,
      maxMileage: null,
      minPrice: null,
      maxYear: null,
    });
    expect(intent.minMileage).toBeNull();
    expect(intent.maxMileage).toBeNull();
    expect(intent.minPrice).toBeNull();
    expect(intent.maxYear).toBeNull();
  });

  it("5. Tüm Türkiye remains nationwide semantic", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      city: "Tüm Türkiye",
    });
    expect(intent.city).toBe("Tüm Türkiye");
  });

  it("6. canonical Honda/Civic", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
    });
    expect(intent.brand).toBe("Honda");
    expect(intent.series).toBe("Civic");
  });

  it("7. Mercedes canonical", () => {
    const intent = buildSearchIntentFromFilter({
      category: "Vasıta > Otomobil",
      brand: "mercedes benz",
      series: "C Serisi",
    });
    expect(intent.brand).toBe("Mercedes-Benz");
    expect(intent.series).toBe("C Serisi");
  });
});
