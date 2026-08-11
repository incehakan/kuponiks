/**
 * Result of a deal-score evaluation for a listing.
 */
export interface DealScoreResult {
  dealScore: number;
  isDeal: boolean;
  /** Discount vs market average as a percentage (positive = cheaper than market). */
  discountPercent: number;
  /** Keywords that adjusted the score. */
  matchedKeywords: string[];
}

/**
 * Keyword rule applied against listing text (title / description / rawDetails).
 */
interface KeywordRule {
  keyword: string;
  /** Score delta applied when the keyword is found (negative = risk). */
  delta: number;
  reason: "risk" | "urgency" | "positive";
}

/** Minimum score required to treat a listing as a deal. */
export const DEAL_SCORE_THRESHOLD = 70;

/**
 * Risk / urgency keywords commonly found in Turkish vehicle & marketplace listings.
 */
const KEYWORD_RULES: readonly KeywordRule[] = [
  { keyword: "ağır hasar", delta: -25, reason: "risk" },
  { keyword: "agir hasar", delta: -25, reason: "risk" },
  { keyword: "tavan boyalı", delta: -15, reason: "risk" },
  { keyword: "tavan boyali", delta: -15, reason: "risk" },
  { keyword: "çıtır hasarlı", delta: -10, reason: "risk" },
  { keyword: "citir hasarli", delta: -10, reason: "risk" },
  { keyword: "hasar kaydı", delta: -12, reason: "risk" },
  { keyword: "hasar kaydi", delta: -12, reason: "risk" },
  { keyword: "tramer", delta: -12, reason: "risk" },
  { keyword: "pert", delta: -30, reason: "risk" },
  { keyword: "acilen", delta: 5, reason: "urgency" },
  { keyword: "acil satılık", delta: 5, reason: "urgency" },
  { keyword: "acil satilik", delta: 5, reason: "urgency" },
  { keyword: "pazarlık payı", delta: 3, reason: "positive" },
  { keyword: "pazarlik payi", delta: 3, reason: "positive" },
] as const;

/**
 * Clamps a numeric value into the inclusive [min, max] range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deal Score Engine — converts price vs market average (+ text signals)
 * into a 0–100 kelepir score.
 */
export class DealScoreService {
  /**
   * Calculates a deal score from listing price, market average, and optional raw text details.
   *
   * Discount example: market 1_000_000, listing 800_000 → 20% discount.
   * Base score maps ~20% discount to the deal threshold (70).
   */
  calculateDealScore(
    price: number,
    marketAveragePrice: number,
    rawDetails?: Record<string, unknown>,
  ): DealScoreResult {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(
        `DealScoreService: invalid price "${String(price)}". Expected a positive number.`,
      );
    }

    if (!Number.isFinite(marketAveragePrice) || marketAveragePrice <= 0) {
      throw new Error(
        `DealScoreService: invalid marketAveragePrice "${String(marketAveragePrice)}". Expected a positive number.`,
      );
    }

    const discountPercent =
      ((marketAveragePrice - price) / marketAveragePrice) * 100;

    // 20% below market ≈ score 70 (deal threshold); scales linearly, clamped 0–100.
    let dealScore = clamp(Math.round(discountPercent * 3.5), 0, 100);

    const textCorpus = this.buildTextCorpus(rawDetails);
    const { delta, matchedKeywords } = this.analyzeText(textCorpus);

    dealScore = clamp(dealScore + delta, 0, 100);

    return {
      dealScore,
      isDeal: dealScore >= DEAL_SCORE_THRESHOLD,
      discountPercent: Number(discountPercent.toFixed(2)),
      matchedKeywords,
    };
  }

  /**
   * Collects searchable text from rawDetails (and nested string fields).
   */
  private buildTextCorpus(rawDetails?: Record<string, unknown>): string {
    if (!rawDetails) {
      return "";
    }

    const chunks: string[] = [];

    const walk = (value: unknown): void => {
      if (typeof value === "string") {
        chunks.push(value);
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
        return;
      }

      if (value && typeof value === "object") {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          walk(nested);
        }
      }
    };

    walk(rawDetails);
    return chunks.join(" ").toLocaleLowerCase("tr-TR");
  }

  /**
   * Detects risk / urgency keywords and returns the cumulative score revision.
   */
  private analyzeText(text: string): {
    delta: number;
    matchedKeywords: string[];
  } {
    if (!text) {
      return { delta: 0, matchedKeywords: [] };
    }

    let delta = 0;
    const matchedKeywords: string[] = [];

    for (const rule of KEYWORD_RULES) {
      if (text.includes(rule.keyword.toLocaleLowerCase("tr-TR"))) {
        delta += rule.delta;
        matchedKeywords.push(rule.keyword);
      }
    }

    return { delta, matchedKeywords };
  }
}

/** Shared Deal Score Engine instance. */
export const dealScoreService = new DealScoreService();
