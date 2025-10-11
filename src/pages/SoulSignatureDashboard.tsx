import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Sparkles, Music, Film, Gamepad2, Heart, Brain, Globe,
  ChevronRight, Play, Pause, Lock, Unlock, Fingerprint,
  User, Briefcase, Palette, Calendar, Mail, MessageSquare,
  Instagram, Twitter, Github, Linkedin, Youtube, Users, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PrivacySpectrumDashboard from '@/components/PrivacySpectrumDashboard';
import { SoulDataExtractor } from '@/components/SoulDataExtractor';

interface ConnectionStatus {
  spotify: boolean;
  netflix: boolean;
  youtube: boolean;
  steam: boolean;
  gmail: boolean;
  calendar: boolean;
  teams: boolean;
  slack: boolean;
  discord: boolean;
}

const SoulSignatureDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const [activeCluster, setActiveCluster] = useState<string>('personal');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [connections, setConnections] = useState<ConnectionStatus>({
    spotify: false,
    netflix: false,
    youtube: false,
    steam: false,
    gmail: true,
    calendar: true,
    teams: false,
    slack: false,
    discord: false
  });
  const [extractedInsights, setExtractedInsights] = useState<{
    personal: string[] | null;
    professional: string[] | null;
  }>({
    personal: null,
    professional: null
  });
  const [hasExtractedData, setHasExtractedData] = useState(false);
  const [hasConnectedServices, setHasConnectedServices] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [extensionAuthenticated, setExtensionAuthenticated] = useState(false);
  const [uniquenessScore, setUniquenessScore] = useState<number>(0);

  // Calculate uniqueness score from style profile
  const calculateUniquenessScore = (profile: any): number => {
    if (!profile) return 0;

    let score = 0;
    let components = 0;

    // 1. Vocabulary richness (0-30 points)
    if (profile.vocabulary_richness !== undefined) {
      score += Math.min(profile.vocabulary_richness * 100 * 0.3, 30);
      components++;
    }

    // 2. Personality trait variance from baseline 0.5 (0-25 points)
    if (profile.personality_traits) {
      const traits = profile.personality_traits;
      const traitValues = [
        traits.openness,
        traits.conscientiousness,
        traits.extraversion,
        traits.agreeableness,
        traits.neuroticism
      ].filter(v => v !== undefined);

      if (traitValues.length > 0) {
        // Calculate average distance from baseline (0.5 = average person)
        const avgDeviation = traitValues.reduce((sum, val) => sum + Math.abs(val - 0.5), 0) / traitValues.length;
        score += Math.min(avgDeviation * 100, 25);
        components++;
      }
    }

    // 3. Communication style uniqueness (0-20 points)
    if (profile.communication_style) {
      // Non-"balanced" styles are more unique
      if (profile.communication_style !== 'balanced') {
        score += 15;
      } else {
        score += 5;
      }
      components++;
    }

    // 4. Writing complexity (0-15 points)
    if (profile.sentence_complexity !== undefined) {
      score += Math.min(profile.sentence_complexity * 100 * 0.15, 15);
      components++;
    }

    // 5. Confidence bonus (0-10 points)
    if (profile.confidence_score !== undefined && profile.confidence_score > 0.7) {
      score += Math.min((profile.confidence_score - 0.7) * 100 / 3, 10);
      components++;
    }

    // Normalize to 0-100 range
    if (components === 0) return 0;
    return Math.min(Math.round(score), 100);
  };

  // Authentication check
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
      return;
    }
  }, [isSignedIn, navigate]);

  // Detect and authenticate browser extension
  useEffect(() => {
    const detectAndAuthExtension = async () => {
      if (!user?.id) return;

      const EXTENSION_ID = 'lgackjdjfgjciljchpcgidahjjimhmdh'; // Your extension ID

      try {
        // Try to ping the extension
        // @ts-expect-error - chrome runtime API not typed
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          // @ts-expect-error - chrome.runtime types not available
          chrome.runtime.sendMessage(
            EXTENSION_ID,
            { type: 'PING' },
            (response: any) => {
              if (chrome.runtime.lastError) {
                console.log('🔌 Extension not detected:', chrome.runtime.lastError.message);
                setExtensionInstalled(false);
                return;
              }

              if (response && response.installed) {
                console.log('✅ Extension detected:', response);
                setExtensionInstalled(true);

                // If not authenticated, send auth credentials
                if (!response.isAuthenticated) {
                  console.log('🔐 Authenticating extension...');

                  // Get auth token from localStorage (or wherever you store it)
                  const authToken = localStorage.getItem('authToken');

                  // @ts-expect-error - chrome.runtime types not available
                  chrome.runtime.sendMessage(
                    EXTENSION_ID,
                    {
                      type: 'AUTHENTICATE',
                      userId: user.id,
                      authToken: authToken
                    },
                    (authResponse: any) => {
                      if (authResponse && authResponse.success) {
                        console.log('✅ Extension authenticated successfully');
                        setExtensionAuthenticated(true);
                      }
                    }
                  );
                } else {
                  console.log('✅ Extension already authenticated');
                  setExtensionAuthenticated(true);
                }
              }
            }
          );
        }
      } catch (error) {
        console.log('🔌 Extension communication failed:', error);
        setExtensionInstalled(false);
      }
    };

    detectAndAuthExtension();
  }, [user]);

  // Fetch connection status from API and localStorage
  useEffect(() => {
    const fetchConnectionStatus = async () => {
      try {
        if (!user?.id) return;

        // Fetch from API
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/connectors/status/${user.id}`);

        if (response.ok) {
          const result = await response.json();
          console.log('📱 Fetched connection status from API:', result);

          // Backend returns { success: true, data: { platform: {...}, ... } }
          const platformData = result.data || {};
          const newConnections: ConnectionStatus = {...connections};

          // Update connection status based on API response
          Object.keys(platformData).forEach((platform: string) => {
            const connDetails = platformData[platform];
            if (connDetails.connected && platform in newConnections) {
              newConnections[platform as keyof ConnectionStatus] = true;
            }
          });

          setConnections(newConnections);

          // Check if any services are connected
          const hasAnyConnections = Object.values(newConnections).some(status => status);
          setHasConnectedServices(hasAnyConnections);

          // Sync with localStorage for consistency
          const connectedPlatforms = Object.keys(newConnections).filter(key => newConnections[key as keyof ConnectionStatus]);
          localStorage.setItem('connectedServices', JSON.stringify(connectedPlatforms));
        } else {
          // Fallback to localStorage if API fails
          console.warn('⚠️ API failed, falling back to localStorage');
          const storedConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
          if (storedConnections.length > 0) {
            const newConnections: ConnectionStatus = {...connections};
            storedConnections.forEach((service: string) => {
              if (service in newConnections) {
                newConnections[service as keyof ConnectionStatus] = true;
              }
            });
            setConnections(newConnections);
            setHasConnectedServices(true);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching connection status:', error);
        // Fallback to localStorage
        const storedConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
        if (storedConnections.length > 0) {
          const newConnections: ConnectionStatus = {...connections};
          storedConnections.forEach((service: string) => {
            if (service in newConnections) {
              newConnections[service as keyof ConnectionStatus] = true;
            }
          });
          setConnections(newConnections);
          setHasConnectedServices(true);
        }
      }
    };

    fetchConnectionStatus();
  }, [user?.id]); // Re-fetch when user changes

  // Animated extraction simulation
  useEffect(() => {
    if (isExtracting) {
      const interval = setInterval(() => {
        setExtractionProgress(prev => {
          if (prev >= 100) {
            setIsExtracting(false);
            return 100;
          }
          return prev + 2;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isExtracting]);

  const clusters = [
    {
      id: 'personal',
      name: 'Personal Soul',
      description: 'Your authentic self through entertainment, creativity, and personal interests',
      icon: <Heart className="w-6 h-6" />,
      accentColor: '#D97706',
      connectors: [
        // Entertainment & Media
        { name: 'Spotify', icon: <Music />, status: connections.spotify, key: 'spotify', category: 'Entertainment' },
        { name: 'Netflix', icon: <Film />, status: connections.netflix, key: 'netflix', category: 'Entertainment' },
        { name: 'YouTube', icon: <Youtube />, status: connections.youtube, key: 'youtube', category: 'Entertainment' },
        { name: 'Steam', icon: <Gamepad2 />, status: connections.steam, key: 'steam', category: 'Gaming' },
        // Social & Creative (merged from Creative Expression)
        { name: 'Instagram', icon: <Instagram />, status: false, key: 'instagram', category: 'Social' },
        { name: 'Twitter', icon: <Twitter />, status: false, key: 'twitter', category: 'Social' },
        { name: 'GitHub', icon: <Github />, status: false, key: 'github', category: 'Creative' },
        { name: 'Discord', icon: <Users />, status: connections.discord, key: 'discord', category: 'Community' }
      ],
      insights: extractedInsights.personal || [],
      analysisActions: [
        {
          id: 'entertainment-analysis',
          name: 'Analyze Entertainment Soul',
          description: 'Extract personality from entertainment platforms',
          platforms: ['spotify', 'netflix', 'youtube']
        },
        {
          id: 'complete-personal',
          name: 'Complete Personal Analysis',
          description: 'Comprehensive personal profile analysis',
          platforms: 'all'
        }
      ]
    },
    {
      id: 'professional',
      name: 'Professional Identity',
      description: 'Your work persona through communication, collaboration, and productivity patterns',
      icon: <Briefcase className="w-6 h-6" />,
      accentColor: '#D97706',
      connectors: [
        { name: 'Gmail', icon: <Mail />, status: connections.gmail, key: 'gmail', category: 'Communication' },
        { name: 'Calendar', icon: <Calendar />, status: connections.calendar, key: 'calendar', category: 'Time Management' },
        { name: 'Teams', icon: <Users />, status: connections.teams, key: 'teams', category: 'Collaboration' },
        { name: 'Slack', icon: <MessageSquare />, status: connections.slack, key: 'slack', category: 'Collaboration' },
        { name: 'LinkedIn', icon: <Linkedin />, status: false, key: 'linkedin', category: 'Networking' }
      ],
      insights: extractedInsights.professional || [],
      analysisActions: [
        {
          id: 'communication-analysis',
          name: 'Analyze Communication Style',
          description: 'Extract communication patterns from Gmail',
          platforms: ['gmail']
        },
        {
          id: 'productivity-analysis',
          name: 'Analyze Work Patterns',
          description: 'Discover productivity and time patterns',
          platforms: ['calendar']
        },
        {
          id: 'complete-professional',
          name: 'Complete Professional Analysis',
          description: 'Comprehensive professional profile',
          platforms: ['gmail', 'calendar']
        }
      ]
    }
  ];

  const handleConnectorClick = async (clusterKey: string, connectorKey: string) => {
    if (!connections[connectorKey as keyof ConnectionStatus]) {
      // Start real connection process
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/entertainment/connect/${connectorKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user?.id || 'current-user' })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authUrl) {
            window.open(data.authUrl, '_blank');
          }
          setConnections(prev => ({ ...prev, [connectorKey]: true }));
        }
      } catch (error) {
        console.error('Connection error:', error);
      }
    } else {
      // Platform is connected, extract soul signature
      await extractSoulSignature(connectorKey);
    }
  };

  const extractSoulSignature = async (platform: string) => {
    setIsExtracting(true);
    setExtractionProgress(0);

    try {
      console.log(`🧠 Extracting soul signature from ${platform}`);

      let response;
      const userId = user?.id || user?.email || 'anonymous-user'; // Use actual user ID

      // Handle different analysis types
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      if (platform === 'communication-analysis' || platform === 'gmail') {
        console.log('📧 Analyzing Gmail communication patterns...');
        response = await fetch(`${apiUrl}/soul/extract/gmail/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (platform === 'productivity-analysis' || platform === 'calendar') {
        console.log('🗓️ Analyzing Calendar time management patterns...');
        response = await fetch(`${apiUrl}/soul/extract/calendar/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (platform === 'complete-professional' || platform === 'professional') {
        console.log('💼 Generating complete professional soul signature...');
        response = await fetch(`${apiUrl}/soul/extract/professional/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // For other platforms, try original route
        response = await fetch(`${apiUrl}/soul/extract/platform/${platform}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            accessToken: null
          })
        });
      }

      if (response?.ok) {
        const data = await response.json();
        console.log('✨ Real soul signature extracted:', data);

        // Update UI with real insights
        if (data.data) {
          updateClusterInsights(platform, data.data);
        }
      } else {
        // Fallback to demo extraction for non-professional platforms
        if (!['gmail', 'calendar', 'professional'].includes(platform)) {
          const demoResponse = await fetch(`${apiUrl}/soul/demo/${platform}`);
          if (demoResponse.ok) {
            const demoData = await demoResponse.json();
            console.log('🎭 Using demo soul signature:', demoData);
            updateClusterInsights(platform, demoData.data);
          }
        } else {
          // Show demo professional insights for Gmail/Calendar
          const demoInsights = {
            soulSignature: {
              communicationStyle: {
                communicationTone: 'Professional',
                responsePattern: 'Business Hours',
                formalityScore: 75,
                emailFrequency: 12
              },
              professionalIdentity: {
                collaborationStyle: 'High Collaboration',
                networkType: 'External Focused',
                networkDiversity: 15
              },
              personalityInsights: {
                communicationPersona: 'The Professional Communicator',
                workStyle: 'Traditional business hour focus',
                socialProfile: 'Team-oriented and meeting-focused'
              }
            }
          };
          updateClusterInsights(platform, demoInsights);
        }
      }
    } catch (error) {
      console.error('Soul extraction error:', error);
      // Show demo insights on error
      updateClusterInsights(platform, {
        soulSignature: {
          personalityInsights: {
            communicationPersona: `The ${platform.charAt(0).toUpperCase() + platform.slice(1)} Professional`
          }
        }
      });
    } finally {
      // Animate extraction progress
      const interval = setInterval(() => {
        setExtractionProgress(prev => {
          if (prev >= 100) {
            setIsExtracting(false);
            clearInterval(interval);
            return 100;
          }
          return prev + 8;
        });
      }, 80);
    }
  };

  const updateClusterInsights = (platform: string, soulSignature: any) => {
    // Find which cluster this platform belongs to
    const cluster = clusters.find(c =>
      c.connectors.some(conn => conn.key === platform) ||
      platform.includes(c.id)
    );

    if (cluster && soulSignature) {
      // Extract insights from the soul signature data
      let newInsights: string[] = [];

      if (soulSignature.uniquenessMarkers && Array.isArray(soulSignature.uniquenessMarkers)) {
        newInsights = soulSignature.uniquenessMarkers.map((marker: string) => marker);
      } else if (soulSignature.soulSignature?.uniquenessMarkers) {
        newInsights = soulSignature.soulSignature.uniquenessMarkers;
      } else if (soulSignature.soulSignature?.personalityInsights) {
        // Build insights from personality data
        const insights = soulSignature.soulSignature.personalityInsights;
        if (insights.communicationPersona) {
          newInsights.push(`💬 Communication Style: ${insights.communicationPersona}`);
        }
        if (insights.workStyle) {
          newInsights.push(`⚡ Work Pattern: ${insights.workStyle}`);
        }
        if (insights.socialProfile) {
          newInsights.push(`🤝 Social Profile: ${insights.socialProfile}`);
        }
      }

      // Update the appropriate cluster insights
      if (newInsights.length > 0) {
        setExtractedInsights(prev => ({
          ...prev,
          [cluster.id]: newInsights
        }));
        setHasExtractedData(true);
        console.log(`✨ Updated ${cluster.name} with ${newInsights.length} insights`);
      }
    }
  };

  const startExtraction = () => {
    setIsExtracting(true);
    setExtractionProgress(0);
  };

  const currentCluster = clusters.find(c => c.id === activeCluster)!;

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] overflow-hidden relative">
      {/* Main Content */}
      <div className="relative z-10 p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <Fingerprint className="w-10 h-10" style={{ color: '#D97706' }} />
            <h1
              className="text-5xl font-medium"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em',
                color: 'hsl(var(--claude-text))'
              }}
            >
              Soul Signature Extraction
            </h1>
            <Sparkles className="w-10 h-10" style={{ color: '#D97706' }} />
          </div>
          <p
            className="text-lg"
            style={{
              fontFamily: 'var(--_typography---font--tiempos)',
              color: 'hsl(var(--claude-text-muted))'
            }}
          >
            Discovering your authentic digital essence through your choices and preferences
          </p>

          {/* Extension Status Badge */}
          {extensionInstalled && (
            <div className="mt-4 flex justify-center">
              <Badge
                className="px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: extensionAuthenticated ? '#10b981' : '#f59e0b',
                  color: 'white',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                  {extensionAuthenticated
                    ? '✓ Browser Extension Connected - Real-time tracking active'
                    : '⏳ Browser Extension Connecting...'}
                </div>
              </Badge>
            </div>
          )}

          <div
            className="text-sm mt-4 max-w-2xl mx-auto"
            style={{
              fontFamily: 'var(--_typography---font--tiempos)',
              color: 'hsl(var(--claude-text-muted))'
            }}
          >
            <strong style={{ color: '#141413' }}>Twin Me</strong> analyzes your digital footprint to create an authentic personality profile.
            Connect your platforms to discover insights about your Professional Identity and Personal Soul.
          </div>
        </div>

        {/* Cluster Navigation */}
        <div className="flex justify-center gap-4 mb-12">
          {clusters.map((cluster) => (
            <button
              key={cluster.id}
              onClick={() => setActiveCluster(cluster.id)}
              className={cn(
                "relative px-6 py-3 rounded-full",
                activeCluster === cluster.id
                  ? "bg-white border-2"
                  : "bg-white border"
              )}
              style={{
                borderColor: activeCluster === cluster.id ? cluster.accentColor : 'rgba(20,20,19,0.1)',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: activeCluster === cluster.id ? cluster.accentColor : '#141413' }}>
                  {cluster.icon}
                </span>
                <span style={{ color: activeCluster === cluster.id ? cluster.accentColor : '#141413' }}>
                  {cluster.name}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Soul Data Extractor - New Real Backend Integration */}
        <div className="mb-8">
          <SoulDataExtractor
            userId={user?.id || user?.email || 'anonymous-user'}
            onExtractionComplete={(data) => {
              console.log('Extraction complete:', data);
              setHasExtractedData(true);
              // Update insights from real personality data
              if (data.profile?.success) {
                const profile = data.profile.profile;

                // Calculate uniqueness score
                const uniqueness = calculateUniquenessScore(profile);
                setUniquenessScore(uniqueness);
                console.log(`✨ Calculated uniqueness score: ${uniqueness}%`);

                // Personal insights - personality and communication style
                const personalInsights = [
                  `😄 Humor Style: ${profile.humor_style}`,
                  `📊 Confidence: ${(profile.confidence_score * 100).toFixed(0)}%`,
                  `✍️ Analyzed from ${profile.sample_size} text samples`
                ];

                // Add Big Five personality traits to personal insights
                if (profile.personality_traits) {
                  const traits = profile.personality_traits;
                  if (traits.openness !== undefined) {
                    personalInsights.push(`🎨 Openness: ${(traits.openness * 100).toFixed(0)}%`);
                  }
                  if (traits.extraversion !== undefined) {
                    personalInsights.push(`🗣️ Extraversion: ${(traits.extraversion * 100).toFixed(0)}%`);
                  }
                }

                // Professional insights - work-related traits
                const professionalInsights = [
                  `🧠 Communication: ${profile.communication_style}`,
                  `📧 Sample Size: ${profile.sample_size} messages analyzed`,
                  `📊 Analysis Confidence: ${(profile.confidence_score * 100).toFixed(0)}%`
                ];

                // Add conscientiousness and agreeableness to professional insights
                if (profile.personality_traits) {
                  const traits = profile.personality_traits;
                  if (traits.conscientiousness !== undefined) {
                    professionalInsights.push(`✅ Conscientiousness: ${(traits.conscientiousness * 100).toFixed(0)}%`);
                  }
                  if (traits.agreeableness !== undefined) {
                    professionalInsights.push(`🤝 Agreeableness: ${(traits.agreeableness * 100).toFixed(0)}%`);
                  }
                }

                // Update both clusters
                setExtractedInsights({
                  personal: personalInsights,
                  professional: professionalInsights
                });
              }
            }}
          />
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Connectors Panel */}
          <div>
            <Card
              className="p-6 h-full"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <h3
                className="text-xl mb-6 flex items-center gap-2"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                <Globe className="w-5 h-5" style={{ color: 'hsl(var(--claude-text))' }} />
                {hasConnectedServices ? 'Connected Services' : 'Data Sources'}
              </h3>

              {/* Show summary if already connected from onboarding */}
              {hasConnectedServices && (
                <div className="mb-6 p-4 rounded-lg bg-[hsl(var(--claude-surface-raised))] border border-[hsl(var(--claude-accent))]">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5" style={{ color: 'hsl(var(--claude-accent))' }} />
                    <p style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: 'hsl(var(--claude-accent))'
                    }}>
                      Services Connected
                    </p>
                  </div>
                  <p className="text-sm" style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                    color: 'hsl(var(--claude-text-muted))'
                  }}>
                    Your digital platforms are connected. Ready to extract your soul signature.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {currentCluster.connectors.map((connector) => (
                  <button
                    key={connector.key}
                    onClick={() => handleConnectorClick(activeCluster, connector.key)}
                    className={cn(
                      "w-full p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]",
                      "flex items-center justify-between",
                      connector.status ? 'border border-[hsl(var(--claude-accent))]' : 'border border-[hsl(var(--claude-border))]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ color: '#141413' }}>{connector.icon}</span>
                      <span
                        style={{
                          fontFamily: 'var(--_typography---font--tiempos)',
                          color: 'hsl(var(--claude-text))'
                        }}
                      >
                        {connector.name}
                      </span>
                    </div>
                    {connector.status ? (
                      <Badge
                        className="bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))] border border-[hsl(var(--claude-accent))]"
                      >
                        Connected
                      </Badge>
                    ) : (
                      <ChevronRight className="w-4 h-4" style={{ color: '#6B7280' }} />
                    )}
                  </button>
                ))}

                {/* Analysis Actions */}
                <div
                  className="mt-6 pt-6"
                  style={{ borderTop: '1px solid rgba(20,20,19,0.1)' }}
                >
                  <h4
                    className="text-sm mb-4"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    Soul Analysis Options
                  </h4>
                  <div className="space-y-3">
                    {currentCluster.analysisActions?.map((action, index) => (
                      <Button
                        key={action.id}
                        onClick={() => extractSoulSignature(action.id)}
                        disabled={isExtracting}
                        variant="outline"
                        className="w-full justify-start text-left p-4 h-auto bg-[hsl(var(--claude-surface-raised))] border border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))]"
                        style={{
                          fontFamily: 'var(--_typography---font--tiempos)'
                        }}
                      >
                        <div>
                          <div
                            className="font-medium text-sm"
                            style={{
                              fontFamily: 'var(--_typography---font--styrene-a)',
                              color: 'hsl(var(--claude-text))'
                            }}
                          >
                            {action.name}
                          </div>
                          <div
                            className="text-xs mt-1"
                            style={{
                              fontFamily: 'var(--_typography---font--tiempos)',
                              color: '#6B7280'
                            }}
                          >
                            {action.description}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Central Visualization */}
          <div>
            <Card
              className="p-6 h-full"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <h3
                className="text-xl mb-6 text-center"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Soul Signature Visualization
              </h3>

              {/* Cluster Visual */}
              <div className="relative h-64 flex items-center justify-center">
                <div className="relative z-10 text-center">
                  <div
                    className="w-32 h-32 rounded-full flex items-center justify-center mx-auto"
                    style={{
                      backgroundColor: currentCluster.accentColor,
                      border: '2px solid rgba(20,20,19,0.1)'
                    }}
                  >
                    <span style={{ color: 'white' }}>{currentCluster.icon}</span>
                  </div>
                  <div className="mt-4">
                    <div
                      className="text-sm"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#6B7280'
                      }}
                    >
                      Uniqueness Score
                    </div>
                    <div
                      className="text-2xl font-medium"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        color: 'hsl(var(--claude-text))'
                      }}
                    >
                      {uniquenessScore > 0 ? `${uniquenessScore}%` : 'Extract to see'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Extraction Control */}
              <div className="mt-6 space-y-4">
                {isExtracting ? (
                  <div>
                    <div
                      className="flex justify-between text-sm mb-2"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: 'hsl(var(--claude-text))'
                      }}
                    >
                      <span>Extracting Soul Signature...</span>
                      <span>{extractionProgress}%</span>
                    </div>
                    <Progress value={extractionProgress} className="h-2" />
                  </div>
                ) : (
                  <Button
                    onClick={startExtraction}
                    className="w-full"
                    style={{
                      backgroundColor: currentCluster.accentColor,
                      color: 'white',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500
                    }}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Extract {currentCluster.name}
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* Insights Panel */}
          <div>
            <Card
              className="p-6 h-full"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <h3
                className="text-xl mb-6 flex items-center gap-2"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                <Brain className="w-5 h-5" style={{ color: '#141413' }} />
                Discovered Patterns
              </h3>
              <div className="space-y-3">
                {currentCluster.insights.length === 0 ? (
                  <div className="text-center py-12">
                    <Fingerprint className="w-16 h-16 mx-auto mb-4" style={{ color: '#6B7280' }} />
                    <h4
                      className="text-lg mb-2"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500,
                        color: '#6B7280'
                      }}
                    >
                      No Soul Signature Yet
                    </h4>
                    <p
                      className="text-sm mb-6 max-w-md mx-auto"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#6B7280'
                      }}
                    >
                      Connect at least one platform from this cluster to begin discovering your authentic {currentCluster.name.toLowerCase()}.
                    </p>
                    <Button
                      onClick={() => {
                        const connectedPlatforms = currentCluster.connectors.filter(c => c.status);
                        if (connectedPlatforms.length > 0) {
                          startExtraction();
                        }
                      }}
                      variant="outline"
                      style={{
                        border: '2px solid ' + currentCluster.accentColor,
                        color: currentCluster.accentColor,
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Start Soul Discovery
                    </Button>
                  </div>
                ) : (
                  currentCluster.insights.map((insight, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))] border border-[hsl(var(--claude-border))]"
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="w-2 h-2 rounded-full mt-1.5"
                          style={{ backgroundColor: currentCluster.accentColor }}
                        />
                        <p
                          className="text-sm"
                          style={{
                            fontFamily: 'var(--_typography---font--tiempos)',
                            color: 'hsl(var(--claude-text))'
                          }}
                        >
                          {insight}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Privacy Controls Toggle */}
        <div className="mt-12 text-center">
          <Button
            onClick={() => setShowPrivacyControls(!showPrivacyControls)}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            {showPrivacyControls ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
            {showPrivacyControls ? 'Hide' : 'Show'} Privacy Controls
          </Button>
        </div>

        {/* Privacy Spectrum Dashboard */}
        {showPrivacyControls && (
          <div className="mt-8">
            <PrivacySpectrumDashboard />
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-12 flex justify-center gap-4">
          <Button
            onClick={() => navigate('/soul-chat')}
            style={{
              backgroundColor: '#D97706',
              color: 'white',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
            disabled={!hasExtractedData}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Chat with Your Twin
          </Button>
          <Button
            onClick={() => navigate('/twin-profile-preview')}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <Play className="w-4 h-4 mr-2" />
            Preview Your Twin
          </Button>
          <Button
            onClick={() => navigate('/twin-activation')}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Activate Twin
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SoulSignatureDashboard;