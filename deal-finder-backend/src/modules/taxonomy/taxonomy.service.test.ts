import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    listing: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { TaxonomyService } from "./taxonomy.service.js";

const mockedFindMany = (prisma as unknown as {
  listing: { findMany: ReturnType<typeof vi.fn> };
}).listing.findMany;

describe("TaxonomyService listing queries", () => {
  const service = new TaxonomyService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("brands exclude empty and rely on non-mock query", async () => {
    mockedFindMany.mockResolvedValue([
      { brand: "Honda" },
      { brand: "honda" },
      { brand: "BMW" },
    ]);
    const items = await service.listVehicleBrands({});
    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platform: { not: "mock" },
        }),
      }),
    );
    expect(items).toHaveLength(2);
  });

  it("series brand'e göre gelir", async () => {
    mockedFindMany.mockResolvedValue([
      { brand: "Honda", series: "Civic" },
      { brand: "Honda", series: "Accord" },
      { brand: "BMW", series: "3 Serisi" },
    ]);
    const items = await service.listVehicleSeries({ brand: "Honda" });
    expect(items.map((i) => i.value).sort()).toEqual(["Accord", "Civic"]);
  });

  it("trims brand+series'e göre gelir", async () => {
    mockedFindMany.mockResolvedValue([
      { brand: "Honda", series: "Civic", trim: "1.6 LS" },
      { brand: "Honda", series: "Civic", trim: "Elegance" },
      { brand: "Honda", series: "Accord", trim: "Executive" },
    ]);
    const items = await service.listVehicleTrims({
      brand: "Honda",
      series: "Civic",
    });
    expect(items.map((i) => i.value).sort()).toEqual(["1.6 LS", "Elegance"]);
  });

  it("mock listing brand dönmez (query filters platform)", async () => {
    mockedFindMany.mockResolvedValue([{ brand: "Honda" }]);
    await service.listVehicleBrands({});
    const where = mockedFindMany.mock.calls[0]?.[0]?.where;
    expect(where.platform).toEqual({ not: "mock" });
  });
});
