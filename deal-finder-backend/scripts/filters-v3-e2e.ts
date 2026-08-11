/**
 * Controlled Filters V3 end-to-end check against local DB.
 * Creates a temporary filter, matches against a real Honda/Civic listing if present,
 * then deactivates the filter. Does NOT send notifications.
 *
 * Usage: npx tsx scripts/filters-v3-e2e.ts
 */
import { prisma } from "../src/lib/prisma.js";
import { listingMatchesFilter } from "../src/filters/filter-match.engine.js";
import { FilterService } from "../src/modules/filters/filter.service.js";
import { taxonomyService } from "../src/modules/taxonomy/taxonomy.service.js";

async function main(): Promise<void> {
  const brands = await taxonomyService.listVehicleBrands({ limit: 20 });
  const honda = brands.find(
    (b) => b.value.toLocaleLowerCase("tr-TR") === "honda",
  );
  console.log("[TAXONOMY] brands sample:", brands.slice(0, 8).map((b) => b.value));

  if (!honda) {
    console.log("[E2E] Honda brand yok — taxonomy boş veya veri yetersiz. Çıkılıyor.");
    return;
  }

  const series = await taxonomyService.listVehicleSeries({ brand: honda.value });
  console.log("[TAXONOMY] Honda series:", series.map((s) => s.value));

  const civic =
    series.find((s) => s.value.toLocaleLowerCase("tr-TR") === "civic") ??
    series[0];
  if (!civic) {
    console.log("[E2E] Honda series yok. Çıkılıyor.");
    return;
  }

  const listing = await prisma.listing.findFirst({
    where: {
      platform: { not: "mock" },
      brand: { not: null },
      OR: [{ series: civic.value }, { model: { contains: civic.value } }],
    },
    orderBy: { lastSeenAt: "desc" },
  });

  if (!listing) {
    console.log("[E2E] Eşleşecek listing bulunamadı.");
    return;
  }

  console.log("[LISTING]", {
    id: listing.id,
    brand: listing.brand,
    series: listing.series,
    trim: listing.trim,
    model: listing.model,
    year: listing.year,
    price: listing.price,
    dealScore: listing.dealScore,
    city: listing.city,
  });

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.log("[E2E] User yok — filter create atlandı, pure match testi:");
    const matched = listingMatchesFilter(
      {
        title: listing.title,
        price: listing.price,
        dealScore: listing.dealScore,
        category: listing.category,
        brand: listing.brand,
        model: listing.model,
        series: listing.series,
        trim: listing.trim,
        year: listing.year,
        mileage: listing.mileage,
        city: listing.city,
        district: listing.district,
        sellerType: listing.sellerType,
        description: listing.description,
        rawDetails: listing.rawDetails,
      },
      {
        category: listing.category ?? "Vasıta > Otomobil",
        brand: honda.value,
        series: civic.value,
        minDealScore: Math.min(50, listing.dealScore),
      },
    );
    console.log("[MATCH]", matched);
    return;
  }

  const service = new FilterService();
  const created = await service.createFilter(user.id, user.subscriptionPlan, {
    category: listing.category ?? "Vasıta > Otomobil",
    brand: honda.value,
    series: civic.value,
    city: listing.city ?? "İzmir",
    minDealScore: Math.min(50, listing.dealScore),
    minPrice: Math.max(0, Math.floor(listing.price * 0.5)),
    maxPrice: Math.ceil(listing.price * 1.5),
    keywords: [],
    excludedKeywords: [],
  });

  console.log("[FILTER CREATED]", {
    id: created.id,
    brand: created.brand,
    series: created.series,
    trim: created.trim,
    minDealScore: created.minDealScore,
  });

  const matched = listingMatchesFilter(
    {
      title: listing.title,
      price: listing.price,
      dealScore: listing.dealScore,
      category: listing.category,
      brand: listing.brand,
      model: listing.model,
      series: listing.series,
      trim: listing.trim,
      year: listing.year,
      mileage: listing.mileage,
      city: listing.city,
      district: listing.district,
      sellerType: listing.sellerType,
      description: listing.description,
      rawDetails: listing.rawDetails,
    },
    created,
  );

  console.log("[MATCH]", matched);
  console.log("[NOTIFICATIONS] 0 (bu script bildirim göndermez)");

  await service.deleteFilter(user.id, created.id);
  console.log("[FILTER] soft-deactivated", created.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
