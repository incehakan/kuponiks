import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http-error.js";

vi.mock("../../lib/prisma.js", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      userFilter: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "../../lib/prisma.js";
import { FilterService } from "./filter.service.js";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  userFilter: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

describe("Filter API validation + series/trim persist", () => {
  const service = new FilterService();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionPlan: "PRO",
    });
    mockedPrisma.userFilter.count.mockResolvedValue(0);
    mockedPrisma.userFilter.create.mockImplementation(async ({ data }) => ({
      id: "f1",
      userId: "u1",
      isActive: true,
      keywords: [],
      excludedKeywords: [],
      minDealScore: 70,
      notifyPush: true,
      notifyTelegram: false,
      notifyWhatsapp: false,
      createdAt: new Date(),
      ...data,
    }));
  });

  it("1. vehicle filter create with series/trim", async () => {
    const filter = await service.createFilter("u1", "PRO", {
      category: "Vasıta > Otomobil",
      subcategory: "Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: "1.6i VTEC Elegance",
      minYear: 2018,
      maxYear: 2022,
      minMileage: 0,
      maxMileage: 120_000,
      minPrice: 800_000,
      maxPrice: 1_500_000,
      city: "İzmir",
      minDealScore: 70,
      keywords: ["hatasız", "boyasız"],
      excludedKeywords: ["pert"],
    });

    expect(mockedPrisma.userFilter.create).toHaveBeenCalled();
    const data = mockedPrisma.userFilter.create.mock.calls[0]?.[0]?.data;
    expect(data.series).toBe("Civic");
    expect(data.trim).toBe("1.6i VTEC Elegance");
    expect(data.brand).toBe("Honda");
    expect(filter.series).toBe("Civic");
  });

  it("2. series/trim empty string → null", async () => {
    await service.createFilter("u1", "PRO", {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "  ",
      trim: "",
    });
    const data = mockedPrisma.userFilter.create.mock.calls[0]?.[0]?.data;
    expect(data.series).toBeNull();
    expect(data.trim).toBeNull();
  });

  it("3. invalid year range → 400", async () => {
    await expect(
      service.createFilter("u1", "PRO", {
        category: "Vasıta > Otomobil",
        minYear: 2022,
        maxYear: 2018,
      }),
    ).rejects.toMatchObject({ statusCode: 400 } satisfies Partial<HttpError>);
  });

  it("4. invalid mileage range → 400", async () => {
    await expect(
      service.createFilter("u1", "PRO", {
        category: "Vasıta > Otomobil",
        minMileage: 100_000,
        maxMileage: 10_000,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("5. invalid price range → 400", async () => {
    await expect(
      service.createFilter("u1", "PRO", {
        category: "Vasıta > Otomobil",
        minPrice: 2_000_000,
        maxPrice: 1_000_000,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("6. invalid minDealScore → 400", async () => {
    await expect(
      service.createFilter("u1", "PRO", {
        category: "Vasıta > Otomobil",
        minDealScore: 140,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("7. old payload still accepted (category + city + prices)", async () => {
    const filter = await service.createFilter("u1", "PRO", {
      category: "Emlak > Konut",
      city: "İstanbul",
      minPrice: 1_000_000,
      maxPrice: 5_000_000,
      keywords: "deniz manzaralı",
      minDealScore: 70,
    });
    expect(filter.category).toBe("Emlak > Konut");
  });

  it("8. update persists series/trim", async () => {
    mockedPrisma.userFilter.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      category: "Vasıta > Otomobil",
      isActive: true,
      minPrice: null,
      maxPrice: null,
      minYear: null,
      maxYear: null,
      minMileage: null,
      maxMileage: null,
      notifyPush: true,
      notifyTelegram: false,
      notifyWhatsapp: false,
      brand: "Honda",
      series: null,
      trim: null,
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));

    await service.updateFilter("f1", "u1", {
      series: "Civic",
      trim: "1.6 LS",
    });

    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.series).toBe("Civic");
    expect(data.trim).toBe("1.6 LS");
  });

  it("9. trim optional — brand+series without trim persists series", async () => {
    await service.createFilter("u1", "PRO", {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      trim: null,
    });
    const data = mockedPrisma.userFilter.create.mock.calls[0]?.[0]?.data;
    expect(data.brand).toBe("Honda");
    expect(data.series).toBe("Civic");
    expect(data.trim).toBeNull();
  });

  it("10. empty string maxMileage → null not 0", async () => {
    await service.createFilter("u1", "PRO", {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      maxMileage: "" as unknown as number,
      minYear: "   " as unknown as number,
      minMileage: 0,
    });
    const data = mockedPrisma.userFilter.create.mock.calls[0]?.[0]?.data;
    expect(data.maxMileage).toBeNull();
    expect(data.minYear).toBeNull();
    expect(data.minMileage).toBe(0);
  });
});
