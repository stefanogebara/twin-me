/**
 * InstantTwinOnboarding - Connect Your Platforms
 *
 * Lorix minimal design implementation with PageLayout and GlassPanel
 * Connects your digital life to discover and share your authentic soul signature
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/components/ui/use-toast';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Shield,
  Sparkles,
  Mail,
  Calendar,
  MessageSquare,
  Briefcase,
  Hash,
  Github,
  Music,
  Settings,
  Eye,
  Plus,
  Youtube,
  Fingerprint,
  X
} from 'lucide-react';

import UserProfile from '../components/UserProfile';
import { DataVerification } from '../components/DataVerification';
import ThemeToggle from '../components/ThemeToggle';

import {
  DataProvider
} from '@/types/data-integration';

// ====================================================================
// CONNECTOR CONFIGURATION
// ====================================================================

interface ConnectorConfig {
  provider: DataProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  dataTypes: string[];
  estimatedInsights: number;
  setupTime: string;
  privacyLevel: 'low' | 'medium' | 'high';
  category: 'entertainment' | 'social' | 'professional';
}

const AVAILABLE_CONNECTORS: ConnectorConfig[] = [
  // Entertainment Platforms
  {
    provider: 'spotify',
    name: 'Spotify',
    description: 'Music taste and cultural interests',
    icon: <Music className="w-6 h-6" />,
    color: '#1DB954',
    dataTypes: ['Music Taste', 'Cultural Interests', 'Mood Patterns'],
    estimatedInsights: 5,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'entertainment'
  },
  {
    provider: 'youtube',
    name: 'YouTube',
    description: 'Learning interests and content preferences',
    icon: <Youtube className="w-6 h-6" />,
    color: '#FF0000',
    dataTypes: ['Learning Style', 'Interests', 'Content Types'],
    estimatedInsights: 10,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'entertainment'
  },
  // Social Platforms
  {
    provider: 'discord',
    name: 'Discord',
    description: 'Community involvement and social gaming',
    icon: <MessageSquare className="w-6 h-6" />,
    color: '#5865F2',
    dataTypes: ['Community', 'Social Interactions', 'Gaming Identity'],
    estimatedInsights: 8,
    setupTime: '10 seconds',
    privacyLevel: 'medium',
    category: 'social'
  },
  {
    provider: 'reddit',
    name: 'Reddit',
    description: 'Community interests and discussion patterns',
    icon: <Hash className="w-6 h-6" />,
    color: '#FF4500',
    dataTypes: ['Community Interests', 'Discussion Style', 'Expertise Areas'],
    estimatedInsights: 8,
    setupTime: '10 seconds',
    privacyLevel: 'medium',
    category: 'social'
  },
  // Professional Platforms
  {
    provider: 'google_gmail',
    name: 'Gmail',
    description: 'Email communication style and professional relationships',
    icon: <Mail className="w-6 h-6" />,
    color: '#EA4335',
    dataTypes: ['Communication Style', 'Response Patterns', 'Professional Network'],
    estimatedInsights: 15,
    setupTime: '10 seconds',
    privacyLevel: 'medium',
    category: 'professional'
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Work patterns, meeting preferences, and time management',
    icon: <Calendar className="w-6 h-6" />,
    color: '#4285F4',
    dataTypes: ['Work Patterns', 'Time Management', 'Collaboration Style'],
    estimatedInsights: 8,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'professional'
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Team communication and workplace personality',
    icon: <MessageSquare className="w-6 h-6" />,
    color: '#4A154B',
    dataTypes: ['Team Dynamics', 'Communication Tone', 'Expertise Areas'],
    estimatedInsights: 12,
    setupTime: '15 seconds',
    privacyLevel: 'medium',
    category: 'professional'
  },
  {
    provider: 'linkedin',
    name: 'LinkedIn',
    description: 'Professional identity and career interests',
    icon: <Briefcase className="w-6 h-6" />,
    color: '#0A66C2',
    dataTypes: ['Professional Identity', 'Career Goals', 'Industry Expertise'],
    estimatedInsights: 10,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'professional'
  },
  {
    provider: 'github',
    name: 'GitHub',
    description: 'Technical skills and coding style (for developers)',
    icon: <Github className="w-6 h-6" />,
    color: '#171515',
    dataTypes: ['Technical Skills', 'Problem-Solving', 'Collaboration'],
    estimatedInsights: 6,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'professional'
  }
];

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const InstantTwinOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { toast } = useToast();

  // Lorix design system colors
  const colors = {
    textPrimary: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
    muted: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    categoryEntertainment: '#3b82f6',
    categorySocial: '#a855f7',
    categoryProfessional: '#78716c',
    connected: '#22c55e',
  };

  const {
    connectedProviders,
    refetch: refetchPlatformStatus
  } = usePlatformStatus(user?.id);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnectors, setSelectedConnectors] = useState<DataProvider[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<DataProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<DataProvider | null>(null);
  const [showProfessionalPlatforms, setShowProfessionalPlatforms] = useState(true);

  const connectedServices = connectedProviders as DataProvider[];

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const provider = urlParams.get('provider');

    if (connected === 'true' && provider) {
      toast({
        title: "Connected Successfully",
        description: `${provider.replace('_', ' ')} is now connected`,
        variant: "default",
      });
      setConnectingProvider(null);
      setTimeout(() => refetchPlatformStatus(), 1500);
    }

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth-success' && event.data?.provider) {
        const providerName = event.data.provider.replace('google_', '').replace('_', ' ');
        const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
        toast({
          title: "Connected Successfully",
          description: `${displayName} is now connected`,
          variant: "default",
        });
        setConnectingProvider(null);
        setTimeout(() => refetchPlatformStatus(), 1500);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [refetchPlatformStatus, toast]);

  const STEPS = [
    { id: 1, name: 'Connect', description: 'Connect your digital services' },
    { id: 2, name: 'Configure', description: 'Choose privacy settings' },
    { id: 3, name: 'Generate', description: 'Create your instant twin' }
  ];

  const handleConnectorToggle = useCallback((provider: DataProvider) => {
    setSelectedConnectors(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    );
  }, []);

  const connectService = useCallback(async (provider: DataProvider) => {
    setConnectingProvider(provider);
    try {
      const userId = user?.id || 'demo-user';
      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const apiUrl = `${baseUrl}/connectors/auth/${provider}?userId=${encodeURIComponent(userId)}`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data?.authUrl) {
        sessionStorage.setItem('connecting_provider', provider);
        window.location.href = result.data.authUrl;
      } else if (result.success) {
        await refetchPlatformStatus();
        toast({
          title: "Test Connection",
          description: `${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name} test connection added`,
          variant: "default",
        });
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      toast({
        title: "Connection failed",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setConnectingProvider(null);
    }
  }, [toast, user, refetchPlatformStatus]);

  const disconnectService = useCallback(async (provider: DataProvider) => {
    if (!user) return;
    setDisconnectingProvider(provider);
    try {
      const userId = user?.id;
      const connectorName = AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name;
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(
        `${baseUrl}/connectors/${provider}/${encodeURIComponent(userId)}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await refetchPlatformStatus();
      toast({
        title: "Disconnected",
        description: `${connectorName} has been disconnected`,
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Disconnect failed';
      toast({
        title: "Disconnect failed",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setDisconnectingProvider(null);
    }
  }, [user, toast, refetchPlatformStatus]);

  const startTwinGeneration = useCallback(async () => {
    if (!user) return;

    if (connectedServices.length === 0) {
      toast({
        title: "No connections found",
        description: "Please connect at least one service before generating your twin.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    toast({
      title: "Setting up your Soul Signature dashboard...",
      description: "Creating your digital twin structure",
    });

    try {
      const twinData = {
        name: user.fullName || user.firstName || 'My Soul Signature',
        description: `Digital twin for ${user.fullName || user.firstName || 'user'}. Soul signature extraction ready.`,
        subject_area: 'Soul Signature Analysis',
        twin_type: 'personal',
        personality_traits: {
          openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
          agreeableness: 0.5, neuroticism: 0.5
        },
        teaching_style: {
          communication_style: 'balanced',
          philosophy: 'Awaiting soul signature extraction from connected platforms'
        },
        common_phrases: [],
        favorite_analogies: [],
        connected_platforms: connectedServices,
        knowledge_base_status: 'pending_extraction'
      };

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/twins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(twinData)
      });

      const result = await response.json();

      if (response.ok && (result.id || result.twin?.id)) {
        toast({
          title: "Ready to extract your Soul Signature!",
          description: "Navigate to the dashboard to begin extraction.",
        });
        setTimeout(() => navigate('/soul-signature'), 500);
      } else {
        throw new Error(`Failed to create soul signature structure: ${result.error || result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating soul signature structure:', error);
      toast({
        title: "Error",
        description: "Failed to create your soul signature structure. Please try again.",
        variant: "destructive"
      });
      setIsGenerating(false);
      setTimeout(() => navigate('/soul-signature'), 1000);
    }
  }, [user, connectedServices, navigate, toast]);

  const renderConnectorCard = (connector: ConnectorConfig) => {
    const isConnected = connectedServices.includes(connector.provider);

    return (
      <GlassPanel
        key={connector.provider}
        hover
        className={`relative transition-all ${isConnected ? 'ring-2 ring-green-500/50' : ''}`}
        style={isConnected ? {
          backgroundColor: theme === 'dark'
            ? 'rgba(34, 197, 94, 0.05)'
            : 'rgba(34, 197, 94, 0.02)',
        } : {}}
      >
        {isConnected && (
          <div className="absolute -top-3 -right-3 z-10">
            <div
              className="rounded-full p-2.5 shadow-lg"
              style={{
                backgroundColor: colors.connected,
                color: 'white',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
              }}
            >
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-4 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: connector.color, color: 'white' }}
          >
            {connector.icon}
          </div>
          <div className="flex-1">
            <h3
              className="text-lg"
              style={{
                color: colors.textPrimary,
                fontFamily: 'var(--font-heading)',
                fontWeight: 400
              }}
            >
              {connector.name}
            </h3>
            <p
              className="text-xs"
              style={{
                color: colors.muted,
                fontFamily: 'var(--font-body)'
              }}
            >
              {connector.setupTime} setup
            </p>
          </div>
        </div>

        <p
          className="text-sm mb-3 leading-relaxed"
          style={{
            color: colors.textSecondary,
            fontFamily: 'var(--font-body)'
          }}
        >
          {connector.description}
        </p>

        <div className="mb-3">
          <div className="flex flex-wrap gap-1">
            {connector.dataTypes.slice(0, 2).map((type, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.8)' : 'rgba(0, 0, 0, 0.05)',
                  color: colors.muted,
                  fontFamily: 'var(--font-body)'
                }}
              >
                {type}
              </span>
            ))}
            {connector.dataTypes.length > 2 && (
              <span
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.8)' : 'rgba(0, 0, 0, 0.05)',
                  color: colors.muted,
                  fontFamily: 'var(--font-body)'
                }}
              >
                +{connector.dataTypes.length - 2} more
              </span>
            )}
          </div>
        </div>

        {!isConnected && (
          <div className="mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                connectService(connector.provider);
              }}
              disabled={connectingProvider === connector.provider}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: colors.textPrimary,
                fontFamily: 'var(--font-body)',
                fontWeight: 500
              }}
            >
              {connectingProvider === connector.provider ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        )}

        {isConnected && (
          <div className="mt-3 space-y-2">
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                border: `1px solid ${colors.connected}`
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: colors.connected }} />
                  <span
                    className="text-sm"
                    style={{
                      color: colors.connected,
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500
                    }}
                  >
                    Connected
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnectService(connector.provider);
                  }}
                  disabled={disconnectingProvider === connector.provider}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: '#EF4444',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500
                  }}
                >
                  {disconnectingProvider === connector.provider ? (
                    <>
                      <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Disconnecting
                    </>
                  ) : (
                    <>
                      <X className="w-3 h-3" />
                      Disconnect
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </GlassPanel>
    );
  };

  // Sort connectors - connected ones first
  const sortConnectors = (connectors: ConnectorConfig[]) => {
    return [...connectors].sort((a, b) => {
      const aConnected = connectedServices.includes(a.provider);
      const bConnected = connectedServices.includes(b.provider);
      if (aConnected && !bConnected) return -1;
      if (!aConnected && bConnected) return 1;
      return 0;
    });
  };

  const entertainmentConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'entertainment'));
  const socialConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'social'));
  const professionalConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'professional'));

  return (
    <PageLayout
      title="Connect Your Platforms"
      subtitle="Link your digital footprints to build your soul signature"
      maxWidth="xl"
      padding="lg"
    >
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => {
            if (currentStep > 1) {
              setCurrentStep(currentStep - 1);
            } else {
              navigate('/');
            }
          }}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(0, 0, 0, 0.05)',
            color: colors.textPrimary
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          {currentStep > 1 ? `Back to ${STEPS[currentStep - 2].name}` : 'Back to Home'}
        </button>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserProfile />
        </div>
      </div>

      {connectedServices.length > 0 && (
        <GlassPanel className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: colors.connected }}
              >
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p
                  className="text-sm"
                  style={{ color: colors.textPrimary, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
                >
                  {connectedServices.length} platform{connectedServices.length !== 1 ? 's' : ''} connected
                </p>
                <p
                  className="text-xs"
                  style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
                >
                  Ready to discover your soul signature
                </p>
              </div>
            </div>
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
              style={{
                backgroundColor: colors.connected,
                color: 'white',
                fontFamily: 'var(--font-body)',
                fontWeight: 500
              }}
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </GlassPanel>
      )}

      {currentStep === 1 && (
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.categoryEntertainment }}
              />
              <h3
                className="text-lg"
                style={{
                  color: colors.textPrimary,
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400
                }}
              >
                Entertainment
              </h3>
              <span
                className="text-xs"
                style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
              >
                Music, videos, streaming
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entertainmentConnectors.map(renderConnectorCard)}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.categorySocial }}
              />
              <h3
                className="text-lg"
                style={{
                  color: colors.textPrimary,
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400
                }}
              >
                Social
              </h3>
              <span
                className="text-xs"
                style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
              >
                Communities, discussions
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {socialConnectors.map(renderConnectorCard)}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors.categoryProfessional }}
                />
                <h3
                  className="text-lg"
                  style={{
                    color: colors.textPrimary,
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 400
                  }}
                >
                  Professional
                </h3>
                <span
                  className="text-xs"
                  style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
                >
                  Work, coding, email
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {professionalConnectors.map(renderConnectorCard)}
            </div>
          </div>

          {connectedServices.length > 0 && (
            <DataVerification
              userId={user?.id || 'demo-user'}
              connectedServices={connectedServices}
            />
          )}

          <GlassPanel className="text-center">
            {connectedServices.length > 0 ? (
              <div>
                <div className="flex items-center justify-center gap-2 mb-4" style={{ color: colors.connected }}>
                  <CheckCircle2 className="w-6 h-6" />
                  <span
                    className="text-lg"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 400
                    }}
                  >
                    {connectedServices.length} platform{connectedServices.length !== 1 ? 's' : ''} connected
                  </span>
                </div>
                <button
                  onClick={() => navigate('/todays-twin')}
                  className="flex items-center gap-3 mx-auto px-8 py-4 rounded-xl text-lg transition-all"
                  style={{
                    backgroundColor: colors.connected,
                    color: 'white',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500
                  }}
                >
                  <Sparkles className="w-5 h-5" />
                  View Your Ritual Dashboard
                  <ArrowRight className="w-5 h-5" />
                </button>
                <p
                  className="text-sm mt-3"
                  style={{
                    color: colors.muted,
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Your patterns and rituals are ready to explore
                </p>
              </div>
            ) : (
              <div>
                <div
                  className="text-lg mb-4"
                  style={{
                    color: colors.textPrimary,
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 400
                  }}
                >
                  Connect at least one platform to begin
                </div>
                <p
                  style={{
                    color: colors.textSecondary,
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Each connection reveals more depth in your soul signature
                </p>
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </PageLayout>
  );
};

export default InstantTwinOnboarding;
