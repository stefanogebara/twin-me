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
} from 'lucide-react';
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
  { bg: 'rgba(59, 130, 246, 0.12)', color: '#1E40AF' },
  { bg: 'rgba(239, 68, 68, 0.12)',  color: '#991B1B' },
  { bg: 'rgba(20, 184, 166, 0.12)', color: '#115E59' },
];

// ── Sub-components ─────────────────────────────────────────────────────────

interface ColoredBadgeProps {
  label: string;
  index: number;
}

const ColoredBadge: React.FC<ColoredBadgeProps> = ({ label, index }) => {
  const palette = BADGE_PALETTE[index % BADGE_PALETTE.length];
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: palette.bg, color: palette.color }}
    >
      {label}
    </span>
  );
};

interface ExpertSectionProps {
  config: ExpertConfig;
  bullets: string[];
}

const ExpertSection: React.FC<ExpertSectionProps> = ({ config, bullets }) => {
  const { key, label, Icon, color, bgColor } = config;
  const hasBullets = bullets.length > 0;

  return (
    <AccordionItem value={key} className="border-b border-gray-100 last:border-0">
      <AccordionTrigger className="py-4 hover:no-underline">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: bgColor }}
          >
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-left">{label}</span>
          {!hasBullets && (
            <span className="ml-2 text-xs text-gray-400 font-normal">(no insights yet)</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {hasBullets ? (
          <ul className="space-y-3 pl-11 pb-2">
            {bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-700">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span>{toSecondPerson(bullet)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pl-11 pb-2 text-sm text-gray-400 italic">
            Your twin hasn't built enough signal here yet — keep using connected platforms.
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
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 text-sm">Assembling your soul portrait...</p>
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
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <Fingerprint className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Your twin is still learning</h2>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Connect your platforms and give it a few days. The more data your twin processes,
            the richer this portrait becomes.
          </p>
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
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-gray-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 heading-serif">Who You Are</h1>
              <p className="text-sm text-gray-500">What your twin knows about you</p>
            </div>
          </div>
          {identityMetaPill && (
            <span
              className="inline-block mt-2 rounded-full px-3 py-1 text-xs font-medium text-gray-500"
              style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}
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
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Twin Summary
              </p>
              {summaryExpanded ? (
                <>
                  <p className="text-gray-800 leading-relaxed text-[15px]">{summary}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => setSummaryExpanded(false)}
                      className="mt-2 text-xs"
                      style={{ color: '#C4A265' }}
                    >
                      Show less
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-gray-800 leading-relaxed text-[15px]">{preview}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => setSummaryExpanded(true)}
                      className="mt-2 text-xs"
                      style={{ color: '#C4A265' }}
                    >
                      Read more
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Archetype + Uniqueness Markers */}
        {(profile?.archetype || uniquenessMarkers.length > 0 || coreValues.length > 0) && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            {profile?.archetype && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                  Archetype
                </p>
                <p className="text-lg font-bold text-gray-900">{profile.archetype}</p>
                {profile?.personality_summary && (() => {
                  const ps = profile.personality_summary!;
                  const psPreview = ps.slice(0, 120);
                  const psNeedsTruncation = ps.length > 120;
                  return (
                    <div className="mt-1">
                      {archetypeExpanded ? (
                        <>
                          <p className="text-sm text-gray-500 leading-relaxed">{ps}</p>
                          {psNeedsTruncation && (
                            <button
                              onClick={() => setArchetypeExpanded(false)}
                              className="mt-1 text-xs"
                              style={{ color: '#C4A265' }}
                            >
                              Show less
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-gray-500 leading-relaxed">{psPreview}{psNeedsTruncation ? '…' : ''}</p>
                          {psNeedsTruncation && (
                            <button
                              onClick={() => setArchetypeExpanded(true)}
                              className="mt-1 text-xs"
                              style={{ color: '#C4A265' }}
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
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
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
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
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
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}
        >
          <div className="px-6 pt-6 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Expert Perspectives
            </p>
            <p className="text-sm text-gray-500 mt-1">
              5 specialist lenses from your twin's reflection engine
            </p>
          </div>
          <Accordion type="multiple" defaultValue={[EXPERT_SECTIONS[0].key]} className="px-6 pb-4">
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
          <div
            className="rounded-2xl p-6"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Music className="w-4 h-4 text-amber-500" />
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Music Signature
              </p>
            </div>

            {musicGenres.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-2">Top genres</p>
                <div className="flex flex-wrap gap-2">
                  {musicGenres.map((genre, i) => (
                    <ColoredBadge key={i} label={genre} index={i + 3} />
                  ))}
                </div>
              </div>
            )}

            {listeningPattern && (
              <p className="text-sm text-gray-700 leading-relaxed">{listeningPattern}</p>
            )}
          </div>
        )}

      </div>
    </PageLayout>
  );
};

export default IdentityPage;
