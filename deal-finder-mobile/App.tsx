import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import AppNavigator from './src/navigation/AppNavigator';
import { syncExpoPushTokenWithBackend } from './src/services/pushNotifications';
import { getToken } from './src/services/api';

/**
 * Ask for notification permission early; if already signed in, fetch token + POST immediately.
 */
async function bootstrapPushNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('deal-alerts', {
      name: 'Kelepir Alarmları',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D9488',
      sound: 'default',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }

  const authToken = await getToken();
  if (authToken) {
    // getExpoPushTokenAsync + POST /api/users/push-token (logs [PUSH TOKEN CREATED])
    await syncExpoPushTokenWithBackend();
  }
}

export default function App(): React.JSX.Element {
  useEffect(() => {
    void bootstrapPushNotifications();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}
