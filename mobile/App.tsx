import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Halant_400Regular,
  Halant_500Medium,
  Halant_600SemiBold,
} from '@expo-google-fonts/halant';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';

import { useAuth } from './src/hooks/useAuth';
import { registerBackgroundSync } from './src/services/backgroundSync';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TwinChatScreen } from './src/screens/TwinChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { COLORS } from './src/constants';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = {
  Home: '⊙',
  Chat: '◈',
  Settings: '⊕',
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
    Halant_400Regular,
    Halant_500Medium,
    Halant_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const { token, user, isLoading, login, signup, loginWithGoogle, logout } = useAuth();
  const navRef = useRef<NavigationContainerRef<Record<string, undefined>>>(null);

  useEffect(() => {
    if (token) {
      registerBackgroundSync().catch(console.error);
    }
  }, [token]);

  const handlePushTap = useCallback(() => {
    navRef.current?.navigate('Chat');
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

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef}>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.background, elevation: 0, shadowOpacity: 0 },
            headerTitleStyle: { color: COLORS.text, fontFamily: 'Halant_400Regular', fontSize: 18, letterSpacing: -0.5 },
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
            name="Settings"
            options={{
              title: 'Settings',
              tabBarLabel: 'Settings',
              tabBarIcon: ({ focused }) => <TabIcon label="Settings" focused={focused} />,
            }}
          >
            {() => <SettingsScreen user={user} onLogout={logout} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
