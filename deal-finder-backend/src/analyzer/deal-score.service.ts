/**
 * Deal Score V2 — explainable 0–100 score from Market Intelligence.
 *
 * A) Price advantage …… max 75
 * B) Market confidence … max 15
 * C) Data completeness … max 10
 */

import { getDealScoreThreshold } from "../market/market-config.js";
import type {
  MarketAnalysisResult,
  MarketConfidence,
} from "../market/market-intelligence.types.js";

/**
 * Result of a deal-score evaluation for a listing.
 */
export interface DealScoreResult {
  dealScore: number;
  isDeal: boolean;
  /** Discount vs market median as a percentage (positive = cheaper than market). */
  discountPercent: number;
  /** Keywords that adjusted the score (legacy; unused in V2). */
  matchedKeywords: string[];
  priceScore: number;
  confidenceScore: number;
  completenessScore: number;
}

export interface DealScoreVehicleFields {
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  price: number;
  currency?: string | null;
  city?: string | null;
}

/** Minimum score required to treat a listing as a deal (env-overridable). */
export const DEAL_SCORE_THRESHOLD = getDealScoreThreshold();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  x: number,
): number {
  if (x1 === x0) {
    return y1;
  }
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

/**
 * Piecewise price advantage → score (max 75).
 *
 * <=0% → 0
 * 0–5% → 0–25
 * 5–10% → 25–50
 * 10–15% → 50–65
 * 15–25% → 65–75
 * >25% → 75 (capped)
 */
export function priceAdvantageToScore(advantagePct: number): number {
  if (!Number.isFinite(advantagePct) || advantagePct <= 0) {
    return 0;
  }
  if (advantagePct <= 5) {
    return clamp(lerp(0, 5, 0, 25, advantagePct), 0, 25);
  }
  if (advantagePct <= 10) {
    return clamp(lerp(5, 10, 25, 50, advantagePct), 25, 50);
  }
  if (advantagePct <= 15) {
    return clamp(lerp(10, 15, 50, 65, advantagePct), 50, 65);
  }
  if (advantagePct <= 25) {
    return clamp(lerp(15, 25, 65, 75, advantagePct), 65, 75);
  }
  return 75;
}

export function confidenceToScore(
  confidence: MarketConfidence | null | undefined,
): number {
  if (confidence === "HIGH") {
    return 15;
  }
  if (confidence === "MEDIUM") {
    return 10;
  }
  if (confidence === "LOW") {
    return 5;
  }
  return 0;
}

/**
 * Vehicle completeness over 7 core fields → 0–10.
 */
export function dataCompletenessScore(fields: DealScoreVehicleFields): number {
  const checks = [
    Boolean(fields.brand?.trim()),
    Boolean(fields.model?.trim()),
    fields.year != null && Number.isFinite(fields.year),
    fields.mileage != null && Number.isFinite(fields.mileage),
    Number.isFinite(fields.price) && fields.price > 0,
    Boolean(fields.currency?.trim()),
    Boolean(fields.city?.trim()),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 10);
}

/**
 * Deal Score Engine V2 — Market Intelligence driven.
 */
export class DealScoreService {
  /**
   * V2 primary API: score from market analysis + listing completeness fields.
   */
  calculateFromMarket(
    fields: DealScoreVehicleFields,
    market: MarketAnalysisResult,
  ): DealScoreResult {
    if (!Number.isFinite(fields.price) || fields.price <= 0) {
      throw new Error(
        `DealScoreService: invalid price "${String(fields.price)}". Expected a positive number.`,
      );
    }

    if (market.status !== "READY" || market.marketMedianPrice == null) {
      return {
        dealScore: 0,
        isDeal: false,
        discountPercent: 0,
        matchedKeywords: [],
        priceScore: 0,
        confidenceScore: 0,
        completenessScore: dataCompletenessScore(fields),
      };
    }

    const advantage =
      market.priceAdvantagePct ??
      ((market.marketMedianPrice - fields.price) / market.marketMedianPrice) *
        100;

    const priceScore = Math.round(priceAdvantageToScore(advantage));
    const confidenceScore = confidenceToScore(market.confidence);
    const completenessScore = dataCompletenessScore(fields);
    const dealScore = clamp(
      priceScore + confidenceScore + completenessScore,
      0,
      100,
    );

    return {
      dealScore,
      isDeal: dealScore >= DEAL_SCORE_THRESHOLD,
      discountPercent: Number(advantage.toFixed(2)),
      matchedKeywords: [],
      priceScore,
      confidenceScore,
      completenessScore,
    };
  }

  /**
   * @deprecated Prefer calculateFromMarket. Legacy signature kept for scripts;
   * synthesizes a READY market result from an explicit median (never from listing price).
   */
  calculateDealScore(
    price: number,
    marketMedianPrice: number,
    _rawDetails?: Record<string, unknown>,
  ): DealScoreResult {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(
        `DealScoreService: invalid price "${String(price)}". Expected a positive number.`,
      );
    }
    if (!Number.isFinite(marketMedianPrice) || marketMedianPrice <= 0) {
      throw new Error(
        `DealScoreService: invalid marketMedianPrice "${String(marketMedianPrice)}". Expected a positive number.`,
      );
    }

    const advantage =
      ((marketMedianPrice - price) / marketMedianPrice) * 100;

    return this.calculateFromMarket(
      {
        price,
        brand: "x",
        model: "y",
        year: 2020,
        mileage: 1,
        currency: "TRY",
        city: "x",
      },
      {
        status: "READY",
        marketMedianPrice,
        sampleSize: 15,
        priceAdvantagePct: Number(advantage.toFixed(2)),
        confidence: "HIGH",
        segmentLevel: "L2",
        dispersionPct: 10,
        calculatedAt: new Date(),
      },
    );
  }
}

/** Shared Deal Score Engine instance. */
export const dealScoreService = new DealScoreService();
