import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  Sparkles, Music, Film, Gamepad2, Heart, Brain, Globe,
  ChevronRight, Play, Pause, Lock, Unlock, Fingerprint,
  User, Briefcase, Palette, Calendar, Mail, MessageSquare,
  Instagram, Twitter, Github, Linkedin, Youtube, Users, CheckCircle2,
  Video, Eye, EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PrivacySpectrumDashboard from '@/components/PrivacySpectrumDashboard';
import { SoulDataExtractor } from '@/components/SoulDataExtractor';
import { PlatformConnectionCard } from '@/components/PlatformConnectionCard';
import { DataExtractionClarity } from '@/components/DataExtractionClarity';
import ExtractionProgressMonitor from '@/components/ExtractionProgressMonitor';

interface ConnectionStatus {
  spotify: boolean;
  netflix: boolean;
  youtube: boolean;
  twitch: boolean;
  steam: boolean;
  google_gmail: boolean;
  google_calendar: boolean;
  teams: boolean;
  slack: boolean;
  discord: boolean;
  github: boolean;
  linkedin: boolean;
  instagram: boolean;
  twitter: boolean;
  reddit: boolean;
}

const SoulSignatureDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();

  // Use unified platform status hook
  const {
    data: platformStatus,
    hasConnectedServices: platformsConnected,
    connectedProviders,
    refetch
  } = usePlatformStatus(user?.id);

  const [activeCluster, setActiveCluster] = useState<string>('personal');
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [showExtractionClarity, setShowExtractionClarity] = useState(false);

  // Derive connections from unified hook (replaces manual state)
  const connections: ConnectionStatus = {
    spotify: platformStatus['spotify']?.connected || false,
    netflix: platformStatus['netflix']?.connected || false,
    youtube: platformStatus['youtube']?.connected || false,
    twitch: platformStatus['twitch']?.connected || false,
    steam: platformStatus['steam']?.connected || false,
    google_gmail: platformStatus['google_gmail']?.connected || false,
    google_calendar: platformStatus['google_calendar']?.connected || false,
    teams: platformStatus['teams']?.connected || false,
    slack: platformStatus['slack']?.connected || false,
    discord: platformStatus['discord']?.connected || false,
    github: platformStatus['github']?.connected || false,
    linkedin: platformStatus['linkedin']?.connected || false,
    instagram: platformStatus['instagram']?.connected || false,
    twitter: platformStatus['twitter']?.connected || false,
    reddit: platformStatus['reddit']?.connected || false
  };
  const [extractedInsights, setExtractedInsights] = useState<{
    personal: string[] | null;
    professional: string[] | null;
  }>({
    personal: null,
    professional: null
  });
  const [hasExtractedData, setHasExtractedData] = useState(false);
  const hasConnectedServices = platformsConnected; // Use unified hook value
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

  // Check for existing extracted data on mount
  useEffect(() => {
    const checkExistingData = async () => {
      if (!user?.id && !user?.email) return;

      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const userId = user?.id || user?.email;

        // Check if user has any extracted data
        const response = await fetch(`${apiUrl}/soul-data/check-extracted-data?userId=${userId}`);

        if (response.ok) {
          const data = await response.json();
          if (data.hasData) {
            setHasExtractedData(true);
            console.log('✅ Existing extracted data found - enabling chat button');
          }
        }
      } catch (error) {
        console.error('Error checking for existing data:', error);
        // Don't prevent user from chatting if check fails
        setHasExtractedData(true);
      }
    };

    checkExistingData();
  }, [user]);

  // Detect and authenticate browser extension
  useEffect(() => {
    const detectAndAuthExtension = async () => {
      if (!user?.id) return;

      const EXTENSION_ID = 'acnofcjjfjaikcfnalggkkbghjaijepc'; // Soul Observer Extension ID

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

  const clusters = [
    {
      id: 'personal',
      name: 'Personal Soul',
      description: 'Your authentic self through entertainment, creativity, and personal interests',
      icon: <Heart className="w-6 h-6" />,
      accentColor: '#D97706',
      connectors: [
        // Entertainment & Media
        { name: 'Spotify', icon: <Music />, status: connections.spotify, key: 'spotify', category: 'Music' },
        { name: 'Netflix', icon: <Film />, status: connections.netflix, key: 'netflix', category: 'Video' },
        { name: 'YouTube', icon: <Youtube />, status: connections.youtube, key: 'youtube', category: 'Video' },
        { name: 'Twitch', icon: <Video />, status: connections.twitch, key: 'twitch', category: 'Live Streaming' },

        // Gaming
        { name: 'Steam', icon: <Gamepad2 />, status: connections.steam, key: 'steam', category: 'Gaming' },
        { name: 'Discord', icon: <Users />, status: connections.discord, key: 'discord', category: 'Community' },

        // Social & Community
        { name: 'Instagram', icon: <Instagram />, status: connections.instagram, key: 'instagram', category: 'Social' },
        { name: 'Twitter', icon: <Twitter />, status: connections.twitter, key: 'twitter', category: 'Social' },
        { name: 'Reddit', icon: <MessageSquare />, status: connections.reddit, key: 'reddit', category: 'Social' },

        // Reading & Creative
        { name: 'GitHub', icon: <Github />, status: connections.github, key: 'github', category: 'Creative' }
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
        { name: 'Gmail', icon: <Mail />, status: connections.google_gmail, key: 'google_gmail', category: 'Communication' },
        { name: 'Calendar', icon: <Calendar />, status: connections.google_calendar, key: 'google_calendar', category: 'Time Management' },
        { name: 'Teams', icon: <Users />, status: connections.teams, key: 'teams', category: 'Collaboration' },
        { name: 'Slack', icon: <MessageSquare />, status: connections.slack, key: 'slack', category: 'Collaboration' },
        { name: 'LinkedIn', icon: <Linkedin />, status: connections.linkedin, key: 'linkedin', category: 'Networking' },
        { name: 'GitHub', icon: <Github />, status: connections.github, key: 'github', category: 'Development' }
      ],
      insights: extractedInsights.professional || [],
      analysisActions: [
        {
          id: 'communication-analysis',
          name: 'Analyze Communication Style',
          description: 'Extract communication patterns from Gmail',
          platforms: ['google_gmail']
        },
        {
          id: 'productivity-analysis',
          name: 'Analyze Work Patterns',
          description: 'Discover productivity and time patterns',
          platforms: ['google_calendar']
        },
        {
          id: 'complete-professional',
          name: 'Complete Professional Analysis',
          description: 'Comprehensive professional profile',
          platforms: ['google_gmail', 'google_calendar']
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
            window.location.href = data.authUrl;
          }
          // Note: Connection status will be updated via usePlatformStatus hook
        }
      } catch (error) {
        console.error('Connection error:', error);
      }
    } else {
      // Platform is connected, extract soul signature
      await extractSoulSignature(connectorKey);
    }
  };


  // Handle platform reconnection (for expired tokens)
  const handleReconnect = async (connectorKey: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      // First disconnect the expired/failed connection
      await fetch(`${apiUrl}/oauth/disconnect/${connectorKey}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'current-user' })
      });

      // Then initiate fresh OAuth flow
      const response = await fetch(`${apiUrl}/entertainment/connect/${connectorKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'current-user' })
      });

      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error(`Failed to reconnect ${connectorKey}:`, error);
    }
  };

  // Handle platform disconnection
  const handleDisconnect = async (connectorKey: string) => {
    if (!confirm(`Are you sure you want to disconnect ${connectorKey}?`)) {
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/oauth/disconnect/${connectorKey}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'current-user' })
      });

      if (response.ok) {
        // Refetch platform status to update UI
        if (refetch) {
          refetch();
        }
      }
    } catch (error) {
      console.error(`Failed to disconnect ${connectorKey}:`, error);
    }
  };

  const extractSoulSignature = async (platform: string) => {
    try {
      console.log(`🧠 Extracting soul signature from ${platform}`);

      let response;
      const userId = user?.id || user?.email || 'anonymous-user'; // Use actual user ID

      // Handle different analysis types
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      if (platform === 'communication-analysis' || platform === 'gmail' || platform === 'google_gmail') {
        console.log('📧 Analyzing Gmail communication patterns...');
        response = await fetch(`${apiUrl}/soul/extract/gmail/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (platform === 'productivity-analysis' || platform === 'calendar' || platform === 'google_calendar') {
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
        console.warn(`⚠️ No data available for ${platform} - extraction failed`);
        // Don't show fake data - let UI show "No Soul Signature Yet"
      }
    } catch (error) {
      console.error('Soul extraction error:', error);
      // Don't show fake data on error - let UI show honest state
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

  const currentCluster = clusters.find(c => c.id === activeCluster)!;

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] overflow-hidden relative">
      {/* Main Content */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 sm:gap-3 mb-4">
            <Fingerprint className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" style={{ color: '#D97706' }} />
            <h1
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em',
                color: 'hsl(var(--claude-text))'
              }}
            >
              Soul Signature Extraction
            </h1>
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" style={{ color: '#D97706' }} />
          </div>
          <p
            className="text-sm sm:text-base lg:text-lg px-4"
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
                  <div className="w-2 h-2 rounded-full bg-card animate-pulse"></div>
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
            <strong style={{ color: "hsl(var(--foreground))" }}>Twin Me</strong> analyzes your digital footprint to create an authentic personality profile.
            Connect your platforms to discover insights about your Professional Identity and Personal Soul.
          </div>
        </div>

        {/* Real-Time Extraction Progress Monitor */}
        <ExtractionProgressMonitor showCompleted={true} maxJobs={3} />

        {/* Cluster Navigation */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mb-8 sm:mb-12 px-4">
          {clusters.map((cluster) => (
            <button
              key={cluster.id}
              onClick={() => setActiveCluster(cluster.id)}
              className={cn(
                "relative px-4 sm:px-6 py-2 sm:py-3 rounded-full w-full sm:w-auto",
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
              <div className="flex items-center justify-center gap-2">
                <span style={{ color: activeCluster === cluster.id ? cluster.accentColor : '#141413' }}>
                  {cluster.icon}
                </span>
                <span className="text-sm sm:text-base" style={{ color: activeCluster === cluster.id ? cluster.accentColor : '#141413' }}>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
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
                  <PlatformConnectionCard
                    key={connector.key}
                    connector={connector}
                    platformStatus={platformStatus[connector.key]}
                    hasExtractedData={hasExtractedData}
                    onConnect={() => handleConnectorClick(activeCluster, connector.key)}
                    onReconnect={() => handleReconnect(connector.key)}
                    onDisconnect={() => handleDisconnect(connector.key)}
                  />
                ))}
              </div>

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
                              color: "hsl(var(--muted-foreground))"
                            }}
                          >
                            {action.description}
                          </div>
                        </div>
                      </Button>
                    ))}
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
                        color: "hsl(var(--muted-foreground))"
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

              {/* Note: Real extraction handled by SoulDataExtractor component above */}
              <div className="mt-6">
                <p className="text-sm text-center" style={{
                  fontFamily: 'var(--_typography---font--tiempos)',
                  color: 'hsl(var(--claude-text-muted))'
                }}>
                  Use the "Extract Soul Signature" button above to begin full pipeline extraction
                </p>
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
                <Brain className="w-5 h-5" style={{ color: "hsl(var(--foreground))" }} />
                Discovered Patterns
              </h3>
              <div className="space-y-3">
                {currentCluster.insights.length === 0 ? (
                  <div className="text-center py-12">
                    <Fingerprint className="w-16 h-16 mx-auto mb-4" style={{ color: "hsl(var(--muted-foreground))" }} />
                    <h4
                      className="text-lg mb-2"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500,
                        color: "hsl(var(--muted-foreground))"
                      }}
                    >
                      No Soul Signature Yet
                    </h4>
                    <p
                      className="text-sm mb-6 max-w-md mx-auto"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: "hsl(var(--muted-foreground))"
                      }}
                    >
                      Connect platforms and use the "Extract Soul Signature" button above to begin discovering your authentic {currentCluster.name.toLowerCase()}.
                    </p>
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

        {/* Privacy Controls & Extraction Clarity Toggles */}
        <div className="mt-12 flex justify-center gap-4">
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

          <Button
            onClick={() => setShowExtractionClarity(!showExtractionClarity)}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            {showExtractionClarity ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showExtractionClarity ? 'Hide' : 'Show'} Data Transparency
          </Button>
        </div>

        {/* Privacy Spectrum Dashboard */}
        {showPrivacyControls && (
          <div className="mt-8">
            <PrivacySpectrumDashboard />
          </div>
        )}

        {/* Data Extraction Clarity */}
        {showExtractionClarity && (
          <div className="mt-8">
            <DataExtractionClarity
              userId={user?.id || user?.email}
              connectedPlatforms={connectedProviders}
              onPrivacyChange={(category, level) => {
                console.log(`Privacy change for ${category}: ${level}%`);
              }}
            />
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
        </div>
      </div>
    </div>
  );
};

export default SoulSignatureDashboard;