import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

import { toDisplayListingImageUrl } from '../utils/listingImage';
import type {
  AuthResponse,
  CategoryFlatItem,
  CityItem,
  CreateFilterPayload,
  Deal,
  Filter,
  NotificationItem,
  TaxonomyItem,
  TaxonomyResponse,
  UpdateFilterPayload,
  UpgradeSubscriptionPayload,
  User,
  TelegramConfig,
} from '../types/models';

const TOKEN_KEY = 'user_token';

/** Production VDS API (Nginx HTTPS → PM2 api-server :3010). */
export const API_BASE_URL = 'https://45.43.152.58.nip.io/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * SecureStore only accepts strings. Pull a JWT out of common backend shapes:
 * string | { token } | { accessToken } | { data: { token } } | { data: { data: { token } } }
 */
export function extractAuthToken(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;
  const nestedDataInner =
    nestedData?.data && typeof nestedData.data === 'object'
      ? (nestedData.data as Record<string, unknown>)
      : null;

  const candidates: unknown[] = [
    record.token,
    record.accessToken,
    nestedData?.token,
    nestedData?.accessToken,
    nestedDataInner?.token,
    nestedDataInner?.accessToken,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === 'object') {
      const nestedToken = (candidate as Record<string, unknown>).token;
      if (typeof nestedToken === 'string' && nestedToken.trim().length > 0) {
        return nestedToken.trim();
      }
    }
  }

  return null;
}

/** Maps backend PublicUser shape to mobile User model. */
export function mapUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  const fullName = typeof record.fullName === 'string' ? record.fullName : null;
  const phoneValue =
    typeof record.phoneNumber === 'string'
      ? record.phoneNumber
      : typeof record.phone === 'string'
        ? record.phone
        : null;
  const subscriptionPlan = record.subscriptionPlan;

  if (!id || !fullName || !phoneValue) {
    return null;
  }

  if (
    subscriptionPlan !== 'FREE' &&
    subscriptionPlan !== 'PRO' &&
    subscriptionPlan !== 'VIP'
  ) {
    return null;
  }

  return {
    id,
    fullName,
    phone: phoneValue,
    subscriptionPlan,
    telegramChatId:
      typeof record.telegramChatId === 'string' ? record.telegramChatId : null,
  };
}

export function extractAuthUser(payload: unknown): User | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;

  const userCandidate = record.user ?? nestedData?.user;
  if (userCandidate && typeof userCandidate === 'object') {
    return mapUser(userCandidate);
  }

  return null;
}

/** @deprecated Prefer extractAuthToken — kept for call-site compatibility. */
export function normalizeToken(token: unknown): string {
  const value = extractAuthToken(token);
  if (!value) {
    throw new Error('Token must be a string or an object containing a token');
  }
  return value;
}

export async function saveToken(token: unknown): Promise<void> {
  const value =
    typeof token === 'string' && token.trim().length > 0
      ? token.trim()
      : extractAuthToken(token);

  if (!value) {
    throw new Error('Token must be a string or an object containing a token');
  }

  await SecureStore.setItemAsync(TOKEN_KEY, String(value));
}

export async function getToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === '[object Object]'
  ) {
    console.warn(
      '[AUTH] SecureStore içinde geçersiz/boş token bulundu — temizleniyor',
    );
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return null;
  }

  return trimmed;
}

export async function deleteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function isLikelyJwt(token: string): boolean {
  // JWT = header.payload.signature (3 base64url segments)
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getToken();

    if (!token) {
      if (config.headers?.Authorization) {
        delete config.headers.Authorization;
      }
      return config;
    }

    if (!isLikelyJwt(token)) {
      console.warn(
        '[AUTH] JWT formatı geçersiz — Authorization başlığı eklenmedi. Lütfen tekrar giriş yapın.',
      );
      if (config.headers?.Authorization) {
        delete config.headers.Authorization;
      }
      return config;
    }

    config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string | string[] }>) => {
    if (error.response?.status === 401) {
      const backendMessage = error.response.data?.message;
      const detail = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage;

      console.warn(
        '[AUTH 401]',
        detail?.trim() ||
          'Oturum geçersiz veya süresi dolmuş. Login ekranına düşmeden önce bu uyarıyı kontrol edin.',
      );
    }

    return Promise.reject(error);
  },
);

