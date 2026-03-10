import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Switch, Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { COLORS, STORAGE_KEYS } from '../constants';
import type { User, SoulSignatureProfile, TwinInsight, MemoryStats, PlatformConnection } from '../types';
import {
  fetchSoulSignature,
  fetchInsights,
  fetchMemoryStats,
  fetchPlatformConnections,
} from '../services/api';
import { registerBackgroundSync, unregisterBackgroundSync, runSyncNow } from '../services/backgroundSync';
import { UsageStatsModule } from '../native/UsageStatsModule';
import { NotificationListenerModule } from '../native/NotificationListenerModule';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  personality: '#8B5CF6',
  lifestyle: '#10B981',
  culturalidentity: '#F59E0B',
  cultural_identity: '#F59E0B',
  social: '#3B82F6',
  socialdynamics: '#3B82F6',
  motivation: '#EF4444',
  health: '#06B6D4',
  music: '#EC4899',
  reflection: '#6B7280',
};

const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  google_calendar: 'Calendar',
  youtube: 'YouTube',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  whoop: 'Whoop',
  twitch: 'Twitch',
  android_usage: 'Phone',
  reddit: 'Reddit',
};

const PLATFORM_ICONS: Record<string, string> = {
  spotify: '♫',
  google_calendar: '📅',
  youtube: '▶',
  discord: '💬',
  linkedin: '💼',
  whoop: '❤',
  android_usage: '📱',
  reddit: '🔗',
  default: '○',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: TwinInsight }) {
  const cat = insight.category?.toLowerCase().replace(/\s+/g, '') ?? 'reflection';
  const color = CATEGORY_COLORS[cat] ?? COLORS.primary;
  const label = insight.category?.replace(/_/g, ' ') ?? 'Reflection';

  return (
    <View style={styles.insightCard}>
      <View style={[styles.insightDot, { backgroundColor: color }]} />
      <View style={styles.insightBody}>
        <Text style={[styles.insightCategory, { color }]}>{label.toUpperCase()}</Text>
        <Text style={styles.insightText} numberOfLines={3}>{insight.content}</Text>
      </View>
    </View>
  );
}

function PlatformStatRow({ platform, count, total }: { platform: string; count: number; total: number }) {
  const label = PLATFORM_LABELS[platform] ?? platform;
  const icon = PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.default;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <View style={styles.statRow}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarBg}>
        <View style={[styles.statBarFill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      <Text style={styles.statCount}>{count.toLocaleString()}</Text>
    </View>
  );
}

function PlatformBadge({ platform, status }: { platform: string; status: string }) {
  const label = PLATFORM_LABELS[platform] ?? platform;
  const connected = status === 'connected';
  return (
    <View style={[styles.badge, connected ? styles.badgeConnected : styles.badgeError]}>
      <Text style={[styles.badgeText, connected ? styles.badgeTextConnected : styles.badgeTextError]}>
        {label}
      </Text>
    </View>
  );
}

