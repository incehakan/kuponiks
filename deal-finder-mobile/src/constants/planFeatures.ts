import type { SubscriptionPlan } from '../types/models';

export interface PlanFeatureRow {
  label: string;
  free: string;
  pro: string;
  vip: string;
}

export interface PlanDefinition {
  plan: SubscriptionPlan;
  title: string;
  priceLabel: string;
  tagline: string;
  features: string[];
  activeFilterLimit: number | null;
  allowsTelegram: boolean;
  allowsWhatsApp: boolean;
  notificationDelayLabel: string;
}

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  FREE: {
    plan: 'FREE',
    title: 'Ücretsiz',
    priceLabel: '0 TL / ay',
    tagline: 'Temel kelepir takibi',
    features: [
      '1 aktif alarm',
      'Mobil push bildirimi',
      '10 dakika gecikmeli bildirim',
    ],
    activeFilterLimit: 1,
    allowsTelegram: false,
    allowsWhatsApp: false,
    notificationDelayLabel: '10 dk gecikme',
  },
  PRO: {
    plan: 'PRO',
    title: 'Standart',
    priceLabel: '199 TL / ay',
    tagline: 'Anlık bildirim + Telegram',
    features: [
      '10 aktif alarm',
      'Anında push bildirimi',
      'Telegram entegrasyonu',
    ],
    activeFilterLimit: 10,
    allowsTelegram: true,
    allowsWhatsApp: false,
    notificationDelayLabel: 'Anlık',
  },
  VIP: {
    plan: 'VIP',
    title: 'Sınırsız',
    priceLabel: '299 TL / ay',
    tagline: 'Tüm kanallar, sınırsız alarm',
    features: [
      'Sınırsız aktif alarm',
      'Anında push bildirimi',
      'Telegram + WhatsApp',
    ],
    activeFilterLimit: null,
    allowsTelegram: true,
    allowsWhatsApp: true,
    notificationDelayLabel: 'Anlık',
  },
};

export const PLAN_COMPARISON_ROWS: PlanFeatureRow[] = [
  {
    label: 'Aktif alarm',
    free: '1',
    pro: '10',
    vip: 'Sınırsız',
  },
  {
    label: 'Mobil push',
    free: '✓',
    pro: '✓',
    vip: '✓',
  },
  {
    label: 'Telegram',
    free: '—',
    pro: '✓',
    vip: '✓',
  },
  {
    label: 'WhatsApp',
    free: '—',
    pro: '—',
    vip: '✓',
  },
  {
    label: 'Bildirim hızı',
    free: '10 dk gecikme',
    pro: 'Anlık',
    vip: 'Anlık',
  },
];

export function getActiveFilterLimit(plan: SubscriptionPlan | undefined): number | null {
  return PLAN_DEFINITIONS[plan ?? 'FREE'].activeFilterLimit;
}

export function canAddActiveFilter(
  plan: SubscriptionPlan | undefined,
  activeCount: number,
): boolean {
  const limit = getActiveFilterLimit(plan);
  if (limit === null) {
    return true;
  }
  return activeCount < limit;
}

export function getUpgradeTargetForFilterLimit(
  plan: SubscriptionPlan | undefined,
): 'PRO' | 'VIP' | null {
  if (plan === 'FREE') {
    return 'PRO';
  }
  if (plan === 'PRO') {
    return 'VIP';
  }
  return null;
}