const NETWORK_TIMEOUT_FALLBACK =
  'Sunucu yanıt vermedi, lütfen tekrar deneyin';

const AUTH_EXPIRED_FALLBACK =
  'Oturumunuz geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.';

export function getHttpStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }
  return undefined;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string | string[];
      error?: string;
      details?: Array<{ message?: string }>;
    }>;

    if (axiosError.response?.status === 401) {
      const data = axiosError.response.data;
      const message = data?.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
      if (Array.isArray(message) && message.length > 0) {
        return message.join('\n');
      }
      return AUTH_EXPIRED_FALLBACK;
    }

    const code = axiosError.code ?? '';
    const rawMessage = (axiosError.message ?? '').toLowerCase();
    const isTimeout =
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      rawMessage.includes('timeout');
    const isNetworkFailure =
      !axiosError.response &&
      (code === 'ERR_NETWORK' ||
        code === 'ECONNREFUSED' ||
        code === 'ENOTFOUND' ||
        code === 'ECONNRESET' ||
        rawMessage.includes('network error'));

    if (isTimeout || isNetworkFailure) {
      return NETWORK_TIMEOUT_FALLBACK;
    }

    const data = axiosError.response?.data;
    const message = data?.message;

    if (Array.isArray(message) && message.length > 0) {
      return message.join('\n');
    }

    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }

    if (Array.isArray(data?.details) && data.details.length > 0) {
      const detailText = data.details
        .map((item) => item.message)
        .filter((item): item is string => Boolean(item?.trim()))
        .join('\n');
      if (detailText) {
        return detailText;
      }
    }

    // Prefer Turkish fallback over raw Axios English messages like "Request failed with status code 403"
    if (axiosError.response?.status) {
      return fallback;
    }

    if (axiosError.message && !axiosError.message.startsWith('Request failed')) {
      return NETWORK_TIMEOUT_FALLBACK;
    }

    return NETWORK_TIMEOUT_FALLBACK;
  }

  if (error instanceof Error && error.message) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes('timeout') ||
      lower.includes('network') ||
      lower.includes('failed to fetch')
    ) {
      return NETWORK_TIMEOUT_FALLBACK;
    }
    return error.message;
  }

  return fallback;
}

export const authApi = {
  login: async (phoneNumber: string, password: string): Promise<AuthResponse> => {
    const trimmedPhone = phoneNumber.trim();
    const { data } = await api.post<AuthResponse>('/auth/login', {
      phoneNumber: trimmedPhone,
      password,
    });
    return data;
  },

  register: async (
    fullName: string,
    phoneNumber: string,
    password: string,
  ): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/register', {
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      password,
    });
    return data;
  },
};

export const dealsApi = {
  getDeals: async (): Promise<Deal[]> => {
    const { data } = await api.get<unknown>('/deals', {
      params: { limit: 50 },
    });

    if (Array.isArray(data)) {
      return data.map((item) =>
        normalizeDeal(item as Partial<Deal> & Record<string, unknown>),
      );
    }

    if (
      data &&
      typeof data === 'object' &&
      Array.isArray((data as { deals?: unknown[] }).deals)
    ) {
      return ((data as { deals: unknown[] }).deals).map((item) =>
        normalizeDeal(item as Partial<Deal> & Record<string, unknown>),
      );
    }

    return [];
  },

  getDealById: async (dealId: string): Promise<Deal> => {
    const { data } = await api.get<unknown>(`/deals/${dealId}`);

    if (data && typeof data === 'object' && 'deal' in data) {
      return normalizeDeal(
        (data as { deal: Partial<Deal> & Record<string, unknown> }).deal,
      );
    }

    return normalizeDeal(data as Partial<Deal> & Record<string, unknown>);
  },

  generateMockDeal: async (): Promise<Deal | null> => {
    const { data } = await api.post<{ deal?: unknown }>('/deals/generate-mock');
    return data?.deal
      ? normalizeDeal(data.deal as Partial<Deal> & Record<string, unknown>)
      : null;
  },
};

