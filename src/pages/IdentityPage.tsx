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
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
  },
  {
    key: 'lifestyle_analyst',
    label: 'How You Live',
    Icon: Activity,
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
  },
  {
    key: 'cultural_identity',
    label: 'Your Cultural DNA',
    Icon: Music,
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  {
    key: 'social_dynamics',
    label: 'How You Connect',
    Icon: Users,
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
  },
  {
    key: 'motivation_analyst',
    label: 'What Drives You',
    Icon: Target,
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
  },
];

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
  isOpen: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const ExpertSection: React.FC<ExpertSectionProps> = ({ config, bullets: rawBullets, isOpen, onToggle, isFirst, isLast }) => {
  const { label, Icon, color, bgColor } = config;
  const bullets = cleanBullets(rawBullets);
  const hasBullets = bullets.length > 0;

  const borderRadius = isFirst
    ? '16px 16px 4px 4px'
    : isLast
    ? '4px 4px 16px 16px'
    : '4px';

  return (
    <div style={{
      background: isOpen ? 'rgba(72,65,65,0.5)' : 'rgba(40,37,37,0.6)',
      border: '1px solid rgba(94,86,86,0.35)',
      borderRadius,
      transition: 'background 0.2s ease',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '20px 24px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: bgColor,
          border: `1px solid ${color}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            {label}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--foreground)' }}>
            {hasBullets ? `${bullets.length} insight${bullets.length !== 1 ? 's' : ''}` : 'Still learning…'}
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0"
          style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
        />
      </button>

      {isOpen && (
        <div style={{ padding: '0 24px 24px' }}>
          {hasBullets ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bullets.map((bullet, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ color: 'var(--accent-vibrant)', fontSize: 14, flexShrink: 0, marginTop: 1 }}>→</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{toSecondPerson(bullet)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
              Nothing here yet — keep your platforms connected and I'll fill this in as I notice things.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────

const IdentityPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [archetypeExpanded, setArchetypeExpanded] = useState(false);
  const [openExpert, setOpenExpert] = useState<number | null>(0);

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user, navigate]);

  const { data, isLoading, error } = useQuery<{ success: boolean; data: IdentityData }>({
    queryKey: ['twin-identity'],
    queryFn: async () => {
      const res = await authFetch('/twin/identity');
      if (!res.ok) throw new Error('Failed to load identity data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — identity changes slowly
    enabled: !!user,
  });

  if (!user) return null;

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

  if (error) {
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
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-vibrant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, fontFamily: 'var(--font-ui)' }}>
            Soul Signature
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="heading-serif"
                style={{
                  fontSize: 'clamp(2rem, 5vw, 2.8rem)',
                  fontWeight: 400,
                  letterSpacing: '-0.05em',
                  lineHeight: 1.1,
                  color: 'var(--foreground)',
                  marginBottom: 12,
                }}
              >Who you are</h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: 'var(--font-ui)' }}>
                What your twin knows about you. Updated as your twin learns.
              </p>
            </div>
            <button
              onClick={() => {
                const shareUrl = `${window.location.origin}/p/${user.id}`;
                navigator.clipboard.writeText(shareUrl).then(() => {
                  toast.success('Link copied! Share your Soul Signature');
                }).catch(() => {
                  toast.error('Could not copy link');
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium flex-shrink-0 transition-opacity hover:opacity-70"
              style={{
                background: 'var(--glass-surface-bg)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
          {identityMetaPill && (
            <span
              className="inline-block mt-3 rounded-full px-4 py-1.5 text-xs font-medium"
              style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}
            >
              {identityMetaPill}
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}>
          {[
            { label: 'Memories', value: profile?.personality_summary ? '—' : '—' },
            { label: 'Reflections', value: EXPERT_SECTIONS.reduce((acc, s) => acc + (expertInsights[s.key]?.length ?? 0), 0).toString() },
            { label: 'Platforms', value: '5' },
            { label: 'Days tracked', value: identity?.inferredAt ? Math.ceil((Date.now() - new Date(identity.inferredAt).getTime()) / (1000 * 60 * 60 * 24)).toString() : '—' },
          ].map((stat, i) => (
            <div key={i} className="glass-card" style={{ padding: '16px', textAlign: 'center', borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4, fontFamily: '"Instrument Serif", serif', letterSpacing: '-0.04em' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{stat.label}</div>
            </div>
          ))}
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
        <div>
          <div style={{ marginBottom: 16 }}>
            <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
              Expert Perspectives
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              5 specialist lenses from your twin's reflection engine
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 16, overflow: 'hidden' }}>
            {EXPERT_SECTIONS.map((config, i) => (
              <ExpertSection
                key={config.key}
                config={config}
                bullets={expertInsights[config.key] ?? []}
                isOpen={openExpert === i}
                onToggle={() => setOpenExpert(openExpert === i ? null : i)}
                isFirst={i === 0}
                isLast={i === EXPERT_SECTIONS.length - 1}
              />
            ))}
          </div>
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
