/**
 * IdentityPage — "Your Soul Signature"
 * ======================================
 * 5-Layer Soul Signature: Values, Rhythms, Taste, Connections, Growth Edges.
 * Archetype hero (from OCEAN) + trait badges + layered soul portrait + ask twin + footer.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Sparkles, ArrowRight, Fingerprint, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { useLenis } from '@/hooks/useLenis';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { IdentityData, PersonalityProfile } from './components/identity/types';
import { determineArchetype, generateTraitBadges } from '@/utils/archetypeEngine';
import PersonalityAxes from './components/identity/PersonalityAxes';
import IdentityQuote from './components/identity/IdentityQuote';
import SoulScore from './components/identity/SoulScore';
import InsightCards from './components/identity/InsightCards';
import PersonalityDNA from './components/identity/PersonalityDNA';

// ── Types for 5-Layer Soul Signature ────────────────────────────────────

interface SoulValue {
  name: string;
  evidence: string;
  strength: number;
}

interface SoulRhythms {
  chronotype: string;
  peakHours: string;
  summary: string;
  distribution: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
}

interface SoulTaste {
  statement: string;
  topSignals: string[];
  diversity: number;
}

interface SoulConnections {
  style: string;
  summary: string;
  patterns: string[];
}

interface GrowthShift {
  domain: string;
  description: string;
  type: 'exploration' | 'growth' | 'stress_response';
}

interface SoulGrowthEdges {
  shifts: GrowthShift[];
  isStable: boolean;
}

interface SoulSignatureLayers {
  values: { values: SoulValue[] };
  rhythms: SoulRhythms;
  taste: SoulTaste;
  connections: SoulConnections;
  growth_edges: SoulGrowthEdges;
  generated_at: string;
}

// ── Demo fallback ────────────────────────────────────────────────────────

const DEMO_IDENTITY_DATA: IdentityData = {
  identity: {
    lifeStage: 'early_career',
    culturalOrientation: 'global_digital_native',
    careerSalience: 'high',
    approximateAge: 28,
    confidence: 0.82,
    promptFragment: 'An analytically-minded creative who balances structure with spontaneity.',
    twinVoiceHint: 'Warm but precise — thinks in systems, speaks in stories.',
    inferredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  profile: {
    archetype: 'The Creative Synthesizer',
    uniqueness_markers: ['Rhythmic Thinker', 'Intentional Planner', 'Curious Generalist', 'Community Builder'],
    music_signature: {
      top_genres: ['Lo-fi', 'Ambient', 'Synthwave', 'Classical Crossover'],
      listening_patterns: 'Uses music as a cognitive tool — high-energy for morning focus, ambient for deep work, lo-fi for transitions.',
    },
    core_values: ['Curiosity', 'Authenticity', 'Deep Work', 'Creative Freedom'],
    personality_summary: 'Highly open to new experiences with strong conscientiousness.',
  },
  expertInsights: {},
  summary: 'You are a creative synthesizer who finds meaning at the intersection of music, technology, and human connection.',
  summaryUpdatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

const DEMO_PERSONALITY: PersonalityProfile = {
  openness: 0.85,
  conscientiousness: 0.78,
  extraversion: 0.55,
  agreeableness: 0.72,
  neuroticism: 0.42,
  temperature: 0.7,
  top_p: 0.9,
  confidence: 0.82,
  memory_count_at_build: 412,
  last_built_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

const DEMO_SOUL_LAYERS: SoulSignatureLayers = {
  values: {
    values: [
      { name: 'Curiosity & Growth', evidence: 'You consistently make time for learning new skills and exploring unfamiliar territory.', strength: 0.9 },
      { name: 'Deep Connection', evidence: 'Your calendar shows heavy investment in meaningful 1:1 time over large group events.', strength: 0.85 },
      { name: 'Creative Freedom', evidence: 'You gravitate toward open-ended projects and resist rigid structures.', strength: 0.8 },
    ],
  },
  rhythms: {
    chronotype: 'night_owl',
    peakHours: '10pm - 2am',
    summary: 'Your best work happens late at night when the world goes quiet. Morning is for recovery, not creation.',
    distribution: { morning: 0.1, afternoon: 0.25, evening: 0.35, night: 0.3 },
  },
  taste: {
    statement: 'You go deep on artists you love, not broad. Loyalty over novelty.',
    topSignals: ['Brazilian pagode after Drake', 'Jazz at midnight', 'Lo-fi for deep work'],
    diversity: 0.7,
  },
  connections: {
    style: 'deep_connector',
    summary: 'Small circle, deep investment. You remember details others forget.',
    patterns: ['Recovery after social density', '1:1 over groups', 'Late-night conversations'],
  },
  growth_edges: {
    shifts: [
      { domain: 'music', description: 'New genres appearing in your rotation', type: 'exploration' },
      { domain: 'social', description: 'More group activities than usual', type: 'growth' },
    ],
    isStable: false,
  },
  generated_at: new Date().toISOString(),
};

// ── Suggestion pills ─────────────────────────────────────────────────────

const SUGGESTION_PILLS = [
  'How have I changed this month?',
  'What patterns do you notice?',
  'What should I work on?',
  'Compare me to last month',
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────

function formatChronotype(raw: string): string {
  const labels: Record<string, string> = {
    night_owl: 'Night Owl',
    early_bird: 'Early Bird',
    afternoon_peak: 'Afternoon Peak',
    even_keel: 'Even Keel',
  };
  return labels[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatConnectionStyle(raw: string): string {
  const labels: Record<string, string> = {
    deep_connector: 'Deep Connector',
    social_butterfly: 'Social Butterfly',
    selective_engager: 'Selective Engager',
    bridge_builder: 'Bridge Builder',
  };
  return labels[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function growthTypeBadgeStyle(type: string): React.CSSProperties {
  switch (type) {
    case 'exploration':
      return { background: 'rgba(93,92,174,0.15)', color: 'rgba(162,161,220,0.85)' };
    case 'growth':
      return { background: 'rgba(74,222,128,0.12)', color: 'rgba(74,222,128,0.85)' };
    case 'stress_response':
      return { background: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,0.85)' };
    default:
      return { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' };
  }
}

// ── Section label ────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2
    className="text-[11px] font-medium tracking-[0.12em] uppercase mb-4"
    style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
  >
    {children}
  </h2>
);

// ── Fade-in wrapper ─────────────────────────────────────────────────────

const FadeInSection: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({
  children,
  delay = 0,
  className = '',
}) => (
  <motion.section
    className={className}
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.5, delay, ease: 'easeOut' }}
  >
    {children}
  </motion.section>
);

// ── First-time reveal overlay ────────────────────────────────────────────

const REVEAL_KEY = 'soul_sig_revealed_v2';

const RevealOverlay: React.FC<{ archetypeName: string; tagline: string; onDismiss: () => void }> = ({
  archetypeName,
  tagline,
  onDismiss,
}) => {
  const words = archetypeName.split(' ');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: '#0a0909' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="w-[400px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(232,224,212,0.15) 0%, rgba(232,224,212,0.05) 40%, transparent 70%)',
            animation: 'soulBreathe 4s ease-in-out infinite',
          }}
        />
      </div>

      <motion.h1
        className="relative z-10 text-center"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 'clamp(40px, 8vw, 64px)',
          fontWeight: 400,
          color: '#fdfcfb',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {words.map((word, i) => (
          <motion.span
            key={i}
            className="inline-block mr-[0.3em]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2 + i * 0.35, duration: 0.6, ease: 'easeOut' }}
          >
            {word}
          </motion.span>
        ))}
      </motion.h1>

      <motion.p
        className="relative z-10 text-center mt-4 text-sm"
        style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif", maxWidth: 400 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4, duration: 0.8 }}
      >
        {tagline}
      </motion.p>

      <motion.button
        className="relative z-10 mt-10 px-6 py-2.5 rounded-[100px] text-sm font-medium flex items-center gap-2 transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
        style={{
          backgroundColor: 'var(--accent-vibrant)',
          color: '#0a0909',
          fontFamily: "'Inter', sans-serif",
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 5, duration: 0.6 }}
        onClick={onDismiss}
      >
        <Sparkles className="w-4 h-4" />
        Explore
      </motion.button>
    </motion.div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────

const IdentityPage: React.FC = () => {
  useLenis();
  useDocumentTitle('Your Soul Signature');
  const { user } = useAuth();
  const navigate = useNavigate();

  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    if (!user && !isDemoMode) navigate('/auth');
  }, [user, isDemoMode, navigate]);

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: personalityData } = useQuery<{ success: boolean; profile: PersonalityProfile }>({
    queryKey: ['personality-profile'],
    queryFn: async () => {
      const res = await authFetch('/personality-profile');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 12 * 60 * 60 * 1000,
    enabled: !!user && !isDemoMode,
    initialData: isDemoMode ? { success: true, profile: DEMO_PERSONALITY } : undefined,
  });

  const { data, isLoading: identityLoading, error: identityError, refetch: refetchIdentity } = useQuery<{ success: boolean; data: IdentityData }>({
    queryKey: ['twin-identity'],
    queryFn: async () => {
      const res = await authFetch('/twin/identity');
      if (!res.ok) throw new Error('Failed to load identity data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user && !isDemoMode,
    initialData: isDemoMode ? { success: true, data: DEMO_IDENTITY_DATA } : undefined,
  });

  const { data: soulData, isLoading: soulLoading, error: soulError } = useQuery<{ success: boolean; data: SoulSignatureLayers }>({
    queryKey: ['soul-signature-layers'],
    queryFn: async () => {
      const res = await authFetch('/soul-signature/layers');
      if (!res.ok) throw new Error('Failed to load soul signature');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user && !isDemoMode,
    initialData: isDemoMode ? { success: true, data: DEMO_SOUL_LAYERS } : undefined,
  });

  const isLoading = identityLoading || soulLoading;

  // ── First-time reveal check ────────────────────────────────────────────

  const pp = personalityData?.profile ?? null;
  const hasOcean = pp?.openness != null;

  useEffect(() => {
    if (hasOcean && !localStorage.getItem(REVEAL_KEY)) {
      setShowReveal(true);
    }
  }, [hasOcean]);

  const dismissReveal = useCallback(() => {
    setShowReveal(false);
    localStorage.setItem(REVEAL_KEY, '1');
  }, []);

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!user && !isDemoMode) return null;
  if (isLoading) return <LoadingSkeleton />;

  if ((identityError || soulError) && !isDemoMode) {
    const errorMsg = (identityError as Error)?.message || (soulError as Error)?.message || 'Could not load your soul signature.';
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div
          className="flex flex-col items-start gap-3 px-5 py-4 rounded-[20px]"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
            <span className="text-sm font-medium" style={{ color: '#EF4444' }}>
              {errorMsg}
            </span>
          </div>
          <button
            onClick={() => refetchIdentity()}
            className="text-sm font-medium px-4 py-2 rounded-[100px] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.97]"
            style={{ backgroundColor: 'var(--button-bg-dark, #252222)', color: 'var(--background, #fdfcfb)' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const summary = data?.data?.summary ?? null;
  const layers = soulData?.data?.layers ?? soulData?.data ?? null;
  const hasLayers = !!(layers?.values?.values?.length || layers?.rhythms || layers?.taste || layers?.connections);

  const hasAnyData = !!(summary || hasOcean || hasLayers);

  if (!hasAnyData) return <EmptyState />;

  // If we have OCEAN but no soul layers yet, show a "still learning" state for the layers
  const showStillLearning = !hasLayers;

  // ── Archetype computation ──────────────────────────────────────────────

  const archetypeResult = hasOcean
    ? determineArchetype(pp!.openness, pp!.conscientiousness, pp!.extraversion, pp!.agreeableness, pp!.neuroticism)
    : null;

  const traitBadges = hasOcean
    ? generateTraitBadges(pp!.openness, pp!.conscientiousness, pp!.extraversion, pp!.agreeableness, pp!.neuroticism)
    : [];

  // ── Share handler ──────────────────────────────────────────────────────

  const handleShare = () => {
    if (!user) return;
    const shareUrl = `${window.location.origin}/p/${user.id}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success('Link copied!'),
      () => toast.error('Could not copy link'),
    );
  };

  // ── Suggestion pill click ──────────────────────────────────────────────

  const handleSuggestion = (message: string) => {
    navigate('/talk-to-twin', { state: { prefill: message } });
  };

  return (
    <>
      {/* First-time reveal overlay */}
      <AnimatePresence>
        {showReveal && archetypeResult && (
          <RevealOverlay
            archetypeName={archetypeResult.archetype.name}
            tagline={archetypeResult.archetype.tagline}
            onDismiss={dismissReveal}
          />
        )}
      </AnimatePresence>

      <div className="max-w-[680px] mx-auto px-6 py-16">

        {/* ── 1. Archetype Hero Section ─────────────────────────────────── */}
        {archetypeResult && (
          <section className="relative mb-16 text-center">
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <div
                className="w-[280px] h-[280px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(232,224,212,0.1) 0%, rgba(232,224,212,0.03) 50%, transparent 70%)',
                  animation: 'soulBreathe 5s ease-in-out infinite',
                }}
              />
            </div>

            <h1
              className="relative z-10"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 'clamp(36px, 7vw, 56px)',
                fontWeight: 400,
                color: 'var(--foreground)',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              {archetypeResult.archetype.name}
            </h1>
            <p
              className="relative z-10 mt-3 text-sm"
              style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
            >
              {archetypeResult.archetype.tagline}
            </p>
          </section>
        )}

        {/* ── Trait Badges ───────────────────────────────────────────────── */}
        {traitBadges.length > 0 && (
          <FadeInSection className="mb-14 flex flex-wrap justify-center gap-2" delay={0.1}>
            {traitBadges.map((badge) => (
              <span
                key={badge}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: 'var(--glass-surface-bg)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {badge}
              </span>
            ))}
          </FadeInSection>
        )}

        {/* ── Still Learning State ──────────────────────────────────────── */}
        {showStillLearning && (
          <FadeInSection className="mb-14" delay={0.2}>
            <div
              className="rounded-[20px] px-5 py-6 text-center"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
              }}
            >
              <p
                className="text-sm mb-3"
                style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}
              >
                Your twin is still learning your patterns. Connect more platforms to unlock your full soul signature.
              </p>
              <button
                onClick={() => navigate('/get-started')}
                className="px-4 py-2 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
                style={{ border: '1px solid var(--accent-vibrant)', color: 'var(--accent-vibrant)', fontFamily: "'Inter', sans-serif" }}
              >
                Connect platforms
              </button>
            </div>
          </FadeInSection>
        )}

        {/* ── NEW: Identity Quote ───────────────────────────────────────── */}
        <IdentityQuote />

        {/* ── NEW: Soul Score + Contributor Cards ─────────────────────────── */}
        <SoulScore />

        {/* ── NEW: Swipeable Insight Cards ─────────────────────────────────── */}
        <InsightCards
          axes={(personalityData?.profile as any)?.axes}
          memoryCount={identityData?.memoryCount}
          platformCount={identityData?.platformCount}
        />

        {/* ── NEW: Personality DNA (OCEAN Sliders) ─────────────────────────── */}
        <PersonalityDNA
          ocean={personalityData?.profile?.ocean_scores}
        />

        {/* ── 2. YOUR VALUES ────────────────────────────────────────────── */}
        {layers?.values?.values && layers.values.values.length > 0 && (
          <FadeInSection className="mb-14" delay={0.15}>
            <SectionLabel>Your Values</SectionLabel>
            <div
              className="rounded-[20px] overflow-hidden"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
              }}
            >
              {layers.values.values.map((value, idx) => (
                <div
                  key={value.name}
                  className="px-5 py-4"
                  style={{
                    borderBottom: idx < layers.values.values.length - 1
                      ? '1px solid rgba(255,255,255,0.06)'
                      : 'none',
                  }}
                >
                  <h3
                    className="text-sm font-medium mb-1.5"
                    style={{ color: '#E8E0D4', fontFamily: "'Inter', sans-serif" }}
                  >
                    {value.name}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}
                  >
                    {value.evidence}
                  </p>
                </div>
              ))}
            </div>
          </FadeInSection>
        )}

        {/* ── 3. YOUR RHYTHMS ───────────────────────────────────────────── */}
        {layers?.rhythms && (
          <FadeInSection className="mb-14" delay={0.2}>
            <SectionLabel>Your Rhythms</SectionLabel>

            {/* Chronotype badge */}
            <span
              className="inline-block px-3 py-1.5 rounded-full text-xs font-medium mb-3"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#E8E0D4',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {formatChronotype(layers.rhythms.chronotype)}
            </span>

            {/* Peak hours */}
            {layers.rhythms.peakHours && (
              <p
                className="text-xs mb-3"
                style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
              >
                Peak hours: {layers.rhythms.peakHours}
              </p>
            )}

            {/* Summary */}
            <p
              className="text-sm leading-relaxed mb-5"
              style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}
            >
              {layers.rhythms.summary}
            </p>

            {/* Activity distribution bar */}
            {layers.rhythms.distribution && (
              <div>
                <div className="flex rounded-full overflow-hidden h-2 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    style={{
                      width: `${layers.rhythms.distribution.morning * 100}%`,
                      backgroundColor: 'rgba(232,224,212,0.20)',
                    }}
                  />
                  <div
                    style={{
                      width: `${layers.rhythms.distribution.afternoon * 100}%`,
                      backgroundColor: 'rgba(232,224,212,0.30)',
                    }}
                  />
                  <div
                    style={{
                      width: `${layers.rhythms.distribution.evening * 100}%`,
                      backgroundColor: 'rgba(232,224,212,0.50)',
                    }}
                  />
                  <div
                    style={{
                      width: `${layers.rhythms.distribution.night * 100}%`,
                      backgroundColor: 'rgba(232,224,212,0.40)',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}>
                  <span>Morning</span>
                  <span>Afternoon</span>
                  <span>Evening</span>
                  <span>Night</span>
                </div>
              </div>
            )}
          </FadeInSection>
        )}

        {/* ── 4. YOUR TASTE ─────────────────────────────────────────────── */}
        {layers?.taste && (
          <FadeInSection className="mb-14" delay={0.25}>
            <SectionLabel>Your Taste</SectionLabel>

            {/* Pull-quote statement */}
            <p
              className="mb-5 leading-relaxed"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '17px',
                color: 'rgba(255,255,255,0.8)',
                lineHeight: 1.6,
              }}
            >
              {layers.taste.statement}
            </p>

            {/* Top signals as glass pills */}
            {layers.taste.topSignals && layers.taste.topSignals.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {layers.taste.topSignals.map((signal) => (
                  <span
                    key={signal}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      background: 'var(--glass-surface-bg)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      color: 'rgba(255,255,255,0.55)',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {signal}
                  </span>
                ))}
              </div>
            )}
          </FadeInSection>
        )}

        {/* ── 5. HOW YOU CONNECT ────────────────────────────────────────── */}
        {layers?.connections && (
          <FadeInSection className="mb-14" delay={0.3}>
            <SectionLabel>How You Connect</SectionLabel>

            {/* Connection style badge */}
            <span
              className="inline-block px-3 py-1.5 rounded-full text-xs font-medium mb-3"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#E8E0D4',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {formatConnectionStyle(layers.connections.style)}
            </span>

            {/* Summary */}
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}
            >
              {layers.connections.summary}
            </p>

            {/* Pattern bullets */}
            {layers.connections.patterns && layers.connections.patterns.length > 0 && (
              <ul className="space-y-1.5">
                {layers.connections.patterns.map((pattern) => (
                  <li
                    key={pattern}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
                  >
                    <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'rgba(232,224,212,0.4)' }} />
                    {pattern}
                  </li>
                ))}
              </ul>
            )}
          </FadeInSection>
        )}

        {/* ── 6. WHAT'S CHANGING ────────────────────────────────────────── */}
        {layers?.growth_edges && (
          <FadeInSection className="mb-14" delay={0.35}>
            <SectionLabel>What's Changing</SectionLabel>

            {layers.growth_edges.isStable || layers.growth_edges.shifts.length === 0 ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(74,222,128,0.6)' }} />
                <p
                  className="text-sm"
                  style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
                >
                  Your patterns have been consistent — you're in a steady state
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {layers.growth_edges.shifts.map((shift) => (
                  <div key={shift.domain} className="flex items-start gap-3">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider flex-shrink-0 mt-0.5"
                      style={growthTypeBadgeStyle(shift.type)}
                    >
                      {shift.domain}
                    </span>
                    <p
                      className="text-sm"
                      style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}
                    >
                      {shift.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </FadeInSection>
        )}

        {/* ── 7. PERSONALITY DIMENSIONS (ICA) ──────────────────────────────── */}
        <PersonalityAxes />

        {/* ── 8. Ask Your Twin About You ──────────────────────────────────── */}
        <FadeInSection className="mb-14" delay={0.4}>
          <SectionLabel>Ask your twin about you</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {SUGGESTION_PILLS.map((pill) => (
              <button
                key={pill}
                onClick={() => handleSuggestion(pill)}
                className="px-3 py-2.5 rounded-[46px] text-xs font-medium transition-all duration-150 hover:opacity-70 active:scale-[0.97] flex items-center gap-1.5"
                style={{
                  background: 'var(--glass-surface-bg)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {pill}
                <ArrowRight className="w-3 h-3" style={{ color: 'var(--accent-vibrant)' }} />
              </button>
            ))}
          </div>
        </FadeInSection>

        {/* ── 8. Footer ──────────────────────────────────────────────────── */}
        <footer className="flex items-center justify-between pt-6" style={{ borderTop: '1px solid var(--border-glass)' }}>
          {!isDemoMode && user && (
            <button
              onClick={handleShare}
              aria-label="Share your soul signature"
              className="flex items-center gap-1.5 text-[12px] transition-all duration-150 ease-out hover:opacity-60 active:scale-[0.97]"
              style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          )}
          <button
            onClick={() => navigate('/get-started')}
            className="flex items-center gap-1.5 text-[12px] transition-all duration-150 ease-out hover:opacity-60 active:scale-[0.97]"
            style={{ color: 'var(--accent-vibrant)', fontFamily: "'Inter', sans-serif" }}
          >
            Connect more platforms
            <ArrowRight className="w-3 h-3" />
          </button>
        </footer>
      </div>

      {/* ── Global keyframes ────────────────────────────────────────────── */}
      <style>{`
        @keyframes soulBreathe {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </>
  );
};

// ── Loading skeleton ─────────────────────────────────────────────────────

const LoadingSkeleton: React.FC = () => (
  <div className="max-w-[680px] mx-auto px-6 py-16">
    {/* Hero skeleton */}
    <div className="animate-pulse text-center mb-16">
      <div className="h-12 w-64 rounded mx-auto mb-3" style={{ background: 'var(--glass-surface-bg)' }} />
      <div className="h-4 w-48 rounded mx-auto" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
    {/* Trait badges skeleton */}
    <div className="animate-pulse flex flex-wrap justify-center gap-2 mb-14">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-7 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
    {/* Values section skeleton */}
    <div className="animate-pulse mb-14">
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="rounded-[20px] overflow-hidden" style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-5 py-4" style={{ borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div className="h-4 w-36 rounded mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-3 w-full rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
          </div>
        ))}
      </div>
    </div>
    {/* Rhythms section skeleton */}
    <div className="animate-pulse mb-14">
      <div className="h-3 w-28 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-7 w-24 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="h-4 w-full rounded mb-2" style={{ background: 'rgba(255,255,255,0.03)' }} />
      <div className="h-2 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
    {/* Taste section skeleton */}
    <div className="animate-pulse mb-14">
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-5 w-3/4 rounded mb-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
        ))}
      </div>
    </div>
    {/* Connections section skeleton */}
    <div className="animate-pulse mb-14">
      <div className="h-3 w-32 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-7 w-28 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="h-4 w-full rounded mb-2" style={{ background: 'rgba(255,255,255,0.03)' }} />
    </div>
    {/* Growth edges skeleton */}
    <div className="animate-pulse mb-14">
      <div className="h-3 w-28 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-4 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
    </div>
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────────

const EmptyState: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <Fingerprint className="w-8 h-8 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
      <h2
        className="text-xl mb-3"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          color: 'var(--foreground)',
          opacity: 0.8,
        }}
      >
        I'm still figuring you out
      </h2>
      <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Connect Spotify, Calendar, or YouTube and I'll build a real picture of you. Usually takes a couple of days.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => navigate('/get-started')}
          className="px-5 py-2 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
          style={{ border: '1px solid var(--accent-vibrant)', color: 'var(--accent-vibrant)' }}
        >
          Connect platforms
        </button>
        <button
          onClick={() => navigate('/interview')}
          className="px-5 py-2 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
          style={{ border: '1px solid var(--border)', color: 'rgba(255,255,255,0.5)' }}
        >
          Complete your interview
        </button>
      </div>
    </div>
  );
};

export default IdentityPage;