function normalizeDeal(deal: Partial<Deal> & Record<string, unknown>): Deal {
  const listingUrl =
    (typeof deal.listingUrl === 'string' && deal.listingUrl) ||
    (typeof deal.originalUrl === 'string' && deal.originalUrl) ||
    (typeof deal.sourceUrl === 'string' && deal.sourceUrl) ||
    undefined;

  const platform =
    (typeof deal.platform === 'string' && deal.platform) ||
    (typeof deal.source === 'string' && deal.source) ||
    undefined;

  return {
    id: String(deal.id ?? ''),
    listingId:
      typeof (deal as { listingId?: string }).listingId === 'string'
        ? (deal as { listingId: string }).listingId
        : String(deal.id ?? ''),
    title: typeof deal.title === 'string' ? deal.title : 'İlan',
    city: typeof deal.city === 'string' ? deal.city : 'Belirtilmemiş',
    district: (deal as { district?: string | null }).district ?? null,
    price: Number(deal.price) || 0,
    currency: (deal as { currency?: string | null }).currency ?? 'TRY',
    marketAverage:
      Number(deal.marketAverage) ||
      Number((deal as { marketAveragePrice?: number }).marketAveragePrice) ||
      Number((deal as { marketMedianPrice?: number }).marketMedianPrice) ||
      0,
    dealScore: Number(deal.dealScore) || 0,
    dealPercent: (() => {
      const explicit = Number(deal.dealPercent);
      if (Number.isFinite(explicit)) {
        return Math.round(explicit);
      }
      const advantage = Number(
        (deal as { priceAdvantagePct?: number }).priceAdvantagePct,
      );
      if (Number.isFinite(advantage)) {
        return Math.round(advantage);
      }
      const price = Number(deal.price) || 0;
      const market =
        Number(deal.marketAverage) ||
        Number((deal as { marketAveragePrice?: number }).marketAveragePrice) ||
        Number((deal as { marketMedianPrice?: number }).marketMedianPrice) ||
        0;
      if (market > 0 && price > 0) {
        return Math.round(((market - price) / market) * 100);
      }
      return 0;
    })(),
    listingUrl,
    originalUrl: typeof deal.originalUrl === 'string' ? deal.originalUrl : listingUrl,
    sourceUrl: typeof deal.sourceUrl === 'string' ? deal.sourceUrl : listingUrl,
    platform,
    source: typeof deal.source === 'string' ? deal.source : platform,
    sellerPhone: typeof deal.sellerPhone === 'string' ? deal.sellerPhone : undefined,
    imageUrl: toDisplayListingImageUrl(
      (deal as { imageUrl?: string | null }).imageUrl,
    ),
    brand: (deal as { brand?: string | null }).brand ?? null,
    model: (deal as { model?: string | null }).model ?? null,
    series: (deal as { series?: string | null }).series ?? null,
    trim: (deal as { trim?: string | null }).trim ?? null,
    year: (deal as { year?: number | null }).year ?? null,
    mileage: (deal as { mileage?: number | null }).mileage ?? null,
    sellerType: (deal as { sellerType?: string | null }).sellerType ?? null,
    description: (deal as { description?: string | null }).description ?? null,
    marketStatus: (deal as { marketStatus?: string | null }).marketStatus ?? null,
    marketMedianPrice:
      (deal as { marketMedianPrice?: number | null }).marketMedianPrice ?? null,
    priceAdvantagePct:
      (deal as { priceAdvantagePct?: number | null }).priceAdvantagePct ?? null,
    marketSampleSize:
      (deal as { marketSampleSize?: number | null }).marketSampleSize ?? null,
    marketConfidence:
      (deal as { marketConfidence?: string | null }).marketConfidence ?? null,
    marketSegmentLevel:
      (deal as { marketSegmentLevel?: string | null }).marketSegmentLevel ?? null,
    matchedAt: (deal as { matchedAt?: string | null }).matchedAt ?? null,
    matchedFilterCount:
      (deal as { matchedFilterCount?: number }).matchedFilterCount ?? undefined,
    matchedFilters:
      (deal as { matchedFilters?: Deal['matchedFilters'] }).matchedFilters ??
      undefined,
    firstSeenAt: (deal as { firstSeenAt?: string | null }).firstSeenAt ?? null,
    publishedAt: (deal as { publishedAt?: string | null }).publishedAt ?? null,
  };
}

