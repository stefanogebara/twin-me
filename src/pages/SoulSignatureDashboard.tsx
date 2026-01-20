import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { useTwinPipeline } from '../hooks/useTwinPipeline';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip';
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
  ChevronRight,
  Sun,
  Compass,
  Target,
  Heart,
  Waves,
  Music,
  Calendar,
  Lightbulb,
  Zap,
  Users,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { BigFiveRadarChart } from '@/components/PersonalityRadarChart';
import BehavioralEvidencePanel from '@/components/BehavioralEvidencePanel';
import AssessmentStatusCard from '@/components/AssessmentStatusCard';

interface PersonalityScores {
  id: string;
  mind?: number;
  energy?: number;
  nature?: number;
  tactics?: number;
  identity?: number;
  mind_ci?: number;
  energy_ci?: number;
  nature_ci?: number;
  tactics_ci?: number;
  identity_ci?: number;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_confidence: number;
  conscientiousness_confidence: number;
  extraversion_confidence: number;
  agreeableness_confidence: number;
  neuroticism_confidence: number;
  archetype_code?: string;
  analyzed_platforms: string[];
  sample_size: number;
}

const MBTI_DIMENSIONS = {
  mind: {
    name: 'Mind',
    lowLabel: 'Introverted',
    highLabel: 'Extraverted',
    lowLetter: 'I',
    highLetter: 'E',
    color: '#8B5CF6',
    description: 'How you interact with the world and where you direct your energy',
    lowDesc: 'Prefer solitary activities, think before speaking, feel drained by social interaction',
    highDesc: 'Prefer group activities, think out loud, feel energized by social interaction'
  },
  energy: {
    name: 'Energy',
    lowLabel: 'Observant',
    highLabel: 'Intuitive',
    lowLetter: 'S',
    highLetter: 'N',
    color: '#F59E0B',
    description: 'How you see the world and process information',
    lowDesc: 'Focus on facts and details, prefer practical solutions, trust experience',
    highDesc: 'Focus on patterns and possibilities, prefer innovative solutions, trust intuition'
  },
  nature: {
    name: 'Nature',
    lowLabel: 'Thinking',
    highLabel: 'Feeling',
    lowLetter: 'T',
    highLetter: 'F',
    color: '#10B981',
    description: 'How you make decisions and cope with emotions',
    lowDesc: 'Prioritize logic and objectivity, focus on truth over tact',
    highDesc: 'Prioritize empathy and harmony, focus on values and feelings'
  },
  tactics: {
    name: 'Tactics',
    lowLabel: 'Prospecting',
    highLabel: 'Judging',
    lowLetter: 'P',
    highLetter: 'J',
    color: '#6366F1',
    description: 'How you approach work and planning',
    lowDesc: 'Prefer flexibility and spontaneity, keep options open, adapt easily',
    highDesc: 'Prefer structure and planning, like closure and completion'
  },
  identity: {
    name: 'Identity',
    lowLabel: 'Turbulent',
    highLabel: 'Assertive',
    lowLetter: 'T',
    highLetter: 'A',
    color: '#EC4899',
    description: 'How confident you are in your abilities and decisions',
    lowDesc: 'Self-conscious, sensitive to stress, perfectionist, success-driven',
    highDesc: 'Self-assured, even-tempered, resistant to stress, confident'
  }
};

interface SoulSignature {
  id: string;
  archetype_name: string;
  archetype_subtitle: string;
  narrative: string;
  defining_traits: Array<{
    trait: string;
    score: number;
    evidence: string;
  }>;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  icon_type: string;
}

interface BehavioralFeature {
  id: string;
  platform: string;
  feature_type: string;
  feature_value: number;
  contributes_to: string;
  confidence_score: number;
}

interface SpotifyPersonality {
  success: boolean;
  bigFive?: {
    openness: { score: number; level: string; description: string };
    conscientiousness: { score: number; level: string; description: string };
    extraversion: { score: number; level: string; description: string };
    agreeableness: { score: number; level: string; description: string };
    neuroticism: { score: number; level: string; description: string };
  };
  archetype?: {
    key: string;
    name: string;
    description: string;
    traits: string[];
    confidence: number;
  };
  topGenres?: {
    current: string[];
    allTime: string[];
    stability: { score: number; label: string };
  };
  listeningPatterns?: {
    peakHours: number[];
    personality: string[];
    weekdayVsWeekend: { weekday: number; weekend: number };
    consistency: { score: number; label: string };
  };
  dataTimestamp?: string;
}

