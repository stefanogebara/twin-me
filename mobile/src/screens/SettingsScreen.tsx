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
    } else {
      Alert.alert('Android only', 'Usage stats collection is only available on Android.');
    }
  }

  function openNotificationPermission() {
    if (Platform.OS === 'android') {
      NotificationListenerModule.requestNotificationPermission();
      setTimeout(() => setHasNotifPerm(NotificationListenerModule.hasNotificationPermission()), 1000);
    } else {
      Alert.alert('Android only', 'Notification tracking is only available on Android.');
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

      {/* Data collection */}
      <Text style={styles.sectionTitle}>DATA COLLECTION</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>App usage sync</Text>
            <Text style={styles.rowSubtitle}>
              Sends app usage stats to your twin every 6 hours
            </Text>
          </View>
          <Switch
            value={syncEnabled}
            onValueChange={handleSyncToggle}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={openUsageStatsPermission}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>
              Usage stats access{'  '}
              <Text style={{ color: hasUsagePerm ? COLORS.success : COLORS.warning }}>
                {hasUsagePerm ? '● Granted' : '● Not granted'}
              </Text>
            </Text>
            <Text style={styles.rowSubtitle}>
              {hasUsagePerm
                ? 'App time tracking is active'
                : 'Tap to open Settings → Apps → Usage access'}
            </Text>
          </View>
          {!hasUsagePerm && <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={openNotificationPermission}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>
              Notification access{'  '}
              <Text style={{ color: hasNotifPerm ? COLORS.success : COLORS.warning }}>
                {hasNotifPerm ? '● Granted' : '● Not granted'}
              </Text>
            </Text>
            <Text style={styles.rowSubtitle}>
              {hasNotifPerm
                ? 'Notification pattern tracking is active'
                : 'Tap to open Settings → Notifications → Notification access'}
            </Text>
          </View>
          {!hasNotifPerm && <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      </View>

      {lastSync && (
        <Text style={styles.syncNote}>Last sync: {new Date(lastSync).toLocaleString()}</Text>
      )}

      {/* About */}
      <Text style={styles.sectionTitle}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Platform</Text>
          <Text style={styles.rowValue}>Android</Text>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 17,
    fontFamily: 'Halant_500Medium',
    color: COLORS.text,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  rowContent: { flex: 1, marginRight: 12 },
  rowTitle: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: COLORS.text,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 16 },
  chevron: { fontSize: 22, color: COLORS.textMuted },
  syncNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    marginTop: -16,
    marginBottom: 24,
    marginLeft: 4,
  },
  logoutBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