export const filtersApi = {
  getFilters: async (): Promise<Filter[]> => {
    const { data } = await api.get<Filter[] | { filters?: Filter[] }>('/filters');
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && Array.isArray(data.filters)) {
      return data.filters;
    }
    return [];
  },

  createFilter: async (payload: CreateFilterPayload): Promise<Filter> => {
    const { data } = await api.post<Filter | { filter: Filter }>('/filters', payload);
    if (data && typeof data === 'object' && 'filter' in data && data.filter) {
      return data.filter;
    }
    return data as Filter;
  },

  updateFilter: async (
    id: string,
    payload: UpdateFilterPayload,
  ): Promise<Filter> => {
    const { data } = await api.put<Filter | { filter: Filter }>(
      `/filters/${id}`,
      payload,
    );
    if (data && typeof data === 'object' && 'filter' in data && data.filter) {
      return data.filter;
    }
    return data as Filter;
  },

  setFilterActive: async (id: string, isActive: boolean): Promise<Filter> => {
    const { data } = await api.put<Filter | { filter: Filter }>(`/filters/${id}`, {
      isActive,
    });
    if (data && typeof data === 'object' && 'filter' in data && data.filter) {
      return data.filter;
    }
    return data as Filter;
  },

  deleteFilter: async (id: string): Promise<void> => {
    await api.delete(`/filters/${id}`);
  },
};

export const catalogApi = {
  getCategories: async (): Promise<CategoryFlatItem[]> => {
    const { data } = await api.get<{
      categories?: unknown;
      flat?: CategoryFlatItem[];
    }>('/categories');

    if (Array.isArray(data?.flat)) {
      return data.flat;
    }

    return [];
  },

  getCities: async (includeAll = true): Promise<CityItem[]> => {
    const { data } = await api.get<{ cities?: CityItem[]; count?: number }>(
      '/cities',
      {
        params: includeAll ? { includeAll: true } : undefined,
      },
    );

    if (Array.isArray(data?.cities)) {
      return data.cities;
    }

    return [];
  },
};

export const taxonomyApi = {
  getVehicleBrands: async (q?: string): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>('/taxonomy/vehicle/brands', {
      params: q ? { q } : undefined,
    });
    return Array.isArray(data?.items) ? data.items : [];
  },

  getVehicleSeries: async (
    brand: string,
    q?: string,
  ): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>('/taxonomy/vehicle/series', {
      params: { brand, ...(q ? { q } : {}) },
    });
    return Array.isArray(data?.items) ? data.items : [];
  },

  getVehicleTrims: async (
    brand: string,
    series: string,
    q?: string,
  ): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>('/taxonomy/vehicle/trims', {
      params: { brand, series, ...(q ? { q } : {}) },
    });
    return Array.isArray(data?.items) ? data.items : [];
  },

  getVehicleFuelTypes: async (): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>(
      '/taxonomy/vehicle/fuel-types',
    );
    return Array.isArray(data?.items) ? data.items : [];
  },

  getVehicleTransmissions: async (): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>(
      '/taxonomy/vehicle/transmissions',
    );
    return Array.isArray(data?.items) ? data.items : [];
  },

  getVehicleSellerTypes: async (): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>(
      '/taxonomy/vehicle/seller-types',
    );
    return Array.isArray(data?.items) ? data.items : [];
  },

  getDistricts: async (city?: string): Promise<TaxonomyItem[]> => {
    const { data } = await api.get<TaxonomyResponse>('/taxonomy/districts', {
      params: city ? { city } : undefined,
    });
    return Array.isArray(data?.items) ? data.items : [];
  },
};

