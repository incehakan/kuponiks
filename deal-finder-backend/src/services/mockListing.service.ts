import { randomUUID } from "crypto";
import type { Listing, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface MockListingSeed {
  title: string;
  description: string;
  category: string;
  city: string;
  price: number;
  marketAveragePrice: number;
  dealScore: number;
  dealPercent: number;
  keywords: string[];
}

interface MockTemplate {
  title: string;
  description: string;
  category: string;
  city: string;
  marketAveragePrice: number;
  keywords: string[];
}

const MOCK_TEMPLATES: MockTemplate[] = [
  {
    // Guaranteed test listing for common alarms (Honda Civic + İzmir + ~1M TL).
    title: "Honda Civic 2024 hatasız",
    description:
      "Honda Civic 2024 hatasız, otomatik vites, boyasız, İzmir'de sahibinden kelepir fırsat.",
    category: "Vasıta > Otomobil",
    city: "İzmir",
    marketAveragePrice: 1_333_333,
    keywords: ["Honda", "Civic", "2024", "hatasız"],
  },
  {
    title: "Yamaha 2024 model MT-07 hatasız acil",
    description:
      "Yamaha 2024 model MT-07, hatasız, bakımlı, düşük km. Sahibinden kelepir fırsat.",
    category: "Vasıta > Motosiklet",
    city: "İzmir",
    marketAveragePrice: 420_000,
    keywords: ["Yamaha", "2024", "hatasız", "MT-07"],
  },
  {
    title: "Honda Civic 2024 hatasız otomatik sunroof",
    description:
      "Honda Civic 2024 hatasız, otomatik vites, sunroof, galeriden değil sahibinden.",
    category: "Vasıta > Otomobil",
    city: "İstanbul",
    marketAveragePrice: 1_650_000,
    keywords: ["Honda", "Civic", "2024", "hatasız", "otomatik", "sunroof"],
  },
  {
    title: "Honda Civic 2023 1.6 Elegance Yeşilyurt",
    description:
      "Yeşilyurt'ta Honda Civic 2023, hatasız boyasız, aile arabası, kelepir fiyat.",
    category: "Vasıta > Otomobil",
    city: "İzmir",
    marketAveragePrice: 1_380_000,
    keywords: ["Honda", "Civic", "Yeşilyurt", "hatasız"],
  },
  {
    title: "3+1 Yeşilyurt satılık daire hatasız",
    description:
      "Yeşilyurt'ta 3+1 satılık daire, asansörlü, hatasız, acil satılık kelepir.",
    category: "Emlak > Konut",
    city: "İzmir",
    marketAveragePrice: 4_800_000,
    keywords: ["3+1", "Yeşilyurt", "hatasız", "daire"],
  },
  {
    title: "iPhone 15 Pro Max 256GB hatasız kutulu",
    description:
      "iPhone 15 Pro Max hatasız, kutulu, faturalı, tramer kaydı yok, kelepir.",
    category: "Elektronik > Cep Telefonu",
    city: "Ankara",
    marketAveragePrice: 68_000,
    keywords: ["iPhone", "15", "Pro", "hatasız"],
  },
  {
    title: "Yamaha NMAX 2024 model sıfır ayarında",
    description:
      "Yamaha NMAX 2024 model, hatasız, düşük km, İstanbul Anadolu yakası.",
    category: "Vasıta > Motosiklet",
    city: "İstanbul",
    marketAveragePrice: 285_000,
    keywords: ["Yamaha", "NMAX", "2024", "hatasız"],
  },
];

/** Fixed price for the guaranteed Honda Civic İzmir test listing. */
const GUARANTEED_HONDA_CIVIC_PRICE = 1_000_000;
const GUARANTEED_HONDA_CIVIC_SCORE = 92;

/**
 * Generates realistic high-score kelepir listings for local testing.
 */
export class MockListingService {
  /**
   * Builds an in-memory mock listing with ~25% discount and score 70–95.
   * Index 0 is the guaranteed Honda Civic 2024 / İzmir / 1.000.000 TL listing.
   */
  buildMockListing(templateIndex?: number): MockListingSeed {
    const resolvedIndex =
      templateIndex != null
        ? templateIndex % MOCK_TEMPLATES.length
        : Math.floor(Math.random() * MOCK_TEMPLATES.length);
    const template = MOCK_TEMPLATES[resolvedIndex]!;

    // Guaranteed test listing: exact title/city/price for filter matching demos.
    if (resolvedIndex === 0) {
      return {
        title: template.title,
        description: template.description,
        category: template.category,
        city: template.city,
        price: GUARANTEED_HONDA_CIVIC_PRICE,
        marketAveragePrice: template.marketAveragePrice,
        dealScore: GUARANTEED_HONDA_CIVIC_SCORE,
        dealPercent: Math.round(
          ((template.marketAveragePrice - GUARANTEED_HONDA_CIVIC_PRICE) /
            template.marketAveragePrice) *
            100,
        ),
        keywords: template.keywords,
      };
    }

    // ~25% below market average (kelepir).
    const dealPercent = 25;
    const price = Math.round(template.marketAveragePrice * (1 - dealPercent / 100));
    const dealScore = 70 + Math.floor(Math.random() * 26); // 70–95

    return {
      title: template.title,
      description: template.description,
      category: template.category,
      city: template.city,
      price,
      marketAveragePrice: template.marketAveragePrice,
      dealScore,
      dealPercent,
      keywords: template.keywords,
    };
  }

  /**
   * Persists one mock listing into the Listing table and returns the row.
   */
  async createAndPersistMockListing(
    templateIndex?: number,
  ): Promise<Listing> {
    const seed = this.buildMockListing(templateIndex);
    return this.persistSeed(seed);
  }

  /**
   * Seeds 3 kelepir listings; first is always the guaranteed Honda Civic İzmir listing.
   */
  async createDefaultMockBatch(): Promise<Listing[]> {
    // Fixed indices: guaranteed Honda Civic İzmir, Yamaha İzmir, Honda Civic İstanbul
    const indices = [0, 1, 2];
    const created: Listing[] = [];

    for (const index of indices) {
      const listing = await this.createAndPersistMockListing(index);
      created.push(listing);
      console.log(
        `[MOCK LISTING] Oluşturuldu → "${listing.title}" | ${listing.city} | ${listing.price} TL | skor=${listing.dealScore}`,
      );
    }

    return created;
  }

  private async persistSeed(seed: MockListingSeed): Promise<Listing> {
    const externalId = `mock-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const platforms = ["sahibinden", "arabam", "letgo"] as const;
    const platform =
      platforms[Math.abs(seed.title.length) % platforms.length] ?? "sahibinden";

    const rawDetails: Prisma.InputJsonValue = {
      category: seed.category,
      kategori: seed.category,
      description: seed.description,
      keywords: seed.keywords,
      dealPercent: seed.dealPercent,
      source: platform,
      originalUrl: `https://www.${platform === "arabam" ? "arabam.com" : platform === "letgo" ? "letgo.com" : "sahibinden.com"}/ilan/${externalId}`,
    };

    return prisma.listing.create({
      data: {
        externalId,
        platform,
        title: seed.title,
        price: seed.price,
        marketAveragePrice: seed.marketAveragePrice,
        dealScore: seed.dealScore,
        city: seed.city,
        url: (rawDetails as { originalUrl: string }).originalUrl,
        rawDetails,
      },
    });
  }
}

/** Shared mock listing seeder instance. */
export const mockListingService = new MockListingService();
