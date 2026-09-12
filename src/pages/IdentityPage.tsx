/**
 * IdentityPage — "Your Soul Signature"
 * ======================================
 * 5-Layer Soul Signature: Values, Rhythms, Taste, Connections, Growth Edges.
 * Archetype (from OCEAN) + traits + the layered portrait + ask twin.
 *
 * In the register (2026-09-12): one 820px column built from the page kit.
 * The archetype is the page title, every layer is a section of rows under an
 * ink rule, and a reading longer than a line waits behind a press (ExpandRow).
 * What used to be a right-hand column of glass cards (ContextSidebar) closes
 * the column as its last sections. No cards, shadows, tracked caps or italic.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Sparkles, Fingerprint, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { useLenis } from '@/hooks/useLenis';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePlatformsSummary, connectedProviders as getConnectedProviders } from '@/hooks/usePlatformsSummary';
import { IdentityData } from './components/identity/types';
import { determineArchetypeFromSoulLayers, generateTraitBadgesFromSoulLayers, formatArchetypeName } from '@/utils/archetypeEngine';
import PersonalityAxes from './components/identity/PersonalityAxes';
import IdentityQuote from './components/identity/IdentityQuote';
import TemporalComparison from './components/identity/TemporalComparison';
import IdentityNarrativeCard from './components/identity/IdentityNarrativeCard';
import ContextSidebar from './components/identity/ContextSidebar';
import ExpandRow from './components/identity/ExpandRow';
import { Page, PageHead, Section, List, Row, SubRow, Empty } from '@/components/register';

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
  // linkedin removed (replan-2026-06-10 Track C): the /insights/linkedin page
  // and route were deleted along with the LinkedIn OAuth stack.
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

// ── Suggestions ──────────────────────────────────────────────────────────

const SUGGESTION_PILLS = [
  'How have I changed this month?',
  'What patterns do you notice?',
  'What should I work on?',
  'Compare me to last month',
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────

function formatChronotype(raw: string): string {
  const labels: Record<string, string> = {
    night_owl: 'Night owl',
    early_bird: 'Early bird',
    afternoon_peak: 'Afternoon peak',
    even_keel: 'Even keel',
  };
  return labels[raw] ?? raw.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function formatConnectionStyle(raw: string): string {
  const labels: Record<string, string> = {
    deep_connector: 'Deep connector',
    social_butterfly: 'Social butterfly',
    selective_engager: 'Selective engager',
    bridge_builder: 'Bridge builder',
  };
  return labels[raw] ?? raw.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function sentenceCase(raw: string): string {
  const s = raw.replace(/_/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
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

// A shift's kind as a mark (a dot in the row's icon square), in register.css's
// values. Once pastel text on pastel fills; the kind now reads from the dot.
function growthTypeMark(type: string): string {
  switch (type) {
    case 'exploration': return 'var(--rg-iris)';
    case 'growth': return 'var(--rg-ok-line)';
    case 'stress_response': return 'var(--rg-ember)';
    default: return 'var(--rg-mark)';
  }
}

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span style={{ width: 8, height: 8, borderRadius: 9999, background: color, display: 'block' }} />
);

// The rhythm bar: the four parts of the day as signature marks (register.css).
const RHYTHM_PARTS = [
  { key: 'morning', label: 'morning', color: 'var(--rg-ember)' },
  { key: 'afternoon', label: 'afternoon', color: 'var(--rg-periwinkle)' },
  { key: 'evening', label: 'evening', color: 'var(--rg-orchid)' },
  { key: 'night', label: 'night', color: 'var(--rg-iris)' },
] as const;

/** An inline text action: ink, underlined, no box. */
const textLink: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'var(--rg-ink)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};

