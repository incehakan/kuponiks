export type SubscriptionPlan = 'FREE' | 'PRO' | 'VIP';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  subscriptionPlan: SubscriptionPlan;
  telegramChatId?: string | null;
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
  title: string;
  city: string;
  price: number;
  marketAverage: number;
  dealScore: number;
  dealPercent: number;
  listingUrl?: string;
  originalUrl?: string;
  sourceUrl?: string;
  platform?: string;
  source?: string;
  sellerPhone?: string;
  /** Market Intelligence V1 (optional). */
  marketMedianPrice?: number | null;
  priceAdvantagePct?: number | null;
  marketSampleSize?: number | null;
  marketConfidence?: string | null;
}

export interface Filter {
  id: string;
  category: string;
  subcategory?: string | null;
  brand?: string | null;
  model?: string | null;
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
  subcategory?: string;
  brand?: string;
  model?: string;
  variant?: string;
  minYear?: number;
  maxYear?: number;
  minMileage?: number;
  maxMileage?: number;
  city: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  fuelType?: string;
  transmission?: string;
  sellerType?: string;
  minDealScore: number;
  keywords?: string;
  excludedKeywords?: string | string[];
  isActive?: boolean;
  notifyPush?: boolean;
  notifyTelegram?: boolean;
  notifyWhatsapp?: boolean;
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
