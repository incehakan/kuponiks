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
  district?: string | null;
  model?: string | null;
  year?: string | number | null;
  mileage?: string | number | null;
  currency?: string | null;
  imageUrl?: string | null;
  raw?: Record<string, unknown>;
}

export interface DomListingRow {
  externalId: string | null;
  title: string | null;
  priceText: string | null;
  city: string | null;
  url: string | null;
  imageUrl?: string | null;
  district?: string | null;
  model?: string | null;
  year?: string | null;
  mileage?: string | null;
}
