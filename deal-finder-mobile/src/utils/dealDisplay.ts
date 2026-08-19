import type { Deal } from '../types/models';

export function resolveSourceLabel(deal: Deal): string {
  const platformName = (deal.source || deal.platform || '').trim();
  const raw = platformName.toLowerCase();

  if (!raw || raw === 'mock' || raw === 'mock-seeder') {
    return '';
  }
  if (raw.includes('sahibinden')) {
    return 'sahibinden.com';
  }
  if (raw.includes('arabam')) {
    return 'arabam.com';
  }
  if (raw.includes('letgo')) {
    return 'Letgo';
  }
  if (raw.includes('otoplus')) {
    return 'Otoplus';
  }
  if (raw.includes('hepsiemlak')) {
    return 'hepsiemlak';
  }

  return platformName;
}

export function resolveListingUrl(deal: Deal): string | null {
  const candidates = [deal.originalUrl, deal.sourceUrl, deal.listingUrl];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function dealHeadline(deal: Deal): string {
  if (deal.brand && deal.series) {
    return `${deal.brand} ${deal.series}`;
  }
  if (deal.brand) {
    return deal.brand;
  }
  return deal.title;
}

export function dealSpecLine(deal: Deal): string | null {
  const parts: string[] = [];
  if (deal.year != null) {
    parts.push(String(deal.year));
  }
  if (deal.mileage != null && Number.isFinite(deal.mileage)) {
    parts.push(
      `${new Intl.NumberFormat('tr-TR').format(deal.mileage)} km`,
    );
  }
  if (deal.fuelType?.trim()) {
    parts.push(deal.fuelType.trim());
  }
  if (deal.transmission?.trim()) {
    parts.push(deal.transmission.trim());
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function dealLocation(deal: Deal): string | null {
  const value = [deal.city, deal.district].filter(Boolean).join(', ');
  return value || null;
}

export function marketMedian(deal: Deal): number | null {
  if (deal.marketStatus !== 'READY') {
    return null;
  }
  if (deal.marketMedianPrice != null && Number.isFinite(deal.marketMedianPrice)) {
    return deal.marketMedianPrice;
  }
  if (deal.marketAverage > 0) {
    return deal.marketAverage;
  }
  return null;
}

export function isRecentMatch(deal: Deal, hours = 48): boolean {
  if (!deal.matchedAt) {
    return false;
  }
  const ts = Date.parse(deal.matchedAt);
  if (!Number.isFinite(ts)) {
    return false;
  }
  return Date.now() - ts < hours * 60 * 60 * 1000;
}
