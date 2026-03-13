/**
 * IdentityPage — "Your Soul Signature"
 * ======================================
 * Progressive reveal: 8 chapters stacked vertically with small caps labels,
 * colored domain dots, thin dividers. Dark, typography-driven — no cards.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import {
  Fingerprint,
  RefreshCw,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { toSecondPerson } from '@/lib/utils';
import { RadarDataPoint } from '@/utils/dataTransformers';
import { useLenis } from '@/hooks/useLenis';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// ── Types ──────────────────────────────────────────────────────────────────

interface IdentityContext {
  lifeStage: string;
  culturalOrientation: string;
  careerSalience: string;
  approximateAge: number | null;
  confidence: number;
  promptFragment: string;
  twinVoiceHint: string;
  inferredAt: string;
}

interface SoulProfile {
  archetype: string | null;
  uniqueness_markers: string[] | null;
  music_signature: {
    top_genres?: string[];
    listening_patterns?: string;
    [key: string]: unknown;
  } | null;
  core_values: string[] | null;
  personality_summary: string | null;
}

interface IdentityData {
  identity: IdentityContext | null;
  profile: SoulProfile | null;
  expertInsights: Record<string, string[]>;
  summary: string | null;
  summaryUpdatedAt: string | null;
}

interface PersonalityProfile {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  temperature: number;
  top_p: number;
  confidence: number;
  last_built_at: string;
}

// ── Expert config ────────────────────────────────────────────────────────

type ExpertKey =
  | 'personality_psychologist'
  | 'lifestyle_analyst'
  | 'cultural_identity'
  | 'social_dynamics'
  | 'motivation_analyst';

const EXPERT_SECTIONS: Array<{
  key: ExpertKey;
  label: string;
  dotColor: string;
}> = [
  { key: 'personality_psychologist', label: 'Personality', dotColor: '#c17e2c' },
  { key: 'lifestyle_analyst', label: 'Lifestyle', dotColor: '#5d5cae' },
  { key: 'cultural_identity', label: 'Cultural Taste', dotColor: '#c1452c' },
  { key: 'social_dynamics', label: 'Social Dynamics', dotColor: '#2cc1a0' },
  { key: 'motivation_analyst', label: 'Motivation', dotColor: '#c1a02c' },
];

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

// ── Helpers ──────────────────────────────────────────────────────────────

function stripCitations(text: string): string {
  return text
    .replace(/\[Memory\s*#?\d+\]/gi, '')
    .replace(/\[Source:\s*[^\]]*\]/gi, '')
    .replace(/\[Based on[^\]]*\]/gi, '')
    .replace(/\[Ref\s*#?\d+\]/gi, '')
    .replace(/\[Note:\s*[^\]]*\]/gi, '')
    .replace(/\[Evidence[^\]]*\]/gi, '')
    .replace(/\[mem\s*#?\d+\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripLeadingBullet(text: string): string {
  return text.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, '').trim();
}

function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const bg = new Set<string>();
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length - 1; i++) bg.add(lower.slice(i, i + 2));
    return bg;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2 * intersection) / (setA.size + setB.size) || 0;
}

function cleanBullets(bullets: string[]): string[] {
  const cleaned: string[] = [];
  for (const raw of bullets) {
    const text = stripCitations(stripLeadingBullet(raw));
    if (!text) continue;
    const isDuplicate = cleaned.some((existing) => bigramSimilarity(existing, text) > 0.75);
    if (isDuplicate) continue;
    cleaned.push(text);
  }
  return cleaned;
}

// ── Sub-components ───────────────────────────────────────────────────────

const SectionLabel: React.FC<{ label: string; color?: string }> = ({ label, color = '#10b77f' }) => (
  <div className="flex items-center gap-2 mb-4">
    {color !== '#10b77f' && (
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    )}
    <span
      className="text-[11px] font-medium tracking-widest uppercase"
      style={{ color, fontFamily: 'Inter, sans-serif' }}
    >
      {label}
    </span>
  </div>
);

const Divider: React.FC = () => (
  <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
);

const OceanBar: React.FC<{ trait: string; value: number }> = ({ trait, value }) => (
  <div className="flex items-center gap-3">
    <span className="text-[13px] w-36 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
      {trait}
    </span>
    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${value}%`,
          backgroundColor: '#10b77f',
          opacity: 0.6,
        }}
      />
    </div>
    <span className="text-[13px] w-10 text-right flex-shrink-0" style={{ color: 'var(--foreground)' }}>
      {value}%
    </span>
  </div>
);

// ── Main page ────────────────────────────────────────────────────────────

const IdentityPage: React.FC = () => {
  useLenis();
  useDocumentTitle('Your Soul Signature');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summaryExpanded, setSummaryExpanded] = useState(false);

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

  const { data, isLoading, error } = useQuery<{ success: boolean; data: IdentityData }>({
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Assembling your portrait...</p>
        </div>
      </div>
    );
  }

  if (error && !isDemoMode) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} />
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {(error as Error).message || 'Could not load identity data.'}
          </span>
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

  // Empty state
  if (!hasAnyData) {
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
            className="px-5 py-2 rounded-full text-sm font-medium"
            style={{ border: '1px solid #10b77f', color: '#10b77f' }}
          >
            Connect platforms
          </button>
          <button
            onClick={() => navigate('/interview')}
            className="px-5 py-2 rounded-full text-sm font-medium"
            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            Complete your interview
          </button>
        </div>
      </div>
    );
  }

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

  // Summary preview
  const dotIdx = summary ? summary.indexOf('. ') : -1;
  const cutoff = dotIdx !== -1 && dotIdx < 180 ? dotIdx + 1 : 150;
  const summaryPreview = summary ? summary.slice(0, cutoff) : '';
  const summaryNeedsTruncation = summary ? summary.length > summaryPreview.length : false;

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">

      {/* ── Header ── */}
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
            className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-60 flex-shrink-0 mt-2"
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

      {/* ── Chapter 1: SOUL ── */}
      {summary && (
        <>
          <SectionLabel label="Soul" />
          {profile?.archetype && (
            <h2
              className="mb-4"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '22px',
                fontWeight: 400,
                color: 'var(--foreground)',
                letterSpacing: '-0.01em',
              }}
            >
              {profile.archetype}
            </h2>
          )}
          <div>
            <p className="text-[15px] leading-relaxed max-w-prose" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {toSecondPerson(summaryExpanded ? summary : summaryPreview)}
            </p>
            {summaryNeedsTruncation && (
              <button
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="mt-2 text-xs"
                style={{ color: '#10b77f' }}
              >
                {summaryExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
          {uniquenessMarkers.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-5">
              {uniquenessMarkers.map((marker, i) => (
                <span
                  key={i}
                  className="text-[12px] px-3 py-1.5 rounded-full"
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {marker}
                </span>
              ))}
            </div>
          )}
          <Divider />
        </>
      )}

      {/* ── Chapter 2: BY THE NUMBERS ── */}
      {oceanCards && (
        <>
          <SectionLabel label="By the Numbers" />
          <div className="grid grid-cols-2 gap-6">
            {[
              { value: oceanCards.find(o => o.trait === 'Openness')?.value ?? '--', unit: '%', label: 'Openness' },
              { value: oceanCards.find(o => o.trait === 'Conscientiousness')?.value ?? '--', unit: '%', label: 'Conscientiousness' },
              { value: oceanCards.find(o => o.trait === 'Extraversion')?.value ?? '--', unit: '%', label: 'Extraversion' },
              { value: oceanCards.find(o => o.trait === 'Agreeableness')?.value ?? '--', unit: '%', label: 'Agreeableness' },
            ].map((stat, i) => (
              <div key={i}>
                <span className="text-[28px] font-medium" style={{ color: 'var(--foreground)' }}>
                  {stat.value}
                  <span className="text-[11px] ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{stat.unit}</span>
                </span>
                <div className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <Divider />
        </>
      )}

      {/* ── Chapter 3: PERSONALITY (OCEAN bars) ── */}
      {oceanCards && (
        <>
          <SectionLabel label="Personality" color="#c17e2c" />
          <div className="space-y-3">
            {oceanCards.map((oc) => (
              <OceanBar key={oc.trait} trait={oc.trait} value={oc.value} />
            ))}
          </div>
          {pp?.temperature != null && (
            <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
              temp {pp.temperature.toFixed(2)} · top_p {pp.top_p.toFixed(3)} · confidence {Math.round((pp.confidence ?? 0) * 100)}%
            </p>
          )}
          <Divider />
        </>
      )}

      {/* ── Chapters 4-8: Expert domains ── */}
      {EXPERT_SECTIONS.map((section) => {
        const rawBullets = expertInsights[section.key] ?? [];
        const bullets = cleanBullets(rawBullets);
        if (bullets.length === 0) return null;

        return (
          <React.Fragment key={section.key}>
            <SectionLabel label={section.label} color={section.dotColor} />
            <div className="space-y-3">
              {bullets.map((bullet, i) => (
                <p
                  key={i}
                  className="text-[15px] leading-relaxed max-w-prose"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  {toSecondPerson(bullet)}
                </p>
              ))}
            </div>
            <Divider />
          </React.Fragment>
        );
      })}

      {/* ── Chapter: CULTURAL TASTE — Music genres ── */}
      {musicGenres.length > 0 && (
        <>
          <SectionLabel label="Music Signature" color="#c1452c" />
          <div className="flex flex-wrap gap-2 mb-3">
            {musicGenres.map((genre, i) => (
              <span
                key={i}
                className="text-[12px] px-3 py-1.5 rounded-full"
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {genre}
              </span>
            ))}
          </div>
          {listeningPattern && (
            <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {listeningPattern}
            </p>
          )}
          <Divider />
        </>
      )}

      {/* ── Chapter: WHAT'S NEXT ── */}
      <SectionLabel label="What's Next" />
      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Your twin is learning. Connect more platforms to deepen your portrait.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/get-started')}
          className="px-4 py-2 rounded-full text-[13px] font-medium transition-opacity hover:opacity-80"
          style={{ border: '1px solid #10b77f', color: '#10b77f' }}
        >
          Connect Platforms
        </button>
        <button
          onClick={() => navigate('/interview')}
          className="px-4 py-2 rounded-full text-[13px] font-medium transition-opacity hover:opacity-80"
          style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
        >
          Redo Interview
        </button>
      </div>
    </div>
  );
};

export default IdentityPage;
