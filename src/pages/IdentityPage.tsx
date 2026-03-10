/**
 * IdentityPage — "Who You Are"
 * ==============================
 * Surfaces everything the twin knows about the user in one structured view:
 * - Twin summary paragraph
 * - Archetype + uniqueness markers as badges
 * - 5 expert sections (Accordion) with reflection bullets
 * - Music signature (if available)
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Brain,
  Activity,
  Music,
  Users,
  Target,
  Fingerprint,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { toSecondPerson } from '@/lib/utils';

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

// ── Expert section config ───────────────────────────────────────────────────

type ExpertKey =
  | 'personality_psychologist'
  | 'lifestyle_analyst'
  | 'cultural_identity'
  | 'social_dynamics'
  | 'motivation_analyst';

interface ExpertConfig {
  key: ExpertKey;
  label: string;
  Icon: React.ElementType;
  color: string;
  bgColor: string;
}

const EXPERT_SECTIONS: ExpertConfig[] = [
  {
    key: 'personality_psychologist',
    label: 'Your Emotional World',
    Icon: Brain,
    color: 'var(--expert-personality)',
    bgColor: 'var(--expert-personality-bg)',
  },
  {
    key: 'lifestyle_analyst',
    label: 'How You Live',
    Icon: Activity,
    color: 'var(--expert-lifestyle)',
    bgColor: 'var(--expert-lifestyle-bg)',
  },
  {
    key: 'cultural_identity',
    label: 'Your Cultural DNA',
    Icon: Music,
    color: 'var(--expert-cultural)',
    bgColor: 'var(--expert-cultural-bg)',
  },
  {
    key: 'social_dynamics',
    label: 'How You Connect',
    Icon: Users,
    color: 'var(--expert-social)',
    bgColor: 'var(--expert-social-bg)',
  },
  {
    key: 'motivation_analyst',
    label: 'What Drives You',
    Icon: Target,
    color: 'var(--expert-motivation)',
    bgColor: 'var(--expert-motivation-bg)',
  },
];

// ── Demo fallback data ──────────────────────────────────────────────────────

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
    uniqueness_markers: [
      'Rhythmic Thinker',
      'Intentional Planner',
      'Curious Generalist',
      'Community Builder',
    ],
    music_signature: {
      top_genres: ['Lo-fi', 'Ambient', 'Synthwave', 'Classical Crossover'],
      listening_patterns: 'Uses music as a cognitive tool — high-energy for morning focus, ambient for deep work, lo-fi for transitions. Peak listening: 10pm-2am.',
    },
    core_values: ['Curiosity', 'Authenticity', 'Deep Work', 'Creative Freedom'],
    personality_summary: 'Highly open to new experiences with strong conscientiousness when it matters. Thrives in environments that blend structure with creative freedom. Your digital footprint reveals someone who is simultaneously structured and spontaneous.',
  },
  expertInsights: {
    personality_psychologist: [
      'Your music selection follows a clear emotional regulation strategy — high-energy tracks during morning focus, ambient during deep work, lo-fi during transitions.',
      'You demonstrate high openness (0.85) paired with moderate conscientiousness (0.78), a combination that enables creative productivity.',
      'Your emotional processing style leans toward introspective — you use solitary activities (music, focused work) to recharge rather than social interaction.',
    ],
    lifestyle_analyst: [
      'Calendar data reveals meeting clustering behavior — bunching meetings into Tuesday/Thursday afternoons, preserving mornings for uninterrupted work.',
      'Your daily rhythm follows a consistent pattern: morning focus blocks, afternoon collaboration, late-night creative exploration.',
      'You maintain a strong work-life boundary with 45% of calendar time blocked for deep work — well above the average of 20%.',
    ],
    cultural_identity: [
      'Your aesthetic preferences lean toward immersive, textured experiences — electronic, ambient, and lo-fi traditions over mainstream pop.',
      'Content consumption shows an 80/20 split: 80% niche technical content versus 20% broader cultural content.',
      'You are a specialist who stays culturally literate — drawing from sound, systems thinking, and storytelling traditions.',
    ],
    social_dynamics: [
      'Your social energy is concentrated in 3 niche communities centered on shared intellectual interests rather than broad social networks.',
      'You prefer depth of connection over breadth — fewer, more meaningful relationships built around shared passions.',
      'Communication style is warm but precise — you think in systems and speak in stories.',
    ],
    motivation_analyst: [
      'Driven by mastery and novelty simultaneously — you set ambitious goals but pace them with intentional recovery cycles.',
      'Your goal tracking shows strong follow-through: 83% completion rate on self-set targets over the past month.',
      'You respond strongly to intrinsic motivation (learning, creating) over extrinsic rewards (status, recognition).',
    ],
  },
  summary: 'You are a creative synthesizer who finds meaning at the intersection of music, technology, and human connection. Your listening patterns show deep emotional intelligence — you use sound as a tool for focus, recovery, and self-expression. The 45% of calendar time blocked for deep work reveals someone who guards their attention fiercely while remaining highly collaborative when present. Your personality combines high openness to experience with structured conscientiousness, enabling both creative exploration and reliable execution.',
  summaryUpdatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

// ── Badge colors for archetype / traits ────────────────────────────────────

const BADGE_PALETTE = [
  { bg: 'rgba(139, 92, 246, 0.12)', color: '#6D28D9' },
  { bg: 'rgba(16, 185, 129, 0.12)', color: '#065F46' },
  { bg: 'rgba(245, 158, 11, 0.12)', color: '#92400E' },
  { bg: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA' },
  { bg: 'rgba(239, 68, 68, 0.12)',  color: '#991B1B' },
  { bg: 'rgba(20, 184, 166, 0.12)', color: '#5EEAD4' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip raw citation markers that LLMs sometimes inject into reflections.
 * Examples: [Memory #34], [Source: Spotify], [Based on memory data], [Ref 2], etc.
 */
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

