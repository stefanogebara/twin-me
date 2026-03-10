import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../constants';
import { fetchPersonalityScores, fetchSoulSignature, fetchInsights } from '../services/api';
import type { PersonalityScores, SoulSignatureProfile, TwinInsight } from '../types';

// ── OCEAN trait config ─────────────────────────────────────────────────────────

const TRAITS = [
  {
    key: 'openness' as const,
    label: 'Openness',
    color: '#8B5CF6',
    low: 'Conventional',
    high: 'Imaginative',
  },
  {
    key: 'conscientiousness' as const,
    label: 'Conscientiousness',
    color: '#10B981',
    low: 'Spontaneous',
    high: 'Disciplined',
  },
  {
    key: 'extraversion' as const,
    label: 'Extraversion',
    color: '#F59E0B',
    low: 'Introspective',
    high: 'Outgoing',
  },
  {
    key: 'agreeableness' as const,
    label: 'Agreeableness',
    color: '#3B82F6',
    low: 'Direct',
    high: 'Empathetic',
  },
  {
    key: 'neuroticism' as const,
    label: 'Emotional Range',
    color: '#EC4899',
    low: 'Stable',
    high: 'Sensitive',
  },
];

const SCREEN_W = Dimensions.get('window').width;

// ── Animated bar ───────────────────────────────────────────────────────────────

