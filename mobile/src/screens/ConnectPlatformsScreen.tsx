import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import type { User, PlatformConnection } from '../types';
import { fetchPlatformConnections } from '../services/api';

// ── Platform definitions ───────────────────────────────────────────────────────

interface PlatformDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: 'spotify',         name: 'Spotify',          description: 'Music taste & listening patterns',    icon: '♫' },
  { id: 'google_calendar', name: 'Google Calendar',   description: 'Schedule & time patterns',            icon: '◻' },
  { id: 'youtube',         name: 'YouTube',           description: 'Content preferences',                 icon: '▷' },
  { id: 'google_gmail',    name: 'Gmail',             description: 'Communication patterns',              icon: '◻' },
  { id: 'discord',         name: 'Discord',           description: 'Community & interests',               icon: '◇' },
  { id: 'linkedin',        name: 'LinkedIn',          description: 'Career trajectory',                   icon: '◆' },
  { id: 'github',          name: 'GitHub',            description: 'Coding patterns',                     icon: '◈' },
  { id: 'reddit',          name: 'Reddit',            description: 'Community interests',                 icon: '◎' },
  { id: 'twitch',          name: 'Twitch',            description: 'Gaming identity',                     icon: '▶' },
  { id: 'whoop',           name: 'Whoop',             description: 'Recovery & health',                   icon: '◉' },
];

const CONNECT_BASE_URL = 'https://twin-ai-learn.vercel.app/connect';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLastSync(isoString: string | undefined): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PlatformRowProps {
  platform: PlatformDef;
  connection: PlatformConnection | undefined;
  onConnect: (platformId: string) => void;
}

function PlatformRow({ platform, connection, onConnect }: PlatformRowProps) {
  const isConnected = connection?.status === 'connected';
  const lastSyncLabel = isConnected ? formatLastSync(connection?.last_sync_at) : null;

  return (
    <View style={styles.platformRow}>
      <View style={styles.platformIcon}>
        <Text style={styles.platformIconText}>{platform.icon}</Text>
      </View>

      <View style={styles.platformInfo}>
        <Text style={styles.platformName}>{platform.name}</Text>
        <Text style={styles.platformDescription}>{platform.description}</Text>
        {isConnected && lastSyncLabel ? (
          <Text style={styles.lastSync}>Last sync: {lastSyncLabel}</Text>
        ) : null}
      </View>

      <View style={styles.platformAction}>
        {isConnected ? (
          <View style={styles.connectedBadge}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => onConnect(platform.id)}
            activeOpacity={0.7}
            style={styles.connectButton}
          >
            <Text style={styles.connectButtonText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  user: User;
}

export function ConnectPlatformsScreen({ user }: Props) {
  const navigation = useNavigation();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const data = await fetchPlatformConnections(user.id);
      setConnections(data);
    } catch {
      // silently keep previous state on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // ── Connect handler ───────────────────────────────────────────────────────

  const handleConnect = useCallback((platformId: string) => {
    const url = `${CONNECT_BASE_URL}/${platformId}`;
    Linking.openURL(url).catch(() => {
      // URL open failed — nothing to do on mobile, system handles errors
    });
  }, []);

  // ── Connection lookup ─────────────────────────────────────────────────────

  const connectionMap = React.useMemo(() => {
    const map: Record<string, PlatformConnection> = {};
    for (const c of connections) {
      map[c.platform] = c;
    }
    return map;
  }, [connections]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Connect platforms</Text>
          <Text style={styles.headerSubtitle}>Connect your accounts to train your twin</Text>
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          <View style={styles.card}>
            {PLATFORMS.map((platform, index) => (
              <React.Fragment key={platform.id}>
                {index > 0 && <View style={styles.divider} />}
                <PlatformRow
                  platform={platform}
                  connection={connectionMap[platform.id]}
                  onConnect={handleConnect}
                />
              </React.Fragment>
            ))}
          </View>

          <Text style={styles.footnote}>
            Connecting opens a browser window. Your data stays private and is only used to train your twin.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 14,
  },
  backButton: {
    marginTop: 2,
  },
  backArrow: {
    fontSize: 22,
    color: COLORS.text,
    fontFamily: 'Inter_400Regular',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: -0.4,
    marginBottom: 3,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  // ── Loading ──
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },

  // ── Card ──
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: COLORS.inputBorder,
    marginLeft: 56,
  },

  // ── Platform row ──
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  platformIconText: {
    fontSize: 16,
    color: COLORS.text,
  },
  platformInfo: {
    flex: 1,
    gap: 2,
  },
  platformName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  platformDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  lastSync: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
    opacity: 0.7,
    marginTop: 2,
  },

  // ── Status / action ──
  platformAction: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  connectedText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.success,
  },
  connectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  connectButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: COLORS.primary,
    letterSpacing: 0.2,
  },

  // ── Footnote ──
  footnote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
    paddingHorizontal: 8,
  },
});
