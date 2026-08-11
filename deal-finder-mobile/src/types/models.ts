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
}

export interface Filter {
  id: string;
  category: string;
  city: string;
  minPrice?: number;
  maxPrice?: number;
  minDealScore: number;
  keywords?: string[];
  isActive?: boolean;
  notifyPush?: boolean;
  notifyTelegram?: boolean;
  notifyWhatsapp?: boolean;
}

export interface CreateFilterPayload {
  category: string;
  city: string;
  minPrice?: number;
  maxPrice?: number;
  minDealScore: number;
  keywords?: string;
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
