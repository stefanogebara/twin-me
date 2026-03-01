import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { RefreshCw, AlertCircle, Share2, Link, Check, Download, User2, Sun, Music, Users, Zap, ChevronDown } from 'lucide-react';
import { useTwinPortrait } from '../hooks/useTwinPortrait';
import { ThemeColors } from './components/soul-signature/types';
import { BigFivePanel } from './components/soul-signature/BigFivePanel';
import { MemoryStreamFooter } from './components/soul-portrait/MemoryStreamFooter';
import { PortraitEmptyState } from './components/soul-portrait/PortraitEmptyState';
import { EvolutionSection } from '../components/brain/EvolutionSection';
import { motion } from 'framer-motion';

// Whitelist for stats — filters out unknown/internal platform entries
const STATS_PLATFORM_WHITELIST = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'whoop', 'github', 'reddit'];

const DOMAIN_CONFIG: Record<string, {
  label: string;
  number: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  bgColor: string;
}> = {
  personality:      { label: 'Personality',      number: '01', Icon: User2, color: '#6366F1', bgColor: 'rgba(99, 102, 241, 0.10)' },
  lifestyle:        { label: 'Lifestyle',         number: '02', Icon: Sun,   color: '#C4A265', bgColor: 'rgba(196, 162, 101, 0.12)' },
  culturalIdentity: { label: 'Cultural Identity', number: '03', Icon: Music, color: '#0D9488', bgColor: 'rgba(13, 148, 136, 0.10)' },
  socialDynamics:   { label: 'Social Dynamics',   number: '04', Icon: Users, color: '#EC4899', bgColor: 'rgba(236, 72, 153, 0.10)' },
  motivation:       { label: 'Motivation',        number: '05', Icon: Zap,   color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.10)' },
};

// ─── DomainSection ────────────────────────────────────────────────────────────

interface DomainSectionProps {
  domainKey: string;
  text: string;
}

