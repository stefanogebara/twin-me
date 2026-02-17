import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { useTwinPipeline } from '../hooks/useTwinPipeline';
import { useNavigate } from 'react-router-dom';
import { PageLayout, GlassPanel } from '../components/layout/PageLayout';
import {
  DEMO_PERSONALITY_SCORES,
  DEMO_SOUL_ARCHETYPE,
  DEMO_BEHAVIORAL_FEATURES,
  DEMO_SPOTIFY_PERSONALITY
} from '../services/demoDataService';
import {
  Sparkles,
  Brain,
  RefreshCw,
  AlertCircle,
  Eye,
  Layers,
  Share2,
  Link,
  Check,
  Download
} from 'lucide-react';
import BehavioralEvidencePanel from '@/components/BehavioralEvidencePanel';
import AssessmentStatusCard from '@/components/AssessmentStatusCard';
import { PlatformCategoryCard, PLATFORM_CATEGORIES } from '@/components/dashboard/PlatformCategoryCard';
import {
  PersonalityScores,
  SoulSignature,
  BehavioralFeature,
  SpotifyPersonality,
  BehavioralEvidenceData,
  ThemeColors,
  TabId
} from './components/soul-signature/types';
import { PipelineStatusCard } from './components/soul-signature/PipelineStatusCard';
import { BigFivePanel } from './components/soul-signature/BigFivePanel';
import { PersonalityTypePanel } from './components/soul-signature/PersonalityTypePanel';
import { TwinInsightsGrid } from './components/soul-signature/TwinInsightsGrid';
import { OverviewTab } from './components/soul-signature/OverviewTab';

const SectionHeader = ({ title, theme }: { title: string; theme: string }) => (
  <div className="flex items-center gap-2 mb-4">
    <div
      className="w-1 h-5 rounded-full"
      style={{
        background: theme === 'dark'
          ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
          : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
      }}
    />
    <h3
      className="text-sm uppercase tracking-wider"
      style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
    >
      {title}
    </h3>
  </div>
);

