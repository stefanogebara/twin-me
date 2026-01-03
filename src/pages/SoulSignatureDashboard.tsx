import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { useTwinPipeline } from '../hooks/useTwinPipeline';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip';
import {
  DEMO_PERSONALITY_SCORES,
  DEMO_SOUL_ARCHETYPE,
  DEMO_BEHAVIORAL_FEATURES,
  DEMO_SPOTIFY_PERSONALITY
} from '../services/demoDataService';
import {
  Sparkles,
  Brain,
  Shield,
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
  TrendingUp,
  Zap,
  Users,
  Clock,
  Eye,
  Settings,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  HelpCircle
} from 'lucide-react';

interface PersonalityScores {
  id: string;
  // New MBTI dimensions (16personalities-style)
  mind?: number;           // I/E: 0=Introversion, 100=Extraversion
  energy?: number;         // S/N: 0=Sensing, 100=Intuition
  nature?: number;         // T/F: 0=Thinking, 100=Feeling
  tactics?: number;        // J/P: 0=Perceiving, 100=Judging
  identity?: number;       // A/T: 0=Turbulent, 100=Assertive
  mind_ci?: number;
  energy_ci?: number;
  nature_ci?: number;
  tactics_ci?: number;
  identity_ci?: number;
  // Legacy Big Five dimensions (for backward compatibility)
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
  // Archetype info
  archetype_code?: string;  // e.g., "INTJ-A"
  analyzed_platforms: string[];
  sample_size: number;
}

// MBTI dimension display info with explanations
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

// Spotify-derived personality insights
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

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sun: Sun,
  compass: Compass,
  target: Target,
  heart: Heart,
  wave: Waves,
};

// Demo data imported from centralized demoDataService.ts
// DEMO_PERSONALITY_SCORES, DEMO_SOUL_ARCHETYPE, DEMO_BEHAVIORAL_FEATURES, DEMO_SPOTIFY_PERSONALITY

