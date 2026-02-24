import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from './src/hooks/useAuth';
import { registerBackgroundSync } from './src/services/backgroundSync';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TwinChatScreen } from './src/screens/TwinChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { COLORS } from './src/constants';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '⊙',
    Chat: '◈',
    Settings: '⊕',
  };
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: focused ? COLORS.primary : 'transparent',
          marginBottom: 2,
        }}
      />
    </View>
  );
}

export default function App() {
  const { token, user, isLoading, login, logout } = useAuth();

  useEffect(() => {
    if (token) {
      registerBackgroundSync().catch(console.error);
    }
  }, [token]);

  if (isLoading) {
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
        <LoginScreen onLogin={login} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.background, elevation: 0, shadowOpacity: 0 },
            headerTitleStyle: { color: COLORS.text, fontWeight: '700', fontSize: 17 },
            tabBarStyle: {
              backgroundColor: COLORS.background,
              borderTopColor: COLORS.border,
              borderTopWidth: 1,
              height: 60,
              paddingBottom: 8,
            },
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: COLORS.textMuted,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tab.Screen
            name="Home"
            options={{ title: 'TwinMe', tabBarLabel: 'Home' }}
          >
            {() => <HomeScreen user={user} />}
          </Tab.Screen>

          <Tab.Screen
            name="Chat"
            component={TwinChatScreen}
            options={{ title: 'Your Twin', tabBarLabel: 'Chat' }}
          />

          <Tab.Screen
            name="Settings"
            options={{ title: 'Settings', tabBarLabel: 'Settings' }}
          >
            {() => <SettingsScreen user={user} onLogout={logout} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
