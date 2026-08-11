export type MarketStatus =
  | "READY"
  | "INSUFFICIENT_DATA"
  | "UNSUPPORTED_CATEGORY";

export type MarketConfidence = "LOW" | "MEDIUM" | "HIGH";

export type MarketSegmentLevel = "L1" | "L2" | "L3" | "L4" | null;

export interface MarketAnalysisInput {
  id?: string | null;
  externalId: string;
  platform: string;
  price: number;
  currency: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  city: string | null;
}

export interface MarketAnalysisResult {
  status: MarketStatus;
  marketMedianPrice: number | null;
  sampleSize: number;
  priceAdvantagePct: number | null;
  confidence: MarketConfidence | null;
  segmentLevel: MarketSegmentLevel;
  dispersionPct: number | null;
  calculatedAt: Date;
  reason?: string;
}

export interface ComparableListingRow {
  id: string;
  externalId: string;
  platform: string;
  price: number;
  currency: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  city: string | null;
  lastSeenAt: Date;
}