/**
 * Strip leading bullet markers (-, *, numbered) the LLM may have left.
 */
function stripLeadingBullet(text: string): string {
  return text.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, '').trim();
}

/**
 * Clean and deduplicate expert bullet strings.
 * - Strips citations and leading bullet markers
 * - Deduplicates by normalised lowercase comparison
 * - Filters out empty strings
 */
/** Bigram similarity (Dice coefficient) for fuzzy dedup */
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
    // Skip if too similar to any already-kept bullet (>0.75 bigram similarity)
    const isDuplicate = cleaned.some((existing) => bigramSimilarity(existing, text) > 0.75);
    if (isDuplicate) continue;
    cleaned.push(text);
  }
  return cleaned;
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface ColoredBadgeProps {
  label: string;
  index: number;
}

const ColoredBadge: React.FC<ColoredBadgeProps> = ({ label, index }) => {
  const palette = BADGE_PALETTE[index % BADGE_PALETTE.length];
  return (
    <span
      className="inline-block rounded-full px-4 py-2 text-sm font-medium"
      style={{ background: palette.bg, border: `1px solid ${palette.color}22`, color: palette.color }}
    >
      {label}
    </span>
  );
};

interface ExpertSectionProps {
  config: ExpertConfig;
  bullets: string[];
}