const SoulSignatureDashboard: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const { theme } = useTheme();
  const { trackFunnel } = useAnalytics();
  const navigate = useNavigate();
  const { connectedProviders, data: platformStatusData } = usePlatformStatus(user?.id);
  const {
    isPipelineRunning,
    currentStage,
    hasTwin,
    connectedCount,
    formTwin,
    isForming,
    formError
  } = useTwinPipeline(user?.id || null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [personalityScores, setPersonalityScores] = useState<PersonalityScores | null>(null);
  const [soulSignature, setSoulSignature] = useState<SoulSignature | null>(null);
  const [features, setFeatures] = useState<BehavioralFeature[]>([]);
  const [spotifyPersonality, setSpotifyPersonality] = useState<SpotifyPersonality | null>(null);
  const [behavioralEvidence, setBehavioralEvidence] = useState<BehavioralEvidenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isPublic, setIsPublic] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL;

  // Theme-aware colors
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

  const fetchData = async () => {
    if (isDemoMode) {
      const platformsToUse = connectedProviders.length > 0 ? connectedProviders : DEMO_PERSONALITY_SCORES.analyzed_platforms;
      setPersonalityScores({
        ...DEMO_PERSONALITY_SCORES,
        analyzed_platforms: platformsToUse,
        sample_size: platformsToUse.length * 15 + 2
      });
      setSoulSignature(DEMO_SOUL_ARCHETYPE);
      setFeatures(DEMO_BEHAVIORAL_FEATURES);
      setSpotifyPersonality(DEMO_SPOTIFY_PERSONALITY);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const headers = { 'Authorization': `Bearer ${token}` };

      const [scoresRes, signatureRes, featuresRes, spotifyRes, evidenceRes] = await Promise.all([
        fetch(`${API_URL}/soul-signature/personality-scores`, { headers }),
        fetch(`${API_URL}/soul-signature/archetype`, { headers }),
        fetch(`${API_URL}/soul-signature/features`, { headers }),
        fetch(`${API_URL}/soul-insights/${user?.id}/spotify-personality`, { headers }).catch(() => null),
        fetch(`${API_URL}/personality-inference/evidence`, { headers }).catch(() => null)
      ]);

      const [scoresData, signatureData, featuresData] = await Promise.all([
        scoresRes.json(),
        signatureRes.json(),
        featuresRes.json()
      ]);

      if (scoresData.success && scoresData.data) {
        setPersonalityScores(scoresData.data);
      }
      if (signatureData.success && signatureData.data) {
        const signatureWithColors = {
          ...signatureData.data,
          color_scheme: signatureData.data.color_scheme || {
            primary: '#C1C0B6',
            secondary: '#A8A79E',
            accent: '#D4D3CC',
            background: '#2D2D29',
            text: '#C1C0B6'
          }
        };
        setSoulSignature(signatureWithColors);
      }
      if (featuresData.success && featuresData.data) {
        setFeatures(featuresData.data);
      }

      if (spotifyRes) {
        try {
          const spotifyData = await spotifyRes.json();
          if (spotifyData.success && spotifyData.spotify) {
            setSpotifyPersonality(spotifyData.spotify);
          }
        } catch {
          // No Spotify personality data available
        }
      }

      if (evidenceRes) {
        try {
          const evidenceData = await evidenceRes.json();
          if (evidenceData.success) {
            setBehavioralEvidence({
              evidence: evidenceData.evidence,
              confidence: evidenceData.confidence,
              dataSources: evidenceData.data_sources
            });
          }
        } catch {
          // No behavioral evidence data available
        }
      }
    } catch (err) {
      console.error('Error fetching soul signature data:', err);
      setError('Failed to load soul signature data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch share status on mount
  useEffect(() => {
    if (isDemoMode) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    fetch(`${API_URL}/soul-signature/share-status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (data.success) setIsPublic(data.is_public || false); })
      .catch(() => {});
  }, [isDemoMode, API_URL]);

  const toggleShare = async () => {
    if (isDemoMode) return;
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

  const generateSoulSignature = async () => {
    if (isDemoMode) {
      setGenerating(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setPersonalityScores(DEMO_PERSONALITY_SCORES);
      setSoulSignature(DEMO_SOUL_ARCHETYPE);
      setFeatures(DEMO_BEHAVIORAL_FEATURES);
      setGenerating(false);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      setGenerating(true);
      setError(null);

      const response = await fetch(`${API_URL}/soul-signature/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force_refresh: true })
      });

      const data = await response.json();

      if (data.success) {
        trackFunnel('soul_signature_generated', {
          platforms_connected: connectedProviders.length,
        });
        await fetchData();
      } else {
        setError(data.error || 'Failed to generate soul signature');
      }
    } catch (err) {
      console.error('Error generating soul signature:', err);
      setError('Failed to generate soul signature');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isDemoMode, connectedProviders.length]);

  if (loading) {
    return (
      <PageLayout maxWidth="xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: colors.textSecondary }} />
            <p style={{ color: colors.textSecondary }}>
              Loading your soul signature...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'deep-dive', label: 'Deep Dive', icon: Brain },
    { id: 'data-sources', label: 'Data Sources', icon: Layers },
  ];

  return (
    <PageLayout maxWidth="xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="text-3xl md:text-4xl mb-2"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              color: colors.textColor
            }}
          >
            Your Soul Signature
          </h1>
          <p style={{ color: colors.textSecondary }}>
            Discover what makes you authentically you
          </p>
        </div>
        <div className="flex items-center gap-2">
          {soulSignature && !isDemoMode && (
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
                style={{
                  backgroundColor: colors.subtleBg,
                  color: colors.textColor,
                  border: colors.cardBorder
                }}
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
          )}

          <button
            onClick={generateSoulSignature}
            disabled={generating}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
            style={{
              backgroundColor: colors.subtleBg,
              color: colors.textColor,
              border: colors.cardBorder
            }}
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            <span className="font-medium">{generating ? 'Generating...' : 'Regenerate'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-6 p-4 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.2)'
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
          <span style={{ color: theme === 'dark' ? '#fca5a5' : '#991b1b' }}>{error}</span>
        </div>
      )}

      {/* Pipeline Status Card */}
      {!isDemoMode && (
        <PipelineStatusCard
          isPipelineRunning={isPipelineRunning}
          currentStage={currentStage}
          hasTwin={hasTwin}
          connectedCount={connectedCount}
          connectedProviders={connectedProviders}
          isForming={isForming}
          formTwin={formTwin}
          formError={formError}
          colors={colors}
        />
      )}

      {/* Assessment Status Card */}
      <div className="mb-6">
        <AssessmentStatusCard
          quickAssessmentComplete={!!personalityScores?.archetype_code}
          mbtiCode={personalityScores?.archetype_code || null}
          bigFiveComplete={!!(personalityScores?.openness && personalityScores.openness > 0)}
          bigFiveScores={personalityScores ? {
            openness: personalityScores.openness,
            conscientiousness: personalityScores.conscientiousness,
            extraversion: personalityScores.extraversion,
            agreeableness: personalityScores.agreeableness,
            neuroticism: personalityScores.neuroticism
          } : null}
          hasBehavioralData={features.length > 0 || !!behavioralEvidence}
          connectedPlatforms={Math.max(
            connectedProviders.length,
            new Set(features.map(f => f.platform)).size,
            personalityScores?.analyzed_platforms?.length || 0
          )}
        />
      </div>

      {/* Sticky Tab Navigation */}
      <div
        className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-0 mb-6"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(35, 35, 32, 0.95)' : 'rgba(250, 250, 249, 0.95)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{
            backgroundColor: colors.subtleBg,
            border: colors.cardBorder,
          }}
        >
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: isActive
                    ? theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(255, 255, 255, 0.9)'
                    : 'transparent',
                  color: isActive ? colors.textColor : colors.textMuted,
                  boxShadow: isActive ? (theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)') : 'none',
                }}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <OverviewTab
          soulSignature={soulSignature}
          personalityScores={personalityScores}
          generating={generating}
          onGenerateSoulSignature={generateSoulSignature}
          colors={colors}
        />
      )}

      {/* DEEP DIVE TAB */}
      {activeTab === 'deep-dive' && (
        <>
          <BigFivePanel
            personalityScores={personalityScores}
            onNavigateToBigFive={() => navigate('/big-five')}
            colors={colors}
          />

          {personalityScores && (personalityScores.mind !== undefined || personalityScores.archetype_code) && (
            <PersonalityTypePanel
              personalityScores={personalityScores}
              soulSignature={soulSignature}
              colors={colors}
            />
          )}

          {/* What Makes You Unique - Full Traits */}
          {soulSignature && (
            <div className="mb-6">
              <SectionHeader title="What Makes You Unique" theme={theme} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {soulSignature.defining_traits.map((trait, index) => {
                  const traitColors = ['#4298B4', '#E4AE3A', '#33A474', '#88619A'];
                  const color = traitColors[index % traitColors.length];

                  return (
                    <div
                      key={index}
                      className="p-4 rounded-xl flex items-center gap-4 transition-all duration-200 hover:scale-[1.01]"
                      style={{
                        backgroundColor: colors.hoverBg,
                        border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        <Sparkles className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium" style={{ color: colors.textColor }}>{trait.trait}</div>
                        <div className="text-sm" style={{ color: colors.textSecondary }}>{trait.evidence}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Behavioral Evidence Panel */}
          {behavioralEvidence && personalityScores &&
           behavioralEvidence.evidence &&
           Object.values(behavioralEvidence.evidence).some((arr: unknown) => Array.isArray(arr) && arr.length > 0) && (
            <div className="mb-6">
              <BehavioralEvidencePanel
                evidence={behavioralEvidence.evidence}
                personality={{
                  openness: personalityScores.openness || 50,
                  conscientiousness: personalityScores.conscientiousness || 50,
                  extraversion: personalityScores.extraversion || 50,
                  agreeableness: personalityScores.agreeableness || 50,
                  neuroticism: personalityScores.neuroticism || 50
                }}
                confidence={behavioralEvidence.confidence}
                dataSources={behavioralEvidence.dataSources}
              />
            </div>
          )}
        </>
      )}

      {/* DATA SOURCES TAB */}
      {activeTab === 'data-sources' && (
        <>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-1 h-5 rounded-full"
                style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
                    : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
                }}
              />
              <Layers className="w-5 h-5" style={{ color: colors.textMuted }} />
              <h3
                className="text-sm uppercase tracking-wider"
                style={{ color: colors.textMuted }}
              >
                Your Data Universe
              </h3>
            </div>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Explore the digital footprints that reveal your soul signature
            </p>

            <div className="space-y-4">
              {Object.entries(PLATFORM_CATEGORIES).map(([id, config]) => (
                <PlatformCategoryCard
                  key={id}
                  categoryId={id}
                  connectedProviders={connectedProviders}
                  onPlatformClick={(p) => navigate(`/insights/${p}`)}
                />
              ))}
            </div>
          </div>

          <div className="mb-6">
            <SectionHeader title="Explore Your Twin Insights" theme={theme} />
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Your digital twin has observations about you based on your connected platforms.
            </p>
            <TwinInsightsGrid
              onNavigate={navigate}
              colors={colors}
            />
          </div>
        </>
      )}
    </PageLayout>
  );
};

export default SoulSignatureDashboard;
