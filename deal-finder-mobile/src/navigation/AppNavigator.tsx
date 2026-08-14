import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import GlyphIcon from '../components/GlyphIcon';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { APP_NAME } from '../constants/brand';
import { colors } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import DealDetailScreen from '../screens/DealDetailScreen';
import AccountInfoScreen from '../screens/main/AccountInfoScreen';
import AboutScreen from '../screens/main/AboutScreen';
import FiltersScreen from '../screens/main/FiltersScreen';
import HelpSupportScreen from '../screens/main/HelpSupportScreen';
import HomeScreen from '../screens/main/HomeScreen';
import NotificationPrefsScreen from '../screens/main/NotificationPrefsScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import {
  extractDealNotificationData,
  syncExpoPushTokenWithBackend,
} from '../services/pushNotifications';
import type {
  AuthStackParamList,
  MainStackParamList,
  MainTabParamList,
  RootStackParamList,
} from '../types/navigation';
import { navigateToDealFromNotification, navigationRef } from './navigationRef';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function TabsNavigator(): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <MainTabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <MainTabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Fırsatlar',
          tabBarIcon: ({ color }) => (
            <GlyphIcon
              name="flash"
              size={20}
              color={color}
            />
          ),
        }}
      />
      <MainTabs.Screen
        name="Filters"
        component={FiltersScreen}
        options={{
          tabBarLabel: 'Aramalarım',
          tabBarIcon: ({ color }) => (
            <GlyphIcon
              name="search"
              size={20}
              color={color}
            />
          ),
        }}
      />
      <MainTabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Bildirimler',
          tabBarIcon: ({ color }) => (
            <GlyphIcon
              name="bell"
              size={20}
              color={color}
            />
          ),
        }}
      />
      <MainTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profilim',
          tabBarIcon: ({ color }) => (
            <GlyphIcon
              name="person"
              size={20}
              color={color}
            />
          ),
        }}
      />
    </MainTabs.Navigator>
  );
}

function MainNavigator(): React.JSX.Element {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs" component={TabsNavigator} />
      <MainStack.Screen
        name="DealDetail"
        component={DealDetailScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
      <MainStack.Screen name="AccountInfo" component={AccountInfoScreen} />
      <MainStack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} />
      <MainStack.Screen name="HelpSupport" component={HelpSupportScreen} />
      <MainStack.Screen name="About" component={AboutScreen} />
    </MainStack.Navigator>
  );
}

function processNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  const data = extractDealNotificationData(
    response.notification.request.content.data,
  );
  const dealId = data?.dealId || data?.listingId;
  if (!dealId) {
    console.warn('[Push] Bildirimde dealId/listingId yok — yönlendirme atlandı.');
    return;
  }

  navigateToDealFromNotification(dealId);
}

function PushNotificationBootstrap(): null {
  const { isAuthenticated, isLoading } = useAuth();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const handledInitialResponse = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    void syncExpoPushTokenWithBackend();
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        processNotificationResponse(response);
      });

    if (!handledInitialResponse.current) {
      handledInitialResponse.current = true;
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          processNotificationResponse(response);
        }
      });
    }

    return () => {
      responseListener.current?.remove();
      responseListener.current = null;
    };
  }, [isAuthenticated, isLoading]);

  return null;
}

function RootNavigator(): React.JSX.Element {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.bootstrapping}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.bootstrappingText}>{APP_NAME} hazırlanıyor...</Text>
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <RootStack.Screen name="Main" component={MainNavigator} />
      ) : (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}

export default function AppNavigator(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer ref={navigationRef}>
          <PushNotificationBootstrap />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootstrapping: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  bootstrappingText: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 15,
  },
});