export const userApi = {
  getProfile: async (): Promise<User> => {
    const { data } = await api.get<User>('/users/me');
    return mapUser(data) ?? (data as User);
  },

  registerPushToken: async (
    pushToken: string,
  ): Promise<{ success: boolean; message?: string }> => {
    const { data } = await api.post<{ success: boolean; message?: string }>(
      '/users/push-token',
      { pushToken, expoPushToken: pushToken },
    );
    return data;
  },

  upgradeSubscription: async (
    payload: UpgradeSubscriptionPayload,
  ): Promise<User> => {
    const { data } = await api.post<User>('/subscriptions/upgrade', payload);
    return mapUser(data) ?? (data as User);
  },
};

function isInternalNotification(item: NotificationItem): boolean {
  const status = (item.status ?? '').toUpperCase();
  const reason = (item.reason ?? '').toLowerCase();
  if (status && status !== 'SENT') {
    return true;
  }
  if (
    reason === 'already_sent' ||
    reason === 'no_token' ||
    reason === 'inactive_filter' ||
    reason === 'market_not_ready' ||
    reason === 'permanent_token_error'
  ) {
    return true;
  }
  return false;
}

function mapNotificationItem(item: NotificationItem): NotificationItem | null {
  if (isInternalNotification(item)) {
    return null;
  }

  const listingId = item.listingId || item.dealId || '';
  const createdAt = item.createdAt || item.sentAt || new Date().toISOString();
  const userFacing =
    item.type === 'deal' || item.title === 'Yeni fırsat bulundu!';

  return {
    id: item.id,
    type: 'deal',
    title: userFacing ? item.title || 'Yeni fırsat bulundu!' : 'Yeni fırsat bulundu!',
    message:
      item.message ||
      item.title ||
      '',
    listingId,
    dealId: item.dealId || listingId,
    imageUrl: toDisplayListingImageUrl(item.imageUrl),
    dealScore: item.dealScore ?? null,
    priceAdvantagePct: item.priceAdvantagePct ?? null,
    platform: item.platform ?? null,
    createdAt,
    sentAt: item.sentAt || createdAt,
  };
}

export const notificationsApi = {
  getNotifications: async (): Promise<NotificationItem[]> => {
    const { data } = await api.get<{ notifications?: NotificationItem[] } | NotificationItem[]>(
      '/notifications',
    );
    const raw = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray(data.notifications)
        ? data.notifications
        : [];
    return raw
      .map((item) => mapNotificationItem(item))
      .filter((item): item is NotificationItem => item != null);
  },
};

export const telegramApi = {
  getConfig: async (): Promise<TelegramConfig> => {
    const { data } = await api.get<TelegramConfig>('/telegram/config');
    return data;
  },
};

export interface CheckoutSessionResponse {
  paymentUrl?: string;
  paymentHtml?: string;
  sessionToken: string;
  provider: string;
}

export const paymentApi = {
  createCheckoutSession: async (
    plan: 'PRO' | 'VIP',
    callbackUrl?: string,
  ): Promise<CheckoutSessionResponse> => {
    const { data } = await api.post<CheckoutSessionResponse>(
      '/payment/checkout',
      { plan, callbackUrl },
    );
    return data;
  },

  getProviders: async (): Promise<{
    activeProvider: string;
    supportedProviders: string[];
  }> => {
    const { data } = await api.get('/payment/providers');
    return data as { activeProvider: string; supportedProviders: string[] };
  },
};