interface EvidenceItem {
  platform: string;
  feature: string;
  value: number;
  raw_value?: Record<string, unknown>;
  correlation: number;
  effect_size: 'small' | 'medium' | 'large';
  description: string;
  citation: string;
}

interface BehavioralEvidence {
  openness: EvidenceItem[];
  conscientiousness: EvidenceItem[];
  extraversion: EvidenceItem[];
  agreeableness: EvidenceItem[];
  neuroticism: EvidenceItem[];
}

interface EvidenceConfidence {
  overall: number;
  by_dimension: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

interface BehavioralEvidenceData {
  evidence: BehavioralEvidence;
  confidence: EvidenceConfidence;
  dataSources?: Record<string, { days: number; events: number }>;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sun: Sun,
  compass: Compass,
  target: Target,
  heart: Heart,
  wave: Waves,
};

const SoulSignatureDashboard: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { connectedProviders, data: platformStatusData } = usePlatformStatus(user?.id);
  const {
    isPipelineRunning,
    currentStage,
    hasTwin,
    platforms,
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

  const API_URL = import.meta.env.VITE_API_URL;

  // Theme-aware colors (matching Dashboard)
  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const textFaint = theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e';
  const cardBg = theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)';
  const cardBorder = theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)';
  const cardShadow = theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.06)';
  const hoverBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)';
  const subtleBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)';

  const activeConnections = connectedProviders.filter(provider => {
    const status = platformStatusData[provider];
    return !status?.tokenExpired && status?.status !== 'token_expired';
  });

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
            primary: '#8B5CF6',
            secondary: '#6366F1',
            accent: '#A78BFA',
            background: '#F5F3FF',
            text: '#1F2937'
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
        } catch (e) {
          console.log('No Spotify personality data available');
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
        } catch (e) {
          console.log('No behavioral evidence data available');
        }
      }
    } catch (err) {
      console.error('Error fetching soul signature data:', err);
      setError('Failed to load soul signature data');
    } finally {
      setLoading(false);
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

  // MBTI dimension bar component
  const MBTIDimensionBar = ({
    dimension,
    value,
    confidence
  }: {
    dimension: keyof typeof MBTI_DIMENSIONS;
    value: number;
    confidence?: number;
  }) => {
    const info = MBTI_DIMENSIONS[dimension];
    const isHigh = value >= 50;
    const percentage = isHigh ? value : 100 - value;
    const letter = isHigh ? info.highLetter : info.lowLetter;

    return (
      <TooltipProvider>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-medium uppercase tracking-wider cursor-help flex items-center gap-1" style={{ color: textMuted }}>
                  {info.name}
                  <HelpCircle className="w-3 h-3 opacity-50" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{info.description}</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ color: info.color }}>
                {letter}
              </span>
              <span className="text-xs" style={{ color: textMuted }}>
                {Math.round(percentage)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs w-20 text-right cursor-help" style={{
                  color: !isHigh ? info.color : textFaint,
                  fontWeight: !isHigh ? 600 : 400
                }}>
                  {info.lowLabel}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-sm font-medium mb-1">{info.lowLabel} ({info.lowLetter})</p>
                <p className="text-xs opacity-80">{info.lowDesc}</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex-1 relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: subtleBg }}>
              <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : 'rgba(0, 0, 0, 0.1)'
              }} />
              <div
                className="absolute h-full rounded-full transition-all duration-500"
                style={{
                  left: value < 50 ? `${value}%` : '50%',
                  width: `${Math.abs(value - 50)}%`,
                  backgroundColor: info.color,
                  opacity: confidence ? 0.4 + (confidence / 100) * 0.6 : 0.8
                }}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs w-20 cursor-help" style={{
                  color: isHigh ? info.color : textFaint,
                  fontWeight: isHigh ? 600 : 400
                }}>
                  {info.highLabel}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-sm font-medium mb-1">{info.highLabel} ({info.highLetter})</p>
                <p className="text-xs opacity-80">{info.highDesc}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    );
  };

  // Section header component (matching Dashboard style)
  const SectionHeader = ({ title }: { title: string }) => (
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
        style={{ color: textMuted }}
      >
        {title}
      </h3>
    </div>
  );

  if (loading) {
    return (
      <PageLayout maxWidth="xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: textSecondary }} />
            <p style={{ color: textSecondary }}>
              Loading your soul signature...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  const IconComponent = soulSignature ? iconMap[soulSignature.icon_type] || Sparkles : Sparkles;

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
              color: textColor
            }}
          >
            Your Soul Signature
          </h1>
          <p style={{ color: textSecondary }}>
            Discover what makes you authentically you
          </p>
        </div>
        <button
          onClick={generateSoulSignature}
          disabled={generating}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
          style={{
            backgroundColor: subtleBg,
            color: textColor,
            border: cardBorder
          }}
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          <span className="font-medium">{generating ? 'Generating...' : 'Regenerate'}</span>
        </button>
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
        <GlassPanel className="!p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: isPipelineRunning
                    ? 'rgba(99, 102, 241, 0.1)'
                    : hasTwin
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(245, 158, 11, 0.1)'
                }}
              >
                {isPipelineRunning ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#6366F1' }} />
                ) : hasTwin ? (
                  <CheckCircle2 className="w-5 h-5" style={{ color: '#10B981' }} />
                ) : (
                  <AlertCircle className="w-5 h-5" style={{ color: '#F59E0B' }} />
                )}
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
                  Twin Formation
                </h3>
                <p className="text-sm" style={{ color: textMuted }}>
                  {isPipelineRunning
                    ? `Stage: ${currentStage || 'Starting...'}`
                    : hasTwin
                      ? 'Your digital twin is ready'
                      : 'Connect platforms to form your twin'}
                </p>
              </div>
            </div>
            {!isPipelineRunning && connectedCount > 0 && (
              <button
                onClick={() => formTwin(false)}
                disabled={isForming}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
                style={{
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                  color: '#6366F1',
                  border: '1px solid rgba(99, 102, 241, 0.2)'
                }}
              >
                <Play className="w-4 h-4" />
                {hasTwin ? 'Refresh Twin' : 'Form Twin'}
              </button>
            )}
          </div>

          {/* Platform Status Grid */}
          {connectedCount > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {['spotify', 'whoop', 'calendar'].map(platform => {
                const platformData = platforms.find(p => p.platform === platform);
                const isConnected = !!platformData;
                const lastSync = platformData?.lastSync;

                const platformColors: Record<string, string> = {
                  spotify: '#1DB954',
                  whoop: '#06B6D4',
                  calendar: '#6366F1'
                };

                return (
                  <div
                    key={platform}
                    className="p-3 rounded-xl transition-all duration-200"
                    style={{
                      backgroundColor: hoverBg,
                      border: isConnected
                        ? `1px solid ${platformColors[platform]}25`
                        : '1px solid transparent'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {platform === 'spotify' && <Music className="w-4 h-4" style={{ color: isConnected ? platformColors.spotify : textFaint }} />}
                      {platform === 'whoop' && <Heart className="w-4 h-4" style={{ color: isConnected ? platformColors.whoop : textFaint }} />}
                      {platform === 'calendar' && <Calendar className="w-4 h-4" style={{ color: isConnected ? platformColors.calendar : textFaint }} />}
                      <span className="text-xs font-medium capitalize" style={{
                        color: isConnected ? textColor : textFaint
                      }}>
                        {platform}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: textFaint }}>
                      {isConnected
                        ? lastSync
                          ? `Synced ${new Date(lastSync).toLocaleDateString()}`
                          : 'Connected'
                        : 'Not connected'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {formError && (
            <div className="mt-4 p-3 rounded-xl text-sm" style={{
              backgroundColor: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.15)',
              color: theme === 'dark' ? '#fca5a5' : '#991b1b'
            }}>
              Pipeline error: {formError.message}
            </div>
          )}
        </GlassPanel>
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
          connectedPlatforms={connectedProviders.length}
        />
      </div>

      {/* Soul Signature Card */}
      {soulSignature ? (
        <div
          className="rounded-2xl md:rounded-3xl overflow-hidden mb-6"
          style={{
            backgroundColor: cardBg,
            border: cardBorder,
            boxShadow: cardShadow
          }}
        >
          <div className="p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-6">
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.2)'
                }}
              >
                <IconComponent className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: '#8B5CF6' }} />
              </div>
              <div>
                <h2
                  className="text-3xl sm:text-4xl mb-2"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 400,
                    color: textColor
                  }}
                >
                  {soulSignature.archetype_name}
                </h2>
                <p className="text-lg italic" style={{ color: '#8B5CF6' }}>
                  {soulSignature.archetype_subtitle}
                </p>
              </div>
            </div>

            {/* Insight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Core Drive */}
              <div className="p-4 rounded-xl" style={{
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.15)'
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }}>
                    <Lightbulb className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#8B5CF6' }}>Core Drive</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                  {soulSignature.defining_traits[0]?.trait || 'Curiosity'} shapes your choices - you seek {soulSignature.defining_traits[0]?.evidence.toLowerCase() || 'new experiences'}
                </p>
              </div>

              {/* Social Style */}
              <div className="p-4 rounded-xl" style={{
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.15)'
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)' }}>
                    <Users className="w-4 h-4" style={{ color: '#6366F1' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#6366F1' }}>Social Style</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                  {personalityScores && personalityScores.extraversion > 60
                    ? 'You thrive in social settings and draw energy from connecting with others'
                    : 'You value deep connections over many, preferring meaningful one-on-one interactions'}
                </p>
              </div>

              {/* Creative Pattern */}
              <div className="p-4 rounded-xl" style={{
                backgroundColor: 'rgba(236, 72, 153, 0.08)',
                border: '1px solid rgba(236, 72, 153, 0.15)'
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(236, 72, 153, 0.15)' }}>
                    <Zap className="w-4 h-4" style={{ color: '#EC4899' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#EC4899' }}>Creative Pattern</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                  {soulSignature.defining_traits[2]?.trait || 'Creative expression'} is key - {soulSignature.defining_traits[2]?.evidence.toLowerCase() || 'you explore diverse artistic interests'}
                </p>
              </div>
            </div>

            {/* MBTI Type Display */}
            {personalityScores && (personalityScores.mind !== undefined || personalityScores.archetype_code) && (
              <div className="mt-6">
                <SectionHeader title="Your Personality Type" />

                {/* Type Code */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6 p-4 rounded-xl" style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.15)'
                }}>
                  <div className="flex items-center gap-1">
                    {(personalityScores.archetype_code || 'XXXX-X').split('').map((letter, i) => {
                      if (letter === '-') return <span key={i} className="text-2xl font-light" style={{ color: textFaint }}>-</span>;
                      const colors = [
                        MBTI_DIMENSIONS.mind.color,
                        MBTI_DIMENSIONS.energy.color,
                        MBTI_DIMENSIONS.nature.color,
                        MBTI_DIMENSIONS.tactics.color,
                        MBTI_DIMENSIONS.identity.color
                      ];
                      const colorIndex = i > 4 ? 4 : i;
                      return (
                        <span key={i} className="text-3xl font-bold" style={{ color: colors[colorIndex] }}>
                          {letter}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: textColor }}>
                      {soulSignature?.archetype_name || 'Your Unique Type'}
                    </div>
                    <div className="text-xs" style={{ color: textMuted }}>
                      Based on your assessment and behavioral patterns
                    </div>
                  </div>
                </div>

                {/* Dimension Bars */}
                <div className="space-y-4">
                  <MBTIDimensionBar dimension="mind" value={personalityScores.mind ?? personalityScores.extraversion ?? 50} confidence={personalityScores.mind_ci ?? personalityScores.extraversion_confidence} />
                  <MBTIDimensionBar dimension="energy" value={personalityScores.energy ?? personalityScores.openness ?? 50} confidence={personalityScores.energy_ci ?? personalityScores.openness_confidence} />
                  <MBTIDimensionBar dimension="nature" value={personalityScores.nature ?? personalityScores.agreeableness ?? 50} confidence={personalityScores.nature_ci ?? personalityScores.agreeableness_confidence} />
                  <MBTIDimensionBar dimension="tactics" value={personalityScores.tactics ?? personalityScores.conscientiousness ?? 50} confidence={personalityScores.tactics_ci ?? personalityScores.conscientiousness_confidence} />
                  <MBTIDimensionBar dimension="identity" value={personalityScores.identity ?? (100 - (personalityScores.neuroticism ?? 50))} confidence={personalityScores.identity_ci ?? personalityScores.neuroticism_confidence} />
                </div>
              </div>
            )}

            {/* Defining Traits */}
            <div className="mt-6">
              <SectionHeader title="What Makes You Unique" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {soulSignature.defining_traits.map((trait, index) => {
                  const traitColors = ['#8B5CF6', '#6366F1', '#EC4899', '#10B981'];
                  const color = traitColors[index % traitColors.length];

                  return (
                    <div
                      key={index}
                      className="p-4 rounded-xl flex items-center gap-4 transition-all duration-200 hover:scale-[1.01]"
                      style={{
                        backgroundColor: hoverBg,
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
                        <div className="font-medium" style={{ color: textColor }}>{trait.trait}</div>
                        <div className="text-sm" style={{ color: textSecondary }}>{trait.evidence}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <GlassPanel className="mb-6 text-center py-12">
          <Sparkles className="w-16 h-16 mx-auto mb-4" style={{ color: textFaint }} />
          <h3
            className="text-xl mb-2"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}
          >
            No Soul Signature Yet
          </h3>
          <p className="mb-6" style={{ color: textSecondary }}>
            Connect your platforms and generate your unique soul signature
          </p>
          <button
            onClick={generateSoulSignature}
            disabled={generating}
            className="px-6 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
            style={{ backgroundColor: '#8B5CF6', color: '#ffffff' }}
          >
            {generating ? 'Generating...' : 'Generate Soul Signature'}
          </button>
        </GlassPanel>
      )}

      {/* Big Five Scientific Assessment */}
      <GlassPanel className="!p-5 md:!p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
              <Target className="w-5 h-5" style={{ color: '#8B5CF6' }} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
                Big Five Personality Profile
              </h3>
              <p className="text-xs" style={{ color: textMuted }}>
                Scientific IPIP-NEO-120 assessment
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/big-five')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              color: '#8B5CF6',
              border: '1px solid rgba(139, 92, 246, 0.2)'
            }}
          >
            Take Assessment
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm mb-6" style={{ color: textSecondary }}>
          The scientifically validated IPIP-NEO-120 assessment measures five core personality dimensions with T-score normalization against 619,000+ respondents.
        </p>

        {personalityScores ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Radar Chart */}
            <div className="flex justify-center">
              <BigFiveRadarChart
                openness={personalityScores.openness || 50}
                conscientiousness={personalityScores.conscientiousness || 50}
                extraversion={personalityScores.extraversion || 50}
                agreeableness={personalityScores.agreeableness || 50}
                neuroticism={personalityScores.neuroticism || 50}
                size={280}
                showValues={true}
                animated={true}
              />
            </div>

            {/* Score Details */}
            <div className="space-y-4">
              {[
                { name: 'Openness', value: personalityScores.openness, color: '#8b5cf6', desc: 'Creativity & intellectual curiosity' },
                { name: 'Conscientiousness', value: personalityScores.conscientiousness, color: '#22c55e', desc: 'Organization & dependability' },
                { name: 'Extraversion', value: personalityScores.extraversion, color: '#f59e0b', desc: 'Sociability & positive emotions' },
                { name: 'Agreeableness', value: personalityScores.agreeableness, color: '#06b6d4', desc: 'Cooperation & trust' },
                { name: 'Neuroticism', value: personalityScores.neuroticism, color: '#ef4444', desc: 'Emotional sensitivity' },
              ].map((trait) => (
                <div key={trait.name} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: trait.color }} />
                      <span className="text-sm font-medium" style={{ color: textColor }}>{trait.name}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: trait.color }}>{Math.round(trait.value || 50)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: subtleBg }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${trait.value || 50}%`, backgroundColor: trait.color, opacity: 0.7 }}
                    />
                  </div>
                  <p className="text-xs" style={{ color: textFaint }}>{trait.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Target className="w-12 h-12 mx-auto mb-4" style={{ color: textFaint }} />
            <p className="mb-4" style={{ color: textMuted }}>
              Complete the assessment to see your Big Five personality profile
            </p>
            <button
              onClick={() => navigate('/big-five')}
              className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#8b5cf6', color: '#fff' }}
            >
              Start Big Five Assessment
            </button>
          </div>
        )}
      </GlassPanel>

      {/* Behavioral Evidence Panel */}
      {behavioralEvidence && personalityScores && (
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

      {/* Twin Insights Links */}
      <div className="mb-6">
        <SectionHeader title="Explore Your Twin Insights" />
        <p className="text-sm mb-4" style={{ color: textSecondary }}>
          Your digital twin has observations about you based on your connected platforms.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassPanel
            hover
            className="cursor-pointer !p-4"
            onClick={() => navigate('/insights/spotify')}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(29, 185, 84, 0.1)' }}
              >
                <Music className="w-5 h-5" style={{ color: '#1DB954' }} />
              </div>
              <div>
                <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
                  Your Musical Soul
                </h4>
                <p className="text-xs" style={{ color: textMuted }}>
                  What your listening reveals
                </p>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel
            hover
            className="cursor-pointer !p-4"
            onClick={() => navigate('/insights/whoop')}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)' }}
              >
                <Heart className="w-5 h-5" style={{ color: '#06B6D4' }} />
              </div>
              <div>
                <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
                  Body Stories
                </h4>
                <p className="text-xs" style={{ color: textMuted }}>
                  What your body tells you
                </p>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel
            hover
            className="cursor-pointer !p-4"
            onClick={() => navigate('/insights/calendar')}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}
              >
                <Calendar className="w-5 h-5" style={{ color: '#6366F1' }} />
              </div>
              <div>
                <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
                  Time Patterns
                </h4>
                <p className="text-xs" style={{ color: textMuted }}>
                  How you structure your days
                </p>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </PageLayout>
  );
};

export default SoulSignatureDashboard;
