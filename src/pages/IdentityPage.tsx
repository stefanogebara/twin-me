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
import { Share2, Sparkles, ArrowRight, Fingerprint, AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { useLenis } from '@/hooks/useLenis';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePlatformsSummary, connectedProviders as getConnectedProviders } from '@/hooks/usePlatformsSummary';
import { IdentityData, PersonalityProfile } from './components/identity/types';
import { determineArchetypeFromSoulLayers, generateTraitBadgesFromSoulLayers, formatArchetypeName } from '@/utils/archetypeEngine';
import PersonalityAxes from './components/identity/PersonalityAxes';
import IdentityQuote from './components/identity/IdentityQuote';
import TemporalComparison from './components/identity/TemporalComparison';
import IdentityNarrativeCard from './components/identity/IdentityNarrativeCard';
import SplitPanelLayout from '@/layouts/SplitPanelLayout';
import ContextSidebar from './components/identity/ContextSidebar';

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
  // audit-2026-06-10: the backend emits camelCase `growthEdges`
  // (soulSignatureService.js:907); `growth_edges` never existed on the wire,
  // so the drift UI was permanently stuck on "Stable signal"/"Consistent".
  // Accept both for resilience against any older cached payloads.
  growthEdges?: SoulGrowthEdges;
  growth_edges?: SoulGrowthEdges;
  generated_at: string;
}

// ── Expert domain labels ─────────────────────────────────────────────────

const EXPERT_LABELS: { key: string; label: string }[] = [
  { key: 'personality_psychologist', label: 'Personality' },
  { key: 'lifestyle_analyst',        label: 'Lifestyle' },
  { key: 'cultural_identity',        label: 'Culture' },
  { key: 'social_dynamics',          label: 'Social' },
  { key: 'motivation_analyst',       label: 'Drive' },
];

// ── Insight-page deep-link mapping ───────────────────────────────────────
// Map lowercased keyword mentions -> { platform connector key, route, label }

interface InsightLinkSpec {
  platform: string; // connector key as reported in the platforms-summary breakdown
  route: string;
  label: string;
}

const INSIGHT_PLATFORMS: Array<{ match: RegExp; spec: InsightLinkSpec }> = [
  { match: /\bspotify\b/i,                spec: { platform: 'spotify',  route: '/insights/spotify',  label: 'Spotify' } },
  { match: /\byoutube\b/i,                spec: { platform: 'youtube',  route: '/insights/youtube',  label: 'YouTube' } },
  { match: /\b(calendar|google calendar)\b/i, spec: { platform: 'google_calendar', route: '/insights/calendar', label: 'Calendar' } },
  { match: /\bdiscord\b/i,                spec: { platform: 'discord',  route: '/insights/discord',  label: 'Discord' } },
  { match: /\blinkedin\b/i,               spec: { platform: 'linkedin', route: '/insights/linkedin', label: 'LinkedIn' } },
];

function detectInsightLink(text: string, connectedProviders: string[]): InsightLinkSpec | null {
  const lowered = connectedProviders.map((p) => p.toLowerCase());
  for (const { match, spec } of INSIGHT_PLATFORMS) {
    if (!match.test(text)) continue;
    // Accept either exact platform key or a fuzzy match (e.g. 'google_calendar' vs 'google')
    const connected = lowered.some((p) =>
      p === spec.platform ||
      (spec.platform === 'google_calendar' && (p === 'google' || p.startsWith('google'))) ||
      p === spec.label.toLowerCase()
    );
    if (connected) return spec;
  }
  return null;
}

