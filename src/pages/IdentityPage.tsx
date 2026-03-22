/**
 * IdentityPage — "Your Soul Signature"
 * ======================================
 * Modern, visual, interactive soul signature page.
 * Archetype hero → OCEAN radar → trait badges → expert accordion → drift → ask twin → footer.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import { ChevronDown, ChevronUp, Share2, Sparkles, ArrowRight, Fingerprint, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { useLenis } from '@/hooks/useLenis';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { IdentityData, PersonalityProfile, EXPERT_SECTIONS, ExpertKey } from './components/identity/types';
import { determineArchetype, generateTraitBadges, extractOneLiner } from '@/utils/archetypeEngine';

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
    personality_summary: 'Highly open to new experiences with strong conscientiousness. Thrives in environments that blend structure with creative freedom.',
  },
  expertInsights: {
    personality_psychologist: [
      'Your music selection follows a clear emotional regulation strategy — high-energy tracks during morning focus, ambient during deep work.',
      'You demonstrate high openness (0.85) paired with moderate conscientiousness (0.78).',
    ],
    lifestyle_analyst: [
      'Calendar data reveals meeting clustering — bunching meetings into Tuesday/Thursday afternoons, preserving mornings for uninterrupted work.',
    ],
    cultural_identity: [
      'Your aesthetic preferences lean toward immersive, textured experiences — electronic, ambient, and lo-fi traditions.',
    ],
    social_dynamics: [
      'Your social energy is concentrated in 3 niche communities centered on shared intellectual interests.',
    ],
    motivation_analyst: [
      'Driven by mastery and novelty simultaneously — you set ambitious goals but pace them with intentional recovery cycles.',
    ],
  },
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

// ── Suggestion pills ─────────────────────────────────────────────────────

const SUGGESTION_PILLS = [
  'How have I changed this month?',
  'What patterns do you notice?',
  'What should I work on?',
  'Compare me to last month',
] as const;

// ── Drift status types ───────────────────────────────────────────────────

interface DriftData {
  similarity: number;
  recent_centroid_size: number;
  baseline_centroid_size: number;
  should_rebuild: boolean;
}

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
      {/* Breathing orb background */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="w-[400px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,132,0,0.15) 0%, rgba(255,132,0,0.05) 40%, transparent 70%)',
            animation: 'soulBreathe 4s ease-in-out infinite',
          }}
        />
      </div>

      {/* Archetype name — word by word */}
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

      {/* Tagline */}
      <motion.p
        className="relative z-10 text-center mt-4 text-sm"
        style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif", maxWidth: 400 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4, duration: 0.8 }}
      >
        {tagline}
      </motion.p>

      {/* Explore button */}
      <motion.button
        className="relative z-10 mt-10 px-6 py-2.5 rounded-[100px] text-sm font-medium flex items-center gap-2 transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
        style={{
          backgroundColor: '#ff8400',
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
  const [expandedDomain, setExpandedDomain] = useState<ExpertKey | null>(null);

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

  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; data: IdentityData }>({
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

  const { data: driftData } = useQuery<{ success: boolean; drift: DriftData }>({
    queryKey: ['personality-drift'],
    queryFn: async () => {
      const res = await authFetch('/personality-profile/drift');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    enabled: !!user && !isDemoMode,
  });

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

  if (error && !isDemoMode) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div
          className="flex flex-col items-start gap-3 px-5 py-4 rounded-[20px]"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
            <span className="text-sm font-medium" style={{ color: '#EF4444' }}>
              {(error as Error).message || 'Could not load identity data.'}
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="text-sm font-medium px-4 py-2 rounded-[100px] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.97]"
            style={{ backgroundColor: 'var(--button-bg-dark, #252222)', color: 'var(--background, #fdfcfb)' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const expertInsights = data?.data?.expertInsights ?? {};
  const summary = data?.data?.summary ?? null;

  const hasAnyData = !!(
    summary ||
    hasOcean ||
    EXPERT_SECTIONS.some((s) => (expertInsights[s.key]?.length ?? 0) > 0)
  );

  if (!hasAnyData) return <EmptyState />;

  // ── Archetype computation ──────────────────────────────────────────────

  const archetypeResult = hasOcean
    ? determineArchetype(pp!.openness, pp!.conscientiousness, pp!.extraversion, pp!.agreeableness, pp!.neuroticism)
    : null;

  const traitBadges = hasOcean
    ? generateTraitBadges(pp!.openness, pp!.conscientiousness, pp!.extraversion, pp!.agreeableness, pp!.neuroticism)
    : [];

  // ── OCEAN radar data ───────────────────────────────────────────────────

  const oceanData = hasOcean
    ? [
        { trait: 'Openness', value: Math.round(pp!.openness * 100), fullMark: 100 },
        { trait: 'Conscientiousness', value: Math.round(pp!.conscientiousness * 100), fullMark: 100 },
        { trait: 'Extraversion', value: Math.round(pp!.extraversion * 100), fullMark: 100 },
        { trait: 'Agreeableness', value: Math.round(pp!.agreeableness * 100), fullMark: 100 },
        { trait: 'Neuroticism', value: Math.round(pp!.neuroticism * 100), fullMark: 100 },
      ]
    : null;

  const memoryCount = pp?.memory_count_at_build ?? 0;
  const confidencePct = pp?.confidence != null ? Math.round(pp.confidence * 100) : 0;

  // ── Drift interpretation ───────────────────────────────────────────────

  const drift = driftData?.drift ?? null;

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

  // ── Toggle accordion ──────────────────────────────────────────────────

  const toggleDomain = (key: ExpertKey) => {
    setExpandedDomain((prev) => (prev === key ? null : key));
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
            {/* Breathing orb behind text */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <div
                className="w-[280px] h-[280px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,132,0,0.1) 0%, rgba(255,132,0,0.03) 50%, transparent 70%)',
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

        {/* ── 2. OCEAN Radar Chart ──────────────────────────────────────── */}
        {oceanData && (
          <section className="mb-14">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={oceanData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis
                  dataKey="trait"
                  tick={{
                    fill: 'rgba(255,255,255,0.4)',
                    fontSize: 11,
                    fontFamily: "'Inter', sans-serif",
                  }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name="OCEAN"
                  dataKey="value"
                  stroke="rgba(255,255,255,0.4)"
                  fill="rgba(255,255,255,0.1)"
                  fillOpacity={1}
                  strokeWidth={1.5}
                  animationBegin={200}
                  animationDuration={800}
                />
              </RadarChart>
            </ResponsiveContainer>
            <p
              className="text-center text-xs mt-2"
              style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
            >
              Based on {memoryCount.toLocaleString()} memories, {confidencePct}% confidence
            </p>
          </section>
        )}

        {/* ── 3. Trait Badges ───────────────────────────────────────────── */}
        {traitBadges.length > 0 && (
          <section className="mb-14 flex flex-wrap justify-center gap-2">
            {traitBadges.map((badge) => (
              <span
                key={badge}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {badge}
              </span>
            ))}
          </section>
        )}

        {/* ── 4. Expert Insights Accordion ──────────────────────────────── */}
        <section className="mb-14">
          {EXPERT_SECTIONS.map((section) => {
            const insights = expertInsights[section.key] ?? [];
            if (insights.length === 0) return null;

            const oneLiner = extractOneLiner(insights);
            const isExpanded = expandedDomain === section.key;

            return (
              <div key={section.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => toggleDomain(section.key)}
                  className="w-full flex items-center gap-3 py-4 text-left transition-opacity hover:opacity-80"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {/* Colored dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: section.dotColor }}
                  />

                  {/* Domain label */}
                  <span
                    className="text-[11px] font-medium tracking-[0.08em] uppercase flex-shrink-0 w-[100px]"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    {section.label}
                  </span>

                  {/* One-liner */}
                  <span
                    className="flex-1 text-sm truncate"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    {oneLiner}
                  </span>

                  {/* Chevron */}
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="pb-4 pl-[calc(8px+12px+100px+12px)]">
                    {insights.map((paragraph, idx) => (
                      <p
                        key={idx}
                        className="text-sm mb-2 last:mb-0"
                        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", lineHeight: 1.65 }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* ── 5. This Week (Drift) ─────────────────────────────────────── */}
        {drift && (
          <section className="mb-14">
            {drift.similarity > 0.90 ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(74,222,128,0.8)' }} />
                <span
                  className="text-xs font-medium"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
                >
                  Stable this week
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(251,191,36,0.8)' }} />
                <span
                  className="text-xs font-medium"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
                >
                  Shifting — personality drift detected ({Math.round(drift.similarity * 100)}% similarity)
                </span>
              </div>
            )}
          </section>
        )}

        {/* ── 6. Ask Your Twin About You ────────────────────────────────── */}
        <section className="mb-14">
          <p
            className="text-[11px] font-medium tracking-[0.08em] uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            Ask your twin about you
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTION_PILLS.map((pill) => (
              <button
                key={pill}
                onClick={() => handleSuggestion(pill)}
                className="px-3 py-2.5 rounded-[46px] text-xs font-medium transition-all duration-150 hover:opacity-70 active:scale-[0.97] flex items-center gap-1.5"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {pill}
                <ArrowRight className="w-3 h-3" style={{ color: '#ff8400' }} />
              </button>
            ))}
          </div>
        </section>

        {/* ── 7. Footer ────────────────────────────────────────────────── */}
        <footer className="flex items-center justify-between pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {!isDemoMode && user && (
            <button
              onClick={handleShare}
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
            style={{ color: '#ff8400', fontFamily: "'Inter', sans-serif" }}
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
      <div className="h-12 w-64 rounded mx-auto mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-4 w-48 rounded mx-auto" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
    {/* Radar skeleton */}
    <div className="animate-pulse mb-14">
      <div className="h-[280px] w-full rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }} />
      <div className="h-3 w-40 rounded mx-auto mt-2" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
    {/* Badges skeleton */}
    <div className="animate-pulse flex flex-wrap justify-center gap-2 mb-14">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-7 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
    {/* Expert accordion skeleton */}
    <div className="animate-pulse mb-14">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex-1 h-3 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="w-4 h-4 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      ))}
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
          style={{ border: '1px solid #ff8400', color: '#ff8400' }}
        >
          Connect platforms
        </button>
        <button
          onClick={() => navigate('/interview')}
          className="px-5 py-2 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
          style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
        >
          Complete your interview
        </button>
      </div>
    </div>
  );
};

export default IdentityPage;
