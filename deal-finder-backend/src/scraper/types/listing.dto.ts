/**
 * Standard listing DTO shared across adapters → normalizer → ingest.
 */
export interface ListingDto {
  externalId: string;
  platform: string;
  title: string;
  price: number;
  city: string | null;
  url: string;
  category: string;
  marketAveragePrice?: number;
  description?: string;
  raw?: Record<string, unknown>;
}

export interface DomListingRow {
  externalId: string | null;
  title: string | null;
  priceText: string | null;
  city: string | null;
  url: string | null;
  imageUrl?: string | null;
}
