import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, Modal, TextInput,
  RefreshControl, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import {
  fetchProactiveInsights, fetchGoals, acceptGoal, dismissGoal, completeGoal, createGoal,
} from '../services/api';
import { WIDGET_STORAGE_KEY } from '../widgets/widgetTaskHandler';
import type { User, ProactiveInsight, Goal } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up,';
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Featured insight card (the ONE thing the twin wants you to know) ──────────

function FeaturedInsightCard({
  item,
  onDo,
  onLater,
}: {
  item: ProactiveInsight;
  onDo: () => void;
  onLater: () => void;
}) {
  return (
    <View style={styles.featuredCard}>
      <Text style={styles.featuredLabel}>{item.category}</Text>
      <Text style={styles.featuredText}>{item.insight}</Text>

      {item.nudge_action ? (
        <>
          <View style={styles.nudgeDivider} />
          <Text style={styles.nudgeLabel}>Suggestion</Text>
          <Text style={styles.nudgeText}>{item.nudge_action}</Text>
          <View style={styles.nudgeActions}>
            <TouchableOpacity style={styles.doBtn} onPress={onDo} activeOpacity={0.8}>
              <Text style={styles.doBtnText}>Do it</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.laterBtn} onPress={onLater} activeOpacity={0.7}>
              <Text style={styles.laterBtnText}>Later</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.nudgeActions}>
          <TouchableOpacity style={styles.laterBtn} onPress={onLater} activeOpacity={0.7}>
            <Text style={styles.laterBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.featuredTime}>{timeAgo(item.created_at)}</Text>
    </View>
  );
}

// ── Active goal row (compact — just progress + streak + complete button) ──────