function PermRow({
  title,
  subtitle,
  granted,
  onTap,
}: {
  title: string;
  subtitle: string;
  granted: boolean;
  onTap: () => void;
}) {
  return (
    <TouchableOpacity style={styles.permRow} onPress={onTap} activeOpacity={0.7}>
      <View style={styles.permContent}>
        <View style={styles.permTitleRow}>
          <Text style={styles.permTitle}>{title}</Text>
          <View style={[styles.permDot, { backgroundColor: granted ? COLORS.success : COLORS.warning }]} />
          <Text style={[styles.permStatus, { color: granted ? COLORS.success : COLORS.warning }]}>
            {granted ? 'Granted' : 'Required'}
          </Text>
        </View>
        <Text style={styles.permSubtitle}>{subtitle}</Text>
      </View>
      {!granted && <Text style={styles.chevron}>›</Text>}
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  user: User;
  onLogout: () => void;
}

export function MeScreen({ user, onLogout }: Props) {
  // Soul data
  const [soul, setSoul] = useState<SoulSignatureProfile | null>(null);
  const [insights, setInsights] = useState<TwinInsight[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sync
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncIsError, setSyncIsError] = useState(false);

  // Permissions
  const [hasUsagePerm, setHasUsagePerm] = useState(false);
  const [hasNotifPerm, setHasNotifPerm] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [s, ins, st, pl] = await Promise.all([
      fetchSoulSignature(),
      fetchInsights(),
      fetchMemoryStats(),
      fetchPlatformConnections(user.id),
    ]);
    setSoul(s);
    setInsights(ins);
    setStats(st);
    setPlatforms(pl);
    setLoading(false);
    setRefreshing(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  // ── Load sync/permission state ────────────────────────────────────────────

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEYS.LAST_SYNC).then(v => setLastSync(v));
    setHasUsagePerm(UsageStatsModule.hasUsagePermission());
    setHasNotifPerm(NotificationListenerModule.hasNotificationPermission());
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // ── Sync handlers ─────────────────────────────────────────────────────────

  const handleSyncToggle = useCallback(async (enabled: boolean) => {
    setSyncEnabled(enabled);
    if (enabled) {
      await registerBackgroundSync();
    } else {
      await unregisterBackgroundSync();
    }
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    setSyncIsError(false);
    try {
      const { observationsCreated } = await runSyncNow();
      const now = new Date().toISOString();
      setLastSync(now);
      setSyncMsg(
        observationsCreated > 0
          ? `Added ${observationsCreated} new observations`
          : 'Up to date'
      );
      setSyncIsError(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setSyncMsg(msg);
      setSyncIsError(true);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // ── Permission handlers ───────────────────────────────────────────────────

  function openUsagePerm() {
    if (Platform.OS === 'android') {
      UsageStatsModule.requestUsagePermission();
      setTimeout(() => setHasUsagePerm(UsageStatsModule.hasUsagePermission()), 1000);
    }
  }

  function openNotifPerm() {
    if (Platform.OS === 'android') {
      NotificationListenerModule.requestNotificationPermission();
      setTimeout(() => setHasNotifPerm(NotificationListenerModule.hasNotificationPermission()), 1000);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onLogout },
    ]);
  }, [onLogout]);

  // ── Derived values ────────────────────────────────────────────────────────

  const displayName = user.full_name ?? user.name ?? user.email.split('@')[0];
  const initials = displayName.slice(0, 2).toUpperCase();
  const archetype = soul?.archetype_name ?? soul?.defining_traits?.[0];
  const archetypeStr = typeof archetype === 'string' ? archetype : (archetype as { name?: string })?.name ?? null;
  const connectedPlatforms = platforms.filter(p => p.status === 'connected');
  const errorPlatforms = platforms.filter(p => p.status !== 'connected');

  // Top platforms by memory count (sorted, top 5)
  const topPlatforms = stats
    ? Object.entries(stats.byPlatform)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >

      {/* ── Profile header ── */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
      </View>

      {/* ── Soul signature ── */}
      <Text style={styles.sectionLabel}>SOUL SIGNATURE</Text>
      <View style={styles.card}>
        {archetypeStr ? (
          <Text style={styles.archetypeTitle}>{archetypeStr}</Text>
        ) : null}
        {soul?.archetype_subtitle ? (
          <Text style={styles.archetypeSubtitle}>{soul.archetype_subtitle}</Text>
        ) : null}
        {soul?.narrative ? (
          <Text style={styles.narrative} numberOfLines={5}>{soul.narrative}</Text>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Not generated yet</Text>
            <Text style={styles.emptyText}>
              Open TwinMe on the web to generate your soul signature from your connected platforms.
            </Text>
          </View>
        )}
      </View>

      {/* ── Twin insights ── */}
      {insights.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>WHAT YOUR TWIN SEES</Text>
          <View style={styles.card}>
            {insights.slice(0, 3).map((insight, idx) => (
              <React.Fragment key={insight.id}>
                {idx > 0 && <View style={styles.divider} />}
                <InsightCard insight={insight} />
              </React.Fragment>
            ))}
          </View>
        </>
      )}

      {/* ── Memory activity ── */}
      {stats && stats.total > 0 && (
        <>
          <Text style={styles.sectionLabel}>MEMORY COLLECTED</Text>
          <View style={styles.card}>
            <View style={styles.memoryHeader}>
              <Text style={styles.memoryTotal}>{stats.total.toLocaleString()}</Text>
              <Text style={styles.memoryTotalLabel}>memories</Text>
            </View>
            {topPlatforms.length > 0 && (
              <View style={styles.platformStats}>
                {topPlatforms.map(([platform, count]) => (
                  <PlatformStatRow
                    key={platform}
                    platform={platform}
                    count={count}
                    total={stats.total}
                  />
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {/* ── Connected platforms ── */}
      {platforms.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>CONNECTED PLATFORMS</Text>
          <View style={styles.card}>
            <View style={styles.badgesRow}>
              {connectedPlatforms.map(p => (
                <PlatformBadge key={p.platform} platform={p.platform} status={p.status} />
              ))}
              {errorPlatforms.map(p => (
                <PlatformBadge key={p.platform} platform={p.platform} status={p.status} />
              ))}
            </View>
          </View>
        </>
      )}

      {/* ── Data & Sync ── */}
      <Text style={styles.sectionLabel}>DATA & SYNC</Text>
      <View style={styles.card}>

        {/* Sync toggle */}
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Background sync</Text>
            <Text style={styles.rowSubtitle}>Sends usage data to your twin every 6 hours</Text>
          </View>
          <Switch
            value={syncEnabled}
            onValueChange={handleSyncToggle}
            trackColor={{ true: COLORS.primary, false: COLORS.inputBorder }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        {/* Usage stats permission */}
        <PermRow
          title="Usage access"
          subtitle={hasUsagePerm ? 'App time tracking is active' : 'Tap to grant in Settings'}
          granted={hasUsagePerm}
          onTap={openUsagePerm}
        />

        <View style={styles.divider} />

        {/* Notification permission */}
        <PermRow
          title="Notification access"
          subtitle={hasNotifPerm ? 'Notification tracking is active' : 'Tap to grant in Settings'}
          granted={hasNotifPerm}
          onTap={openNotifPerm}
        />
      </View>

      {/* Sync now button */}
      <TouchableOpacity
        style={[styles.syncButton, syncing && styles.syncButtonBusy]}
        onPress={handleSyncNow}
        disabled={syncing}
        activeOpacity={0.8}
      >
        {syncing
          ? <ActivityIndicator color={COLORS.primaryFg} size="small" />
          : <Text style={styles.syncButtonText}>SYNC NOW</Text>}
      </TouchableOpacity>

      {syncMsg ? (
        <Text style={[styles.syncNote, { color: syncIsError ? COLORS.error : COLORS.success }]}>
          {syncMsg}
        </Text>
      ) : lastSync ? (
        <Text style={styles.syncNote}>
          Last sync: {new Date(lastSync).toLocaleString()}
        </Text>
      ) : null}

      {/* ── About ── */}
      <Text style={[styles.sectionLabel, { marginTop: 28 }]}>ABOUT</Text>
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
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>SIGN OUT</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  // Profile header
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
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
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
    fontFamily: 'InstrumentSerif_400Regular',
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
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  // Soul signature
  archetypeTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: -0.5,
    margin: 16,
    marginBottom: 2,
  },
  archetypeSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  narrative: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 21,
    margin: 16,
    marginTop: 0,
  },
  emptyState: { padding: 20 },
  emptyTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 17,
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },

  // Insight cards
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  insightBody: { flex: 1 },
  insightCategory: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    letterSpacing: 1.0,
    marginBottom: 4,
  },
  insightText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },

  // Memory stats
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    padding: 16,
    paddingBottom: 8,
  },
  memoryTotal: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 32,
    color: COLORS.text,
    letterSpacing: -1,
  },
  memoryTotalLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
  },
  platformStats: { paddingBottom: 8 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  statIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.text,
    width: 72,
  },
  statBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.07)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    opacity: 0.8,
  },
  statCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    width: 40,
    textAlign: 'right',
  },

  // Platform badges
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeConnected: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderColor: 'rgba(0,0,0,0.12)',
  },
  badgeError: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderColor: 'rgba(239,68,68,0.2)',
  },
  badgeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  badgeTextConnected: { color: COLORS.text },
  badgeTextError: { color: COLORS.error },

  // Data & Sync rows
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
  divider: { height: 1, backgroundColor: COLORS.inputBorder, marginLeft: 16 },

  // Permission rows
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  permContent: { flex: 1, marginRight: 8 },
  permTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  permTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.text,
  },
  permDot: { width: 6, height: 6, borderRadius: 3 },
  permStatus: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  permSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  chevron: {
    fontFamily: 'Inter_400Regular',
    fontSize: 22,
    color: COLORS.textMuted,
  },

  // Sync button
  syncButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
  },
  syncButtonBusy: { opacity: 0.6 },
  syncButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: COLORS.primaryFg,
    letterSpacing: 1.5,
  },
  syncNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Sign out
  logoutButton: {
    borderWidth: 1.5,
    borderColor: COLORS.error,
    borderRadius: 9999,
    paddingVertical: 15,
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
