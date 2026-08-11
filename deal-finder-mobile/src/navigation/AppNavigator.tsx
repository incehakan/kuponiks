import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { APP_NAME } from '../constants/brand';
import { colors } from '../constants/theme';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import DealDetailScreen from '../screens/DealDetailScreen';
import FiltersScreen from '../screens/main/FiltersScreen';
import HomeScreen from '../screens/main/HomeScreen';
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
  return (
    <MainTabs.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#12022B',
        },
        headerTitleStyle: {
          fontWeight: '700',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
        tabBarActiveTintColor: '#FF7A00',
        tabBarInactiveTintColor: '#666688',
        tabBarStyle: {
          backgroundColor: '#12022B',
          borderTopColor: '#2A164D',
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        sceneStyle: {
          backgroundColor: '#12022B',
        },
      }}
    >
      <MainTabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Fırsatlar',
          headerShown: false,
          tabBarLabel: 'Fırsatlar',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="F" color={color} focused={focused} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Filters"
        component={FiltersScreen}
        options={{
          title: 'Alarmlarım',
          tabBarLabel: 'Alarmlarım',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="A" color={color} focused={focused} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profil / Ayarlar',
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="P" color={color} focused={focused} />
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
    </MainStack.Navigator>
  );
}

interface TabIconProps {
  label: string;
  color: string;
  focused: boolean;
}

function TabIcon({ label, color, focused }: TabIconProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.tabIcon,
        focused && styles.tabIconFocused,
        { borderColor: color },
      ]}
    >
      <Text style={[styles.tabIconText, { color }]}>{label}</Text>
    </View>
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

  // In-app only: never Linking.openURL from notification tap.
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
        <ActivityIndicator size="large" color={colors.primary} />
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
  tabIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconFocused: {
    backgroundColor: '#3B1D6A',
  },
  tabIconText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