const ExpertSection: React.FC<ExpertSectionProps> = ({ config, bullets: rawBullets }) => {
  const { key, label, Icon, color, bgColor } = config;
  const bullets = cleanBullets(rawBullets);
  const hasBullets = bullets.length > 0;

  return (
    <AccordionItem value={key} className="border-b last:border-0" style={{ borderColor: 'var(--glass-surface-border)' }}>
      <AccordionTrigger className="py-4 px-5 hover:no-underline" style={{ borderLeft: `3px solid ${color}33` }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: bgColor }}
          >
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <span className="text-sm text-left" style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>{label}</span>
          {!hasBullets && (
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(still learning)</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent style={{ padding: '1.5rem 2rem' }}>
        {hasBullets ? (
          <ul className="space-y-3 pl-11">
            {bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2.5 leading-7" style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
                <span className="mt-2.5 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span>{toSecondPerson(bullet)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pl-11 italic leading-relaxed" style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
            Nothing here yet — keep your platforms connected and I'll fill this in as I notice things.
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────

const IdentityPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [archetypeExpanded, setArchetypeExpanded] = useState(false);

  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  useEffect(() => {
    if (!user && !isDemoMode) navigate('/auth');
  }, [user, isDemoMode, navigate]);

  const { data, isLoading, error } = useQuery<{ success: boolean; data: IdentityData }>({
    queryKey: ['twin-identity'],
    queryFn: async () => {
      const res = await authFetch('/twin/identity');
      if (!res.ok) throw new Error('Failed to load identity data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — identity changes slowly
    enabled: !!user && !isDemoMode,
    initialData: isDemoMode ? { success: true, data: DEMO_IDENTITY_DATA } : undefined,
  });

  if (!user && !isDemoMode) return null;

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Assembling your soul portrait...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error && !isDemoMode) {
    return (
      <PageLayout>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div
            className="p-4 rounded-xl flex items-center gap-3"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.2)' }}
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-800">
              {(error as Error).message || 'Could not load identity data. Try refreshing.'}
            </span>
          </div>
        </div>
      </PageLayout>
    );
  }

  const identity = data?.data?.identity ?? null;
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
      <PageLayout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/8 flex items-center justify-center mx-auto mb-6">
            <Fingerprint className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-3">I'm still figuring you out</h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto mb-6">
            Connect Spotify, Calendar, or YouTube and I'll start building a real picture of you — not just facts, but patterns. Usually takes a couple of days.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/get-started')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium"
              style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
            >
              Connect platforms
            </button>
            <button
              onClick={() => navigate('/interview')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium border border-white/10"
              style={{ color: 'var(--foreground)' }}
            >
              Complete your interview
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const uniquenessMarkers: string[] = Array.isArray(profile?.uniqueness_markers)
    ? profile.uniqueness_markers.filter(Boolean)
    : [];

  const coreValues: string[] = Array.isArray(profile?.core_values)
    ? profile.core_values.filter(Boolean)
    : [];

  const musicGenres: string[] = Array.isArray(profile?.music_signature?.top_genres)
    ? (profile.music_signature.top_genres as string[]).filter(Boolean)
    : [];

  const listeningPattern: string | null =
    typeof profile?.music_signature?.listening_patterns === 'string'
      ? profile.music_signature.listening_patterns
      : null;

  const hasMusicSection = musicGenres.length > 0 || !!listeningPattern;

  // Identity meta pill (confidence-aware)
  const identityMetaPill =
    identity && identity.lifeStage !== 'unknown'
      ? `${identity.lifeStage.replace(/_/g, ' ')}${identity.approximateAge ? ` · ~${identity.approximateAge}` : ''}${identity.careerSalience !== 'unknown' ? ` · ${identity.careerSalience} career salience` : ''}`
      : null;

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-16">

        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h1
                  className="heading-serif"
                  style={{
                    fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                    fontWeight: 400,
                    letterSpacing: '-0.05em',
                    lineHeight: 1.1,
                    color: 'var(--foreground)',
                  }}
                >Who You Are</h1>
                <p className="text-lg mt-1" style={{ color: 'var(--text-secondary)' }}>What your twin knows about you</p>
              </div>
            </div>
            {!isDemoMode && user && (
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}/p/${user.id}`;
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    toast.success('Link copied! Share your Soul Signature');
                  }).catch(() => {
                    toast.error('Could not copy link');
                  });
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium glass-button flex-shrink-0"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            )}
          </div>
          {identityMetaPill && (
            <span
              className="inline-block mt-2 rounded-full px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)', color: 'var(--text-secondary)', marginBottom: '2rem' }}
            >
              {identityMetaPill}
            </span>
          )}
        </div>

        {/* Twin Summary */}
        {summary && (() => {
          const dotIdx = summary.indexOf('. ');
          const cutoff = dotIdx !== -1 && dotIdx < 180 ? dotIdx + 1 : 150;
          const preview = summary.slice(0, cutoff);
          const needsTruncation = summary.length > preview.length;
          return (
            <div className="glass-card rounded-2xl p-8">
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}
              >
                Twin Summary
              </p>
              {summaryExpanded ? (
                <>
                  <p className="text-foreground leading-relaxed text-[15px]">{toSecondPerson(summary)}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => setSummaryExpanded(false)}
                      className="mt-2 text-xs"
                      style={{ color: 'var(--accent-vibrant)' }}
                    >
                      Show less
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-foreground leading-relaxed text-[15px]">{toSecondPerson(preview)}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => setSummaryExpanded(true)}
                      className="mt-2 text-xs"
                      style={{ color: 'var(--accent-vibrant)' }}
                    >
                      Read more
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Interview CTA */}
        <div className="text-center" style={{ marginBottom: '2.5rem' }}>
          <button
            onClick={() => navigate('/interview')}
            className="text-xs transition-opacity hover:opacity-60"
            style={{ color: 'var(--accent-vibrant)' }}
          >
            Improve accuracy → Redo your interview
          </button>
        </div>

        {/* Archetype + Uniqueness Markers */}
        {(profile?.archetype || uniquenessMarkers.length > 0 || coreValues.length > 0) && (
          <div className="glass-card rounded-2xl p-8 space-y-6" style={{ marginBottom: '3rem' }}>
            {profile?.archetype && (
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-1"
                  style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}
                >
                  Archetype
                </p>
                <p className="text-lg" style={{ fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>{profile.archetype}</p>
                {profile?.personality_summary && (() => {
                  const ps = profile.personality_summary!;
                  const psPreview = ps.slice(0, 120);
                  const psNeedsTruncation = ps.length > 120;
                  return (
                    <div className="mt-1">
                      {archetypeExpanded ? (
                        <>
                          <p className="text-sm text-muted-foreground leading-relaxed">{toSecondPerson(ps)}</p>
                          {psNeedsTruncation && (
                            <button
                              onClick={() => setArchetypeExpanded(false)}
                              className="mt-1 text-xs"
                              style={{ color: 'var(--accent-vibrant)' }}
                            >
                              Show less
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground leading-relaxed">{toSecondPerson(psPreview)}{psNeedsTruncation ? '…' : ''}</p>
                          {psNeedsTruncation && (
                            <button
                              onClick={() => setArchetypeExpanded(true)}
                              className="mt-1 text-xs"
                              style={{ color: 'var(--accent-vibrant)' }}
                            >
                              Read more
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {uniquenessMarkers.length > 0 && (
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}
                >
                  What makes you unique
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniquenessMarkers.map((marker, i) => (
                    <ColoredBadge key={i} label={marker} index={i} />
                  ))}
                </div>
              </div>
            )}

            {coreValues.length > 0 && (
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}
                >
                  Core values
                </p>
                <div className="flex flex-wrap gap-2">
                  {coreValues.map((value, i) => (
                    <ColoredBadge key={i} label={value} index={i + 2} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expert Insights Accordion */}
        <div className="glass-card rounded-2xl overflow-hidden" style={{ padding: '2.5rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <p
              className="text-base"
              style={{ fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--foreground)' }}
            >
              Expert Perspectives
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              5 specialist lenses from your twin's reflection engine
            </p>
          </div>
          <Accordion type="multiple" defaultValue={[EXPERT_SECTIONS[0].key]} className="space-y-2">
            {EXPERT_SECTIONS.map((config) => (
              <ExpertSection
                key={config.key}
                config={config}
                bullets={expertInsights[config.key] ?? []}
              />
            ))}
          </Accordion>
        </div>

        {/* Music Signature */}
        {hasMusicSection && (
          <div className="glass-card rounded-2xl p-8" style={{ marginBottom: '3rem' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
              <Music className="w-4 h-4 text-amber-500" />
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}
              >
                Music Signature
              </p>
            </div>

            {musicGenres.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-2">Top genres</p>
                <div className="flex flex-wrap gap-2">
                  {musicGenres.map((genre, i) => (
                    <ColoredBadge key={i} label={genre} index={i + 3} />
                  ))}
                </div>
              </div>
            )}

            {listeningPattern && (
              <p className="text-sm text-muted-foreground leading-relaxed">{listeningPattern}</p>
            )}
          </div>
        )}

      </div>
    </PageLayout>
  );
};

export default IdentityPage;
