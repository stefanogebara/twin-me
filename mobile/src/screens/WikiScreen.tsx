import React, { useState, useEffect, useCallback } from 'react';
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
import type { WikiPage } from '../types';
import { fetchWikiPages } from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN_ORDER = [
  'personality_psychologist',
  'lifestyle_analyst',
  'cultural_identity',
  'social_dynamics',
  'motivation_analyst',
] as const;

const DOMAIN_DISPLAY: Record<string, { label: string; displayTitle: string }> = {
  personality_psychologist: { label: 'PERSONALITY', displayTitle: 'Who I Am' },
  lifestyle_analyst:        { label: 'LIFESTYLE',    displayTitle: 'How I Live' },
  cultural_identity:        { label: 'CULTURE',      displayTitle: 'What I Love' },
  social_dynamics:          { label: 'SOCIAL',       displayTitle: 'How I Connect' },
  motivation_analyst:       { label: 'MOTIVATION',   displayTitle: 'What Drives Me' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')       // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/`(.+?)`/g, '$1')       // inline code
    .replace(/\[\[.+?]]/g, '')       // wiki cross-refs
    .replace(/^[-*]\s+/gm, '')       // list bullets
    .trim();
}

function formatRelativeDate(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Just now';
  if (diffDays === 1) return 'Updated 1 day ago';
  return `Updated ${diffDays} days ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WikiDomainCard({ page }: { page: WikiPage }) {
  const [expanded, setExpanded] = useState(false);

  const domainMeta = DOMAIN_DISPLAY[page.domain] ?? {
    label: page.domain.toUpperCase(),
    displayTitle: page.title,
  };

  const cleanContent = stripMarkdown(page.content_md);
  const preview = cleanContent.slice(0, 150);
  const hasMore = cleanContent.length > 150;
  const displayContent = expanded ? cleanContent : preview;

  return (
    <View style={styles.card}>
      <View style={styles.cardInner}>
        <Text style={styles.domainLabel}>{domainMeta.label}</Text>
        <Text style={styles.cardTitle}>{domainMeta.displayTitle}</Text>
        <Text style={styles.compiledAt}>{formatRelativeDate(page.compiled_at)}</Text>
        <Text style={styles.contentText}>
          {displayContent}
          {!expanded && hasMore ? '...' : ''}
        </Text>
        {hasMore && (
          <TouchableOpacity
            onPress={() => setExpanded(prev => !prev)}
            activeOpacity={0.7}
            style={styles.toggleButton}
          >
            <Text style={styles.toggleButtonText}>
              {expanded ? 'Show less' : 'Read more'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function WikiScreen() {
  const navigation = useNavigation();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchWikiPages();
    // Sort pages by canonical domain order
    const sorted = [...data].sort((a, b) => {
      const ai = DOMAIN_ORDER.indexOf(a.domain as typeof DOMAIN_ORDER[number]);
      const bi = DOMAIN_ORDER.indexOf(b.domain as typeof DOMAIN_ORDER[number]);
      const aIdx = ai === -1 ? 99 : ai;
      const bIdx = bi === -1 ? 99 : bi;
      return aIdx - bIdx;
    });
    setPages(sorted);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
          <Text style={styles.headerTitle}>Your twin's knowledge</Text>
          <Text style={styles.headerSubtitle}>Compiled by your twin from all your data</Text>
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
          {pages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing compiled yet</Text>
              <Text style={styles.emptyText}>
                Your twin is still learning about you. Connect more platforms to build these pages.
              </Text>
            </View>
          ) : (
            pages.map(page => (
              <WikiDomainCard key={page.domain} page={page} />
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
    gap: 16,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardInner: {
    padding: 18,
  },
  domainLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: -0.4,
    lineHeight: 28,
    marginBottom: 4,
  },
  compiledAt: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  contentText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
    opacity: 0.85,
  },

  // Toggle
  toggleButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  toggleButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: COLORS.primary,
    opacity: 0.55,
    letterSpacing: 0.1,
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
