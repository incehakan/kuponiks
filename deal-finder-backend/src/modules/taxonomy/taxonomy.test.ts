import { describe, expect, it } from "vitest";
import { dedupeTaxonomyValues } from "./taxonomy.service.js";

describe("Taxonomy dedupe / search", () => {
  it("1. brands duplicate kaldırır (case)", () => {
    const items = dedupeTaxonomyValues(["Honda", "HONDA", "honda", "BMW"]);
    expect(items.map((i) => i.value.toLocaleLowerCase("tr-TR")).sort()).toEqual(
      ["bmw", "honda"],
    );
    expect(items).toHaveLength(2);
  });

  it("2. null / empty brand dönmez", () => {
    const items = dedupeTaxonomyValues([null, "", "  ", "Toyota"]);
    expect(items).toEqual([{ value: "Toyota", label: "Toyota" }]);
  });

  it("3. q search çalışır", () => {
    const items = dedupeTaxonomyValues(["Honda", "Hyundai", "BMW"], "hon");
    expect(items.map((i) => i.value)).toEqual(["Honda"]);
  });

  it("4. empty result güvenli", () => {
    expect(dedupeTaxonomyValues([])).toEqual([]);
    expect(dedupeTaxonomyValues(["Honda"], "zzz")).toEqual([]);
  });

  it("5. response deterministic sıralı", () => {
    const items = dedupeTaxonomyValues(["Civic", "Accord", "Jazz"]);
    expect(items.map((i) => i.label)).toEqual(["Accord", "Civic", "Jazz"]);
  });

  it("6. prefers non-ALLCAPS label when collapsing", () => {
    const items = dedupeTaxonomyValues(["HONDA", "Honda"]);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Honda");
  });
});
