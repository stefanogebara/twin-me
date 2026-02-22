/**
 * InstantTwinOnboarding - Connect Your Platforms
 *
 * Lorix minimal design implementation with PageLayout and GlassPanel
 * Connects your digital life to discover and share your authentic soul signature
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useToast } from '@/components/ui/use-toast';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info
} from 'lucide-react';

import { DataVerification } from '../components/DataVerification';

import {
  DataProvider
} from '@/types/data-integration';

import { AVAILABLE_CONNECTORS } from './onboarding/components/connectorConfig';
import { PlatformCategorySection } from './onboarding/components/PlatformCategorySection';

// ====================================================================
// MODULE-LEVEL CONSTANTS
// ====================================================================

const NANGO_PROVIDER_MAP: Record<string, string> = {
  'linkedin': 'linkedin',
  'github': 'github',
  'reddit': 'reddit',
  'whoop': 'whoop',
  'spotify': 'spotify',
  'youtube': 'youtube',
  'twitch': 'twitch',
  'google-calendar': 'google-calendar',
};

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const InstantTwinOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { isDemoMode } = useDemo();
  const { trackFunnel } = useAnalytics();
  const { toast } = useToast();

  // Lorix design system colors
  const colors = {
    textPrimary: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
    muted: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    categoryEntertainment: '#3b82f6',
    categorySocial: '#a855f7',
    categoryProfessional: '#78716c',
    categoryHealth: '#00A7E1',
    connected: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e', // Subtle gray instead of green
  };

  const {
    data: platformStatusData,
    connectedProviders,
    refetch: refetchPlatformStatus,
    optimisticDisconnect,
    revertOptimisticUpdate
  } = usePlatformStatus(user?.id);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnectors, setSelectedConnectors] = useState<DataProvider[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<DataProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<DataProvider | null>(null);
  const [showProfessionalPlatforms, setShowProfessionalPlatforms] = useState(true);

  const connectedServices = connectedProviders as DataProvider[];

  // Calculate truly active connections (excluding expired tokens)
  const activeConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    const isNotExpired = !status?.tokenExpired && status?.status !== 'token_expired';
    return isNotExpired;
  });
  const expiredConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    const isExpired = status?.tokenExpired || status?.status === 'token_expired';
    return isExpired;
  });

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
    if (isDemoMode) {
      toast({
        title: "Demo Mode",
        description: "Sign up to connect real platforms",
      });
      return;
    }

    setConnectingProvider(provider);
    try {
      const userId = user?.id || 'demo-user';
      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      // Use health connector route for health platforms (oura only - whoop uses Arctic)
      const healthPlatforms = ['oura'];
      // Entertainment platforms use direct OAuth via entertainment-connectors endpoints
      const entertainmentPlatforms = ['spotify', 'discord', 'youtube', 'twitch', 'netflix', 'hbo_max', 'prime_video', 'disney_plus', 'apple_music', 'apple_tv'];
      // Professional platforms that use Google OAuth scopes via entertainment-connectors
      const googlePlatforms = ['google_calendar', 'gmail'];
      // Arctic-managed platforms with built-in OAuth
      const arcticPlatforms = ['whoop', 'github', 'reddit', 'linkedin'];

      let apiUrl: string;
      let fetchOptions: RequestInit = {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      };

      if (entertainmentPlatforms.includes(provider as string) || googlePlatforms.includes(provider as string)) {
        // Use direct entertainment-connectors OAuth (PKCE + encrypted state)
        apiUrl = `${baseUrl}/entertainment/connect/${provider}`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ userId })
        };
      } else if (healthPlatforms.includes(provider as string)) {
        apiUrl = `${baseUrl}/health/connect/${provider}?userId=${encodeURIComponent(userId)}`;
      } else if (arcticPlatforms.includes(provider as string)) {
        apiUrl = `${baseUrl}/arctic/connect/${provider}?userId=${encodeURIComponent(userId)}`;
      } else {
        // Fallback to arctic connector
        apiUrl = `${baseUrl}/arctic/connect/${provider}?userId=${encodeURIComponent(userId)}`;
      }

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.authUrl) {
        trackFunnel('platform_connect_initiated', { platform: provider });
        sessionStorage.setItem('connecting_provider', provider);
        window.location.href = result.authUrl;
      } else if (result.success && result.connectUrl) {
        // Open Nango Connect in a centered popup instead of full-page redirect
        const width = 600, height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          result.connectUrl,
          'nango-connect',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
        );

        if (!popup) {
          // Popup was blocked - fall back to redirect
          sessionStorage.setItem('connecting_provider', provider);
          window.location.href = result.connectUrl;
          return;
        }

        // Poll for popup close, then verify connection
        const pollInterval = setInterval(async () => {
          if (!popup || popup.closed) {
            clearInterval(pollInterval);

            const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
            try {
              const verifyResponse = await fetch(`${baseUrl}/nango/verify-connection`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ integrationId: nangoIntegrationId })
              });
              const verifyResult = await verifyResponse.json();

              if (verifyResult.success && verifyResult.connected) {
                toast({
                  title: "Connected Successfully",
                  description: `${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name} is now connected`,
                });
                await refetchPlatformStatus();
              } else {
                toast({
                  title: "Connection not completed",
                  description: "The connection window was closed. Try again if needed.",
                  variant: "default",
                });
              }
            } catch (err) {
              console.error('Failed to verify connection:', err);
            } finally {
              setConnectingProvider(null);
            }
          }
        }, 500);

        return; // Prevent finally block from clearing connectingProvider early
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

    const connectorName = AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name;

    // Optimistically update UI immediately for instant feedback
    optimisticDisconnect(provider);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      let apiUrl: string;
      let fetchOptions: RequestInit = {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      };

      // Use standard connectors endpoint for disconnect
      apiUrl = `${baseUrl}/connectors/${provider}/${encodeURIComponent(user.id)}`;

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Confirm optimistic update by refetching (optional, for data consistency)
      await refetchPlatformStatus();

      toast({
        title: "Disconnected",
        description: `${connectorName} has been disconnected`,
      });
    } catch (error: unknown) {
      // Revert optimistic update on failure
      await revertOptimisticUpdate();

      const errorMsg = error instanceof Error ? error.message : 'Disconnect failed';
      toast({
        title: "Disconnect failed",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setDisconnectingProvider(null);
    }
  }, [user, toast, refetchPlatformStatus, optimisticDisconnect, revertOptimisticUpdate]);

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

        // Generate instant soul signature archetype (non-blocking — failure doesn't block navigation)
        try {
          const instantSigRes = await fetch(`${import.meta.env.VITE_API_URL}/onboarding/instant-signature`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              enrichmentContext: {
                answers: [],
                writingSamples: [],
              },
              calibrationInsights: '',
              connectedPlatforms: connectedServices,
            }),
          });

          if (instantSigRes.ok) {
            const sigData = await instantSigRes.json();
            if (sigData.archetype?.archetype_name) {
              sessionStorage.setItem('instant_archetype', JSON.stringify(sigData.archetype));
            }
          }
        } catch (err) {
          console.warn('[Onboarding] instant-signature failed (non-blocking):', err);
        }

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

  const DEMO_CONNECTED_PROVIDERS = ['spotify', 'google_calendar', 'whoop'];

  // Sort connectors - connected ones first
  const sortConnectors = (connectors: typeof AVAILABLE_CONNECTORS) => {
    return [...connectors].sort((a, b) => {
      const aConnected = connectedServices.includes(a.provider);
      const bConnected = connectedServices.includes(b.provider);
      if (aConnected && !bConnected) return -1;
      if (!aConnected && bConnected) return 1;
      return 0;
    });
  };

  const entertainmentConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'entertainment'));
  const healthConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'health'));
  const socialConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'social'));
  const professionalConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'professional'));

  const categoryProps = {
    connectedServices,
    isDemoMode,
    demoConnectedProviders: DEMO_CONNECTED_PROVIDERS,
    platformStatusData,
    connectingProvider,
    disconnectingProvider,
    theme,
    colors,
    onConnect: connectService,
    onDisconnect: disconnectService,
  };

  return (
    <PageLayout
      title="Connect Your Platforms"
      subtitle="Link your digital footprints to build your soul signature"
      maxWidth="xl"
      padding="lg"
    >
      {isDemoMode && (
        <div
          className="rounded-2xl p-4 flex items-center gap-3 mb-6"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.1)',
            border: `1px solid ${theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.3)'}`
          }}
        >
          <Info className="w-5 h-5 flex-shrink-0" style={{ color: '#FBBF24' }} />
          <p className="text-sm" style={{ color: colors.textSecondary, fontFamily: 'var(--font-body)' }}>
            You're in demo mode. Spotify, Calendar, and Whoop are shown as connected with sample data. Sign up to connect your real platforms.
          </p>
        </div>
      )}

      {currentStep > 1 && (
        <div className="mb-8">
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(0, 0, 0, 0.05)',
              color: colors.textPrimary
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {STEPS[currentStep - 2].name}
          </button>
        </div>
      )}

      {connectedServices.length > 0 && (
        <GlassPanel className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: expiredConnections.length > 0 ? '#f59e0b' : colors.connected }}
              >
                {expiredConnections.length > 0 ? (
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <p
                  className="text-sm"
                  style={{ color: colors.textPrimary, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
                >
                  {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
                  {expiredConnections.length > 0 && (
                    <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                      ({expiredConnections.length} need{expiredConnections.length === 1 ? 's' : ''} reconnection)
                    </span>
                  )}
                </p>
                <p
                  className="text-xs"
                  style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
                >
                  {expiredConnections.length > 0
                    ? 'Reconnect expired platforms below for full access'
                    : 'Ready to discover your soul signature'}
                </p>
              </div>
            </div>
            <motion.button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
              style={{
                backgroundColor: colors.connected,
                color: 'white',
                fontFamily: 'var(--font-body)',
                fontWeight: 500
              }}
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              Continue to Dashboard
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </GlassPanel>
      )}

      {currentStep === 1 && (
        <div className="space-y-8">
          <PlatformCategorySection
            categoryName="Entertainment"
            categorySubtext="Music, videos, streaming"
            categoryColor={colors.categoryEntertainment}
            connectors={entertainmentConnectors}
            animationDelay={0.1}
            dotDelay={0.2}
            {...categoryProps}
          />

          <PlatformCategorySection
            categoryName="Health"
            categorySubtext="Recovery, sleep, fitness"
            categoryColor={colors.categoryHealth}
            connectors={healthConnectors}
            animationDelay={0.2}
            dotDelay={0.3}
            {...categoryProps}
          />

          <PlatformCategorySection
            categoryName="Social"
            categorySubtext="Communities, discussions"
            categoryColor={colors.categorySocial}
            connectors={socialConnectors}
            animationDelay={0.3}
            dotDelay={0.4}
            {...categoryProps}
          />

          <PlatformCategorySection
            categoryName="Professional"
            categorySubtext="Work, coding, email"
            categoryColor={colors.categoryProfessional}
            connectors={professionalConnectors}
            animationDelay={0.4}
            dotDelay={0.5}
            {...categoryProps}
          />

          {connectedServices.length > 0 && (
            <DataVerification
              userId={user?.id || 'demo-user'}
              connectedServices={connectedServices}
            />
          )}

          {connectedServices.length > 0 && (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                {expiredConnections.length > 0 ? (
                  <svg className="w-5 h-5" style={{ color: '#C1C0B6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <CheckCircle2 className="w-5 h-5" style={{ color: colors.muted }} />
                )}
                <span
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: colors.textSecondary
                  }}
                >
                  {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
                  {expiredConnections.length > 0 && (
                    <span style={{ color: '#f59e0b', marginLeft: '6px' }}>
                      ({expiredConnections.length} expired)
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#FAFAFA',
                  fontFamily: 'var(--font-ui)'
                }}
              >
                Continue to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
              <p
                className="text-sm mt-3"
                style={{
                  color: colors.muted,
                  fontFamily: 'var(--font-body)'
                }}
              >
                {expiredConnections.length > 0
                  ? 'Reconnect expired platforms for full functionality'
                  : 'Your twin insights are ready to explore'}
              </p>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
};

export default InstantTwinOnboarding;