function ActiveGoalRow({ goal, onComplete }: { goal: Goal; onComplete: () => void }) {
  const pct = goal.target_value > 0
    ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
    : 0;

  return (
    <View style={styles.goalRow}>
      <View style={styles.goalRowLeft}>
        <Text style={styles.goalRowTitle}>{goal.title}</Text>
        {goal.current_streak > 0 && (
          <Text style={styles.goalRowStreak}>{goal.current_streak} day streak</Text>
        )}
      </View>
      <View style={styles.goalRowRight}>
        <View style={styles.goalBarBg}>
          <View style={[styles.goalBarFill, { width: `${pct}%` as `${number}%` }]} />
        </View>
        <Text style={styles.goalPct}>{pct}%</Text>
        <TouchableOpacity
          style={styles.goalCompleteBtn}
          onPress={onComplete}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.goalCompleteBtnText}>✓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Suggested goal compact row ────────────────────────────────────────────────

function SuggestedGoalRow({
  goal,
  onAccept,
  onDismiss,
}: {
  goal: Goal;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.suggestedRow}>
      <View style={styles.suggestedLeft}>
        <Text style={styles.suggestedTitle}>{goal.title}</Text>
        {goal.description ? (
          <Text style={styles.suggestedDesc} numberOfLines={1}>{goal.description}</Text>
        ) : null}
      </View>
      <View style={styles.suggestedActions}>
        <TouchableOpacity style={styles.acceptSmall} onPress={onAccept} activeOpacity={0.8}>
          <Text style={styles.acceptSmallText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.dismissSmall}>×</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  user: User;
}

export function HomeScreen({ user }: Props) {
  const navigation = useNavigation() as ReturnType<typeof useNavigation> & {
    navigate: (screen: string) => void;
  };

  const [featuredInsight, setFeaturedInsight] = useState<ProactiveInsight | null>(null);
  const [moreInsightCount, setMoreInsightCount] = useState(0);
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [suggestedGoals, setSuggestedGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addGoalVisible, setAddGoalVisible] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [addingGoal, setAddingGoal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [proactiveResult, activeResult, suggestedResult] = await Promise.allSettled([
        fetchProactiveInsights(),
        fetchGoals('active'),
        fetchGoals('suggested'),
      ]);

      if (proactiveResult.status === 'fulfilled') {
        const all = proactiveResult.value
          .filter(p => !p.delivered)
          .sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.urgency] ?? 1) - (order[b.urgency] ?? 1);
          });
        setFeaturedInsight(all[0] ?? null);
        setMoreInsightCount(Math.max(0, all.length - 1));

        // Feed widget
        if (all[0]) {
          AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({
            text: all[0].insight,
            category: all[0].category,
          })).catch(() => {/* non-critical */});
        }
      }

      if (activeResult.status === 'fulfilled') {
        setActiveGoals(activeResult.value.slice(0, 3));
      }

      if (suggestedResult.status === 'fulfilled') {
        setSuggestedGoals(suggestedResult.value.slice(0, 2));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  const dismissFeatured = useCallback(() => {
    setFeaturedInsight(null);
  }, []);

  const handleAcceptGoal = useCallback(async (id: string) => {
    await acceptGoal(id).catch(() => {});
    setSuggestedGoals(prev => prev.filter(g => g.id !== id));
    // Reload active goals
    fetchGoals('active').then(g => setActiveGoals(g.slice(0, 3))).catch(() => {});
  }, []);

  const handleDismissGoal = useCallback(async (id: string) => {
    await dismissGoal(id).catch(() => {});
    setSuggestedGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const handleCompleteGoal = useCallback(async (id: string) => {
    await completeGoal(id).catch(() => {});
    setActiveGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const handleAddGoal = useCallback(async () => {
    const title = newGoalTitle.trim();
    if (!title) return;
    setAddingGoal(true);
    try {
      const goal = await createGoal(title);
      setActiveGoals(prev => [goal, ...prev].slice(0, 3));
      setNewGoalTitle('');
      setAddGoalVisible(false);
    } catch {
      // ignore — goal just won't appear
    } finally {
      setAddingGoal(false);
    }
  }, [newGoalTitle]);

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

  const hasContent = featuredInsight || activeGoals.length > 0 || suggestedGoals.length > 0;

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
        <Text style={styles.greeting}>{getGreeting()}</Text>
        <Text style={styles.name}>{firstName}</Text>
        <Text style={styles.twinStatus}>Your twin is active</Text>
      </View>

      {/* Featured insight — the one thing your twin wants you to know */}
      {featuredInsight && (
        <FeaturedInsightCard
          item={featuredInsight}
          onDo={dismissFeatured}
          onLater={dismissFeatured}
        />
      )}

      {/* More insights link */}
      {moreInsightCount > 0 && (
        <TouchableOpacity
          style={styles.moreInsightsRow}
          onPress={() => navigation.navigate('Insights')}
          activeOpacity={0.7}
        >
          <Text style={styles.moreInsightsText}>
            {moreInsightCount} more {moreInsightCount === 1 ? 'observation' : 'observations'} from your twin
          </Text>
          <Text style={styles.moreInsightsArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Quick chat entry */}
      <TouchableOpacity
        style={styles.chatEntry}
        onPress={() => navigation.navigate('Chat')}
        activeOpacity={0.8}
      >
        <Text style={styles.chatEntryText}>Ask your twin anything...</Text>
        <View style={styles.chatEntryBtn}>
          <Text style={styles.chatEntryBtnText}>↑</Text>
        </View>
      </TouchableOpacity>

      {/* Active goals */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Active goals</Text>
          <TouchableOpacity onPress={() => setAddGoalVisible(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.sectionAddBtn}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {activeGoals.length > 0 && (
          <View style={styles.card}>
            {activeGoals.map((goal, i) => (
              <React.Fragment key={goal.id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <ActiveGoalRow goal={goal} onComplete={() => handleCompleteGoal(goal.id)} />
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {/* Add goal modal */}
      <Modal
        visible={addGoalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddGoalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New goal</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Read for 20 minutes daily"
              placeholderTextColor={COLORS.textMuted}
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddGoal}
              maxLength={200}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setAddGoalVisible(false); setNewGoalTitle(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, (!newGoalTitle.trim() || addingGoal) && styles.modalSaveDisabled]}
                onPress={handleAddGoal}
                disabled={!newGoalTitle.trim() || addingGoal}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveText}>{addingGoal ? '...' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Suggested goals */}
      {suggestedGoals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your twin suggests</Text>
          <View style={styles.card}>
            {suggestedGoals.map((goal, i) => (
              <React.Fragment key={goal.id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <SuggestedGoalRow
                  goal={goal}
                  onAccept={() => handleAcceptGoal(goal.id)}
                  onDismiss={() => handleDismissGoal(goal.id)}
                />
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {/* Empty state */}
      {!hasContent && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Your twin is learning</Text>
          <Text style={styles.emptyText}>
            Chat with your twin or connect platforms. Observations and goals will appear here as it learns your patterns.
          </Text>
          <TouchableOpacity
            style={styles.emptyAction}
            onPress={() => navigation.navigate('Chat')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyActionText}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  // Header
  header: { marginBottom: 28 },
  headerLogo: { width: 36, height: 36, marginBottom: 18, opacity: 0.85 },
  greeting: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  name: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 34,
    color: COLORS.text,
    letterSpacing: -1,
    lineHeight: 40,
    marginBottom: 4,
  },
  twinStatus: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    opacity: 0.7,
  },

  // Featured insight card
  featuredCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  featuredLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  featuredText: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 20,
    color: COLORS.text,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  featuredTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
    opacity: 0.6,
    marginTop: 10,
  },
  nudgeDivider: {
    height: 1,
    backgroundColor: COLORS.inputBorder,
    marginVertical: 16,
  },
  nudgeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  nudgeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 14,
  },
  nudgeActions: { flexDirection: 'row', gap: 8 },
  doBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  doBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: COLORS.primaryFg,
  },
  laterBtn: {
    flex: 1,
    borderRadius: 9999,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  laterBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // More insights link
  moreInsightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  moreInsightsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
  },
  moreInsightsArrow: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
  },

  // Quick chat entry
  chatEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 28,
    gap: 8,
  },
  chatEntryText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
  },
  chatEntryBtn: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatEntryBtnText: {
    color: COLORS.primaryFg,
    fontSize: 16,
    fontWeight: '700',
  },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginLeft: 2,
    marginRight: 2,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  sectionAddBtn: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.text,
    letterSpacing: 0.3,
    opacity: 0.6,
  },

  // Shared card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowDivider: { height: 1, backgroundColor: COLORS.inputBorder, marginHorizontal: 16 },

  // Active goal row
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  goalRowLeft: { flex: 1 },
  goalRowTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 2,
  },
  goalRowStreak: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  goalRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 90,
  },
  goalBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  goalBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2, opacity: 0.7 },
  goalPct: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    width: 28,
    textAlign: 'right',
  },
  goalCompleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCompleteBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Add goal modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  modalTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
  },
  modalSave: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalSaveDisabled: { opacity: 0.4 },
  modalSaveText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.background,
  },

  // Suggested goal row
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  suggestedLeft: { flex: 1 },
  suggestedTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 2,
  },
  suggestedDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  suggestedActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  acceptSmall: {
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  acceptSmallText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: COLORS.primaryFg,
  },
  dismissSmall: {
    fontSize: 20,
    color: COLORS.textMuted,
    lineHeight: 22,
  },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 21,
    marginBottom: 20,
  },
  emptyAction: {
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  emptyActionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: COLORS.primaryFg,
  },
});
