/**
 * IdentityPage — "Your Soul Signature"
 * ======================================
 * Progressive reveal: 8 chapters stacked vertically with small caps labels,
 * colored domain dots, thin dividers. Dark, typography-driven — no cards.
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { Fingerprint, AlertCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { RadarDataPoint } from '@/utils/dataTransformers';
import { useLenis } from '@/hooks/useLenis';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { IdentityData, PersonalityProfile, EXPERT_SECTIONS } from './components/identity/types';
import SoulChapter from './components/identity/SoulChapter';
import ByTheNumbersChapter from './components/identity/ByTheNumbersChapter';
import PersonalityChapter from './components/identity/PersonalityChapter';
import ExpertDomainsChapter from './components/identity/ExpertDomainsChapter';
import MusicSignatureChapter from './components/identity/MusicSignatureChapter';
import WhatsNextChapter from './components/identity/WhatsNextChapter';

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

// ── Main page ────────────────────────────────────────────────────────────

const IdentityPage: React.FC = () => {
  useLenis();
  useDocumentTitle('Your Soul Signature');
  const { user } = useAuth();
  const navigate = useNavigate();

  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  useEffect(() => {
    if (!user && !isDemoMode) navigate('/auth');
  }, [user, isDemoMode, navigate]);

  const { data: personalityData } = useQuery<{ success: boolean; profile: PersonalityProfile }>({
    queryKey: ['personality-profile'],
    queryFn: async () => {
      const res = await authFetch('/personality-profile');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 12 * 60 * 60 * 1000,
    enabled: !!user && !isDemoMode,
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

  const profile = data?.data?.profile ?? null;
  const expertInsights = data?.data?.expertInsights ?? {};
  const summary = data?.data?.summary ?? null;

  const hasAnyData = !!(
    summary ||
    profile?.archetype ||
    (profile?.uniqueness_markers?.length ?? 0) > 0 ||
    EXPERT_SECTIONS.some((s) => (expertInsights[s.key]?.length ?? 0) > 0)
  );

  if (!hasAnyData) return <EmptyState />;

  const uniquenessMarkers: string[] = Array.isArray(profile?.uniqueness_markers)
    ? profile.uniqueness_markers.filter(Boolean)
    : [];

  const musicGenres: string[] = Array.isArray(profile?.music_signature?.top_genres)
    ? (profile.music_signature.top_genres as string[]).filter(Boolean)
    : [];

  const listeningPattern: string | null =
    typeof profile?.music_signature?.listening_patterns === 'string'
      ? profile.music_signature.listening_patterns
      : null;

  const pp = personalityData?.profile;
  const oceanCards: RadarDataPoint[] | null = pp?.openness != null
    ? [
        { trait: 'Openness',          value: Math.round(pp.openness * 100) },
        { trait: 'Conscientiousness', value: Math.round(pp.conscientiousness * 100) },
        { trait: 'Extraversion',      value: Math.round(pp.extraversion * 100) },
        { trait: 'Agreeableness',     value: Math.round(pp.agreeableness * 100) },
        { trait: 'Neuroticism',       value: Math.round(pp.neuroticism * 100) },
      ]
    : null;

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '32px',
              fontWeight: 400,
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            Your Soul Signature
          </h1>
          <div className="w-10 h-[2px] mt-2" style={{ backgroundColor: '#10b77f' }} />
        </div>
        {!isDemoMode && user && (
          <button
            onClick={() => {
              const shareUrl = `${window.location.origin}/p/${user.id}`;
              navigator.clipboard.writeText(shareUrl).then(() => {
                toast.success('Link copied!');
              }).catch(() => {
                toast.error('Could not copy link');
              });
            }}
            className="flex items-center gap-1.5 text-[12px] transition-all duration-150 ease-out hover:opacity-60 active:scale-[0.97] flex-shrink-0 mt-2"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
        )}
      </div>
      <p className="text-sm mb-12" style={{ color: 'rgba(255,255,255,0.35)' }}>
        A living portrait, drawn from your data
      </p>

      {summary && (
        <div
          className="rounded-[20px] px-6 py-6 mb-8"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
          }}
        >
          <SoulChapter
            summary={summary}
            archetype={profile?.archetype ?? null}
            uniquenessMarkers={uniquenessMarkers}
          />
        </div>
      )}

      {oceanCards && (
        <div
          className="rounded-[20px] px-6 py-6 mb-8"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
          }}
        >
          <ByTheNumbersChapter oceanCards={oceanCards} />
        </div>
      )}

      {oceanCards && (
        <div
          className="rounded-[20px] px-6 py-6 mb-8"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
          }}
        >
          <PersonalityChapter
            oceanCards={oceanCards}
            temperature={pp?.temperature ?? null}
            topP={pp?.top_p ?? null}
            confidence={pp?.confidence ?? null}
          />
        </div>
      )}

      <div
        className="rounded-[20px] px-6 py-6 mb-8"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        <ExpertDomainsChapter expertInsights={expertInsights} />
      </div>

      {musicGenres.length > 0 && (
        <div
          className="rounded-[20px] px-6 py-6 mb-8"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
          }}
        >
          <MusicSignatureChapter genres={musicGenres} listeningPattern={listeningPattern} />
        </div>
      )}

      <div
        className="rounded-[20px] px-6 py-6"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        <WhatsNextChapter />
      </div>
    </div>
  );
};

// ── Loading skeleton ─────────────────────────────────────────────────────

const LoadingSkeleton: React.FC = () => (
  <div className="max-w-[680px] mx-auto px-6 py-16">
    <div className="animate-pulse">
      <div className="h-8 w-56 rounded mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="w-10 h-[2px] mt-2 mb-12" style={{ background: 'rgba(255,255,255,0.06)' }} />
    </div>
    <div className="animate-pulse mb-10">
      <div className="h-3 w-12 rounded mb-4" style={{ background: 'rgba(16,183,127,0.15)' }} />
      <div className="h-6 w-48 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="space-y-2 mb-5">
        <div className="h-4 w-full rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-4 w-4/5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="flex gap-2">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-8 w-28 rounded-[46px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
        ))}
      </div>
    </div>
    <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
    <div className="animate-pulse mb-10">
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'rgba(16,183,127,0.15)' }} />
      <div className="grid grid-cols-2 gap-6">
        {[1,2,3,4].map(i => (
          <div key={i}>
            <div className="h-8 w-16 rounded mb-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-3 w-24 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
    </div>
    <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
    <div className="animate-pulse mb-10">
      <div className="h-3 w-20 rounded mb-4" style={{ background: 'rgba(193,126,44,0.3)' }} />
      <div className="space-y-3">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-36 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-3 w-10 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
    </div>
    <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
    {[1,2,3].map(i => (
      <div key={i} className="animate-pulse mb-10">
        <div className="h-3 w-20 rounded mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="space-y-2">
          <div className="h-4 w-full rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-4 w-5/6 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-4 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
        </div>
        {i < 3 && <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />}
      </div>
    ))}
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
          className="px-5 py-2 rounded-[100px] text-sm font-medium"
          style={{ border: '1px solid #10b77f', color: '#10b77f' }}
        >
          Connect platforms
        </button>
        <button
          onClick={() => navigate('/interview')}
          className="px-5 py-2 rounded-[100px] text-sm font-medium"
          style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
        >
          Complete your interview
        </button>
      </div>
    </div>
  );
};

export default IdentityPage;
