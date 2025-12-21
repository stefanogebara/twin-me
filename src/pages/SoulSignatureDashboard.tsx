import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
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
  Settings
} from 'lucide-react';

interface PersonalityScores {
  id: string;
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
  analyzed_platforms: string[];
  sample_size: number;
}

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

// Demo data for demo mode - MVP platforms: Spotify, Google Calendar, Whoop
const DEMO_PERSONALITY_SCORES: PersonalityScores = {
  id: 'demo-scores',
  openness: 78,
  conscientiousness: 65,
  extraversion: 82,
  agreeableness: 71,
  neuroticism: 35,
  openness_confidence: 85,
  conscientiousness_confidence: 72,
  extraversion_confidence: 90,
  agreeableness_confidence: 68,
  neuroticism_confidence: 75,
  analyzed_platforms: ['spotify', 'google_calendar', 'whoop'],
  sample_size: 47
};

const DEMO_SOUL_SIGNATURE: SoulSignature = {
  id: 'demo-signature',
  archetype_name: 'The Creative Explorer',
  archetype_subtitle: 'Curious mind with a passion for discovery',
  narrative: 'You are driven by an insatiable curiosity and a desire to understand the world around you. Your eclectic taste in music and content reveals a mind that thrives on variety and novelty. You connect deeply with others while maintaining your unique perspective, making you both relatable and distinctively original.',
  defining_traits: [
    { trait: 'Intellectual Curiosity', score: 92, evidence: 'Diverse music genres in Spotify history' },
    { trait: 'Work-Life Balance', score: 78, evidence: 'Healthy mix of meetings and focus time' },
    { trait: 'Health Conscious', score: 85, evidence: 'Consistent recovery tracking on Whoop' },
    { trait: 'Emotional Depth', score: 74, evidence: 'Music choices reflect mood awareness' }
  ],
  color_scheme: {
    primary: '#8B5CF6',
    secondary: '#6366F1',
    accent: '#A78BFA',
    background: '#F5F3FF',
    text: '#1F2937'
  },
  icon_type: 'compass'
};

const DEMO_FEATURES: BehavioralFeature[] = [
  { id: 'f1', platform: 'spotify', feature_type: 'music_diversity', feature_value: 85, contributes_to: 'openness', confidence_score: 90 },
  { id: 'f2', platform: 'google_calendar', feature_type: 'focus_time_ratio', feature_value: 67, contributes_to: 'conscientiousness', confidence_score: 78 },
  { id: 'f3', platform: 'whoop', feature_type: 'recovery_consistency', feature_value: 72, contributes_to: 'neuroticism', confidence_score: 82 },
  { id: 'f4', platform: 'google_calendar', feature_type: 'social_events_ratio', feature_value: 68, contributes_to: 'extraversion', confidence_score: 85 }
];

const SoulSignatureDashboard: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const { theme } = useTheme();
  const { connectedProviders, data: platformStatusData } = usePlatformStatus(user?.id);
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
      setSoulSignature(DEMO_SOUL_SIGNATURE);
      setFeatures(DEMO_FEATURES);
      // Demo Spotify personality data
      setSpotifyPersonality({
        success: true,
        bigFive: {
          openness: { score: 78, level: 'high', description: 'Curious and adventurous - you explore diverse genres and new artists' },
          conscientiousness: { score: 65, level: 'moderate', description: 'Flexible approach to music organization' },
          extraversion: { score: 72, level: 'high', description: 'High-energy preferences - upbeat tracks fuel your day' },
          agreeableness: { score: 45, level: 'moderate', description: 'Mix of personal and shared playlists' },
          neuroticism: { score: 35, level: 'low', description: 'Emotionally stable - consistent mood in choices' }
        },
        archetype: {
          key: 'eclectic-explorer',
          name: 'Eclectic Explorer',
          description: 'You traverse the entire musical landscape, never settling in one genre',
          traits: ['Open-minded', 'Curious', 'Adventurous'],
          confidence: 82
        },
        topGenres: {
          current: ['indie pop', 'electronic', 'hip hop', 'lo-fi', 'alternative'],
          allTime: ['pop', 'rock', 'electronic', 'indie', 'hip hop'],
          stability: { score: 0.65, label: 'moderately-stable' }
        },
        listeningPatterns: {
          peakHours: [21, 22, 20, 19],
          personality: ['evening-focused', 'weekend-enthusiast'],
          weekdayVsWeekend: { weekday: 65, weekend: 35 },
          consistency: { score: 0.55, label: 'moderately-consistent' }
        },
        dataTimestamp: new Date().toISOString()
      });
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
      setSoulSignature(DEMO_SOUL_SIGNATURE);
      setFeatures(DEMO_FEATURES);
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