// Split raw insight text into first-sentence preview + remaining body.
function splitFirstSentence(raw: string): { first: string; rest: string } {
  const cleaned = raw.replace(/\*/g, '').replace(/^["']|["']$/g, '').trim();
  // Period boundary: look for ". " or end-of-string
  const idx = cleaned.search(/\.\s/);
  if (idx === -1) return { first: cleaned.replace(/\.$/, ''), rest: '' };
  const first = cleaned.slice(0, idx);
  const rest = cleaned.slice(idx + 2).trim();
  return { first, rest };
}

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
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
    animate={{ opacity: 1, y: 0 }}
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
          // audit-2026-05-15 H8: was w-[400px] h-[400px] (fixed). Caused
          // horizontal scroll on viewports <400px. min(400px, 90vw) keeps
          // the decorative glow proportional on mobile while preserving
          // the desktop size.
          className="rounded-full"
          style={{
            width: 'min(400px, 90vw)',
            height: 'min(400px, 90vw)',
            background: 'radial-gradient(circle, rgba(232,224,212,0.15) 0%, rgba(232,224,212,0.05) 40%, transparent 70%)',
            animation: 'soulBreathe 4s ease-in-out infinite',
          }}
        />
      </div>

      <motion.h1
        aria-label={archetypeName}
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
        {/* audit-2026-05-15 H10: shortened the reveal timeline. Previously
            the first word didn't appear until t=2s, and the Explore button
            at t=5s — Agent 3 flagged the 2-4s empty-black-screen period
            as reading like a broken page. Cascade now starts at 0.4s and
            wraps in ~2s total, preserving the cinematic feel while
            killing the "is this stuck?" perception. */}
        {words.map((word, i) => (
          <motion.span
            key={i}
            className="inline-block mr-[0.3em]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.25, duration: 0.5, ease: 'easeOut' }}
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
        transition={{ delay: 1.5, duration: 0.6 }}
      >
        {tagline}
      </motion.p>

      <motion.button
        className="relative z-10 mt-10 px-6 py-2.5 rounded-[100px] text-sm font-medium flex items-center gap-2 transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
        style={{
          backgroundColor: '#F5F5F4',
          color: '#110f0f',
          fontFamily: "'Inter', sans-serif",
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2, duration: 0.5 }}
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

  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user, navigate]);

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: personalityData } = useQuery<{ success: boolean; profile: PersonalityProfile }>({
    queryKey: ['personality-profile'],
    queryFn: async () => {
      const res = await authFetch('/personality-profile');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 12 * 60 * 60 * 1000,
    enabled: !!user,
  });

  const { data, isLoading: identityLoading, error: identityError, refetch: refetchIdentity } = useQuery<{ success: boolean; data: IdentityData }>({
    queryKey: ['twin-identity'],
    queryFn: async () => {
      const res = await authFetch('/twin/identity');
      if (!res.ok) throw new Error('Failed to load identity data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // audit-2026-06-10: /soul-signature/layers returns { data: null, generating:
  // true, retryAfter } while generation runs in the background (~15-25s), and
  // { data: null, message } when there aren't enough memories yet. Poll while
  // generating so the finished signature appears without a hard reload
  // (staleTime alone would cache the null payload for 10 minutes).
  const { data: soulData, isLoading: soulLoading, error: soulError, refetch: refetchSoul } = useQuery<{
    success: boolean;
    data: (SoulSignatureLayers & { layers?: SoulSignatureLayers }) | null;
    generating?: boolean;
    message?: string;
    retryAfter?: number;
  }>({
    queryKey: ['soul-signature-layers'],
    queryFn: async () => {
      const res = await authFetch('/soul-signature/layers');
      if (!res.ok) throw new Error('Failed to load soul signature');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: (query) =>
      query.state.data?.generating ? (query.state.data.retryAfter ?? 15) * 1000 : false,
    enabled: !!user,
  });

  // Stored LLM-driven archetype (canonical — generated by cron-soul-signature-regen).
  // Audit-2026-05-13: /identity was rendering the locally-computed cosine catalog
  // match ("The Strategist") while the soul_signatures row had a richer
  // LLM-generated label ("The Debugging Composer"). The two systems disagreed.
  // The stored archetype is the source of truth; the local cosine match is a
  // legacy fallback for users without a stored archetype.
  const { data: storedArchetypeData } = useQuery<{
    success: boolean;
    data: { archetype_name?: string; archetype_subtitle?: string; narrative?: string } | null;
  }>({
    queryKey: ['soul-signature-archetype'],
    queryFn: async () => {
      const res = await authFetch('/soul-signature/archetype');
      if (!res.ok) return { success: false, data: null };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  });

  const isLoading = identityLoading || soulLoading;
  const summary = data?.data?.summary ?? null;
  const layers = soulData?.data?.layers ?? soulData?.data ?? null;
  const hasLayers = !!(layers?.values?.values?.length || layers?.rhythms || layers?.taste || layers?.connections);

  // ── First-time reveal check ────────────────────────────────────────────

  const pp = personalityData?.profile ?? null;

  useEffect(() => {
    if (hasLayers && !localStorage.getItem(REVEAL_KEY)) {
      setShowReveal(true);
    }
  }, [hasLayers]);

  const dismissReveal = useCallback(() => {
    setShowReveal(false);
    localStorage.setItem(REVEAL_KEY, '1');
  }, []);

  // Hooks must be declared BEFORE any early return (isLoading / hasAnyData
  // guards below). Previously the platform-status hook + useState(expandedLens)
  // were positioned after those guards, causing React error #310 ("Rendered
  // more hooks than during the previous render") on transition from loading to
  // loaded state.
  // batch3 state-unification: connected set comes from the canonical
  // /platforms/summary breakdown (any state counts as connected for lens gating).
  const { data: platformsSummary } = usePlatformsSummary();
  const connectedProviders = getConnectedProviders(platformsSummary);
  const [expandedLens, setExpandedLens] = useState<string | null>(null);

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!user) return null;

  // Render skeleton only on truly cold loads (nothing in cache yet). On warm
  // navigation back, data is already populated even though isLoading may flip
  // true briefly — block on isLoading there caused the audit's reported 20 s
  // hang on /identity (Vercel cold-start chain across 5 parallel fetches).
  // Frontend audit CRITICAL #3.
  if (isLoading && !summary && !layers) return <LoadingSkeleton />;

  if (identityError || soulError) {
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
            onClick={() => {
              // audit-2026-06-10: retry must refetch the query that actually
              // failed — refetching identity alone left soulError in place.
              if (identityError) refetchIdentity();
              if (soulError) refetchSoul();
            }}
            className="text-sm font-medium px-4 py-2 rounded-[100px] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.97]"
            style={{ backgroundColor: 'var(--button-bg-dark, #252222)', color: 'var(--foreground)' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const hasAnyData = !!(summary || hasLayers);

  // audit-2026-06-10: while the signature is generating in the background
  // (~15-25s, polled above), show that — not the "takes a couple of days"
  // empty state.
  if (!hasAnyData && soulData?.generating) return <GeneratingState message={soulData?.message} />;

  if (!hasAnyData) return <EmptyState message={soulData?.message} />;

  const showStillLearning = !hasLayers;

  // ── Archetype computation from 5-layer Soul Signature ─────────────────

  const localArchetypeResult = hasLayers && layers
    ? determineArchetypeFromSoulLayers(layers as SoulSignatureLayers)
    : null;

  // Prefer the stored LLM-driven archetype when available — it's the source of
  // truth, written by cron-soul-signature-regen using the full memory stream.
  // Local cosine catalog match is a legacy fallback only.
  const storedArchetypeName = storedArchetypeData?.data?.archetype_name?.trim();
  const archetypeResult = storedArchetypeName
    ? {
        archetype: {
          name: storedArchetypeName,
          tagline: storedArchetypeData?.data?.archetype_subtitle?.trim() || (localArchetypeResult?.archetype.tagline ?? ''),
          description: storedArchetypeData?.data?.narrative?.trim() || (localArchetypeResult?.archetype.description ?? ''),
          signature: localArchetypeResult?.archetype.signature ?? ([0.5, 0.5, 0.5, 0.5, 0.5] as [number, number, number, number, number]),
        },
        score: localArchetypeResult?.score ?? 1,
      }
    : localArchetypeResult;

  const traitBadges = hasLayers && layers
    ? generateTraitBadgesFromSoulLayers(layers as SoulSignatureLayers)
    : [];

  // ── Expert 1-liners (first sentence of first insight per domain) ─────

  const rawExpertInsights = data?.data?.expertInsights ?? {};

  const expertLensEntries = EXPERT_LABELS
    .map(({ key, label }) => {
      const insights: string[] = rawExpertInsights[key] ?? [];
      if (!insights.length) return null;
      const full = insights[0].replace(/\*/g, '').replace(/^["']|["']$/g, '').trim();
      const { first, rest } = splitFirstSentence(insights[0]);
      const insightLink = detectInsightLink(full, connectedProviders);
      return { key, label, preview: first, rest, insightLink };
    })
    .filter(Boolean) as {
      key: string;
      label: string;
      preview: string;
      rest: string;
      insightLink: InsightLinkSpec | null;
    }[];

  // ── Insight-page discovery pills (shown when user has connected platforms) ──
  const availableInsightPages: InsightLinkSpec[] = (() => {
    const lowered = connectedProviders.map((p) => p.toLowerCase());
    const seen = new Set<string>();
    const out: InsightLinkSpec[] = [];
    for (const { spec } of INSIGHT_PLATFORMS) {
      if (seen.has(spec.route)) continue;
      const connected = lowered.some((p) =>
        p === spec.platform ||
        (spec.platform === 'google_calendar' && (p === 'google' || p.startsWith('google'))) ||
        p === spec.label.toLowerCase()
      );
      if (connected) {
        out.push(spec);
        seen.add(spec.route);
      }
    }
    return out;
  })();

  // ── Drift signal ────────────────────────────────────────────────────────

  const growthEdges = layers?.growthEdges ?? layers?.growth_edges;
  const driftIsStable = !growthEdges || growthEdges.isStable || (growthEdges.shifts?.length ?? 0) === 0;
  const driftShiftCount = growthEdges?.shifts?.length ?? 0;

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
    // Use a query param rather than navigate(state) to work around a pre-existing
    // infinite-render crash in TalkToTwin when location.state is non-null.
    // TalkToTwin reads ?prefill= and clears the param after applying.
    navigate(`/talk-to-twin?prefill=${encodeURIComponent(message)}`);
  };

  // ── Greeting ────────────────────────────────────────────────────────

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const firstName = user?.firstName ?? user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── Glass card wrapper ──────────────────────────────────────────────

  const glassCard = (children: React.ReactNode, className = '', variant: 'default' | 'anchor' = 'default') => (
    <div
      className={`rounded-[20px] px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 ${className}`}
      style={{
        background: variant === 'anchor' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: variant === 'anchor' ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: variant === 'anchor'
          ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 24px rgba(0,0,0,0.20)'
          : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.15)',
      }}
    >
      {children}
    </div>
  );

  const heroCard = (children: React.ReactNode) => (
    <div
      className="rounded-[20px] px-5 py-5"
      style={{
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(0,0,0,0.25)',
      }}
    >
      {children}
    </div>
  );

  // ── Main panel content ─────────────────────────────────────────────

  const mainContent = (
    <div className="space-y-5">
      {/* ── Top row: back button (mobile) + greeting + date — single row to save vertical space ── */}
      <div
        className="flex items-center justify-between px-1 text-[12px]"
        style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="lg:hidden flex items-center gap-1 transition-opacity hover:opacity-70 active:scale-95"
            aria-label="Go back"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span>{getGreeting()}, {firstName}</span>
        </div>
        <span>{formattedDate}</span>
      </div>

      {/* ── Hero card: archetype is the sole focal point above the fold ── */}
      {heroCard(
        <>
          {archetypeResult ? (
            <>
              <section className="relative pl-5" style={{ borderLeft: '3px solid rgba(255,255,255,0.20)' }}>
                {/* Single-archetype headline — promoted from h2 to h1 so the hero has one dominant voice */}
                <h1
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontStyle: 'italic',
                    fontSize: 'clamp(36px, 6.5vw, 56px)',
                    fontWeight: 400,
                    color: 'var(--foreground)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  {formatArchetypeName(archetypeResult.archetype.name)}
                </h1>
                <p
                  className="mt-3 text-[15px] leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.65)', fontFamily: "'Inter', sans-serif", maxWidth: '42ch' }}
                >
                  {archetypeResult.archetype.tagline}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={driftIsStable
                      ? { background: 'rgba(74,222,128,0.10)', color: 'rgba(74,222,128,0.75)' }
                      : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }
                    }
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: driftIsStable ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.40)' }}
                    />
                    {driftIsStable ? 'Stable signal' : `${driftShiftCount} shift${driftShiftCount !== 1 ? 's' : ''} detected`}
                  </span>
                </div>
                {layers?.generated_at && (
                  <p
                    className="mt-2 text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
                  >
                    Updated {timeAgo(layers.generated_at)}
                  </p>
                )}
              </section>

              {/* Pre-filled primary CTA + Share CTA — Share is promoted into the above-the-fold
                  hero because "Here's what my AI twin knows about me" is the platform's strongest
                  viral hook. Previously it was a tiny low-contrast link buried ~1400px down. */}
              <div className="mt-6 pl-5 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() =>
                    handleSuggestion(
                      `Tell me what "${formatArchetypeName(archetypeResult.archetype.name)}" actually means about how I live — the real evidence from my data, not a generic description.`
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-85 active:scale-[0.97]"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'var(--foreground)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Ask your twin why this fits
                  <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
                {user && (
                  <button
                    onClick={handleShare}
                    aria-label="Share your soul signature"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
                    style={{
                      background: '#F5F5F4',
                      color: '#110f0f',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                    Share your signature
                  </button>
                )}
              </div>
            </>
          ) : (
            // Fallback hero for users whose archetype hasn't been computed yet (pre-onboarding or <20 memories).
            // Intentionally simple — the still-learning card below carries the CTA to connect platforms.
            <div>
              <h1
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 'clamp(32px, 6vw, 48px)',
                  fontWeight: 400,
                  color: 'var(--foreground)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                Your signal is coming together
              </h1>
              <p
                className="mt-3 text-[15px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Inter', sans-serif", maxWidth: '42ch' }}
              >
                A few more observations from your connected platforms and your archetype will take shape.
              </p>
            </div>
          )}

          {traitBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {traitBadges.map((badge) => (
                <span
                  key={badge}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.65)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Your soul, in your own words (askjo SOUL.md analog) ─────── */}
      {/* User-editable narrative override. Renders nothing if no soul */}
      {/* signature has been generated yet. */}
      <IdentityNarrativeCard />

      {/* ── Temporal Comparison ("You then vs you now") ─────────────── */}
      {/* Renders nothing unless the backend has 8+ memories in each window. */}
      <TemporalComparison />

      {/* ── Still Learning State ───────────────────────────────────── */}
      {showStillLearning && (
        <FadeInSection delay={0.2}>
          {glassCard(
            <div className="text-center">
              <p
                className="text-sm mb-3"
                style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}
              >
                Your twin is still learning your patterns. Connect more platforms to unlock your full soul signature.
              </p>
              <button
                onClick={() => navigate('/get-started')}
                className="px-4 py-2 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
                style={{ border: '1px solid rgba(255,255,255,0.20)', color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
              >
                Connect platforms
              </button>
            </div>
          )}
        </FadeInSection>
      )}

      {/* ── Identity Quote ─────────────────────────────────────────── */}
      <IdentityQuote />

      {/* ── Expert lenses (expand/collapse) ────────────────────────── */}
      {expertLensEntries.length > 0 && (
        <FadeInSection delay={0.12}>
          {glassCard(
            <>
              <SectionLabel>What your experts see</SectionLabel>
              <div className="space-y-3.5">
                {expertLensEntries.map(({ key, label, preview, rest, insightLink }) => {
                  const isExpanded = expandedLens === key;
                  const hasMore = rest.length > 0;
                  return (
                    <div key={key} className="flex items-start gap-3">
                      <span
                        className="text-[10px] font-medium uppercase tracking-wider flex-shrink-0 pt-0.5 w-[68px] text-right"
                        style={{ color: 'rgba(255,255,255,0.28)', fontFamily: "'Inter', sans-serif" }}
                      >
                        {label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          style={{
                            fontFamily: "'Instrument Serif', Georgia, serif",
                            fontStyle: 'italic',
                            fontSize: '14px',
                            color: 'rgba(255,255,255,0.72)',
                            lineHeight: 1.55,
                          }}
                        >
                          {preview}
                          {!hasMore && '.'}
                        </p>
                        <AnimatePresence initial={false}>
                          {isExpanded && hasMore && (
                            <motion.div
                              initial={{ opacity: 0, height: 0, marginTop: 0 }}
                              animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                              exit={{ opacity: 0, height: 0, marginTop: 0 }}
                              transition={{ duration: 0.22, ease: 'easeOut' }}
                              style={{ overflow: 'hidden' }}
                            >
                              <p
                                style={{
                                  fontFamily: "'Instrument Serif', Georgia, serif",
                                  fontStyle: 'italic',
                                  fontSize: '14px',
                                  color: 'rgba(255,255,255,0.6)',
                                  lineHeight: 1.55,
                                }}
                              >
                                {rest}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="flex items-center gap-3 mt-1.5">
                          {hasMore && (
                            <button
                              type="button"
                              onClick={() => setExpandedLens(isExpanded ? null : key)}
                              className="text-[11px] transition-opacity duration-150 hover:opacity-70"
                              style={{
                                color: 'rgba(255,255,255,0.4)',
                                fontFamily: "'Inter', sans-serif",
                                background: 'transparent',
                                padding: 0,
                              }}
                            >
                              {isExpanded ? 'Show less' : 'Show full analysis'}
                            </button>
                          )}
                          {insightLink && (
                            <button
                              type="button"
                              onClick={() => navigate(insightLink.route)}
                              className="text-[12px] inline-flex items-center gap-1 transition-opacity duration-150 hover:opacity-70"
                              style={{
                                color: 'var(--accent-vibrant)',
                                fontFamily: "'Inter', sans-serif",
                                background: 'transparent',
                                padding: 0,
                              }}
                            >
                              Deep dive: {insightLink.label} insights
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </FadeInSection>
      )}

      {/* ── Values ─────────────────────────────────────────────────── */}
      {layers?.values?.values && layers.values.values.length > 0 && (
        <FadeInSection delay={0.15}>
          {glassCard(
            <>
              <SectionLabel>Your Values</SectionLabel>
              {layers.values.values.map((value, idx) => (
                <div
                  key={value.name}
                  className="py-3"
                  style={{
                    borderBottom: idx < layers.values.values.length - 1
                      ? '1px solid rgba(255,255,255,0.06)'
                      : 'none',
                  }}
                >
                  <h3 className="text-sm font-medium mb-1" style={{ color: '#E8E0D4', fontFamily: "'Inter', sans-serif" }}>
                    {value.name}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>
                    {value.evidence}
                  </p>
                </div>
              ))}
            </>,
            '',
            'anchor'
          )}
        </FadeInSection>
      )}

      {/* ── Rhythms + Taste (side by side on desktop) ──────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {layers?.rhythms && (
          <FadeInSection delay={0.2}>
            {glassCard(
              <>
                <SectionLabel>Your Rhythms</SectionLabel>
                <span
                  className="inline-block px-3 py-1.5 rounded-full text-xs font-medium mb-3"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#E8E0D4', fontFamily: "'Inter', sans-serif" }}
                >
                  {formatChronotype(layers.rhythms.chronotype)}
                </span>
                {layers.rhythms.peakHours && (
                  <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                    Peak hours: {layers.rhythms.peakHours}
                  </p>
                )}
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>
                  {layers.rhythms.summary}
                </p>
                {layers.rhythms.distribution && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] mb-1.5" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                      Time of day activity
                    </p>
                    <div className="flex rounded-[6px] overflow-hidden h-4 mb-2 gap-px" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${layers.rhythms.distribution.morning * 100}%`, backgroundColor: 'rgba(251,191,36,0.90)', minWidth: layers.rhythms.distribution.morning > 0.01 ? 2 : 0 }} />
                      <div style={{ width: `${layers.rhythms.distribution.afternoon * 100}%`, backgroundColor: 'rgba(130,170,255,0.90)', minWidth: layers.rhythms.distribution.afternoon > 0.01 ? 2 : 0 }} />
                      <div style={{ width: `${layers.rhythms.distribution.evening * 100}%`, backgroundColor: 'rgba(255,140,60,0.90)', minWidth: layers.rhythms.distribution.evening > 0.01 ? 2 : 0 }} />
                      <div style={{ width: `${layers.rhythms.distribution.night * 100}%`, backgroundColor: 'rgba(130,120,220,0.90)', minWidth: layers.rhythms.distribution.night > 0.01 ? 2 : 0 }} />
                    </div>
                    <div className="flex justify-between text-[10px]" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>
                      <span>{Math.round(layers.rhythms.distribution.morning * 100)}% Morning</span>
                      <span>{Math.round(layers.rhythms.distribution.afternoon * 100)}% Afternoon</span>
                      <span>{Math.round(layers.rhythms.distribution.evening * 100)}% Evening</span>
                      <span>{Math.round(layers.rhythms.distribution.night * 100)}% Night</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </FadeInSection>
        )}

        {layers?.taste && (
          <FadeInSection delay={0.25}>
            {glassCard(
              <>
                <SectionLabel>Your Taste</SectionLabel>
                <p
                  className="text-[14px] leading-relaxed mb-4"
                  style={{ color: 'rgba(255,255,255,0.75)', fontFamily: "'Inter', sans-serif" }}
                >
                  {layers.taste.statement}
                </p>
                {layers.taste.topSignals && layers.taste.topSignals.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {layers.taste.topSignals.map((signal) => (
                      <span
                        key={signal}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', fontFamily: "'Inter', sans-serif" }}
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </FadeInSection>
        )}
      </div>

      {/* ── Connections + Growth (side by side) ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {layers?.connections && (
          <FadeInSection delay={0.3}>
            {glassCard(
              <>
                <SectionLabel>How You Connect</SectionLabel>
                <span
                  className="inline-block px-3 py-1.5 rounded-full text-xs font-medium mb-3"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#E8E0D4', fontFamily: "'Inter', sans-serif" }}
                >
                  {formatConnectionStyle(layers.connections.style)}
                </span>
                <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>
                  {layers.connections.summary}
                </p>
                {layers.connections.patterns && layers.connections.patterns.length > 0 && (
                  <ul className="space-y-1.5">
                    {layers.connections.patterns.map((pattern) => (
                      <li key={pattern} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
                        <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'rgba(232,224,212,0.4)' }} />
                        {pattern}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </FadeInSection>
        )}

        <FadeInSection delay={0.35}>
          {glassCard(
            <>
              <SectionLabel>What's Changing</SectionLabel>
              {driftIsStable ? (
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(74,222,128,0.6)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
                    Consistent — your patterns have been stable recently
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {growthEdges!.shifts.map((shift) => (
                    <div key={shift.domain} className="flex items-start gap-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider flex-shrink-0 mt-0.5" style={growthTypeBadgeStyle(shift.type)}>
                        {shift.domain}
                      </span>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>
                        {shift.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </FadeInSection>
      </div>

      {/* ── ICA Personality Axes ────────────────────────────────────── */}
      <PersonalityAxes />

      {/* ── Ask Twin + Footer ──────────────────────────────────────── */}
      {glassCard(
        <>
          {availableInsightPages.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Deep dives</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {availableInsightPages.map(({ platform, route, label }) => (
                  <button
                    key={platform}
                    onClick={() => navigate(route)}
                    className="px-3 py-2 rounded-[46px] text-xs font-medium transition-all duration-150 hover:opacity-70 active:scale-[0.97] inline-flex items-center gap-1.5"
                    style={{
                      background: 'rgba(255,132,0,0.08)',
                      color: 'var(--accent-vibrant)',
                      border: '1px solid rgba(255,132,0,0.18)',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {label} insights
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <SectionLabel>Ask your twin about you</SectionLabel>
          <div className="flex flex-wrap gap-2 mb-6">
            {SUGGESTION_PILLS.map((pill) => (
              <button
                key={pill}
                onClick={() => handleSuggestion(pill)}
                className="px-3 py-2 rounded-[46px] text-xs font-medium transition-all duration-150 hover:opacity-70 active:scale-[0.97] flex items-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', fontFamily: "'Inter', sans-serif" }}
              >
                {pill}
                <ArrowRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {user && (
              <button
                onClick={handleShare}
                aria-label="Share your soul signature"
                className="flex items-center gap-1.5 text-[12px] transition-all duration-150 ease-out hover:opacity-60 active:scale-[0.97] min-h-[44px]"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            )}
            <button
              onClick={() => navigate('/get-started')}
              className="flex items-center gap-1.5 text-[12px] transition-all duration-150 ease-out hover:opacity-60 active:scale-[0.97]"
              style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}
            >
              Connect more platforms
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* First-time reveal overlay */}
      <AnimatePresence>
        {showReveal && archetypeResult && (
          <RevealOverlay
            archetypeName={formatArchetypeName(archetypeResult.archetype.name)}
            tagline={archetypeResult.archetype.tagline}
            onDismiss={dismissReveal}
          />
        )}
      </AnimatePresence>

      <SplitPanelLayout
        main={mainContent}
        sidebar={<ContextSidebar />}
      />

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
  <div
    className="min-h-screen w-full"

  >
    <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_420px] gap-8 max-w-[1320px] mx-auto px-6 py-10">
      {/* Main panel skeleton */}
      <div
        className="rounded-[24px] px-8 py-10 animate-pulse"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="h-10 w-72 rounded mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-4 w-40 rounded mb-12" style={{ background: 'rgba(255,255,255,0.03)' }} />
        <div className="h-12 w-64 rounded mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-4 w-80 rounded mb-4" style={{ background: 'rgba(255,255,255,0.03)' }} />
        <div className="flex flex-wrap gap-2 mb-12">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="mb-10">
            <div className="h-3 w-24 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-4 w-full rounded mb-2" style={{ background: 'rgba(255,255,255,0.03)' }} />
            <div className="h-4 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
          </div>
        ))}
      </div>
      {/* Sidebar skeleton */}
      <div
        className="rounded-[24px] px-5 py-6 animate-pulse"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="w-28 h-28 rounded-full mx-auto mb-6" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 rounded-[12px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
        <div className="h-10 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
      </div>
    </div>
    {/* Mobile fallback */}
    <div className="lg:hidden max-w-[680px] mx-auto px-5 py-8 animate-pulse space-y-5">
      <div className="h-48 w-full rounded-[20px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-28 w-full rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="grid grid-cols-2 gap-5">
        <div className="h-32 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-32 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="h-32 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-32 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="h-44 w-full rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="h-20 w-full rounded-[20px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  </div>
);

// ── Generating state ─────────────────────────────────────────────────────
// audit-2026-06-10: shown while /soul-signature/layers reports generating:true.
// The query above polls every retryAfter seconds, so this resolves on its own.

const GeneratingState: React.FC<{ message?: string }> = ({ message }) => (
  <div className="max-w-xl mx-auto px-6 py-20 text-center">
    <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" style={{ color: 'rgba(255,255,255,0.35)' }} />
    <h2
      className="text-xl mb-3"
      style={{
        fontFamily: "'Instrument Serif', Georgia, serif",
        fontStyle: 'italic',
        color: 'var(--foreground)',
        opacity: 0.8,
      }}
    >
      Reading your signals
    </h2>
    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
      {message || 'Your soul signature is being generated. This usually takes under a minute.'}
    </p>
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────────

const EmptyState: React.FC<{ message?: string }> = ({ message }) => {
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
        {/* audit-2026-06-10: prefer the backend's precise reason (e.g. "N
            memories found, minimum 10 required") over the generic claim. */}
        {message || "Connect Spotify, Calendar, or YouTube and I'll build a real picture of you. Usually takes a couple of days."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => navigate('/get-started')}
          className="px-5 py-2 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
          style={{ border: '1px solid rgba(255,255,255,0.20)', color: 'var(--foreground)' }}
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