// ── First-time reveal overlay ────────────────────────────────────────────
// Kept, in the register: the page colour, the archetype as an upright Cosmos
// title in ink, the tagline as the grey line, one ink primary. (It was an
// italic serif title; the flip already moved its ground off #0a0909.)

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
      style={{ background: 'var(--rg-page)' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <motion.h1
        aria-label={archetypeName}
        className="relative z-10 text-center"
        style={{
          margin: 0,
          fontFamily: 'var(--rg-sans)',
          fontSize: 'var(--rg-title-marketing)',
          fontWeight: 300,
          lineHeight: 1,
          letterSpacing: 'var(--rg-title-track)',
          textWrap: 'balance',
          color: 'var(--rg-ink)',
        }}
      >
        {/* audit-2026-05-15 H10: shortened the reveal timeline so the page
            never reads as stuck: the cascade starts at 0.4s, done in ~2s. */}
        {words.map((word, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="inline-block mr-[0.25em]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.25, duration: 0.5, ease: 'easeOut' }}
          >
            {word}
          </motion.span>
        ))}
      </motion.h1>

      <motion.p
        className="relative z-10 text-center"
        style={{ margin: '12px 0 0', color: 'var(--rg-ink-2)', fontWeight: 350, maxWidth: 400 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
      >
        {tagline}
      </motion.p>

      <motion.button
        type="button"
        className="n-btn n-btn--primary relative z-10"
        style={{ marginTop: 32 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2, duration: 0.5 }}
        onClick={onDismiss}
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" />
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
    data: (SoulSignatureLayers & { layers?: SoulSignatureLayers; generatedAt?: string }) | null;
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

  // Latest fidelity battery wave (Phase 2: the headline metric). waves[0] is
  // the newest; only waves with a measured twin_accuracy count.
  const { data: fidelityData } = useQuery<{
    success: boolean;
    data: { waves: Array<{ twin_accuracy: number | null; wave: number }> } | null;
  }>({
    queryKey: ['twin-fidelity-results'],
    queryFn: async () => {
      const res = await authFetch('/twin-fidelity/results');
      if (!res.ok) return { success: false, data: null };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  });
  const latestFidelity = fidelityData?.data?.waves?.find(
    (w) => typeof w.twin_accuracy === 'number',
  ) ?? null;

  const isLoading = identityLoading || soulLoading;
  const summary = data?.data?.summary ?? null;
  const layers = soulData?.data?.layers ?? soulData?.data ?? null;
  // audit-2026-06-10: the freshness stamp read layers?.generated_at, but the
  // backend puts generatedAt as a sibling of `layers` (soul-signature.js:761),
  // not inside it — so the stamp never rendered.
  const generatedAt = soulData?.data?.generatedAt ?? null;
  const hasLayers = !!(layers?.values?.values?.length || layers?.rhythms || layers?.taste || layers?.connections);

  // ── First-time reveal check ────────────────────────────────────────────

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
      <Page>
        <PageHead title="Your soul signature" />
        <Section>
          <List>
            <li>
              <p role="alert" className="rg-empty" style={{ color: 'var(--rg-danger)' }}>{errorMsg}</p>
            </li>
          </List>
          <button
            type="button"
            className="n-btn n-btn--ghost"
            style={{ marginTop: 16 }}
            onClick={() => {
              // audit-2026-06-10: retry must refetch the query that actually
              // failed — refetching identity alone left soulError in place.
              if (identityError) refetchIdentity();
              if (soulError) refetchSoul();
            }}
          >
            Try again
          </button>
        </Section>
      </Page>
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
        similarity: localArchetypeResult?.similarity ?? 1,
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

  // ── Insight-page discovery (shown when user has connected platforms) ──
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

  // ── Suggestion click ───────────────────────────────────────────────────

  const handleSuggestion = (message: string) => {
    // Use a query param rather than navigate(state) to work around a pre-existing
    // infinite-render crash in TalkToTwin when location.state is non-null.
    // TalkToTwin reads ?prefill= and clears the param after applying.
    navigate(`/talk-to-twin?prefill=${encodeURIComponent(message)}`);
  };

  // ── Greeting ────────────────────────────────────────────────────────

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.firstName ?? user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const taste = layers?.taste?.statement ? layers.taste : null;
  // audit-2026-06-10: gate on real content. The backend returns a truthy
  // placeholder (style 'unknown', empty/insufficient summary, _partial)
  // when connection patterns couldn't be generated.
  const connections = layers?.connections?.summary && layers.connections.style !== 'unknown' ? layers.connections : null;
  const connectionsSplit = connections ? splitFirstSentence(connections.summary) : null;

  // ── The page ─────────────────────────────────────────────────────────

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

      <Page>
        {/* Greeting and date: one quiet line over the title (back on phones). */}
        <div className="flex items-center gap-2" style={{ marginBottom: 16, color: 'var(--rg-ink-2)', fontWeight: 350 }}>
          <button type="button" onClick={() => navigate(-1)} className="rg-iconbtn lg:hidden" aria-label="Go back">
            <ChevronLeft aria-hidden="true" />
          </button>
          <span>{getGreeting()}, {firstName}. {formattedDate}.</span>
        </div>

        {archetypeResult ? (
          <PageHead
            title={formatArchetypeName(archetypeResult.archetype.name)}
            line={archetypeResult.archetype.tagline}
            // Share is the page's one ink primary: "here's what my twin knows
            // about me" is the product's strongest hook.
            action={user ? (
              <button type="button" onClick={handleShare} aria-label="Share your soul signature" className="n-btn n-btn--primary">
                <Share2 className="w-4 h-4" aria-hidden="true" />
                Share
              </button>
            ) : undefined}
          />
        ) : (
          // Fallback for users whose archetype hasn't been computed yet
          // (pre-onboarding or <20 memories).
          <PageHead
            title="Your signal is coming together"
            line="A few more observations from your connected platforms and your archetype will take shape."
          />
        )}

        {(archetypeResult || traitBadges.length > 0) && (
          <Section>
            <List>
              {archetypeResult && (
                <Row
                  // Fidelity: measured twin accuracy from the test-retest
                  // battery (the Phase 2 headline metric), or an invitation.
                  title={latestFidelity
                    ? `Your twin knows you ${Math.round(latestFidelity.twin_accuracy! * 100)}%`
                    : 'Test your twin'}
                  line={latestFidelity ? 'From your last check.' : 'Twenty-five quick questions, about three minutes.'}
                  to="/fidelity"
                />
              )}
              {archetypeResult && (
                <Row
                  title={driftIsStable ? 'Stable signal' : `${driftShiftCount} shift${driftShiftCount !== 1 ? 's' : ''} detected`}
                  line={generatedAt ? `Updated ${timeAgo(generatedAt)}` : undefined}
                />
              )}
              {traitBadges.length > 0 && <Row title="Traits" line={traitBadges.join(' · ')} />}
              {archetypeResult && (
                <Row
                  title="Ask your twin why this fits"
                  line="The real evidence from your data."
                  onClick={() =>
                    handleSuggestion(
                      `Tell me what "${formatArchetypeName(archetypeResult.archetype.name)}" actually means about how I live — the real evidence from my data, not a generic description.`
                    )
                  }
                />
              )}
            </List>
          </Section>
        )}

        {/* Your soul, in your own words (askjo SOUL.md analog). Renders nothing
            if no soul signature has been generated yet. */}
        <IdentityNarrativeCard />

        {/* "You then vs you now". Renders nothing unless the backend has 8+
            memories in each window. */}
        <TemporalComparison />

        {showStillLearning && (
          <Section title="Still learning" line="Connect more platforms to unlock your full soul signature.">
            <List>
              <Row title="Connect platforms" to="/get-started" />
            </List>
          </Section>
        )}

        <IdentityQuote />

        {/* Expert lenses: the first sentence each, the rest behind a press. */}
        {expertLensEntries.length > 0 && (
          <Section title="What your twin sees">
            <List>
              {expertLensEntries.map(({ key, label, preview, rest, insightLink }) => {
                const isExpanded = expandedLens === key;
                const hasMore = rest.length > 0;
                return (
                  <ExpandRow
                    key={key}
                    title={label}
                    line={`${preview}${hasMore ? '' : '.'}`}
                    open={isExpanded}
                    onToggle={() => setExpandedLens(isExpanded ? null : key)}
                    more={hasMore || insightLink ? (
                      <>
                        {hasMore && <p style={{ margin: 0 }}>{rest}</p>}
                        {insightLink && (
                          <button
                            type="button"
                            style={{ ...textLink, marginTop: hasMore ? 8 : 0 }}
                            onClick={() => navigate(insightLink.route)}
                          >
                            See your {insightLink.label} insights
                          </button>
                        )}
                      </>
                    ) : null}
                  />
                );
              })}
            </List>
          </Section>
        )}

        {/* Values */}
        {layers?.values?.values && layers.values.values.length > 0 && (
          <Section title="Your values">
            <List>
              {layers.values.values.map((value) => (
                <Row key={value.name} title={value.name} line={value.evidence} />
              ))}
            </List>
          </Section>
        )}

        {/* Rhythms: the chronotype row, then the day as four signature marks. */}
        {layers?.rhythms && (
          <Section
            title="Your rhythms"
            line={layers.rhythms.peakHours ? `Peak hours: ${layers.rhythms.peakHours}` : undefined}
          >
            <List>
              <Row title={formatChronotype(layers.rhythms.chronotype)} line={layers.rhythms.summary} />
              {layers.rhythms.distribution && (
                <li style={{ padding: '20px 12px', borderBottom: '1px solid var(--rg-rule)' }}>
                  <span className="rg-row-title">Time of day</span>
                  <div
                    className="flex overflow-hidden"
                    style={{ height: 8, gap: 2, margin: '10px 0', borderRadius: 2 }}
                    aria-hidden="true"
                  >
                    {RHYTHM_PARTS.map(({ key, color }) => {
                      const share = layers.rhythms.distribution[key];
                      return (
                        <div
                          key={key}
                          style={{ width: `${share * 100}%`, background: color, minWidth: share > 0.01 ? 2 : 0 }}
                        />
                      );
                    })}
                  </div>
                  <ul className="flex flex-wrap" style={{ margin: 0, padding: 0, listStyle: 'none', columnGap: 16, rowGap: 4, color: 'var(--rg-ink-2)', fontWeight: 350, fontVariantNumeric: 'tabular-nums' }}>
                    {RHYTHM_PARTS.map(({ key, label, color }) => (
                      <li key={key} className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                        {Math.round(layers.rhythms.distribution[key] * 100)}% {label}
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </List>
          </Section>
        )}

        {/* audit-2026-06-10: gate on real content, not object truthiness. The
            backend returns a truthy placeholder { statement: '', _partial: true }
            when the taste layer couldn't be generated. */}
        {taste && (
          <Section title="Your taste" line={taste.statement}>
            {taste.topSignals && taste.topSignals.length > 0 && (
              <List>
                <Row title="What stands out" line={taste.topSignals.join(' · ')} />
              </List>
            )}
          </Section>
        )}

        {connections && connectionsSplit && (
          <Section title="How you connect">
            <List>
              <ExpandRow
                title={formatConnectionStyle(connections.style)}
                line={`${connectionsSplit.first}.`}
                more={connectionsSplit.rest || null}
              />
              {connections.patterns?.map((pattern) => (
                <SubRow key={pattern}><span className="rg-row-line">{pattern}</span></SubRow>
              ))}
            </List>
          </Section>
        )}

        {/* audit-2026-06-10: gate on hasLayers. Without layers, growthEdges is
            absent so driftIsStable defaults true and this would assert "stable"
            for users who have no soul-signature data at all. */}
        {hasLayers && (
          <Section title="What's changing">
            <List>
              {driftIsStable ? (
                <Row icon={<Dot color="var(--rg-ok-line)" />} title="Consistent" line="Your patterns have been stable recently." />
              ) : (
                growthEdges!.shifts.map((shift) => (
                  <Row
                    key={shift.domain}
                    icon={<Dot color={growthTypeMark(shift.type)} />}
                    title={sentenceCase(shift.domain)}
                    line={shift.description}
                  />
                ))
              )}
            </List>
          </Section>
        )}

        {/* ICA personality axes */}
        <PersonalityAxes />

        <Section title="Ask your twin">
          <List>
            {SUGGESTION_PILLS.map((pill) => (
              <Row key={pill} title={pill} onClick={() => handleSuggestion(pill)} />
            ))}
          </List>
        </Section>

        <Section title="Go deeper">
          <List>
            {availableInsightPages.map(({ platform, route, label }) => (
              <Row key={platform} title={`${label} insights`} to={route} />
            ))}
            <Row title="Connect more platforms" to="/get-started" />
          </List>
        </Section>

        {/* Soul score and "Your twin": the old right-hand column, now the
            column's closing sections. */}
        <ContextSidebar />
      </Page>
    </>
  );
};

// ── Loading skeleton ─────────────────────────────────────────────────────

const Bar: React.FC<{ width: string; height?: number }> = ({ width, height = 12 }) => (
  <span className="block rounded-[4px] animate-pulse" style={{ width, height, background: 'var(--rg-field)' }} />
);

const LoadingSkeleton: React.FC = () => (
  <Page>
    <div aria-busy="true" aria-label="Loading your soul signature">
      <PageHead title={<Bar width="60%" height={36} />} line={<span style={{ display: 'block', marginTop: 8 }}><Bar width="40%" /></span>} />
      <Section>
        <List>
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="rg-row rg-row--plain">
              <span className="rg-row-text" style={{ gap: 8 }}>
                <Bar width="30%" />
                <Bar width={`${50 + i * 8}%`} />
              </span>
              <span />
            </li>
          ))}
        </List>
      </Section>
    </div>
  </Page>
);

// ── Generating state ─────────────────────────────────────────────────────
// audit-2026-06-10: shown while /soul-signature/layers reports generating:true.
// The query above polls every retryAfter seconds, so this resolves on its own.

const GeneratingState: React.FC<{ message?: string }> = ({ message }) => (
  <Page>
    <PageHead
      title="Reading your signals"
      line={message || 'Your soul signature is being generated. This usually takes under a minute.'}
      action={<Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--rg-ink-3)' }} aria-label="Generating" />}
    />
  </Page>
);

// ── Empty state ──────────────────────────────────────────────────────────

const EmptyState: React.FC<{ message?: string }> = ({ message }) => {
  const navigate = useNavigate();

  return (
    <Page>
      <PageHead
        title="I'm still figuring you out"
        // audit-2026-06-10: prefer the backend's precise reason (e.g. "N
        // memories found, minimum 10 required") over the generic claim.
        line={message || "Connect Spotify, Calendar, or YouTube and I'll build a real picture of you. Usually takes a couple of days."}
      />
      <Section>
        <List>
          <Row icon={<Fingerprint aria-hidden="true" />} title="Connect platforms" onClick={() => navigate('/get-started')} />
          <Row icon={<Sparkles aria-hidden="true" />} title="Complete your interview" onClick={() => navigate('/story')} />
        </List>
        <Empty>Either one gives your twin something to learn from.</Empty>
      </Section>
    </Page>
  );
};

export default IdentityPage;
