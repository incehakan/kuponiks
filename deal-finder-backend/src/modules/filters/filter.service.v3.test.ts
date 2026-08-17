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

  it("11. update empty string maxMileage → null", async () => {
    mockedPrisma.userFilter.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      category: "Vasıta > Otomobil",
      isActive: true,
      minPrice: null,
      maxPrice: null,
      minYear: 2016,
      maxYear: 2018,
      minMileage: null,
      maxMileage: 0,
      notifyPush: true,
      notifyTelegram: false,
      notifyWhatsapp: false,
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", {
      maxMileage: "" as unknown as number,
    });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.maxMileage).toBeNull();
  });

  it("12. update explicit null → null", async () => {
    mockedPrisma.userFilter.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      category: "Vasıta > Otomobil",
      isActive: true,
      minPrice: null,
      maxPrice: null,
      minYear: null,
      maxYear: null,
      minMileage: 0,
      maxMileage: 0,
      notifyPush: true,
      notifyTelegram: false,
      notifyWhatsapp: false,
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", {
      minMileage: null,
      maxMileage: null,
    });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.minMileage).toBeNull();
    expect(data.maxMileage).toBeNull();
  });

  it("13. update omitted maxMileage does not rewrite existing", async () => {
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
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", {
      minDealScore: 50,
    });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.maxMileage).toBeUndefined();
    expect(data.minDealScore).toBe(50);
  });

  it("14. update explicit 0 preserved", async () => {
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
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", { maxMileage: 0 });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.maxMileage).toBe(0);
  });

  it("15. production-like Honda Civic: null mileage does not reject km>0", async () => {
    const { listingMatchesFilter } = await import(
      "../../filters/filter-match.engine.js"
    );
    expect(
      listingMatchesFilter(
        {
          title: "Honda Civic 1.6",
          price: 1_200_000,
          dealScore: 70,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          year: 2017,
          mileage: 90_000,
          subcategory: null,
        },
        {
          category: "Vasıta > Otomobil",
          subcategory: "Otomobil",
          brand: "Honda",
          series: "Civic",
          minYear: 2016,
          maxYear: 2018,
          minMileage: null,
          maxMileage: null,
          minDealScore: 50,
          city: "Tüm Türkiye",
        },
      ),
    ).toBe(true);
  });

  it("16. year outside range still fails with null mileage", async () => {
    const { listingMatchesFilter } = await import(
      "../../filters/filter-match.engine.js"
    );
    expect(
      listingMatchesFilter(
        {
          title: "Honda Civic",
          price: 1_000_000,
          dealScore: 80,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          year: 2015,
          mileage: 50_000,
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          minYear: 2016,
          maxYear: 2018,
          maxMileage: null,
          minDealScore: 50,
        },
      ),
    ).toBe(false);
  });

  it("17. dealScore < 50 still fails", async () => {
    const { listingMatchesFilter } = await import(
      "../../filters/filter-match.engine.js"
    );
    expect(
      listingMatchesFilter(
        {
          title: "Honda Civic",
          price: 1_000_000,
          dealScore: 40,
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          year: 2017,
          mileage: 50_000,
        },
        {
          category: "Vasıta > Otomobil",
          brand: "Honda",
          series: "Civic",
          minYear: 2016,
          maxYear: 2018,
          maxMileage: null,
          minDealScore: 50,
        },
      ),
    ).toBe(false);
  });

  it("18. update omitted notifyPush keeps existing true", async () => {
    mockedPrisma.userFilter.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      category: "Vasıta > Otomobil",
      isActive: true,
      minPrice: null,
      maxPrice: null,
      minYear: 2016,
      maxYear: 2018,
      minMileage: null,
      maxMileage: null,
      notifyPush: true,
      notifyTelegram: false,
      notifyWhatsapp: false,
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", {
      minDealScore: 50,
      maxMileage: null,
    });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.notifyPush).toBeUndefined();
    expect(data.maxMileage).toBeNull();
    expect(data.minDealScore).toBe(50);
  });

  it("19. update explicit notifyPush=false", async () => {
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
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", { notifyPush: false });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.notifyPush).toBe(false);
    expect(data.notifyTelegram).toBeUndefined();
  });

  it("20. update explicit notifyPush=true", async () => {
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
      notifyPush: false,
      notifyTelegram: false,
      notifyWhatsapp: false,
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", { notifyPush: true });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.notifyPush).toBe(true);
  });

  it("21. create default notifyPush=true for VIP when omitted", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionPlan: "VIP",
    });
    await service.createFilter("u1", "VIP", {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      city: "Tüm Türkiye",
    });
    const data = mockedPrisma.userFilter.create.mock.calls[0]?.[0]?.data;
    expect(data.notifyPush).toBe(true);
    expect(data.notifyTelegram).toBe(false);
  });

  it("22. create explicit notifyPush=false preserved", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionPlan: "VIP",
    });
    await service.createFilter("u1", "VIP", {
      category: "Vasıta > Otomobil",
      brand: "Honda",
      series: "Civic",
      city: "Tüm Türkiye",
      notifyPush: false,
    });
    const data = mockedPrisma.userFilter.create.mock.calls[0]?.[0]?.data;
    expect(data.notifyPush).toBe(false);
  });

  it("23. update numeric null + omitted notifyPush does not drop channels", async () => {
    mockedPrisma.userFilter.findFirst.mockResolvedValue({
      id: "f1",
      userId: "u1",
      category: "Vasıta > Otomobil",
      isActive: true,
      minPrice: null,
      maxPrice: null,
      minYear: 2016,
      maxYear: 2018,
      minMileage: 0,
      maxMileage: 0,
      notifyPush: true,
      notifyTelegram: false,
      notifyWhatsapp: false,
    });
    mockedPrisma.userFilter.update.mockImplementation(async ({ data }) => ({
      id: "f1",
      ...data,
    }));
    await service.updateFilter("f1", "u1", {
      minMileage: null,
      maxMileage: null,
    });
    const data = mockedPrisma.userFilter.update.mock.calls[0]?.[0]?.data;
    expect(data.minMileage).toBeNull();
    expect(data.maxMileage).toBeNull();
    expect(data.notifyPush).toBeUndefined();
    expect(data.notifyTelegram).toBeUndefined();
  });
});
