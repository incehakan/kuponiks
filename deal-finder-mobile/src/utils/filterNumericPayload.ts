/**
 * Builds filter create/update numeric fields without collapsing empty → 0.
 * "" / whitespace → null; explicit 0 / "0" → 0; omitted keys stay omitted on partial.
 */
import { parseOptionalNumber } from './filterForm';

export type OptionalNumericKey =
  | 'minYear'
  | 'maxYear'
  | 'minMileage'
  | 'maxMileage'
  | 'minPrice'
  | 'maxPrice';

export function optionalNumericForSave(
  raw: string | null | undefined,
): number | null {
  if (raw == null) {
    return null;
  }
  const parsed = parseOptionalNumber(raw);
  if (parsed === undefined) {
    return null;
  }
  return parsed;
}

/**
 * Edit hydrate: null/undefined → empty input; keep explicit 0 as "0".
 */
export function optionalNumericToFormValue(
  value: number | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

/**
 * Vehicle save payload numerics — always explicit null when empty (never omit → never leave stale 0).
 */
export function buildVehicleNumericPayload(form: {
  minYear: string;
  maxYear: string;
  minMileage: string;
  maxMileage: string;
  minPrice: string;
  maxPrice: string;
}): Record<OptionalNumericKey, number | null> {
  return {
    minYear: optionalNumericForSave(form.minYear),
    maxYear: optionalNumericForSave(form.maxYear),
    minMileage: optionalNumericForSave(form.minMileage),
    maxMileage: optionalNumericForSave(form.maxMileage),
    minPrice: optionalNumericForSave(form.minPrice),
    maxPrice: optionalNumericForSave(form.maxPrice),
  };
}
