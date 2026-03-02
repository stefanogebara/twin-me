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
import { useDemo } from '@/contexts/DemoContext';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useToast } from '@/components/ui/use-toast';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  Sparkles
} from 'lucide-react';

import { DataVerification } from '../components/DataVerification';
import SoulRichnessBar from '../components/onboarding/SoulRichnessBar';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';

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
  'spotify': 'spotify',
  'youtube': 'youtube',
  'google-calendar': 'google-calendar',
};

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const InstantTwinOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDemoMode } = useDemo();
  const { trackFunnel } = useAnalytics();
  const { toast } = useToast();

  // Design system colors (light only)
  const colors = {
    textPrimary: '#000000',
    textSecondary: '#8A857D',
    muted: '#8A857D',
    categoryEntertainment: '#3b82f6',
    categorySocial: '#a855f7',
    categoryProfessional: '#78716c',
    categoryHealth: '#00A7E1',
    connected: '#8A857D',
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
  const [revealedArchetype, setRevealedArchetype] = useState<{
    archetype_name: string;
    signature_quote?: string;
    first_impression?: string;
    core_traits?: unknown[];
  } | null>(null);

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

      const healthPlatforms = ['oura'];
      // Entertainment platforms use direct OAuth via entertainment-connectors endpoints
      const entertainmentPlatforms = ['spotify', 'discord', 'youtube', 'netflix', 'hbo_max', 'prime_video', 'disney_plus', 'apple_music', 'apple_tv'];
      // Professional platforms that use Google OAuth scopes via entertainment-connectors
      const googlePlatforms = ['google_calendar', 'gmail'];
      // Arctic-managed platforms with built-in OAuth
      const arcticPlatforms = ['github', 'reddit', 'linkedin'];

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

      const fetchOptions: RequestInit = {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      };

      // Use standard connectors endpoint for disconnect
      const apiUrl = `${baseUrl}/connectors/${provider}/${encodeURIComponent(user.id)}`;

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
        // Advance to the archetype reveal step immediately
        setCurrentStep(3);

        // Fetch archetype (with 15s timeout) — show reveal step while we wait
        const VITE_API_URL = import.meta.env.VITE_API_URL;
        const sigController = new AbortController();
        const sigTimeout = setTimeout(() => sigController.abort(), 15000);
        fetch(`${VITE_API_URL}/onboarding/instant-signature`, {
          method: 'POST',
          signal: sigController.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            enrichmentContext: { answers: [], writingSamples: [] },
            calibrationInsights: [],
            connectedPlatforms: connectedServices,
          }),
        })
          .then(res => (res.ok ? res.json() : null))
          .then(sigData => {
            clearTimeout(sigTimeout);
            const sig = sigData?.signature ?? sigData?.archetype;
            if (sig?.archetype_name) {
              sessionStorage.setItem('instant_archetype', JSON.stringify(sig));
              setRevealedArchetype(sig);
            } else {
              // No archetype returned — navigate directly
              navigate('/soul-signature');
            }
          })
          .catch(() => {
            clearTimeout(sigTimeout);
            navigate('/soul-signature');
          });
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
    }
  }, [user, connectedServices, navigate, toast]);

  const DEMO_CONNECTED_PROVIDERS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin'];

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
    theme: 'light',
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
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)'
          }}
        >
          <Info className="w-5 h-5 flex-shrink-0" style={{ color: '#FBBF24' }} />
          <p className="text-sm" style={{ color: colors.textSecondary, fontFamily: 'var(--font-body)' }}>
            You're in demo mode. All 5 platforms are shown as connected with sample data. Sign up to connect your real platforms.
          </p>
        </div>
      )}

      {currentStep > 1 && currentStep < 3 && (
        <div className="mb-8">
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
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
              className="btn-cta-app flex items-center gap-2 px-4 py-2 text-sm"
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              Continue to Dashboard
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </GlassPanel>
      )}

      {currentStep === 3 && (
        <div className="flex flex-col items-center justify-center py-16 min-h-[60vh]">
          {!revealedArchetype ? (
            // Loading — waiting for instant-signature to return
            <motion.div
              className="flex flex-col items-center gap-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative w-28 h-28">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: 'rgba(12, 10, 9, 0.06)' }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.2, 0.8] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute inset-3 rounded-full"
                  style={{ backgroundColor: 'rgba(12, 10, 9, 0.08)' }}
                  animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.15, 0.6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                />
                <div
                  className="absolute inset-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#0c0a09' }}
                >
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles className="w-7 h-7" style={{ color: '#FAFAFA' }} />
                  </motion.div>
                </div>
              </div>

              <div className="text-center space-y-2">
                <h2
                  className="text-2xl"
                  style={{ color: colors.textPrimary, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
                >
                  Discovering your archetype...
                </h2>
                <p
                  className="text-sm"
                  style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
                >
                  Weaving your digital footprint into a soul signature
                </p>
              </div>

              <div className="flex gap-1.5">
                {[0, 0.3, 0.6].map((delay, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: colors.muted }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            // Archetype revealed
            <motion.div
              className="w-full max-w-lg"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <GlassPanel>
                {/* Label */}
                <div className="text-center mb-6">
                  <p
                    className="text-[10px] uppercase tracking-[0.2em] mb-4"
                    style={{ color: colors.muted, fontFamily: 'var(--font-ui)' }}
                  >
                    Your Soul Archetype
                  </p>

                  {/* Archetype name */}
                  <h2
                    className="text-4xl mb-2"
                    style={{ color: colors.textPrimary, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
                  >
                    {revealedArchetype.archetype_name}
                  </h2>

                  {revealedArchetype.signature_quote && (
                    <p
                      className="text-sm italic"
                      style={{ color: colors.textSecondary, fontFamily: 'var(--font-body)' }}
                    >
                      {revealedArchetype.signature_quote}
                    </p>
                  )}
                </div>

                {/* Defining traits */}
                {Array.isArray(revealedArchetype.core_traits) && revealedArchetype.core_traits.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mb-6">
                    {revealedArchetype.core_traits.slice(0, 5).map((trait, i) => {
                      const label = typeof trait === 'string' ? trait : (trait as { trait?: string })?.trait ?? '';
                      if (!label) return null;
                      return (
                        <motion.span
                          key={i}
                          className="px-3 py-1 rounded-full text-xs"
                          style={{
                            backgroundColor: 'rgba(12, 10, 9, 0.06)',
                            color: colors.textSecondary,
                            fontFamily: 'var(--font-body)',
                          }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 + i * 0.07 }}
                        >
                          {label}
                        </motion.span>
                      );
                    })}
                  </div>
                )}

                {/* Narrative */}
                {revealedArchetype.first_impression && (
                  <motion.p
                    className="text-sm leading-relaxed text-center mb-8"
                    style={{ color: colors.textSecondary, fontFamily: 'var(--font-body)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    {revealedArchetype.first_impression}
                  </motion.p>
                )}

                {/* CTA */}
                <div className="text-center">
                  <motion.button
                    onClick={() => navigate('/soul-signature')}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-[14px] font-medium"
                    style={{
                      backgroundColor: '#0c0a09',
                      color: '#FAFAFA',
                      fontFamily: 'var(--font-ui)',
                    }}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    Enter your Twin
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </GlassPanel>
            </motion.div>
          )}
        </div>
      )}

      {currentStep === 1 && (
        <div className="space-y-8">
          <SoulRichnessBar connectedPlatforms={activeConnections} />

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

          {/* Upload historical data exports */}
          {user && (
            <GlassPanel>
              <div className="mb-4">
                <h3
                  className="text-base mb-1"
                  style={{ color: colors.textPrimary, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
                >
                  Upload historical data
                </h3>
              </div>
              <DataUploadPanel userId={user.id} />
            </GlassPanel>
          )}

          {connectedServices.length > 0 && (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                {expiredConnections.length > 0 ? (
                  <svg className="w-5 h-5" style={{ color: '#8A857D' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <motion.button
                onClick={startTwinGeneration}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-medium transition-all hover:opacity-90 disabled:opacity-60"
                style={{
                  backgroundColor: '#0c0a09',
                  color: '#FAFAFA',
                  fontFamily: 'var(--font-ui)',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                }}
                whileHover={!isGenerating ? { scale: 1.03, y: -1 } : {}}
                whileTap={!isGenerating ? { scale: 0.97 } : {}}
              >
                {isGenerating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="w-4 h-4" />
                    </motion.div>
                    Discovering your archetype...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Reveal Your Soul Archetype
                  </>
                )}
              </motion.button>
              <button
                onClick={() => navigate('/dashboard')}
                className="text-xs mt-3 hover:opacity-70 transition-opacity"
                style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
              >
                Skip — go straight to dashboard →
              </button>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
};

export default InstantTwinOnboarding;
