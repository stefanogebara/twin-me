import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import type { ProactiveInsight, User } from '../types';
import { fetchProactiveInsights, rateInsight } from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const URGENCY_BORDER: Record<string, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#22c55e',
};

function formatDaysAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightCard({ item }: { item: ProactiveInsight }) {
  const [rated, setRated] = useState<boolean | null>(null);

  const handleRate = useCallback(async (helpful: boolean) => {
    setRated(helpful);
    rateInsight(item.id, helpful).catch(console.warn);
  }, [item.id]);

  const borderColor = URGENCY_BORDER[item.urgency] ?? COLORS.border;

  return (
    <View style={[styles.card, { borderLeftColor: borderColor }]}>
      <Text style={styles.category}>{item.category.toUpperCase()}</Text>
      <Text style={styles.insightText}>{item.insight}</Text>
      {item.nudge_action ? (
        <Text style={styles.nudgeAction}>Try: {item.nudge_action}</Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={styles.timestamp}>{formatDaysAgo(item.created_at)}</Text>
        {rated !== null ? (
          <Text style={styles.feedbackThanks}>Thanks for the feedback</Text>
        ) : (
          <View style={styles.ratingRow}>
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => handleRate(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.rateButtonText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => handleRate(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.rateButtonText}>-</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  user: User;
}

export function InsightsScreen(_props: Props) {
  const navigation = useNavigation();
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchProactiveInsights(100);
    // Sort high urgency first
    const sorted = [...data].sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[a.urgency] ?? 1) - (order[b.urgency] ?? 1);
    });
    setInsights(sorted);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Load on mount
  React.useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backArrow}>{'<'}</Text>
        </TouchableOpacity>
        <View style={styles.headerTextGroup}>
          <Text style={styles.headerTitle}>What your twin noticed</Text>
          <Text style={styles.headerSubtitle}>Patterns observed across your data</Text>
        </View>
      </View>

      {/* ── Body ── */}
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
          {insights.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing yet</Text>
              <Text style={styles.emptyText}>
                Your twin is observing your patterns. Check back soon.
              </Text>
            </View>
          ) : (
            insights.map(item => (
              <InsightCard key={item.id} item={item} />
            ))
          )}
        </ScrollView>
      )}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexShrink: 0,
  },
  backArrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 20,
    marginTop: -1,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  // Loading / center
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 12,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  category: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  insightText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 23,
  },
  nudgeAction: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 19,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  timestamp: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rateButton: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 20,
  },
  feedbackThanks: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Empty state
  emptyState: {
    marginTop: 48,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 20,
    color: COLORS.text,
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
});
