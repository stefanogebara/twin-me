import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  RefreshControl, ActivityIndicator, TouchableOpacity, LayoutAnimation,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { fetchMemoryStats, fetchInsights } from '../services/api';
import { WIDGET_STORAGE_KEY } from '../widgets/widgetTaskHandler';
import type { MemoryStats, TwinInsight, User } from '../types';

function toSecondPerson(text: string): string {
  return text
    .replace(/\bThis person's\b/g, 'Your')
    .replace(/\bthis person's\b/g, 'your')
    .replace(/\bThis person\b/g, 'You')
    .replace(/\bthis person\b/g, 'you')
    .replace(/\bTheir\b/g, 'Your')
    .replace(/\btheir\b/g, 'your')
    .replace(/\bThey\b/g, 'You')
    .replace(/\bthey\b/g, 'you')
    .replace(/\bThem\b/g, 'You')
    .replace(/\bthem\b/g, 'you')
    .replace(/\bThemselves\b/g, 'Yourself')
    .replace(/\bthemselves\b/g, 'yourself');
}

function InsightCard({ insight }: { insight: TwinInsight }) {
  const [expanded, setExpanded] = useState(false);
  const text = toSecondPerson(insight.content);
  return (
    <TouchableOpacity
      style={styles.insightCard}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(e => !e);
      }}
      activeOpacity={0.75}
    >
      <View
        style={[
          styles.insightDot,
          { backgroundColor: EXPERT_COLORS[insight.category] ?? '#000' },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.insightText} numberOfLines={expanded ? undefined : 3}>
          {text}
        </Text>
        <Text style={styles.insightToggle}>{expanded ? 'Less ↑' : 'More ↓'}</Text>
      </View>
    </TouchableOpacity>
  );
}

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
      const [statsResult, insightsResult] = await Promise.allSettled([
        fetchMemoryStats(),
        fetchInsights(),
      ]);
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      else console.error('[Home] stats failed:', statsResult.reason);
      if (insightsResult.status === 'fulfilled') {
        const list = insightsResult.value.slice(0, 5);
        setInsights(list);
        // Persist first insight for the home screen widget
        if (list.length > 0) {
          AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({
            text: list[0].content,
            category: list[0].category,
            memoriesTotal: statsResult.status === 'fulfilled' ? statsResult.value?.total : undefined,
          })).catch(() => {/* non-critical */});
        }
      } else {
        console.error('[Home] insights failed:', insightsResult.reason);
      }
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
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      )}

      {/* Empty state — show when no insights loaded yet */}
      {insights.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Twin is building your portrait</Text>
          <Text style={styles.emptyText}>
            Connect platforms on the web and chat with your twin — insights appear here as it learns your patterns.
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
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21,
  },
  insightToggle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
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
