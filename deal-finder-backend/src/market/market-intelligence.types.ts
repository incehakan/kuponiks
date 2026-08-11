export type MarketStatus =
  | "READY"
  | "INSUFFICIENT_DATA"
  | "UNSUPPORTED_CATEGORY";

export type MarketConfidence = "LOW" | "MEDIUM" | "HIGH";

/** V1.1 segments: L1/L2 trim-level; L3_SERIES/L4_SERIES series-level. L3/L4 kept for BC reads. */
export type MarketSegmentLevel =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L3_SERIES"
  | "L4_SERIES"
  | null;

export interface MarketAnalysisInput {
  id?: string | null;
  externalId: string;
  platform: string;
  price: number;
  currency: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  series?: string | null;
  trim?: string | null;
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
  series: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  city: string | null;
  lastSeenAt: Date;
}
