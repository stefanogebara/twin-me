import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
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
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const displayName = user.full_name ?? user.name ?? user.email.split('@')[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Good to see you,</Text>
        <Text style={styles.name}>{displayName}</Text>
      </View>

      {/* Memory count card */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MEMORIES COLLECTED</Text>
          <Text style={styles.bigNumber}>{(stats.total ?? 0).toLocaleString()}</Text>
          <View style={styles.platformRow}>
            {Object.entries(stats.byPlatform ?? {}).slice(0, 4).map(([platform, count]) => (
              <View key={platform} style={styles.platformChip}>
                <Text style={styles.platformName}>{platform}</Text>
                <Text style={styles.platformCount}>{Number(count).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Twin insights */}
      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What your twin knows</Text>
          {insights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <View
                style={[
                  styles.insightDot,
                  { backgroundColor: EXPERT_COLORS[insight.category] ?? COLORS.primary },
                ]}
              />
              <Text style={styles.insightText} numberOfLines={3}>
                {insight.content}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Placeholder if no insights */}
      {insights.length === 0 && (
        <View style={styles.emptyCard}>
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
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 24 },
  greeting: { fontSize: 14, color: COLORS.textMuted },
  name: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 20, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  bigNumber: { fontSize: 48, fontWeight: '700', color: COLORS.text, letterSpacing: -1 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  platformChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  platformName: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  platformCount: { fontSize: 11, color: COLORS.primary },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' },
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  insightDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  insightText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },
  emptyCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 24, alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
