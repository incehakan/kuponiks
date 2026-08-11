import type { Filter } from '../types/models';

/** Top-level category buckets used by Filters V3 dynamic form. */
export const FILTER_CATEGORY_OPTIONS = [
  { value: 'Vasıta > Otomobil', label: 'Vasıta › Otomobil', group: 'Vasıta' },
  { value: 'Emlak > Konut', label: 'Emlak › Konut', group: 'Emlak' },
  { value: 'Elektronik > Cep Telefonu', label: 'Elektronik › Cep Telefonu', group: 'Elektronik' },
  { value: 'Diğer', label: 'Diğer', group: 'Diğer' },
] as const;

export function isVehicleCategory(categoryPath: string): boolean {
  const n = categoryPath.trim().toLocaleLowerCase('tr-TR');
  return n.includes('vasıta') || n.includes('vasita') || n.includes('otomobil');
}

export function isRealEstateCategory(categoryPath: string): boolean {
  const n = categoryPath.trim().toLocaleLowerCase('tr-TR');
  return n.includes('emlak');
}

export function formatFilterTaskTitle(filter: Filter): string {
  if (filter.name?.trim()) {
    return filter.name.trim();
  }
  if (filter.brand && filter.series) {
    return `${filter.brand} ${filter.series}${filter.trim ? ` ${filter.trim}` : ''}`;
  }
  if (filter.brand) {
    return filter.brand;
  }
  if (filter.model) {
    return filter.model;
  }
  return filter.category || 'Vasıta Araması';
}

export function formatFilterSummary(filter: Filter): string {
  const parts: string[] = [];
  if (filter.brand || filter.series) {
    parts.push(
      [filter.brand, filter.series, filter.trim].filter(Boolean).join(' '),
    );
  }
  if (filter.minYear != null || filter.maxYear != null) {
    parts.push(
      `${filter.minYear ?? '…'}–${filter.maxYear ?? '…'}`,
    );
  }
  if (filter.maxMileage != null) {
    parts.push(`Max ${filter.maxMileage.toLocaleString('tr-TR')} km`);
  }
  if (filter.maxPrice != null) {
    parts.push(`Max ${filter.maxPrice.toLocaleString('tr-TR')} TL`);
  }
  if (filter.city?.trim()) {
    parts.push(filter.city);
  }
  parts.push(`Skor ≥${filter.minDealScore}`);
  return parts.filter(Boolean).join(' · ');
}

export function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/\./g, '').replace(/,/g, '');
  if (!trimmed) {
    return undefined;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : Number.NaN;
}

export function splitKeywordInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
