import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { RefreshCw, AlertCircle, Share2, Link, Check, Download } from 'lucide-react';
import { useTwinPortrait } from '../hooks/useTwinPortrait';
import { ThemeColors } from './components/soul-signature/types';
import { BigFivePanel } from './components/soul-signature/BigFivePanel';
import { TwinSummaryHero } from './components/soul-portrait/TwinSummaryHero';
import { ExpertReflections } from './components/soul-portrait/ExpertReflections';
import { InsightsSection } from './components/soul-portrait/InsightsSection';
import { ActiveGoalsStrip } from './components/soul-portrait/ActiveGoalsStrip';
import { LivePlatformPulse } from './components/soul-portrait/LivePlatformPulse';
import { MemoryStreamFooter } from './components/soul-portrait/MemoryStreamFooter';
import { PortraitEmptyState } from './components/soul-portrait/PortraitEmptyState';

const SoulSignatureDashboard: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [isPublic, setIsPublic] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL;

  // Redirect if not authenticated
  if (!user) {
    navigate('/auth');
    return null;
  }

  const { data: portrait, isLoading, error, refetch } = useTwinPortrait(!!user);

  const colors: ThemeColors = {
    textColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
    textMuted: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
    textFaint: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e',
    cardBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
    cardBorder: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
    cardShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.06)',
    hoverBg: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    subtleBg: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    theme
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

  const hasData = portrait && (
    portrait.twinSummary ||
    portrait.reflections.length > 0 ||
    portrait.insights.length > 0 ||
    portrait.memoryStats.total > 0
  );

  return (
    <PageLayout maxWidth="xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="text-3xl md:text-4xl mb-2"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: colors.textColor }}
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
          <span style={{ color: theme === 'dark' ? '#fca5a5' : '#991b1b' }}>
            {(error as Error).message || 'Failed to load portrait'}
          </span>
          <button onClick={() => refetch()} className="ml-auto text-sm underline" style={{ color: colors.textSecondary }}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasData && !error && <PortraitEmptyState />}

      {/* Portrait content - single scrollable page */}
      {hasData && portrait && (
        <>
          {/* Twin Summary Hero — 5-domain narrative (centerpiece) */}
          {portrait.twinSummary && <TwinSummaryHero data={portrait.twinSummary} />}

          {/* Proactive Insights — "What Your Twin Noticed" */}
          <InsightsSection insights={portrait.insights} />

          {/* Expert Reflections — Top observations from 5 expert personas */}
          <ExpertReflections reflections={portrait.reflections} />

          {/* Active Goals — with progress */}
          <ActiveGoalsStrip goals={portrait.goals} />

          {/* Live Platform Pulse — connected platform data */}
          <LivePlatformPulse
            platformData={portrait.platformData}
            connectedPlatforms={portrait.connectedPlatforms}
          />

          {/* Big Five — collapsible, secondary */}
          {portrait.personalityScores && (
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
          )}

          {/* Memory Stream Footer — stats bar */}
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