const DomainSection: React.FC<DomainSectionProps> = ({ domainKey, text }) => {
  const [expanded, setExpanded] = useState(false);
  const config = DOMAIN_CONFIG[domainKey];
  if (!config) return null;

  const { Icon, color, bgColor, label } = config;

  // First sentence as the card preview
  const dotIdx = text.indexOf('. ');
  const preview = dotIdx > 20 && dotIdx < 160
    ? text.slice(0, dotIdx + 1)
    : text.slice(0, 110) + '\u2026';

  return (
    <div className="mb-3">
      <div
        className="rounded-2xl overflow-hidden transition-shadow duration-200"
        style={{
          background: 'rgba(255, 255, 255, 0.60)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: expanded ? '0 4px 24px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* Header row — always visible, tappable */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="w-full text-left flex items-center gap-4 p-5"
        >
          {/* Colored icon */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: bgColor }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>

          {/* Label + one-line preview */}
          <div className="flex-1 min-w-0">
            <p
              className="uppercase tracking-widest mb-0.5"
              style={{ fontSize: '10px', color, fontFamily: "'Geist', sans-serif", fontWeight: 600 }}
            >
              {label}
            </p>
            <p
              className="truncate"
              style={{ fontSize: '13px', color: '#78716c', fontFamily: "'Geist', sans-serif" }}
            >
              {preview}
            </p>
          </div>

          {/* Chevron */}
          <ChevronDown
            className="flex-shrink-0 w-4 h-4 transition-transform duration-200"
            style={{ color: '#a8a29e', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>

        {/* Expanded full text */}
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="px-5 pb-5"
          >
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '16px' }}>
              <p
                style={{
                  fontFamily: "'Geist', sans-serif",
                  fontSize: '14px',
                  fontWeight: 400,
                  lineHeight: 1.75,
                  color: '#44403c',
                }}
              >
                {text}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SoulSignatureDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isPublic, setIsPublic] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL;

  const { data: portrait, isLoading, error, refetch } = useTwinPortrait(!!user);

  // Use cached archetype from onboarding if portrait API hasn't loaded yet
  const cachedArchetype = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('instant_archetype');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  // Redirect if not authenticated (after all hooks)
  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user, navigate]);

  if (!user) return null;

  // portrait.soulSignature from API, falling back to sessionStorage cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- portrait shape from API is dynamic
  const displaySoulSignature = (portrait as any)?.soulSignature ?? cachedArchetype;

  const colors: ThemeColors = {
    textColor: '#000000',
    textSecondary: '#8A857D',
    textMuted: '#8A857D',
    textFaint: 'rgba(138, 133, 125, 0.7)',
    cardBg: 'rgba(255, 255, 255, 0.55)',
    cardBorder: '1px solid rgba(0, 0, 0, 0.08)',
    cardShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
    hoverBg: 'rgba(0, 0, 0, 0.02)',
    subtleBg: 'rgba(0, 0, 0, 0.05)',
    theme: 'light'
  };

  const toggleShare = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    setShareLoading(true);
    try {
      const res = await fetch(`${API_URL}/soul-signature/visibility`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !isPublic })
      });
      const data = await res.json();
      if (data.success) setIsPublic(data.is_public);
    } catch { /* ignore */ }
    finally { setShareLoading(false); }
  };

  const copyShareLink = () => {
    if (!user?.id) return;
    const url = `${window.location.origin}/api/s/${user.id}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const downloadCard = async () => {
    if (!user?.id) return;
    const token = localStorage.getItem('auth_token');
    setDownloadLoading(true);
    try {
      const res = await fetch(`${API_URL}/og/soul-card?userId=${user.id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soul-signature-${user.id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading card:', err);
    } finally {
      setDownloadLoading(false);
    }
  };

  if (isLoading) {
    return (
      <PageLayout maxWidth="xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: colors.textSecondary }} />
            <p style={{ color: colors.textSecondary }}>Loading your soul signature...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  const hasData = !!(
    displaySoulSignature ||
    portrait?.twinSummary ||
    (portrait?.reflections?.length ?? 0) > 0 ||
    (portrait?.insights?.length ?? 0) > 0 ||
    (portrait?.memoryStats?.total ?? 0) > 0 ||
    (portrait?.connectedPlatforms?.length ?? 0) > 0 ||
    portrait?.personalityScores !== null
  );

  // Determine which platforms are connected and have a known config
  const PLATFORM_ALIAS: Record<string, string> = { google_calendar: 'calendar', whoop: 'whoop' };
  const knownPlatforms = ['spotify', 'calendar', 'youtube', 'discord', 'linkedin', 'whoop'];
  const activePlatforms = portrait?.connectedPlatforms
    .map(p => {
      const key = p.platform.toLowerCase();
      return PLATFORM_ALIAS[key] ?? key;
    })
    .filter(p => knownPlatforms.includes(p)) ?? [];

  const whitelistedPlatforms = portrait?.connectedPlatforms.filter(p =>
    STATS_PLATFORM_WHITELIST.includes(p.platform.toLowerCase())
  ) ?? [];

  // ─── Derived display values ─────────────────────────────────────────────────

  const archetypeName = displaySoulSignature?.archetype_name ?? '';
  const archetypeQuote = displaySoulSignature?.signature_quote ?? displaySoulSignature?.archetype_subtitle ?? '';
  const archetypeNarrative = displaySoulSignature?.first_impression ?? displaySoulSignature?.narrative ?? '';
  const rawTraits = displaySoulSignature?.core_traits ?? displaySoulSignature?.defining_traits ?? [];
  const traitList: string[] = (Array.isArray(rawTraits) ? rawTraits : [])
    .map((t: unknown) => (typeof t === 'string' ? t : (t as { trait?: string })?.trait ?? ''))
    .filter(Boolean)
    .slice(0, 4);

  const memoryTotal = portrait?.memoryStats?.total ?? 0;
  const formattedMemories = memoryTotal.toLocaleString('en-US') + ' memories';

  const daysSinceFirst = portrait?.firstMemoryAt
    ? Math.floor((Date.now() - new Date(portrait.firstMemoryAt).getTime()) / 86_400_000)
    : null;

  const platformCount = whitelistedPlatforms.length;

  const domains = portrait?.twinSummary?.domains as Record<string, string> | undefined;

  // Convert legacy third-person reflections to second person for display
  function toSecondPerson(text: string): string {
    return text
      .replace(/^This person /i, 'You ')
      .replace(/^They /i, 'You ')
      .replace(/^Their /i, 'Your ')
      .replace(/ they /gi, ' you ')
      .replace(/ their /gi, ' your ')
      .replace(/ them /gi, ' you ')
      .replace(/ they're /gi, " you're ")
      .replace(/ they've /gi, " you've ")
      .replace(/ they'd /gi, " you'd ")
      .replace(/ they'll /gi, " you'll ");
  }

  return (
    <PageLayout maxWidth="xl">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="heading-serif mb-2"
            style={{ fontSize: '36px' }}
          >
            Your Soul Signature
          </h1>
          <p style={{ color: colors.textSecondary }}>
            What your twin knows about you
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPublic && (
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 hover:scale-[1.02]"
              style={{
                backgroundColor: linkCopied ? 'rgba(16, 185, 129, 0.1)' : colors.subtleBg,
                color: linkCopied ? '#10B981' : colors.textColor,
                border: linkCopied ? '1px solid rgba(16, 185, 129, 0.3)' : colors.cardBorder
              }}
            >
              {linkCopied ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
              <span className="text-sm font-medium hidden sm:inline">{linkCopied ? 'Copied!' : 'Copy Link'}</span>
            </button>
          )}
          <button
            onClick={downloadCard}
            disabled={downloadLoading}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
            style={{ backgroundColor: colors.subtleBg, color: colors.textColor, border: colors.cardBorder }}
          >
            <Download className={`w-4 h-4 ${downloadLoading ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-medium hidden sm:inline">{downloadLoading ? 'Saving...' : 'Download'}</span>
          </button>
          <button
            onClick={toggleShare}
            disabled={shareLoading}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
            style={{
              backgroundColor: isPublic ? 'rgba(99, 102, 241, 0.1)' : colors.subtleBg,
              color: isPublic ? '#6366F1' : colors.textColor,
              border: isPublic ? '1px solid rgba(99, 102, 241, 0.3)' : colors.cardBorder
            }}
          >
            <Share2 className="w-4 h-4" />
            <span className="text-sm font-medium hidden sm:inline">{isPublic ? 'Public' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="mb-6 p-4 rounded-xl flex items-center gap-3"
          style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.2)' }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
          <span style={{ color: '#991b1b' }}>
            {(error as Error).message || 'Failed to load portrait'}
          </span>
          <button onClick={() => refetch()} className="ml-auto text-sm underline" style={{ color: colors.textSecondary }}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasData && !error && <PortraitEmptyState />}

      {/* Magazine layout — single column, max-width 720px centered */}
      {hasData && (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>

          {/* ── 1. ARCHETYPE HERO ─────────────────────────────────────────────── */}
          {displaySoulSignature && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-16 pb-16"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
            >
              <div className="flex items-start gap-6">
                {/* Text content — 60% */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-3"
                    style={{ color: '#C4A265' }}
                  >
                    Your Soul Archetype
                  </p>
                  <h1
                    style={{
                      fontFamily: "'Halant', serif",
                      fontSize: '48px',
                      fontWeight: 600,
                      lineHeight: 1.15,
                      color: '#000000',
                      marginBottom: '12px',
                    }}
                  >
                    {archetypeName}
                  </h1>
                  {archetypeQuote && (
                    <p
                      style={{
                        fontFamily: "'Halant', serif",
                        fontStyle: 'italic',
                        fontSize: '20px',
                        lineHeight: 1.5,
                        color: '#44403c',
                        marginBottom: '16px',
                      }}
                    >
                      {archetypeQuote}
                    </p>
                  )}
                  {traitList.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {traitList.map((trait: string) => (
                        <span
                          key={trait}
                          className="rounded-full px-3 py-1 text-xs font-medium"
                          style={{ background: 'rgba(196, 162, 101, 0.15)', color: '#7D6232' }}
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  )}
                  {archetypeNarrative && (
                    <p
                      className="line-clamp-2 text-sm"
                      style={{ color: '#8A857D', lineHeight: 1.65 }}
                    >
                      {archetypeNarrative}
                    </p>
                  )}
                </div>

                {/* Flower — 38% */}
                <div className="flex-shrink-0 hidden sm:block" style={{ width: '38%' }}>
                  <img
                    src="/images/backgrounds/flower-card-1.jpg"
                    alt=""
                    style={{ height: '200px', width: '100%', borderRadius: '16px', objectFit: 'cover' }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 2. STATS BAR ──────────────────────────────────────────────────── */}
          {(memoryTotal > 0 || daysSinceFirst !== null || platformCount > 0) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="py-8 flex items-center gap-4 flex-wrap"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
            >
              {memoryTotal > 0 && (
                <span
                  className="uppercase tracking-widest"
                  style={{ fontSize: '12px', color: '#8A857D', fontFamily: 'Geist, sans-serif' }}
                >
                  {formattedMemories}
                </span>
              )}
              {memoryTotal > 0 && daysSinceFirst !== null && (
                <span style={{ color: '#C4A265', fontSize: '10px' }}>&#8226;</span>
              )}
              {daysSinceFirst !== null && (
                <span
                  className="uppercase tracking-widest"
                  style={{ fontSize: '12px', color: '#8A857D', fontFamily: 'Geist, sans-serif' }}
                >
                  {daysSinceFirst} days of data
                </span>
              )}
              {((memoryTotal > 0 || daysSinceFirst !== null) && platformCount > 0) && (
                <span style={{ color: '#C4A265', fontSize: '10px' }}>&#8226;</span>
              )}
              {platformCount > 0 && (
                <span
                  className="uppercase tracking-widest"
                  style={{ fontSize: '12px', color: '#8A857D', fontFamily: 'Geist, sans-serif' }}
                >
                  {platformCount} {platformCount === 1 ? 'platform' : 'platforms'} connected
                </span>
              )}
            </motion.div>
          )}

          {/* ── 3. DOMAIN CHAPTERS ────────────────────────────────────────────── */}
          {domains && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="py-8"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: '#8A857D' }}
              >
                Who You Are
              </p>
              {Object.keys(DOMAIN_CONFIG).map(key => {
                const text = domains[key];
                if (!text) return null;
                return <DomainSection key={key} domainKey={key} text={text} />;
              })}
            </motion.div>
          )}

          {/* ── 4. TWIN REFLECTIONS ───────────────────────────────────────────── */}
          {(portrait?.reflections?.length ?? 0) > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="py-12"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-6"
                style={{ color: '#8A857D' }}
              >
                What Your Twin Sees
              </p>
              <div className="flex flex-col gap-5">
                {portrait!.reflections.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div
                      className="flex-shrink-0 mt-1"
                      style={{ width: '2px', height: '40px', background: 'rgba(196, 162, 101, 0.35)', borderRadius: '1px' }}
                    />
                    <div>
                      <p style={{ fontSize: '14px', color: '#44403c', lineHeight: 1.65 }}>
                        {toSecondPerson(r.content)}
                      </p>
                      {r.expert && (
                        <p className="mt-1 uppercase tracking-widest" style={{ fontSize: '10px', color: '#8A857D' }}>
                          {r.expert}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 5. BIG FIVE ───────────────────────────────────────────────────── */}
          {portrait?.personalityScores && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mb-8"
            >
              <BigFivePanel
                personalityScores={{
                  id: user.id,
                  openness: portrait.personalityScores.openness,
                  conscientiousness: portrait.personalityScores.conscientiousness,
                  extraversion: portrait.personalityScores.extraversion,
                  agreeableness: portrait.personalityScores.agreeableness,
                  neuroticism: portrait.personalityScores.neuroticism,
                  openness_confidence: 0,
                  conscientiousness_confidence: 0,
                  extraversion_confidence: 0,
                  agreeableness_confidence: 0,
                  neuroticism_confidence: 0,
                  archetype_code: portrait.personalityScores.archetype_code,
                  analyzed_platforms: portrait.personalityScores.analyzed_platforms || [],
                  sample_size: 0,
                }}
                onNavigateToBigFive={() => navigate('/big-five')}
                colors={colors}
              />
            </motion.div>
          )}

          {/* ── 6. EVOLUTION SECTION ──────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-8"
          >
            <EvolutionSection />
          </motion.div>

          {/* ── 7. MEMORY FOOTER ──────────────────────────────────────────────── */}
          {portrait && (
            <MemoryStreamFooter
              stats={portrait.memoryStats}
              firstMemoryAt={portrait.firstMemoryAt}
            />
          )}

        </div>
      )}
    </PageLayout>
  );
};

export default SoulSignatureDashboard;