const SoulSignatureDashboard: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const { theme } = useTheme();
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
  const [error, setError] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL;

  // Get active platforms (excluding expired tokens)
  const activeConnections = connectedProviders.filter(provider => {
    const status = platformStatusData[provider];
    return !status?.tokenExpired && status?.status !== 'token_expired';
  });

  const fetchData = async () => {
    // In demo mode, use mock data but with actual connected platforms
    if (isDemoMode) {
      // Use actual connected platforms if available, otherwise demo defaults
      const platformsToUse = connectedProviders.length > 0 ? connectedProviders : DEMO_PERSONALITY_SCORES.analyzed_platforms;
      setPersonalityScores({
        ...DEMO_PERSONALITY_SCORES,
        analyzed_platforms: platformsToUse,
        sample_size: platformsToUse.length * 15 + 2
      });
      setSoulSignature(DEMO_SOUL_ARCHETYPE);
      setFeatures(DEMO_BEHAVIORAL_FEATURES);
      // Demo Spotify personality data from centralized service
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

      // Fetch all data in parallel (including Spotify personality)
      const [scoresRes, signatureRes, featuresRes, spotifyRes] = await Promise.all([
        fetch(`${API_URL}/soul-signature/personality-scores`, { headers }),
        fetch(`${API_URL}/soul-signature/archetype`, { headers }),
        fetch(`${API_URL}/soul-signature/features`, { headers }),
        fetch(`${API_URL}/soul-insights/${user?.id}/spotify-personality`, { headers }).catch(() => null)
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
        setSoulSignature(signatureData.data);
      }
      if (featuresData.success && featuresData.data) {
        setFeatures(featuresData.data);
      }

      // Handle Spotify personality data
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
    } catch (err) {
      console.error('Error fetching soul signature data:', err);
      setError('Failed to load soul signature data');
    } finally {
      setLoading(false);
    }
  };

  const generateSoulSignature = async () => {
    // In demo mode, just simulate generation
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
        // Refresh all data
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

  const PersonalityBar = ({
    label,
    value,
    confidence,
    color
  }: {
    label: string;
    value: number;
    confidence: number;
    color: string;
  }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
          {label}
        </span>
        <span className="text-sm font-bold" style={{ color }}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
      }}>
        <div
          className="absolute h-full rounded-full transition-all duration-500"
          style={{
            width: `${value}%`,
            backgroundColor: color,
            opacity: 0.3 + (confidence / 100) * 0.7
          }}
        />
      </div>
      {confidence > 0 && (
        <div className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
          {confidence}% confidence
        </div>
      )}
    </div>
  );

  // MBTI dimension bar - shows polarity between two traits (e.g., I vs E)
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
    const label = isHigh ? info.highLabel : info.lowLabel;

    return (
      <TooltipProvider>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-medium uppercase tracking-wider cursor-help flex items-center gap-1" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e'
                }}>
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
              <span className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
                {Math.round(percentage)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Low pole label */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs w-20 text-right cursor-help" style={{
                  color: !isHigh ? info.color : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d4d4d4'),
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
            {/* Bar */}
            <div className="flex-1 relative h-2 rounded-full overflow-hidden" style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
            }}>
              {/* Center marker */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : 'rgba(0, 0, 0, 0.1)'
              }} />
              {/* Value indicator */}
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
            {/* High pole label */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs w-20 cursor-help" style={{
                  color: isHigh ? info.color : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d4d4d4'),
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

  const FeatureCard = ({ feature }: { feature: BehavioralFeature }) => {
    const platformIcons: Record<string, React.ReactNode> = {
      spotify: <Music className="w-4 h-4" />,
      calendar: <Calendar className="w-4 h-4" />
    };

    return (
      <div
        className="p-4 rounded-xl"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
          border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
            {platformIcons[feature.platform] || <Sparkles className="w-4 h-4" />}
          </span>
          <span className="text-xs uppercase tracking-wider" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
            {feature.platform}
          </span>
        </div>
        <div className="text-sm font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
          {feature.feature_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            {Math.round(feature.feature_value)}%
          </span>
          <span className="text-xs px-2 py-1 rounded-full" style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
          }}>
            → {feature.contributes_to}
          </span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }} />
          <p style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Loading your soul signature...
          </p>
        </div>
      </div>
    );
  }

  const IconComponent = soulSignature ? iconMap[soulSignature.icon_type] || Sparkles : Sparkles;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-normal tracking-tight font-garamond" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            Your Soul Signature
          </h1>
          <p className="mt-1" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Discover what makes you authentically you
          </p>
        </div>
        <button
          onClick={generateSoulSignature}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-50"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)'
          }}
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Regenerate'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl" style={{
          backgroundColor: theme === 'dark' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(255, 235, 235, 0.5)',
          border: '1px solid rgba(220, 38, 38, 0.2)',
          color: theme === 'dark' ? '#fca5a5' : '#991b1b'
        }}>
          {error}
        </div>
      )}

      {/* Pipeline Status Card */}
      {!isDemoMode && (
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
          }}
        >
          <div className="flex items-center justify-between mb-4">
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
                <h3 className="font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  Twin Formation
                </h3>
                <p className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
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
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-50"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                  color: '#6366F1',
                  border: theme === 'dark' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(99, 102, 241, 0.2)'
                }}
              >
                <Play className="w-4 h-4" />
                {hasTwin ? 'Refresh Twin' : 'Form Twin'}
              </button>
            )}
          </div>

          {/* Platform Status */}
          {connectedCount > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {['spotify', 'whoop', 'calendar'].map(platform => {
                const platformData = platforms.find(p => p.platform === platform);
                const isConnected = !!platformData;
                const lastSync = platformData?.lastSync;

                return (
                  <div
                    key={platform}
                    className="p-3 rounded-xl"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                      border: isConnected
                        ? theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(16, 185, 129, 0.15)'
                        : theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {platform === 'spotify' && <Music className="w-4 h-4" style={{ color: isConnected ? '#1DB954' : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d4d4d4') }} />}
                      {platform === 'whoop' && <Heart className="w-4 h-4" style={{ color: isConnected ? '#06B6D4' : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d4d4d4') }} />}
                      {platform === 'calendar' && <Calendar className="w-4 h-4" style={{ color: isConnected ? '#6366F1' : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d4d4d4') }} />}
                      <span className="text-xs font-medium capitalize" style={{
                        color: isConnected ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09') : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d4d4d4')
                      }}>
                        {platform}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
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
              backgroundColor: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              color: theme === 'dark' ? '#fca5a5' : '#991b1b'
            }}>
              Pipeline error: {formError.message}
            </div>
          )}
        </div>
      )}

      {/* Soul Signature Card */}
      {soulSignature ? (
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: theme === 'dark'
              ? `linear-gradient(135deg, rgba(45, 45, 41, 0.8), rgba(45, 45, 41, 0.5))`
              : `linear-gradient(135deg, ${soulSignature.color_scheme.background}, white)`,
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : `1px solid ${soulSignature.color_scheme.primary}20`,
            boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div className="p-8">
            <div className="flex items-start gap-6">
              {/* Icon */}
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: theme === 'dark'
                    ? 'rgba(193, 192, 182, 0.1)'
                    : `linear-gradient(135deg, ${soulSignature.color_scheme.primary}30, ${soulSignature.color_scheme.secondary}20)`,
                  border: theme === 'dark'
                    ? '1px solid rgba(193, 192, 182, 0.2)'
                    : `1px solid ${soulSignature.color_scheme.primary}40`
                }}
              >
                <IconComponent
                  className="w-10 h-10"
                  style={{ color: theme === 'dark' ? '#C1C0B6' : soulSignature.color_scheme.primary }}
                />
              </div>

              {/* Title & Subtitle */}
              <div className="flex-1">
                <h2
                  className="text-4xl font-normal tracking-tight font-garamond mb-2"
                  style={{ color: theme === 'dark' ? '#C1C0B6' : soulSignature.color_scheme.text }}
                >
                  {soulSignature.archetype_name}
                </h2>
                <p
                  className="text-lg italic"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : soulSignature.color_scheme.primary }}
                >
                  {soulSignature.archetype_subtitle}
                </p>
              </div>
            </div>


            {/* Visual Insight Cards */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Core Drive Card */}
              <div className="p-4 rounded-xl" style={{
                backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)',
                border: theme === 'dark' ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid rgba(139, 92, 246, 0.15)'
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)'
                  }}>
                    <Lightbulb className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#8B5CF6' }}>
                    Core Drive
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                  {soulSignature.defining_traits[0]?.trait || 'Curiosity'} shapes your choices - you seek {soulSignature.defining_traits[0]?.evidence.toLowerCase() || 'new experiences'}
                </p>
              </div>

              {/* Social Style Card */}
              <div className="p-4 rounded-xl" style={{
                backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
                border: theme === 'dark' ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(99, 102, 241, 0.15)'
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'
                  }}>
                    <Users className="w-4 h-4" style={{ color: '#6366F1' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#6366F1' }}>
                    Social Style
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                  {personalityScores && personalityScores.extraversion > 60
                    ? 'You thrive in social settings and draw energy from connecting with others'
                    : 'You value deep connections over many, preferring meaningful one-on-one interactions'}
                </p>
              </div>

              {/* Creative Pattern Card */}
              <div className="p-4 rounded-xl" style={{
                backgroundColor: theme === 'dark' ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)',
                border: theme === 'dark' ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid rgba(236, 72, 153, 0.15)'
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(236, 72, 153, 0.1)'
                  }}>
                    <Zap className="w-4 h-4" style={{ color: '#EC4899' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#EC4899' }}>
                    Creative Pattern
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                  {soulSignature.defining_traits[2]?.trait || 'Creative expression'} is key - {soulSignature.defining_traits[2]?.evidence.toLowerCase() || 'you explore diverse artistic interests'}
                </p>
              </div>
            </div>

            {/* MBTI Type Display */}
            {personalityScores && (personalityScores.mind !== undefined || personalityScores.archetype_code) && (
              <div className="mt-6">
                <h3 className="text-sm font-medium uppercase tracking-wider mb-4" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                }}>
                  Your Personality Type
                </h3>

                {/* Type Code Display */}
                <div className="flex items-center gap-4 mb-6 p-4 rounded-xl" style={{
                  backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)',
                  border: theme === 'dark' ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid rgba(139, 92, 246, 0.15)'
                }}>
                  <div className="flex items-center gap-1">
                    {(personalityScores.archetype_code || 'XXXX-X').split('').map((letter, i) => {
                      if (letter === '-') return <span key={i} className="text-2xl font-light" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : '#d4d4d4' }}>-</span>;
                      const colors = [
                        MBTI_DIMENSIONS.mind.color,
                        MBTI_DIMENSIONS.energy.color,
                        MBTI_DIMENSIONS.nature.color,
                        MBTI_DIMENSIONS.tactics.color,
                        MBTI_DIMENSIONS.identity.color
                      ];
                      const colorIndex = i > 4 ? 4 : i;
                      return (
                        <span
                          key={i}
                          className="text-3xl font-bold"
                          style={{ color: colors[colorIndex] }}
                        >
                          {letter}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                      {soulSignature?.archetype_name || 'Your Unique Type'}
                    </div>
                    <div className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
                      Based on your questionnaire and behavioral patterns
                    </div>
                  </div>
                </div>

                {/* Dimension Bars */}
                <div className="space-y-4">
                  <MBTIDimensionBar
                    dimension="mind"
                    value={personalityScores.mind ?? personalityScores.extraversion ?? 50}
                    confidence={personalityScores.mind_ci ?? personalityScores.extraversion_confidence}
                  />
                  <MBTIDimensionBar
                    dimension="energy"
                    value={personalityScores.energy ?? personalityScores.openness ?? 50}
                    confidence={personalityScores.energy_ci ?? personalityScores.openness_confidence}
                  />
                  <MBTIDimensionBar
                    dimension="nature"
                    value={personalityScores.nature ?? personalityScores.agreeableness ?? 50}
                    confidence={personalityScores.nature_ci ?? personalityScores.agreeableness_confidence}
                  />
                  <MBTIDimensionBar
                    dimension="tactics"
                    value={personalityScores.tactics ?? personalityScores.conscientiousness ?? 50}
                    confidence={personalityScores.tactics_ci ?? personalityScores.conscientiousness_confidence}
                  />
                  <MBTIDimensionBar
                    dimension="identity"
                    value={personalityScores.identity ?? (100 - (personalityScores.neuroticism ?? 50))}
                    confidence={personalityScores.identity_ci ?? personalityScores.neuroticism_confidence}
                  />
                </div>
              </div>
            )}

            {/* Defining Traits - No percentages */}
            <div className="mt-6">
              <h3 className="text-sm font-medium uppercase tracking-wider mb-4" style={{
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
              }}>
                What Makes You Unique
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {soulSignature.defining_traits.map((trait, index) => {
                  const traitColors = ['#8B5CF6', '#6366F1', '#EC4899', '#10B981'];
                  const color = traitColors[index % traitColors.length];

                  return (
                    <div
                      key={index}
                      className="p-4 rounded-xl flex items-center gap-4 group hover:scale-[1.02] transition-transform"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
                      }}
                    >
                      {/* Icon instead of progress ring */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <Sparkles className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                          {trait.trait}
                        </div>
                        <div className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e' }}>
                          {trait.evidence}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-3xl p-12 text-center"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
          }}
        >
          <Sparkles className="w-16 h-16 mx-auto mb-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : '#d4d4d4' }} />
          <h3 className="text-xl font-medium mb-2" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            No Soul Signature Yet
          </h3>
          <p className="mb-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e' }}>
            Connect your platforms and generate your unique soul signature
          </p>
          <button
            onClick={generateSoulSignature}
            disabled={generating}
            className="px-6 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
            style={{
              backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
              color: theme === 'dark' ? '#232320' : '#ffffff'
            }}
          >
            {generating ? 'Generating...' : 'Generate Soul Signature'}
          </button>
        </div>
      )}


      {/* Link to Insight Pages */}
      <div
        className="rounded-2xl p-6"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
          border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
        }}
      >
        <div className="flex items-center gap-2 mb-6">
          <Eye className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }} />
          <h3 className="text-lg font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            Explore Your Twin Insights
          </h3>
        </div>

        <p className="text-sm mb-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}>
          Your digital twin has observations about you based on your connected platforms. Explore what it has noticed.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => window.location.href = '/insights/spotify'}
            className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(29, 185, 84, 0.1)' : 'rgba(29, 185, 84, 0.05)',
              border: theme === 'dark' ? '1px solid rgba(29, 185, 84, 0.2)' : '1px solid rgba(29, 185, 84, 0.15)'
            }}
          >
            <Music className="w-5 h-5 mb-2" style={{ color: '#1DB954' }} />
            <h4 className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
              Your Musical Soul
            </h4>
            <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
              What your listening reveals
            </p>
          </button>

          <button
            onClick={() => window.location.href = '/insights/whoop'}
            className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(6, 182, 212, 0.1)' : 'rgba(6, 182, 212, 0.05)',
              border: theme === 'dark' ? '1px solid rgba(6, 182, 212, 0.2)' : '1px solid rgba(6, 182, 212, 0.15)'
            }}
          >
            <Heart className="w-5 h-5 mb-2" style={{ color: '#06B6D4' }} />
            <h4 className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
              Body Stories
            </h4>
            <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
              What your body tells you
            </p>
          </button>

          <button
            onClick={() => window.location.href = '/insights/calendar'}
            className="p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
              border: theme === 'dark' ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(99, 102, 241, 0.15)'
            }}
          >
            <Calendar className="w-5 h-5 mb-2" style={{ color: '#6366F1' }} />
            <h4 className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
              Time Patterns
            </h4>
            <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
              How you structure your days
            </p>
          </button>
        </div>
      </div>

    </div>
  );
};

export default SoulSignatureDashboard;
