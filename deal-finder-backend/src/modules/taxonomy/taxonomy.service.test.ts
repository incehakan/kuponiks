import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    listing: {
      findMany: vi.fn(),
    },
    vehicleBrand: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    vehicleSeries: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    vehicleTrim: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { TaxonomyService } from "./taxonomy.service.js";

const mockedPrisma = prisma as unknown as {
  listing: { findMany: ReturnType<typeof vi.fn> };
  vehicleBrand: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  vehicleSeries: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  vehicleTrim: { findMany: ReturnType<typeof vi.fn> };
};

describe("TaxonomyService catalog primary + listing fallback", () => {
  const service = new TaxonomyService();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.vehicleBrand.findMany.mockResolvedValue([]);
    mockedPrisma.vehicleBrand.findFirst.mockResolvedValue(null);
    mockedPrisma.vehicleSeries.findMany.mockResolvedValue([]);
    mockedPrisma.vehicleSeries.findFirst.mockResolvedValue(null);
    mockedPrisma.vehicleTrim.findMany.mockResolvedValue([]);
    mockedPrisma.listing.findMany.mockResolvedValue([]);
  });

  it("brands: catalog primary, listing union, no GET mutation", async () => {
    mockedPrisma.vehicleBrand.findMany.mockResolvedValue([{ name: "Honda" }]);
    mockedPrisma.listing.findMany.mockResolvedValue([
      { brand: "honda" },
      { brand: "BMW" },
    ]);
    const items = await service.listVehicleBrands({});
    expect(items.map((i) => i.label).sort()).toEqual(["BMW", "Honda"]);
    expect(mockedPrisma.vehicleBrand.findMany).toHaveBeenCalled();
    expect(mockedPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platform: { not: "mock" },
        }),
      }),
    );
  });

  it("brands listing fallback when catalog empty", async () => {
    mockedPrisma.listing.findMany.mockResolvedValue([{ brand: "Honda" }]);
    const items = await service.listVehicleBrands({});
    expect(items).toEqual([{ value: "Honda", label: "Honda" }]);
  });

  it("series: catalog + listing for brand", async () => {
    mockedPrisma.vehicleBrand.findFirst.mockResolvedValue({ id: "b1" });
    mockedPrisma.vehicleSeries.findMany.mockResolvedValue([
      { name: "Civic" },
      { name: "Jazz" },
    ]);
    mockedPrisma.listing.findMany.mockResolvedValue([
      { brand: "Honda", series: "Civic" },
      { brand: "Honda", series: "Accord" },
      { brand: "BMW", series: "3 Serisi" },
    ]);
    const items = await service.listVehicleSeries({ brand: "Honda" });
    expect(items.map((i) => i.value).sort()).toEqual([
      "Accord",
      "Civic",
      "Jazz",
    ]);
  });

  it("series: MINI uses catalog identity so Cooper is found", async () => {
    mockedPrisma.vehicleBrand.findFirst.mockImplementation(async (args) => {
      const names = args?.where?.normalizedName?.in ?? [];
      return names.includes("mini") ? { id: "mini1" } : null;
    });
    mockedPrisma.vehicleSeries.findMany.mockResolvedValue([{ name: "Cooper" }]);
    const items = await service.listVehicleSeries({ brand: "MINI" });
    expect(items.map((i) => i.value)).toEqual(["Cooper"]);
    const names =
      mockedPrisma.vehicleBrand.findFirst.mock.calls[0]?.[0]?.where
        ?.normalizedName?.in ?? [];
    expect(names).toContain("mini");
  });

  it("trims: listing fallback when catalog empty", async () => {
    mockedPrisma.vehicleBrand.findFirst.mockResolvedValue({ id: "b1" });
    mockedPrisma.vehicleSeries.findFirst.mockResolvedValue({ id: "s1" });
    mockedPrisma.vehicleTrim.findMany.mockResolvedValue([]);
    mockedPrisma.listing.findMany.mockResolvedValue([
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

  it("trims optional: empty catalog + empty listings → items []", async () => {
    mockedPrisma.vehicleBrand.findFirst.mockResolvedValue({ id: "b1" });
    mockedPrisma.vehicleSeries.findFirst.mockResolvedValue({ id: "s1" });
    const items = await service.listVehicleTrims({
      brand: "Honda",
      series: "Civic",
    });
    expect(items).toEqual([]);
  });

  it("q search works on catalog brands", async () => {
    mockedPrisma.vehicleBrand.findMany.mockResolvedValue([
      { name: "Honda" },
      { name: "Hyundai" },
      { name: "BMW" },
    ]);
    const items = await service.listVehicleBrands({ q: "hon" });
    expect(items.map((i) => i.value)).toEqual(["Honda"]);
  });

  it("mock listing brand excluded via platform filter", async () => {
    mockedPrisma.vehicleBrand.findMany.mockResolvedValue([{ name: "Honda" }]);
    await service.listVehicleBrands({});
    const where = mockedPrisma.listing.findMany.mock.calls[0]?.[0]?.where;
    expect(where.platform).toEqual({ not: "mock" });
  });
});
