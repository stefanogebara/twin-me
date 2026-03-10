import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SecureStore from 'expo-secure-store';
import {
  InstrumentSerif_400Regular,
} from '@expo-google-fonts/instrument-serif';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';

import { useAuth } from './src/hooks/useAuth';
import { registerBackgroundSync, runSyncNow } from './src/services/backgroundSync';
import { addLocationSample, SAMPLE_INTERVAL_MS } from './src/services/locationClusters';
import { registerForPushNotifications } from './src/services/pushNotifications';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TwinChatScreen } from './src/screens/TwinChatScreen';
import { MeScreen } from './src/screens/MeScreen';
import { PermissionOnboardingScreen } from './src/screens/PermissionOnboardingScreen';
import { COLORS, STORAGE_KEYS } from './src/constants';
import { UsageStatsModule } from './src/native/UsageStatsModule';
import { NotificationListenerModule } from './src/native/NotificationListenerModule';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = {
  Home: '⊙',
  Chat: '◈',
  Me: '⊕',
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: focused ? COLORS.primary : 'transparent',
        }}
      />
      <Text style={{ fontSize: 16, color: focused ? COLORS.text : COLORS.textMuted }}>
        {TAB_ICONS[label] ?? '○'}
      </Text>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const { token, user, isLoading, login, signup, loginWithGoogle, logout } = useAuth();
  const navRef = useRef<NavigationContainerRef<Record<string, undefined>>>(null);

  // Tracks whether we should show the permission onboarding wizard
  const [showPermissions, setShowPermissions] = useState<boolean | null>(null);

  useEffect(() => {
    if (token) {
      registerBackgroundSync().catch(console.error);
      registerForPushNotifications().catch(err =>
        console.warn('[Push] Registration failed (non-fatal):', err)
      );
      checkPermissionsNeeded();
    } else {
      setShowPermissions(null);
    }
  }, [token]);

  // Foreground location sampling — fires every 5 min while app is open
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(addLocationSample, SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  async function checkPermissionsNeeded() {
    const alreadyShown = await SecureStore.getItemAsync(STORAGE_KEYS.PERMISSIONS_SHOWN);
    if (alreadyShown) {
      setShowPermissions(false);
      return;
    }
    const hasUsage = UsageStatsModule.hasUsagePermission();
    const hasNotif = NotificationListenerModule.hasNotificationPermission();
    setShowPermissions(!hasUsage || !hasNotif);
  }

  async function handlePermissionsDone() {
    // Kick off an immediate sync so new permissions take effect right away
    runSyncNow().catch(console.error);
    setShowPermissions(false);
  }

  const handlePushTap = useCallback((data: Record<string, unknown>) => {
    const type = (data?.notificationType as string) ?? 'insight';
    const screenMap: Record<string, string> = {
      insight: 'Home',
      goal: 'Home',      // no dedicated Goals tab in mobile yet
      reflection: 'Me',
      chat: 'Chat',
    };
    const screen = screenMap[type] ?? 'Chat';
    navRef.current?.navigate(screen as never);
  }, []);

  usePushNotifications(token ? handlePushTap : undefined);

  if (isLoading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!token || !user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LoginScreen onLogin={login} onSignup={signup} onGoogleLogin={loginWithGoogle} />
      </SafeAreaProvider>
    );
  }

  // showPermissions is null while we're checking — show spinner
  if (showPermissions === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  // Show onboarding wizard if permissions are missing and haven't been shown yet
  if (showPermissions) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <PermissionOnboardingScreen onDone={handlePermissionsDone} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef}>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.background, elevation: 0, shadowOpacity: 0 },
            headerTitleStyle: { color: COLORS.text, fontFamily: 'InstrumentSerif_400Regular', fontSize: 18, letterSpacing: -0.5 },
            tabBarStyle: {
              backgroundColor: COLORS.background,
              borderTopColor: 'rgba(0,0,0,0.06)',
              borderTopWidth: 1,
              height: 60,
              paddingBottom: 8,
            },
            tabBarActiveTintColor: COLORS.text,
            tabBarInactiveTintColor: COLORS.textMuted,
            tabBarLabelStyle: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textTransform: 'uppercase' },
          }}
        >
          <Tab.Screen
            name="Home"
            options={{
              title: 'TwinMe',
              tabBarLabel: 'Home',
              tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
            }}
          >
            {() => <HomeScreen user={user} />}
          </Tab.Screen>

          <Tab.Screen
            name="Chat"
            component={TwinChatScreen}
            options={{
              title: 'Your Twin',
              tabBarLabel: 'Chat',
              tabBarIcon: ({ focused }) => <TabIcon label="Chat" focused={focused} />,
            }}
          />

          <Tab.Screen
            name="Me"
            options={{
              title: 'Me',
              tabBarLabel: 'Me',
              tabBarIcon: ({ focused }) => <TabIcon label="Me" focused={focused} />,
            }}
          >
            {() => <MeScreen user={user} onLogout={logout} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
