import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  RefreshControl, ActivityIndicator, TouchableOpacity, LayoutAnimation,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import {
  fetchMemoryStats, fetchInsights, fetchProactiveInsights, fetchGoals,
  acceptGoal, dismissGoal,
} from '../services/api';
import { WIDGET_STORAGE_KEY } from '../widgets/widgetTaskHandler';
import type { MemoryStats, TwinInsight, User, ProactiveInsight, Goal } from '../types';

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

const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  google_calendar: 'Calendar',
  google_gmail: 'Gmail',
  gmail: 'Gmail',
  youtube: 'YouTube',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  whoop: 'Whoop',
  twitch: 'Twitch',
  android_usage: 'Phone',
  reddit: 'Reddit',
  github: 'GitHub',
};

const EXPERT_COLORS: Record<string, string> = {
  personality: '#8b5cf6',
  lifestyle: '#10b981',
  cultural: '#C9B99A',
  social: '#3b82f6',
  motivation: '#D4CBBE',
};

const URGENCY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: COLORS.textMuted,
};

function InsightCard({ insight }: { insight: TwinInsight }) {
  const [expanded, setExpanded] = useState(false);
  const text = toSecondPerson(insight.content?.replace(/\*\*/g, '') ?? '');
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
        <Text style={styles.insightToggle}>{expanded ? 'Less' : 'More'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ProactiveInsightCard({ item }: { item: ProactiveInsight }) {
  const [expanded, setExpanded] = useState(false);
  const urgencyColor = URGENCY_COLORS[item.urgency] ?? COLORS.textMuted;
  return (
    <TouchableOpacity
      style={styles.proactiveCard}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(e => !e);
      }}
      activeOpacity={0.75}
    >
      <View style={[styles.urgencyBar, { backgroundColor: urgencyColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.proactiveCategory}>{item.category}</Text>
        <Text style={styles.proactiveText} numberOfLines={expanded ? undefined : 2}>
          {item.insight}
        </Text>
        {item.nudge_action && (
          <Text style={styles.nudgeAction} numberOfLines={expanded ? undefined : 1}>
            {item.nudge_action}
          </Text>
        )}
        <Text style={styles.insightToggle}>{expanded ? 'Less' : 'More'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function GoalCard({
  goal,
  onAccept,
  onDismiss,
}: {
  goal: Goal;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const pct = goal.target_value > 0
    ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
    : 0;

  return (
    <View style={styles.goalCard}>
      <Text style={styles.goalTitle}>{goal.title}</Text>
      {goal.description ? (
        <Text style={styles.goalDescription} numberOfLines={2}>{goal.description}</Text>
      ) : null}
      <View style={styles.goalProgressRow}>
        <View style={styles.goalBarBg}>
          <View style={[styles.goalBarFill, { width: `${pct}%` as `${number}%` }]} />
        </View>
        <Text style={styles.goalPct}>{pct}%</Text>
      </View>
      <View style={styles.goalActions}>
        <TouchableOpacity
          style={styles.goalAccept}
          onPress={() => onAccept(goal.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.goalAcceptText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.goalDismiss}
          onPress={() => onDismiss(goal.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.goalDismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  const navigation = useNavigation() as ReturnType<typeof useNavigation> & { navigate: (screen: string) => void };
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [insights, setInsights] = useState<TwinInsight[]>([]);
  const [proactiveInsights, setProactiveInsights] = useState<ProactiveInsight[]>([]);
  const [suggestedGoals, setSuggestedGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsResult, insightsResult, proactiveResult, goalsResult] = await Promise.allSettled([
        fetchMemoryStats(),
        fetchInsights(),
        fetchProactiveInsights(),
        fetchGoals('suggested'),
      ]);

      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      if (insightsResult.status === 'fulfilled') {
        const list = insightsResult.value.slice(0, 5);
        setInsights(list);
        if (list.length > 0) {
          AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({
            text: list[0].content,
            category: list[0].category,
            memoriesTotal: statsResult.status === 'fulfilled' ? statsResult.value?.total : undefined,
          })).catch(() => {/* non-critical */});
        }
      }
      if (proactiveResult.status === 'fulfilled') {
        // Show only undelivered insights, high urgency first
        const sorted = proactiveResult.value
          .filter(p => !p.delivered)
          .sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.urgency] ?? 1) - (order[b.urgency] ?? 1);
          })
          .slice(0, 3);
        setProactiveInsights(sorted);
      }
      if (goalsResult.status === 'fulfilled') {
        setSuggestedGoals(goalsResult.value.slice(0, 3));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh on every tab focus (covers initial load and returning from Me tab after sync)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleAcceptGoal = useCallback(async (id: string) => {
    await acceptGoal(id).catch(() => {/* non-critical */});
    setSuggestedGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const handleDismissGoal = useCallback(async (id: string) => {
    await dismissGoal(id).catch(() => {/* non-critical */});
    setSuggestedGoals(prev => prev.filter(g => g.id !== id));
  }, []);

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
      showsVerticalScrollIndicator={false}
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
      </View>

      {/* Proactive insights (twin noticed something) */}
      {proactiveInsights.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Your twin noticed</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Insights')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>
          {proactiveInsights.map((item) => (
            <ProactiveInsightCard key={item.id} item={item} />
          ))}
        </View>
      )}

      {/* Memory count card */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Memories collected</Text>
          <Text style={styles.bigNumber}>{(stats.total ?? 0).toLocaleString()}</Text>
          {Object.keys(stats.byPlatform ?? {}).length > 0 && (
            <View style={styles.chipRow}>
              {Object.entries(stats.byPlatform ?? {}).slice(0, 4).map(([platform, count]) => (
                <View key={platform} style={styles.chip}>
                  <Text style={styles.chipText}>
                    {PLATFORM_LABELS[platform] ?? platform}
                  </Text>
                  <Text style={styles.chipCount}>{Number(count).toLocaleString()}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Suggested goals from twin */}
      {suggestedGoals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Suggested goals</Text>
          {suggestedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onAccept={handleAcceptGoal}
              onDismiss={handleDismissGoal}
            />
          ))}
        </View>
      )}

      {/* Twin reflections */}
      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What your twin knows</Text>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      )}

      {insights.length === 0 && proactiveInsights.length === 0 && (
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
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 32,
    color: COLORS.text,
    letterSpacing: -1,
    lineHeight: 38,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  bigNumber: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 52,
    color: COLORS.text,
    letterSpacing: -2,
    lineHeight: 58,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 9999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: COLORS.text,
  },
  chipCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Section
  section: { marginBottom: 20 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginLeft: 2,
    marginRight: 2,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  seeAll: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 0.1,
  },

  // Insight cards
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
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
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
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
  },

  // Proactive insight cards
  proactiveCard: {
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
  urgencyBar: { width: 3, borderRadius: 2, alignSelf: 'stretch', marginTop: 2 },
  proactiveCategory: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.2,
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  proactiveText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21,
  },
  nudgeAction: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Goal cards
  goalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 8,
  },
  goalTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  goalDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
    marginBottom: 12,
  },
  goalProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  goalBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    opacity: 0.7,
  },
  goalPct: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    width: 32,
    textAlign: 'right',
  },
  goalActions: { flexDirection: 'row', gap: 8 },
  goalAccept: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  goalAcceptText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: COLORS.primaryFg,
  },
  goalDismiss: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 9999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  goalDismissText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Empty state
  emptyTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
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
