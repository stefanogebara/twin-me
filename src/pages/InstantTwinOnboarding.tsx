/**
 * InstantTwinOnboarding - Soul Signature Discovery Journey
 * Connect your digital life to discover and share your authentic soul signature
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Zap,
  Shield,
  Brain,
  Sparkles,
  User,
  Mail,
  Calendar,
  MessageSquare,
  Briefcase,
  Hash,
  Github,
  Music,
  Play,
  Settings,
  Eye,
  EyeOff,
  Plus,
  Film,
  Youtube,
  Gamepad2,
  Book,
  Heart,
  Palette,
  Fingerprint,
  X
} from 'lucide-react';

import UserProfile from '../components/UserProfile';
import { DataVerification } from '../components/DataVerification';
import ThemeToggle from '../components/ThemeToggle';
import { ExtractionProgressIndicator } from '../components/ExtractionProgressIndicator';

import {
  DataProvider,
  TwinGenerationProgress,
  InstantTwinConfig,
  DataConnector
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
}

const AVAILABLE_CONNECTORS: ConnectorConfig[] = [
  {
    provider: 'google_gmail',
    name: 'Gmail',
    description: 'Email communication style and professional relationships',
    icon: <Mail className="w-6 h-6" />,
    color: '#EA4335',
    dataTypes: ['Communication Style', 'Response Patterns', 'Professional Network'],
    estimatedInsights: 15,
    setupTime: '10 seconds',
    privacyLevel: 'medium'
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
    privacyLevel: 'low'
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
    privacyLevel: 'medium'
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
    privacyLevel: 'low'
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
    privacyLevel: 'low'
  },
  {
    provider: 'spotify',
    name: 'Spotify',
    description: 'Music taste and cultural interests',
    icon: <Music className="w-6 h-6" />,
    color: '#1DB954',
    dataTypes: ['Music Taste', 'Cultural Interests', 'Mood Patterns'],
    estimatedInsights: 5,
    setupTime: '5 seconds',
    privacyLevel: 'low'
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
    privacyLevel: 'low'
  },
  {
    provider: 'discord',
    name: 'Discord',
    description: 'Community involvement and social gaming',
    icon: <MessageSquare className="w-6 h-6" />,
    color: '#5865F2',
    dataTypes: ['Community', 'Social Interactions', 'Gaming Identity'],
    estimatedInsights: 8,
    setupTime: '10 seconds',
    privacyLevel: 'medium'
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
    privacyLevel: 'medium'
  }
];

// Note: Removed connectors:
// - Netflix: Uses CSV upload (no OAuth API for watch history)
// - Goodreads: API deprecated since 2020
// - Steam: Requires separate implementation

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const InstantTwinOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Use unified platform status hook - single source of truth
  const {
    data: platformStatus,
    connectedProviders,
    hasConnectedServices,
    refetch: refetchPlatformStatus
  } = usePlatformStatus(user?.id);

  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnectors, setSelectedConnectors] = useState<DataProvider[]>([]);
  const [generationProgress, setGenerationProgress] = useState<TwinGenerationProgress | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showExtractionProgress, setShowExtractionProgress] = useState(false);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<DataProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<DataProvider | null>(null);
  // Progressive disclosure state
  const [showAllConnectors, setShowAllConnectors] = useState(false);

  // Derive connectedServices from unified hook (replaces localStorage)
  const connectedServices = connectedProviders as DataProvider[];

  // Handle OAuth callback success - both from URL params and postMessage
  React.useEffect(() => {
    // Handle OAuth callback from URL params (when redirected back)
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const provider = urlParams.get('provider');

    if (connected === 'true' && provider) {
      console.log('🔗 OAuth callback detected from URL for:', provider);

      // Show success toast
      toast({
        title: "✅ Connected Successfully",
        description: `${provider.replace('_', ' ')} is now connected to your Twin Me account`,
        variant: "default",
      });

      // Clear connecting provider state
      setConnectingProvider(null);

      // Refetch platform status from database (single source of truth)
      setTimeout(() => {
        refetchPlatformStatus();
      }, 1500); // Small delay to allow backend to process
    }

    // Handle OAuth success from popup window via postMessage
    const handleOAuthMessage = (event: MessageEvent) => {
      // Validate origin
      if (event.origin !== window.location.origin) return;

      // Check for OAuth success message
      if (event.data?.type === 'oauth-success' && event.data?.provider) {
        console.log('🔗 OAuth success received via postMessage for:', event.data.provider);

        // Show success toast
        const providerName = event.data.provider.replace('google_', '').replace('_', ' ');
        const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

        toast({
          title: "✅ Connected Successfully",
          description: `${displayName} is now connected to your Twin Me account`,
          variant: "default",
        });

        // Clear connecting provider state
        setConnectingProvider(null);

        // Refetch platform status from database
        setTimeout(() => {
          console.log('🔄 Refetching platform status after OAuth success...');
          refetchPlatformStatus();
        }, 1500); // Give backend time to process the OAuth tokens
      }
    };

    // Add event listener for OAuth popup messages
    window.addEventListener('message', handleOAuthMessage);

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, [refetchPlatformStatus, toast]); // Include dependencies for proper updates

  // Steps configuration
  const STEPS = [
    { id: 1, name: 'Connect', description: 'Connect your digital services' },
    { id: 2, name: 'Configure', description: 'Choose privacy settings' },
    { id: 3, name: 'Generate', description: 'Create your instant twin' }
  ];

  // ====================================================================
  // CONNECTOR MANAGEMENT
  // ====================================================================

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
      console.log('🔍 Connect service called with:', { provider, user });

      // Use UUID as userId for database queries
      const userId = user?.id || 'demo-user';

      console.log('🔑 Using userId:', userId);

      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      // Get OAuth authorization URL from backend
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const apiUrl = `${baseUrl}/connectors/auth/${provider}?userId=${encodeURIComponent(userId)}`;
      console.log('🌐 Making request to:', apiUrl);
      console.log('🔑 API URL env var:', import.meta.env.VITE_API_URL);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('🌐 OAuth response:', result);

      if (result.success && result.data?.authUrl) {
        // REAL OAuth flow - redirect to Google OAuth
        console.log('🚀 Redirecting to OAuth URL:', result.data.authUrl);

        // Store the provider we're connecting so we can update UI after OAuth callback
        sessionStorage.setItem('connecting_provider', provider);


        // Redirect in same window for better OAuth flow
        window.location.href = result.data.authUrl;

        // Note: OAuth callback page will handle the success and redirect back
        console.log('🪟 OAuth redirect initiated, waiting for OAuth callback...');
      } else if (result.success) {
        // Test connection success (shouldn't happen in production)
        console.warn('⚠️ No OAuth URL received, connection may be in test mode');

        // Refetch status from database (no localStorage)
        await refetchPlatformStatus();

        toast({
          title: "⚠️ Test Connection",
          description: `${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name} test connection added (not real OAuth)`,
          variant: "default",
        });
      } else {
        throw new Error(result.error || 'Connection failed');
      }

    } catch (error: unknown) {
      console.error('Error connecting service:', error);
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

      console.log(`🔌 Disconnecting ${provider} for user ${userId}`);

      // Call backend disconnect API
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(
        `${baseUrl}/connectors/${provider}/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ ${provider} disconnected:`, result);

      // Refetch platform status from database (single source of truth)
      await refetchPlatformStatus();

      toast({
        title: "Disconnected",
        description: `${connectorName} has been disconnected`,
      });

    } catch (error: unknown) {
      console.error('Error disconnecting service:', error);
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

    // Check if user has actually connected at least one service
    if (connectedServices.length === 0) {
      toast({
        title: "No connections found",
        description: "Please connect at least one service before generating your twin.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    // Show simple loading toast
    toast({
      title: "Setting up your Soul Signature dashboard...",
      description: "Creating your digital twin structure",
    });

    // Create the digital twin record (lightweight operation)
    try {
      const twinData = {
        name: user.fullName || user.firstName || 'My Soul Signature',
        description: `Digital twin for ${user.fullName || user.firstName || 'user'}. Soul signature extraction ready.`,
        subject_area: 'Soul Signature Analysis',
        twin_type: 'personal',
        personality_traits: {
          openness: 0.5,
          conscientiousness: 0.5,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.5
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
      console.log('✅ Digital twin structure created:', { status: response.status, result });

      if (response.ok && (result.id || result.twin?.id)) {
        // Navigate directly to Soul Signature Dashboard
        // Actual data extraction will happen there when user clicks "Extract Soul Signature"
        toast({
          title: "Ready to extract your Soul Signature!",
          description: "Navigate to the dashboard to begin extraction.",
        });

        setTimeout(() => {
          navigate('/soul-signature');
        }, 500);
      } else {
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          result
        });
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

      // Still navigate to dashboard even on error (they might have an existing twin)
      setTimeout(() => {
        navigate('/soul-signature');
      }, 1000);
    }

  }, [user, connectedServices, navigate, toast]);

  // ====================================================================
  // RENDER HELPERS
  // ====================================================================

  // Step Indicator
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-12">
      <div className="flex items-center space-x-4">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => {
                // Only allow going back to previous steps or current step
                if (step.id <= currentStep) {
                  setCurrentStep(step.id);
                }
              }}
              className={`flex items-center justify-center w-10 h-10 rounded-full text-sm border-2 ${
                currentStep >= step.id
                  ? 'bg-[hsl(var(--claude-accent))] border-[hsl(var(--claude-accent))] text-white'
                  : 'bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))]'
              }`}
              style={{
                cursor: step.id <= currentStep ? 'pointer' : 'default',
                fontWeight: 500
              }}
              disabled={step.id > currentStep}
            >
              {currentStep > step.id ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                step.id
              )}
            </button>
            <div className="ml-3 text-sm">
              <div
                style={{
                  color: currentStep >= step.id ? 'hsl(var(--claude-text))' : '#6B7280',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em'
                }}
              >
                {step.name}
              </div>
              <div
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                {step.description}
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className="w-12 h-0.5 mx-4"
                style={{
                  backgroundColor: currentStep > step.id ? '#D97706' : 'rgba(20,20,19,0.1)'
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderConnectorCard = (connector: ConnectorConfig) => {
    const isSelected = selectedConnectors.includes(connector.provider);
    const isConnected = connectedServices.includes(connector.provider);

    return (
      <div
        key={connector.provider}
        className="relative p-6 rounded-2xl cursor-pointer border transition-all"
        style={{
          backgroundColor: 'hsl(var(--claude-surface))',
          borderColor: isConnected || isSelected ? 'hsl(var(--claude-accent))' : 'hsl(var(--claude-border))',
          borderWidth: isConnected || isSelected ? '2px' : '1px'
        }}
        onClick={() => !isConnected && handleConnectorToggle(connector.provider)}
      >
        {/* Connection status indicator */}
        {isConnected && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="rounded-full p-2" style={{ backgroundColor: '#D97706', color: 'white' }}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Service icon and name */}
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
                color: 'hsl(var(--claude-text))',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                letterSpacing: '-0.02em'
              }}
            >
              {connector.name}
            </h3>
            <p
              className="text-xs"
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              {connector.setupTime} setup
            </p>
          </div>
        </div>

        {/* Description */}
        <p
          className="text-sm mb-3 leading-relaxed"
          style={{
            color: '#6B7280',
            fontFamily: 'var(--_typography---font--tiempos)'
          }}
        >
          {connector.description}
        </p>

        {/* Data types */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-1">
            {connector.dataTypes.slice(0, 2).map((type, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded-full bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text-muted))]"
                style={{
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                {type}
              </span>
            ))}
            {connector.dataTypes.length > 2 && (
              <span
                className="text-xs px-2 py-1 rounded-full bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text-muted))]"
                style={{
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                +{connector.dataTypes.length - 2} more
              </span>
            )}
          </div>
        </div>

        {/* Connect Button */}
        {!isConnected && (
          <div className="mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                connectService(connector.provider);
              }}
              disabled={connectingProvider === connector.provider}
              className="btn-anthropic-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Connection Success State */}
        {isConnected && (
          <div className="mt-3 space-y-2">
            {/* Connected Badge */}
            <div
              className="p-3 rounded-xl border bg-[hsl(var(--claude-surface-raised))] border-[hsl(var(--claude-accent))]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[hsl(var(--claude-accent))]" />
                  <span
                    className="text-sm"
                    style={{
                      color: '#D97706',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Connected
                  </span>
                </div>

                {/* Disconnect Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnectService(connector.provider);
                  }}
                  disabled={disconnectingProvider === connector.provider}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[hsl(var(--claude-surface))] hover:bg-[hsl(var(--claude-surface-raised))] border border-red-200 dark:border-red-900"
                  style={{
                    color: '#EF4444',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    letterSpacing: '-0.02em'
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
      </div>
    );
  };

  const renderGenerationProgress = () => {
    if (!generationProgress) return null;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Show Extraction Progress if connectors are selected */}
        {selectedConnectors.length > 0 && showExtractionProgress && !extractionComplete && user && (
          <ExtractionProgressIndicator
            userId={user.id}
            platforms={selectedConnectors}
            onComplete={() => {
              console.log('✅ Extraction complete');
              setExtractionComplete(true);
            }}
          />
        )}

        {/* Show Twin Generation Progress */}
        <div className="text-center">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-4 relative">
              {/* Background circle */}
              <div
                className="absolute inset-0 rounded-full border-4"
                style={{ borderColor: 'rgba(20,20,19,0.1)' }}
              ></div>
              {/* Progress circle */}
              <svg className="absolute inset-0 w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - generationProgress.progress / 100)}`}
                />
              </svg>
              {/* Center icon */}
              <div className="absolute inset-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D97706' }}>
                <Brain className="w-8 h-8" style={{ color: 'white' }} />
              </div>
            </div>

            <h2
              className="text-2xl mb-2"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'hsl(var(--claude-text))'
              }}
            >
              {generationProgress.progress === 100 ? 'Your Soul Signature is Ready!' : 'Discovering Your Soul Signature'}
            </h2>

          <p
            className="mb-6"
            style={{
              color: '#6B7280',
              fontFamily: 'var(--_typography---font--tiempos)'
            }}
          >
            {generationProgress.currentTask}
          </p>

          {/* Progress bar */}
          <div className="max-w-md mx-auto mb-6">
            <div
              className="w-full rounded-full h-2"
              style={{ backgroundColor: '#F5F5F5' }}
            >
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${generationProgress.progress}%`,
                  backgroundColor: '#D97706'
                }}
              ></div>
            </div>
            <div className="flex justify-between text-sm mt-2" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              <span style={{ color: '#6B7280' }}>
                {generationProgress.progress}% complete
              </span>
              <span style={{ color: '#6B7280' }}>
                {generationProgress.estimatedTimeRemaining > 0
                  ? `${Math.ceil(generationProgress.estimatedTimeRemaining)}s remaining`
                  : 'Complete!'
                }
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
            <div className="text-center">
              <div
                className="text-2xl"
                style={{
                  color: '#D97706',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500
                }}
              >
                {generationProgress.connectorsConnected.length}
              </div>
              <div
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Services
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl"
                style={{
                  color: '#D97706',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500
                }}
              >
                {generationProgress.dataPointsIngested}
              </div>
              <div
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Data Points
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl"
                style={{
                  color: '#D97706',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500
                }}
              >
                {generationProgress.insightsGenerated}
              </div>
              <div
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Insights
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  // ====================================================================
  // MAIN RENDER
  // ====================================================================

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))]">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-[hsl(var(--claude-surface))]" style={{ borderColor: 'hsl(var(--claude-border))' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Back Navigation */}
            <button
              onClick={() => {
                if (currentStep > 1) {
                  setCurrentStep(currentStep - 1);
                } else {
                  navigate('/');
                }
              }}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-4 h-4" />
              {currentStep > 1 ? `Back to ${STEPS[currentStep - 2].name}` : 'Back to Home'}
            </button>

            <div className="text-center">
              <h1
                className="text-2xl"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Discover Your Soul Signature
              </h1>
              <p
                className="text-sm"
                style={{
                  color: 'hsl(var(--claude-text-muted))',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Connect your digital life to reveal your authentic essence
              </p>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <UserProfile />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Step 1: Connect Services */}
        {currentStep === 1 && (
          <div>
            {/* Hero Section */}
            <div className="text-center mb-16">

              <h2
                className="text-4xl md:text-5xl mb-6"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Discover Your Soul Signature
              </h2>

              <p
                className="text-base max-w-3xl mx-auto leading-relaxed"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                "Perhaps we are searching in the branches for what we only find in the roots." Connect your digital life - Netflix, Spotify, Discord, and 30+ platforms - to discover what makes you authentically you.
              </p>

              {/* Stats Row */}
              <div className="flex justify-center items-center gap-8 mt-8">
                <div className="text-center">
                  <div
                    className="text-2xl"
                    style={{
                      color: '#D97706',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500
                    }}
                  >
                    30+
                  </div>
                  <div
                    className="text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Platforms
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className="text-2xl"
                    style={{
                      color: '#D97706',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500
                    }}
                  >
                    100%
                  </div>
                  <div
                    className="text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Authentic
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className="text-2xl"
                    style={{
                      color: '#D97706',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500
                    }}
                  >
                    ∞
                  </div>
                  <div
                    className="text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Sharable
                  </div>
                </div>
              </div>
            </div>

            {/* Progressive Disclosure for Connectors */}
            <div className="mb-16">
              <h3
                className="text-2xl text-center mb-4"
                style={{
                  color: 'hsl(var(--claude-text))',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em'
                }}
              >
                Connect Your Soul's Digital Canvas
              </h3>
              <p
                className="text-center mb-8 max-w-2xl mx-auto"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Each platform reveals a different facet of your authentic self. Start with the ones that feel most "you."
              </p>

              {/* Essential Connectors First - Progressive Disclosure */}
              <div className="space-y-8">
                {/* Primary/Essential Connectors */}
                <div>
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <div
                      className="px-3 py-1 border rounded-full text-sm bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-accent))] text-[hsl(var(--claude-accent))]"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500
                      }}
                    >
                      Essential
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                    {AVAILABLE_CONNECTORS.slice(0, 3).map(renderConnectorCard)}
                  </div>
                </div>

                {/* Show More Button */}
                {!showAllConnectors && AVAILABLE_CONNECTORS.length > 3 && (
                  <div className="text-center">
                    <button
                      onClick={() => setShowAllConnectors(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border text-sm bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))] transition-colors"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Show {AVAILABLE_CONNECTORS.length - 3} More Options
                    </button>
                    <p
                      className="text-xs mt-2"
                      style={{
                        color: '#6B7280',
                        fontFamily: 'var(--_typography---font--tiempos)'
                      }}
                    >
                      Professional tools, social platforms, and more
                    </p>
                  </div>
                )}

                {/* Additional Connectors - Revealed Progressively */}
                {showAllConnectors && (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <div
                        className="px-3 py-1 border rounded-full text-sm bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text-muted))]"
                        style={{
                          fontFamily: 'var(--_typography---font--styrene-a)',
                          fontWeight: 500
                        }}
                      >
                        Optional
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                      {AVAILABLE_CONNECTORS.slice(3).map(renderConnectorCard)}
                    </div>

                    {/* Show Less Button */}
                    <div className="text-center mt-6">
                      <button
                        onClick={() => setShowAllConnectors(false)}
                        className="text-sm"
                        style={{
                          color: '#6B7280',
                          fontFamily: 'var(--_typography---font--tiempos)'
                        }}
                      >
                        Show less
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Data Verification Section */}
            {connectedServices.length > 0 && (
              <DataVerification
                userId={user?.id || 'demo-user'}
                connectedServices={connectedServices}
              />
            )}

            {/* Action Section */}
            <div
              className="text-center rounded-3xl p-8 border bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]"
            >
              {connectedServices.length > 0 ? (
                <div>
                  <div className="flex items-center justify-center gap-2 mb-4" style={{ color: '#D97706' }}>
                    <CheckCircle2 className="w-6 h-6" />
                    <span
                      className="text-lg"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500,
                        letterSpacing: '-0.02em'
                      }}
                    >
                      Perfect! {connectedServices.length} platform{connectedServices.length !== 1 ? 's' : ''} connected
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="btn-anthropic-primary text-lg px-8 py-4 flex items-center gap-3 mx-auto"
                  >
                    <Fingerprint className="w-5 h-5" />
                    Discover Your Soul Signature
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  <p
                    className="text-sm mt-3"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Your soul signature will emerge in moments
                  </p>
                </div>
              ) : (
                <div>
                  <div
                    className="text-lg mb-4"
                    style={{
                      color: 'hsl(var(--claude-text))',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Connect at least one platform to begin
                  </div>
                  <p
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Each connection reveals more depth in your soul signature
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Privacy Settings */}
        {currentStep === 2 && (
          <div>
            {/* Visual Privacy Header */}
            <div className="text-center mb-12">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D97706' }}>
                <Shield className="w-10 h-10" style={{ color: 'white' }} />
              </div>
              <h2
                className="text-3xl mb-4"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: '#141413'
                }}
              >
                Your Privacy Matters
              </h2>
              <p
                className="text-lg max-w-2xl mx-auto leading-relaxed"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Your soul signature is precious. We protect it with the highest standards while giving you complete control.
              </p>
            </div>

            {/* Visual Privacy Features */}
            <div className="max-w-4xl mx-auto mb-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Military Grade Encryption */}
                <div className="text-center p-6 rounded-2xl border bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[hsl(var(--claude-surface-raised))]">
                    <Shield className="w-8 h-8 text-[hsl(var(--claude-accent))]" />
                  </div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      color: 'hsl(var(--claude-text))',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Military-Grade Security
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    AES-256 encryption protects your data at every step
                  </p>
                </div>

                {/* You Control Everything */}
                <div className="text-center p-6 rounded-2xl border bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[hsl(var(--claude-surface-raised))]">
                    <Settings className="w-8 h-8 text-[hsl(var(--claude-accent))]" />
                  </div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      color: 'hsl(var(--claude-text))',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      letterSpacing: '-0.02em'
                    }}
                  >
                    You're In Control
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Choose what to reveal, what to share, with whom
                  </p>
                </div>

                {/* Zero Data Retention */}
                <div className="text-center p-6 rounded-2xl border bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[hsl(var(--claude-surface-raised))]">
                    <Eye className="w-8 h-8 text-[hsl(var(--claude-accent))]" />
                  </div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      color: 'hsl(var(--claude-text))',
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Complete Transparency
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    See exactly how your data creates your soul signature
                  </p>
                </div>
              </div>
            </div>

            {/* What Makes This Special */}
            <div className="max-w-2xl mx-auto mb-12 text-center">
              <div className="p-8 rounded-3xl border bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-accent))]">
                <h3
                  className="text-xl mb-4"
                  style={{
                    color: 'hsl(var(--claude-text))',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    letterSpacing: '-0.02em'
                  }}
                >
                  ✨ What makes this different?
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  Unlike other platforms that harvest your data, we discover your soul signature and then
                  <span style={{ color: '#D97706' }}> delete the raw data</span>.
                  You keep the insights, we keep nothing.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <button
                onClick={startTwinGeneration}
                className="btn-anthropic-primary flex items-center gap-3 mx-auto text-lg px-10 py-4"
              >
                <Sparkles className="w-6 h-6" />
                Reveal My Soul Signature
                <ArrowRight className="w-5 h-5" />
              </button>
              <p
                className="text-sm mt-4 max-w-md mx-auto"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Your authentic essence will emerge in moments, protected by the highest security standards
              </p>
            </div>
          </div>
        )}

        {/* Step 3: No longer used - we navigate directly to soul-signature dashboard */}
      </div>
    </div>
  );
};

export default InstantTwinOnboarding;