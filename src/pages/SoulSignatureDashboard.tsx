import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { RefreshCw, AlertCircle, Share2, Link, Check, Download } from 'lucide-react';
import { useTwinPortrait } from '../hooks/useTwinPortrait';
import { ThemeColors } from './components/soul-signature/types';
import { BigFivePanel } from './components/soul-signature/BigFivePanel';
import { MemoryStreamFooter } from './components/soul-portrait/MemoryStreamFooter';
import { PortraitEmptyState } from './components/soul-portrait/PortraitEmptyState';
import { BentoHero } from './components/soul-portrait/BentoHero';
import { BentoStatsTile } from './components/soul-portrait/BentoStatsTile';
import { BentoDomainTile } from './components/soul-portrait/BentoDomainTile';
import { BentoPlatformTile } from './components/soul-portrait/BentoPlatformTile';
import { BentoInsightsTile } from './components/soul-portrait/BentoInsightsTile';
import { BentoExpertSpotlight } from './components/soul-portrait/BentoExpertSpotlight';
import { BentoGoalsTile } from './components/soul-portrait/BentoGoalsTile';

// Whitelist for BentoStatsTile — filters out unknown/internal platform entries
const STATS_PLATFORM_WHITELIST = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'github', 'reddit'];

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
  const cachedArchetype = React.useMemo(() => {
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
    textColor: '#1F1C18',
    textSecondary: '#8A857D',
    textMuted: '#8A857D',
    textFaint: 'rgba(138, 133, 125, 0.7)',
    cardBg: 'rgba(255, 255, 255, 0.18)',
    cardBorder: '1px solid rgba(255, 255, 255, 0.45)',
    cardShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
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
    displaySoulSignature ||           // NEW — show content if archetype exists
    portrait?.twinSummary ||
    (portrait?.reflections?.length ?? 0) > 0 ||
    (portrait?.insights?.length ?? 0) > 0 ||
    (portrait?.memoryStats?.total ?? 0) > 0 ||
    (portrait?.connectedPlatforms?.length ?? 0) > 0 ||
    portrait?.personalityScores !== null
  );

  // Determine which platforms are connected and have a known config
  // DB stores 'google_calendar' but we reference it as 'calendar' in the UI
  const PLATFORM_ALIAS: Record<string, string> = { google_calendar: 'calendar' };
  const knownPlatforms = ['spotify', 'calendar', 'youtube', 'discord', 'linkedin'];
  const activePlatforms = portrait?.connectedPlatforms
    .map(p => {
      const key = p.platform.toLowerCase();
      return PLATFORM_ALIAS[key] ?? key;
    })
    .filter(p => knownPlatforms.includes(p)) ?? [];

  const whitelistedPlatforms = portrait?.connectedPlatforms.filter(p =>
    STATS_PLATFORM_WHITELIST.includes(p.platform.toLowerCase())
  ) ?? [];

  return (
    <PageLayout maxWidth="xl">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="heading-serif text-3xl md:text-4xl mb-2"
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

      {/* Bento grid layout */}
      {hasData && (
        <>
          {/* Archetype Card — visible immediately after onboarding, before reflections accumulate */}
          {displaySoulSignature && (
            <div
              className="mb-6 rounded-2xl p-6 backdrop-blur-sm"
              style={{ background: colors.cardBg, border: colors.cardBorder, boxShadow: colors.cardShadow }}
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textFaint }}>
                Your Archetype
              </p>
              <h2 className="mb-2 text-2xl font-bold" style={{ color: colors.textColor }}>
                {displaySoulSignature.archetype_name}
              </h2>
              {/* signature_quote is the sessionStorage field, archetype_subtitle is the DB field */}
              {(displaySoulSignature.signature_quote || displaySoulSignature.archetype_subtitle) && (
                <p className="mb-3 italic" style={{ color: colors.textSecondary }}>
                  "{displaySoulSignature.signature_quote ?? displaySoulSignature.archetype_subtitle}"
                </p>
              )}
              {/* core_traits is sessionStorage field, defining_traits is DB field */}
              {(() => {
                const raw = displaySoulSignature.core_traits ?? displaySoulSignature.defining_traits ?? [];
                const traitList: string[] = (Array.isArray(raw) ? raw : [])
                  .map((t: unknown) => (typeof t === 'string' ? t : (t as { trait?: string })?.trait ?? ''))
                  .filter(Boolean);
                return traitList.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {traitList.map((trait: string) => (
                      <span key={trait} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: colors.subtleBg, color: colors.textSecondary }}>
                        {trait}
                      </span>
                    ))}
                  </div>
                ) : null;
              })()}
              {/* first_impression is sessionStorage field, narrative is DB field */}
              {(displaySoulSignature.first_impression || displaySoulSignature.narrative) && (
                <p className="mt-3 text-sm" style={{ color: colors.textMuted }}>
                  {displaySoulSignature.first_impression ?? displaySoulSignature.narrative}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Bento grid layout */}
      {hasData && portrait && (
        <>
          {/* ── Row 1: Hero (2/3) + Stats (1/3) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {portrait.twinSummary ? (
              <div className="lg:col-span-2">
                <BentoHero data={portrait.twinSummary} />
              </div>
            ) : (
              <div className="lg:col-span-2" />
            )}
            <BentoStatsTile
              stats={portrait.memoryStats}
              firstMemoryAt={portrait.firstMemoryAt}
              connectedPlatforms={whitelistedPlatforms}
            />
          </div>

          {/* ── Row 2: Personality + Lifestyle + Spotify/Cultural Identity ── */}
          {portrait.twinSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <BentoDomainTile
                domainKey="personality"
                domains={portrait.twinSummary.domains}
                animationDelay={0.05}
              />
              <BentoDomainTile
                domainKey="lifestyle"
                domains={portrait.twinSummary.domains}
                animationDelay={0.1}
              />
              {activePlatforms.includes('spotify') ? (
                <BentoPlatformTile
                  platform="spotify"
                  platformData={portrait.platformData}
                  connectedPlatforms={portrait.connectedPlatforms}
                  animationDelay={0.15}
                />
              ) : (
                <BentoDomainTile
                  domainKey="culturalIdentity"
                  domains={portrait.twinSummary.domains}
                  animationDelay={0.15}
                />
              )}
            </div>
          )}

          {/* ── Row 3: Cultural Identity + Social Dynamics + Motivation ── */}
          {portrait.twinSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {activePlatforms.includes('spotify') && (
                <BentoDomainTile
                  domainKey="culturalIdentity"
                  domains={portrait.twinSummary.domains}
                  animationDelay={0.1}
                />
              )}
              <BentoDomainTile
                domainKey="socialDynamics"
                domains={portrait.twinSummary.domains}
                animationDelay={0.15}
              />
              <BentoDomainTile
                domainKey="motivation"
                domains={portrait.twinSummary.domains}
                animationDelay={0.2}
              />
            </div>
          )}

          {/* ── Row 3b: Platform insight tiles (Calendar + YouTube + Discord + LinkedIn) ── */}
          {(activePlatforms.includes('calendar') || activePlatforms.includes('youtube') ||
            activePlatforms.includes('discord') || activePlatforms.includes('linkedin')) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {activePlatforms.includes('calendar') && (
                <BentoPlatformTile
                  platform="calendar"
                  platformData={portrait.platformData}
                  connectedPlatforms={portrait.connectedPlatforms}
                  animationDelay={0.1}
                />
              )}
              {activePlatforms.includes('youtube') && (
                <BentoPlatformTile
                  platform="youtube"
                  platformData={portrait.platformData}
                  connectedPlatforms={portrait.connectedPlatforms}
                  animationDelay={0.15}
                />
              )}
              {activePlatforms.includes('discord') && (
                <BentoPlatformTile
                  platform="discord"
                  platformData={portrait.platformData}
                  connectedPlatforms={portrait.connectedPlatforms}
                  animationDelay={0.2}
                />
              )}
              {activePlatforms.includes('linkedin') && (
                <BentoPlatformTile
                  platform="linkedin"
                  platformData={portrait.platformData}
                  connectedPlatforms={portrait.connectedPlatforms}
                  animationDelay={0.25}
                />
              )}
            </div>
          )}

          {/* ── Row 4: Insights (2/3) + Goals (1/3) ── */}
          {(portrait.insights.length > 0 || portrait.goals.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {portrait.insights.length > 0 && (
                <div className="lg:col-span-2">
                  <BentoInsightsTile insights={portrait.insights} animationDelay={0.1} />
                </div>
              )}
              {portrait.goals.length > 0 && (
                <BentoGoalsTile goals={portrait.goals} animationDelay={0.15} />
              )}
            </div>
          )}

          {/* ── Row 5: Expert Analysis — full width ── */}
          {portrait.reflections.length > 0 && (
            <div className="mb-4">
              <BentoExpertSpotlight
                reflections={portrait.reflections}
                animationDelay={0.08}
              />
            </div>
          )}

          {/* ── Big Five — collapsible, secondary ── */}
          {portrait.personalityScores && (
            <div className="mb-4">
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
            </div>
          )}

          {/* ── Memory stream footer — full width ── */}
          <MemoryStreamFooter
            stats={portrait.memoryStats}
            firstMemoryAt={portrait.firstMemoryAt}
          />
        </>
      )}
    </PageLayout>
  );
};

export default SoulSignatureDashboard;
