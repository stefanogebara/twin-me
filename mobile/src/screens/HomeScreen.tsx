import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { COLORS } from '../constants';
import { fetchMemoryStats, fetchInsights } from '../services/api';
import type { MemoryStats, TwinInsight, User } from '../types';

const EXPERT_COLORS: Record<string, string> = {
  personality: '#8b5cf6',
  lifestyle: '#10b981',
  cultural: '#f59e0b',
  social: '#3b82f6',
  motivation: '#f97316',
};

interface Props {
  user: User;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({ user }: Props) {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [insights, setInsights] = useState<TwinInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([fetchMemoryStats(), fetchInsights()]);
      setStats(s);
      setInsights(i.slice(0, 5));
    } catch {
      // silently fail — show stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.text} size="large" />
      </View>
    );
  }

  const firstName = user.full_name?.split(' ')[0]
    ?? user.name?.split(' ')[0]
    ?? user.email.split('@')[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={COLORS.text}
        />
      }
    >
      {/* Greeting */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/flower-hero.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <Text style={styles.greeting}>{getGreeting()},</Text>
        <Text style={styles.name}>{firstName}</Text>
        <Text style={styles.subheading}>Your soul signature awaits</Text>
      </View>

      {/* Memory count card */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MEMORIES COLLECTED</Text>
          <Text style={styles.bigNumber}>{(stats.total ?? 0).toLocaleString()}</Text>
          {Object.keys(stats.byPlatform ?? {}).length > 0 && (
            <View style={styles.chipRow}>
              {Object.entries(stats.byPlatform ?? {}).slice(0, 4).map(([platform, count]) => (
                <View key={platform} style={styles.chip}>
                  <Text style={styles.chipText}>{platform}</Text>
                  <Text style={styles.chipCount}>{Number(count).toLocaleString()}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHAT YOUR TWIN KNOWS</Text>
          {insights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <View
                style={[
                  styles.insightDot,
                  { backgroundColor: EXPERT_COLORS[insight.category] ?? '#000' },
                ]}
              />
              <Text style={styles.insightText} numberOfLines={3}>
                {insight.content}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty state */}
      {insights.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Twin is learning</Text>
          <Text style={styles.emptyText}>
            Connect platforms and add memories to start building your soul signature.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  // Header
  header: { marginBottom: 32 },
  headerLogo: { width: 40, height: 40, marginBottom: 20 },
  greeting: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  name: {
    fontFamily: 'Halant_400Regular',
    fontSize: 32,
    color: COLORS.text,
    letterSpacing: -1,
    lineHeight: 38,
  },
  subheading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Glass card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  cardLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bigNumber: {
    fontFamily: 'Halant_400Regular',
    fontSize: 52,
    color: COLORS.text,
    letterSpacing: -2,
    lineHeight: 58,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.text,
  },
  chipCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // Insights section
  section: { marginBottom: 20 },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 8,
  },
  insightDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  insightText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21,
  },

  // Empty state
  emptyTitle: {
    fontFamily: 'Halant_400Regular',
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
});
