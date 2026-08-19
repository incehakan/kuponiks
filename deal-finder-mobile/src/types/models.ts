export type SubscriptionPlan = 'FREE' | 'PRO' | 'VIP';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  subscriptionPlan: SubscriptionPlan;
  telegramChatId?: string | null;
}

export interface NotificationItem {
  id: string;
  type?: 'deal';
  title: string;
  message?: string;
  listingId: string;
  dealId?: string;
  imageUrl?: string | null;
  dealScore?: number | null;
  priceAdvantagePct?: number | null;
  platform?: string | null;
  createdAt: string;
  sentAt?: string;
  channel?: string;
  status?: string;
  reason?: string | null;
  listingUrl?: string | null;
}

export interface TelegramConfig {
  botUsername: string | null;
  deepLinkBase: string | null;
}

export interface AuthResponse {
  token?: string;
  accessToken?: string;
  user?: User;
  data?: {
    token?: string;
    accessToken?: string;
    user?: User;
    data?: {
      token?: string;
      accessToken?: string;
      user?: User;
    };
  };
}

export interface Deal {
  id: string;
  listingId?: string;
  title: string;
  city: string;
  district?: string | null;
  price: number;
  currency?: string | null;
  marketAverage: number;
  dealScore: number;
  dealPercent: number;
  listingUrl?: string;
  originalUrl?: string;
  sourceUrl?: string;
  platform?: string;
  source?: string;
  sellerPhone?: string;
  imageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  trim?: string | null;
  year?: number | null;
  mileage?: number | null;
  sellerType?: string | null;
  description?: string | null;
  marketStatus?: string | null;
  /** Market Intelligence V1 (optional). */
  marketMedianPrice?: number | null;
  priceAdvantagePct?: number | null;
  marketSampleSize?: number | null;
  marketConfidence?: string | null;
  marketSegmentLevel?: string | null;
  marketSourceCount?: number | null;
  marketSourceDistribution?: Array<{
    platform: string;
    platformLabel?: string;
    sampleSize: number;
  }>;
  marketDominantSourcePct?: number | null;
  marketDiversity?: string | null;
  marketSourceCaption?: string | null;
  platformLabel?: string;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
  engine?: string | null;
  color?: string | null;
  traction?: string | null;
  matchedAt?: string | null;
  matchedFilterCount?: number;
  matchedFilters?: Array<{
    id: string;
    name: string | null;
    category: string;
    brand: string | null;
    series: string | null;
  }>;
  firstSeenAt?: string | null;
  publishedAt?: string | null;
}

export interface Filter {
  id: string;
  name?: string | null;
  category: string;
  subcategory?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  trim?: string | null;
  variant?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minMileage?: number | null;
  maxMileage?: number | null;
  city?: string | null;
  district?: string | null;
  minPrice?: number;
  maxPrice?: number;
  fuelType?: string | null;
  transmission?: string | null;
  sellerType?: string | null;
  minDealScore: number;
  keywords?: string[];
  excludedKeywords?: string[];
  isActive?: boolean;
  notifyPush?: boolean;
  notifyTelegram?: boolean;
  notifyWhatsapp?: boolean;
}

export interface CreateFilterPayload {
  category: string;
  name?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  trim?: string | null;
  variant?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minMileage?: number | null;
  maxMileage?: number | null;
  city?: string;
  district?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  sellerType?: string | null;
  minDealScore: number;
  keywords?: string | string[];
  excludedKeywords?: string | string[];
  isActive?: boolean;
  notifyPush?: boolean;
  notifyTelegram?: boolean;
  notifyWhatsapp?: boolean;
}

export type UpdateFilterPayload = Partial<CreateFilterPayload> & {
  isActive?: boolean;
};

export type CoverageCapability = 'FULL' | 'PARTIAL' | 'UNSUPPORTED';
export type CoverageAvailability = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
export type ProviderReliability =
  | 'HEALTHY'
  | 'NO_DATA'
  | 'DEGRADED'
  | 'FAILING'
  | 'UNKNOWN';
export type EffectiveMonitorStatus =
  | 'ACTIVE'
  | 'LIMITED'
  | 'NO_DATA'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED';

export interface FilterCoveragePlatform {
  platform: string;
  status: CoverageCapability;
  capability: CoverageCapability;
  availability: CoverageAvailability;
  reliability: ProviderReliability;
  effectiveStatus: EffectiveMonitorStatus;
  userStatus: 'active' | 'limited' | 'unavailable' | 'unsupported';
  userLabel: string;
  availabilityReason: string;
  sourceCriteria: string[];
  matcherCriteria: string[];
  unsupportedCriteria: string[];
}

export interface FilterCoverageResponse {
  filterId: string;
  platforms: FilterCoveragePlatform[];
  monitoredPlatformCount: number;
  monitoredLabel: string;
  activeSourceCount: number;
  limitedSourceCount: number;
  unavailableSourceCount: number;
  totalSourceCount: number;
  statusLabel: string;
  limitedLabel: string | null;
  unavailableLabel: string | null;
}

export interface TaxonomyItem {
  value: string;
  label: string;
}

export interface TaxonomyResponse {
  items: TaxonomyItem[];
}

export interface CategoryFlatItem {
  id: string;
  path: string;
  name: string;
  parent?: string;
}

export interface CityItem {
  id: string;
  name: string;
}

export interface UpgradeSubscriptionPayload {
  plan: 'PRO' | 'VIP';
}
