/**
 * Shared Turkish number / advantage formatters for Deal Feed V2.
 */

export function formatTry(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${new Intl.NumberFormat('tr-TR').format(value)} km`;
}

/**
 * Formats price advantage for users.
 * Positive = cheaper than market.
 */
export function formatPriceAdvantage(
  pct: number | null | undefined,
): string | null {
  if (pct == null || !Number.isFinite(pct)) {
    return null;
  }
  const abs = Math.abs(pct).toLocaleString('tr-TR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  if (pct >= 0) {
    return `%${abs} Daha Ucuz`;
  }
  return `%${abs} pahalı`;
}

export function formatDealScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) {
    return '—';
  }
  return `${Math.round(score)}`;
}

export function formatMatchedTaskLabel(filter: {
  name?: string | null;
  brand?: string | null;
  series?: string | null;
  category?: string;
}): string {
  if (filter.name?.trim()) {
    return filter.name.trim();
  }
  if (filter.brand && filter.series) {
    return `${filter.brand} ${filter.series}`;
  }
  if (filter.brand) {
    return filter.brand;
  }
  return filter.category?.trim() || 'Arama görevi';
}
