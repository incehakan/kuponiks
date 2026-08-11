import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, getErrorMessage, getToken } from './api';

/**
 * Must match `expo.extra.eas.projectId` in app.json
 * (EAS project: 76bc1832-876b-4f6c-a650-e0cf40fd3ad2).
 */
const APP_JSON_PROJECT_ID = '76bc1832-876b-4f6c-a650-e0cf40fd3ad2';

export interface DealNotificationData {
  dealId?: string;
  listingId?: string;
  url?: string;
  type?: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Resolves EAS projectId from runtime config, falling back to app.json value.
 */
function resolveProjectId(): string {
  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig = Constants.easConfig?.projectId;

  for (const candidate of [fromExpoConfig, fromEasConfig, APP_JSON_PROJECT_ID]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return APP_JSON_PROJECT_ID;
}

async function persistPushTokenToBackend(token: string): Promise<void> {
  await api.post('/users/push-token', {
    pushToken: token,
    expoPushToken: token,
  });
}

/**
 * Requests notification permission and returns a live Expo push token.
 * Never fabricates mock- tokens.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.error(
      '[Push] Fiziksel cihaz gerekli. Emülatör/simülatörde gerçek Expo push token alınamaz.',
    );
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('deal-alerts', {
      name: 'Kelepir Alarmları',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF7A00',
      sound: 'default',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    console.error(
      '[Push] Bildirim izni verilmedi. Ayarlardan bildirim iznini açıp uygulamayı yeniden başlatın.',
    );
    return null;
  }

  const projectId = resolveProjectId();
  console.log(`[Push] getExpoPushTokenAsync projectId=${projectId}`);

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenResponse.data?.trim();

    if (!token) {
      console.error('[Push] Expo boş token döndü — DB güncellenmeyecek.');
      return null;
    }

    if (token.includes('mock-')) {
      console.error(
        '[Push] Mock token reddedildi. Yalnızca canlı ExponentPushToken[...] kabul edilir:',
        token,
      );
      return null;
    }

    console.log('>>> GERÇEK TOKEN:', token);
    return token;
  } catch (error) {
    console.error(
      '[Push] getExpoPushTokenAsync başarısız (mock üretilmeyecek):',
      getErrorMessage(error, 'bilinmeyen hata'),
      `| projectId=${projectId}`,
    );
    return null;
  }
}

/**
 * Takes a live Expo push token and POSTs it to /api/users/push-token.
 */
export async function syncExpoPushTokenWithBackend(): Promise<string | null> {
  const authToken = await getToken();
  if (!authToken) {
    console.warn('[Push] Kullanıcı oturumu yok — push token backend’e gönderilmedi.');
    return null;
  }

  const token = await registerForPushNotificationsAsync();
  if (!token) {
    return null;
  }

  try {
    await persistPushTokenToBackend(token);
    console.log(`[PUSH TOKEN SAVED]: ${token}`);
    return token;
  } catch (error) {
    console.error(
      '[Push] Token DB’ye kaydedilemedi:',
      getErrorMessage(error, 'Push token kaydı başarısız'),
    );
    return null;
  }
}

export function extractDealNotificationData(
  data: unknown,
): DealNotificationData | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  const dealId =
    (typeof record.dealId === 'string' && record.dealId) ||
    (typeof record.listingId === 'string' && record.listingId) ||
    undefined;
  const url = typeof record.url === 'string' ? record.url : undefined;
  const type = typeof record.type === 'string' ? record.type : undefined;

  if (!dealId && !url) {
    return null;
  }

  return { dealId, url, type, listingId: dealId };
}

/**
 * Opens listing URL only when explicitly requested from DealDetail CTA.
 * Notification taps should navigate in-app to DealDetail instead.
 */
export async function handleDealNotificationNavigation(
  data: DealNotificationData,
): Promise<{ dealId?: string; openedUrl: boolean }> {
  return { dealId: data.dealId ?? data.listingId, openedUrl: false };
}
