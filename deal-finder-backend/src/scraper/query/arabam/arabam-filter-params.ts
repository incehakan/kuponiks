export interface ArabamFilterParamsInput {
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  take?: number;
}

export interface ArabamFilterParamsResult {
  params: Record<string, string>;
  applied: string[];
}

/**
 * Verified query-string filters on Arabam taxonomy URLs (live UI audit Aug 2026).
 * Param names: minYear, maxYear, minPrice, maxPrice, take
 */
export function buildArabamFilterParams(
  input: ArabamFilterParamsInput,
): ArabamFilterParamsResult {
  const params: Record<string, string> = {};
  const applied: string[] = [];

  if (input.minYear != null) {
    params.minYear = String(Math.trunc(input.minYear));
    applied.push("minYear");
  }
  if (input.maxYear != null) {
    params.maxYear = String(Math.trunc(input.maxYear));
    applied.push("maxYear");
  }
  if (input.minPrice != null) {
    params.minPrice = String(Math.trunc(input.minPrice));
    applied.push("minPrice");
  }
  if (input.maxPrice != null) {
    params.maxPrice = String(Math.trunc(input.maxPrice));
    applied.push("maxPrice");
  }

  const take = input.take ?? 50;
  params.take = String(take);
  applied.push("take");

  return { params, applied };
}
