import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, Platform,
} from 'react-native';
import { COLORS, STORAGE_KEYS } from '../constants';
import type { User } from '../types';
import * as SecureStore from 'expo-secure-store';
import { registerBackgroundSync, unregisterBackgroundSync } from '../services/backgroundSync';
import { UsageStatsModule } from '../native/UsageStatsModule';
import { NotificationListenerModule } from '../native/NotificationListenerModule';

interface Props {
  user: User;
  onLogout: () => void;
}

export function SettingsScreen({ user, onLogout }: Props) {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasUsagePerm, setHasUsagePerm] = useState(false);
  const [hasNotifPerm, setHasNotifPerm] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEYS.LAST_SYNC).then(v => setLastSync(v));
    setHasUsagePerm(UsageStatsModule.hasUsagePermission());
    setHasNotifPerm(NotificationListenerModule.hasNotificationPermission());
  }, []);

  const handleSyncToggle = useCallback(async (enabled: boolean) => {
    setSyncEnabled(enabled);
    if (enabled) {
      await registerBackgroundSync();
    } else {
      await unregisterBackgroundSync();
    }
  }, []);

  function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onLogout },
    ]);
  }

  function openUsageStatsPermission() {
    if (Platform.OS === 'android') {
      UsageStatsModule.requestUsagePermission();
      setTimeout(() => setHasUsagePerm(UsageStatsModule.hasUsagePermission()), 1000);
    }
  }

  function openNotificationPermission() {
    if (Platform.OS === 'android') {
      NotificationListenerModule.requestNotificationPermission();
      setTimeout(() => setHasNotifPerm(NotificationListenerModule.hasNotificationPermission()), 1000);
    }
  }

  const displayName = user.full_name ?? user.name ?? user.email.split('@')[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
      </View>

      {/* Section: Data collection */}
      <Text style={styles.sectionLabel}>DATA COLLECTION</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>App usage sync</Text>
            <Text style={styles.rowSubtitle}>
              Sends usage stats to your twin every 6 hours
            </Text>
          </View>
          <Switch
            value={syncEnabled}
            onValueChange={handleSyncToggle}
            trackColor={{ true: COLORS.primary, false: COLORS.inputBorder }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.rowDivider} />

        <TouchableOpacity style={styles.row} onPress={openUsageStatsPermission} activeOpacity={0.7}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>
              Usage stats access{'  '}
              <Text style={{ color: hasUsagePerm ? COLORS.success : COLORS.warning }}>
                {hasUsagePerm ? '● Granted' : '● Not granted'}
              </Text>
            </Text>
            <Text style={styles.rowSubtitle}>
              {hasUsagePerm ? 'App time tracking is active' : 'Tap to grant access in Settings'}
            </Text>
          </View>
          {!hasUsagePerm && <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>

        <View style={styles.rowDivider} />

        <TouchableOpacity style={styles.row} onPress={openNotificationPermission} activeOpacity={0.7}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>
              Notification access{'  '}
              <Text style={{ color: hasNotifPerm ? COLORS.success : COLORS.warning }}>
                {hasNotifPerm ? '● Granted' : '● Not granted'}
              </Text>
            </Text>
            <Text style={styles.rowSubtitle}>
              {hasNotifPerm ? 'Notification tracking is active' : 'Tap to grant access in Settings'}
            </Text>
          </View>
          {!hasNotifPerm && <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      </View>

      {lastSync && (
        <Text style={styles.syncNote}>Last sync: {new Date(lastSync).toLocaleString()}</Text>
      )}

      {/* Section: About */}
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Platform</Text>
          <Text style={styles.rowValue}>Android</Text>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 60 },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 9999,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.primaryFg,
    fontFamily: 'Inter_500Medium',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontFamily: 'Halant_400Regular',
    fontSize: 20,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Section label
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  rowContent: { flex: 1, marginRight: 12 },
  rowTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.text,
  },
  rowSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  rowValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
  },
  rowDivider: { height: 1, backgroundColor: COLORS.inputBorder, marginLeft: 16 },
  chevron: {
    fontFamily: 'Inter_400Regular',
    fontSize: 22,
    color: COLORS.textMuted,
  },

  // Sync note
  syncNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: -16,
    marginBottom: 24,
    marginLeft: 4,
  },

  // Sign out — outline pill button
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.error,
    borderRadius: 9999,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  logoutText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.error,
    letterSpacing: 1.5,
  },
});
