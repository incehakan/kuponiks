import type { Deal } from '../types/models';

export type DealFeedSort = 'newest' | 'score' | 'advantage' | 'price';

export interface DealFeedFilters {
  sort: DealFeedSort;
  minScore: number | null;
  platform: string | null;
  brand: string | null;
  city: string | null;
  onlyBelowMarket: boolean;
}

export const DEFAULT_DEAL_FEED_FILTERS: DealFeedFilters = {
  sort: 'newest',
  minScore: null,
  platform: null,
  brand: null,
  city: null,
  onlyBelowMarket: false,
};

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
}

export function applyDealFeedFilters(
  deals: Deal[],
  filters: DealFeedFilters,
): Deal[] {
  const filtered = deals.filter((deal) => {
    if (filters.minScore != null && deal.dealScore < filters.minScore) {
      return false;
    }
    if (
      filters.platform &&
      (deal.platform ?? deal.source ?? '').toLowerCase() !==
        filters.platform.toLowerCase()
    ) {
      return false;
    }
    if (
      filters.brand &&
      (deal.brand ?? '').toLocaleLowerCase('tr-TR') !==
        filters.brand.toLocaleLowerCase('tr-TR')
    ) {
      return false;
    }
    if (
      filters.city &&
      (deal.city ?? '').toLocaleLowerCase('tr-TR') !==
        filters.city.toLocaleLowerCase('tr-TR')
    ) {
      return false;
    }
    if (filters.onlyBelowMarket) {
      const pct = deal.priceAdvantagePct ?? deal.dealPercent;
      if (deal.marketStatus !== 'READY' || pct == null || pct <= 0) {
        return false;
      }
    }
    return true;
  });

  const copy = [...filtered];
  copy.sort((a, b) => {
    if (filters.sort === 'score') {
      return b.dealScore - a.dealScore;
    }
    if (filters.sort === 'advantage') {
      const av = a.priceAdvantagePct ?? a.dealPercent ?? Number.NEGATIVE_INFINITY;
      const bv = b.priceAdvantagePct ?? b.dealPercent ?? Number.NEGATIVE_INFINITY;
      return bv - av;
    }
    if (filters.sort === 'price') {
      return a.price - b.price;
    }
    const at = a.matchedAt ? new Date(a.matchedAt).getTime() : 0;
    const bt = b.matchedAt ? new Date(b.matchedAt).getTime() : 0;
    return bt - at;
  });
  return copy;
}

export function platformLabel(value: string): string {
  const key = value.toLowerCase();
  if (key === 'arabam') return 'Arabam';
  if (key === 'otoplus') return 'Otoplus';
  if (key === 'sahibinden') return 'Sahibinden';
  if (key === 'letgo') return 'Letgo';
  if (key === 'hepsiemlak') return 'Hepsiemlak';
  return value;
}