function OceanBar({
  score,
  color,
  label,
  low,
  high,
  delay,
}: {
  score: number;
  color: string;
  label: string;
  low: string;
  high: string;
  delay: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const BAR_W = SCREEN_W - 48 - 32; // screen padding + card padding

  useEffect(() => {
    Animated.timing(anim, {
      toValue: score,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score, delay, anim]);

  const pct = Math.round(score * 100);
  const side = score >= 0.5 ? high : low;

  return (
    <View style={barStyles.row}>
      <View style={barStyles.headerRow}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={[barStyles.side, { color }]}>{side}</Text>
      </View>
      <View style={barStyles.track}>
        <Animated.View
          style={[
            barStyles.fill,
            {
              backgroundColor: color,
              width: anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
        {/* Tick at 50% */}
        <View style={barStyles.midTick} />
      </View>
      <Text style={barStyles.pct}>{pct}th</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { marginBottom: 18 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  side: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  midTick: {
    position: 'absolute',
    left: '50%',
    top: 0,
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  pct: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 3,
    textAlign: 'right',
  },
});

// ── Insight pill ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  personality: '#8B5CF6',
  lifestyle: '#10B981',
  culturalidentity: '#F59E0B',
  cultural_identity: '#F59E0B',
  social: '#3B82F6',
  socialdynamics: '#3B82F6',
  motivation: '#EF4444',
  music: '#EC4899',
  reflection: '#8A857D',
};

function InsightPill({ insight, index }: { insight: TwinInsight; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const cat = insight.category?.toLowerCase().replace(/\s+/g, '') ?? 'reflection';
  const color = CATEGORY_COLORS[cat] ?? COLORS.textMuted;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay: 600 + index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        delay: 600 + index * 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, index]);

  return (
    <Animated.View style={[pillStyles.pill, { opacity, transform: [{ translateY }] }]}>
      <View style={[pillStyles.dot, { backgroundColor: color }]} />
      <Text style={pillStyles.text}>{insight.content}</Text>
    </Animated.View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbf4',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    marginBottom: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 5,
    flexShrink: 0,
  },
  text: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
    flex: 1,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SoulSignatureRevealScreen({ visible, onClose }: Props) {
  const [scores, setScores] = useState<PersonalityScores | null>(null);
  const [soul, setSoul] = useState<SoulSignatureProfile | null>(null);
  const [insights, setInsights] = useState<TwinInsight[]>([]);
  const [loading, setLoading] = useState(false);

  // Hero animation
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    heroOpacity.setValue(0);
    heroY.setValue(20);

    Promise.all([fetchPersonalityScores(), fetchSoulSignature(), fetchInsights()])
      .then(([sc, sl, ins]) => {
        setScores(sc);
        setSoul(sl);
        setInsights(ins.slice(0, 4));
        setLoading(false);
        // Start hero entrance
        Animated.parallel([
          Animated.timing(heroOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(heroY, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      })
      .catch(() => setLoading(false));
  }, [visible]);

  const archetypeStr = (() => {
    const a = soul?.archetype_name ?? soul?.defining_traits?.[0];
    if (!a) return null;
    return typeof a === 'string' ? a : (a as { name?: string }).name ?? null;
  })();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header bar */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>SOUL SIGNATURE</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Reading your memories...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero: archetype */}
            <Animated.View
              style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}
            >
              {archetypeStr ? (
                <>
                  <Text style={styles.archetypeLabel}>You are</Text>
                  <Text style={styles.archetypeTitle}>{archetypeStr}</Text>
                </>
              ) : (
                <Text style={styles.archetypeTitle}>Your Personality</Text>
              )}
              {soul?.archetype_subtitle ? (
                <Text style={styles.archetypeSub}>{soul.archetype_subtitle}</Text>
              ) : null}
            </Animated.View>

            {/* Narrative */}
            {soul?.narrative ? (
              <View style={styles.section}>
                <Text style={styles.narrative}>{soul.narrative}</Text>
              </View>
            ) : null}

            {/* OCEAN bars */}
            {scores ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>PERSONALITY DIMENSIONS</Text>
                <View style={styles.card}>
                  {TRAITS.map((t, i) => (
                    <OceanBar
                      key={t.key}
                      score={scores[t.key] ?? 0.5}
                      color={t.color}
                      label={t.label}
                      low={t.low}
                      high={t.high}
                      delay={i * 80}
                    />
                  ))}
                </View>
                <Text style={styles.oceanNote}>
                  Based on Big Five personality research. Scores reflect your digital behavior patterns.
                </Text>
              </View>
            ) : null}

            {/* Expert insights */}
            {insights.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>WHAT YOUR TWIN SEES</Text>
                {insights.map((ins, i) => (
                  <InsightPill key={ins.id} insight={ins} index={i} />
                ))}
              </View>
            )}

            {/* Defining traits pills */}
            {soul?.defining_traits && soul.defining_traits.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DEFINING TRAITS</Text>
                <View style={styles.traitPills}>
                  {soul.defining_traits.slice(0, 8).map((t, i) => {
                    const label = typeof t === 'string' ? t : (t as { name: string }).name;
                    return (
                      <View key={i} style={styles.traitPill}>
                        <Text style={styles.traitPillText}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Music signature */}
            {soul?.music_signature?.top_genres && soul.music_signature.top_genres.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>MUSIC IDENTITY</Text>
                <View style={styles.traitPills}>
                  {soul.music_signature.top_genres.slice(0, 6).map((g, i) => (
                    <View key={i} style={[styles.traitPill, styles.musicPill]}>
                      <Text style={[styles.traitPillText, styles.musicPillText]}>{g}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Empty state */}
            {!scores && !soul && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Building your signature</Text>
                <Text style={styles.emptyText}>
                  Connect platforms on TwinMe web and let your twin collect memories. Your soul signature
                  appears once enough data is gathered.
                </Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  hero: {
    marginBottom: 28,
  },
  archetypeLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  archetypeTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 38,
    color: COLORS.text,
    letterSpacing: -0.8,
    lineHeight: 44,
  },
  archetypeSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: COLORS.textMuted,
    marginTop: 8,
    lineHeight: 22,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  narrative: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 24,
    opacity: 0.85,
  },
  card: {
    backgroundColor: '#fffbf4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 16,
    paddingBottom: 2,
  },
  oceanNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 8,
    lineHeight: 16,
  },
  traitPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  traitPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fffbf4',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  traitPillText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.text,
  },
  musicPill: {
    backgroundColor: 'rgba(236,72,153,0.06)',
    borderColor: 'rgba(236,72,153,0.2)',
  },
  musicPillText: {
    color: '#be185d',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 22,
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
});
