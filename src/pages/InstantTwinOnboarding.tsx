/**
 * InstantTwinOnboarding - Connect Your Platforms
 *
 * Typography-driven design — no glass panels, no PageLayout wrapper
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useToast } from '@/components/ui/use-toast';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  CheckCircle2,
  Info,
  Loader2,
  ArrowRight,
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
  'github': 'github-getting-started',
  'reddit': 'reddit',
  'spotify': 'spotify',
  'youtube': 'youtube',
  'google-calendar': 'google-calendar',
  'strava': 'strava',
  'fitbit': 'fitbit',
  'garmin': 'garmin',
  'twitch': 'twitch',
  'microsoft_outlook': 'outlook',
};

// ====================================================================
// SUB-COMPONENTS
// ====================================================================

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <span
    className="text-[11px] font-medium tracking-widest uppercase block mb-5"
    style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
  >
    {label}
  </span>
);

const Divider: React.FC = () => (
  <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
);

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const InstantTwinOnboarding = () => {
  useDocumentTitle('Connect Platforms');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDemoMode } = useDemo();
  const { trackFunnel } = useAnalytics();
  const { toast } = useToast();

  const colors = {
    textPrimary: 'var(--foreground)',
    textSecondary: 'var(--text-secondary)',
    muted: 'var(--text-secondary)',
    categoryEntertainment: '#3b82f6',
    categorySocial: '#a855f7',
    categoryProfessional: '#78716c',
    categoryHealth: '#00A7E1',
    categoryBrowsing: 'rgba(255,255,255,0.6)',
    connected: 'var(--text-secondary)',
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
  const [revealedArchetype, setRevealedArchetype] = useState<{
    archetype_name: string;
    signature_quote?: string;
    first_impression?: string;
    core_traits?: unknown[];
  } | null>(null);

  const connectedServices = connectedProviders as DataProvider[];

  const activeConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    return !status?.tokenExpired && status?.status !== 'token_expired';
  });
  const expiredConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    return status?.tokenExpired || status?.status === 'token_expired';
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
      const entertainmentPlatforms = ['spotify', 'discord', 'youtube', 'netflix', 'hbo_max', 'prime_video', 'disney_plus', 'apple_tv', 'reddit', 'linkedin', 'github'];
      const googlePlatforms = ['google_calendar', 'google_gmail'];
      const arcticPlatforms: string[] = [];
      const nangoPlatforms = ['strava', 'fitbit', 'garmin', 'microsoft_outlook'];

      let apiUrl: string;
      let fetchOptions: RequestInit = {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      };

      if (nangoPlatforms.includes(provider as string)) {
        const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
        apiUrl = `${baseUrl}/nango/connect-session`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ integrationId: nangoIntegrationId })
        };
      } else if (entertainmentPlatforms.includes(provider as string) || googlePlatforms.includes(provider as string)) {
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
        const width = 600, height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          result.connectUrl,
          'nango-connect',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
        );

        if (!popup) {
          sessionStorage.setItem('connecting_provider', provider);
          window.location.href = result.connectUrl;
          return;
        }

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

        return;
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
  }, [toast, user, refetchPlatformStatus, isDemoMode, trackFunnel]);

  const disconnectService = useCallback(async (provider: DataProvider) => {
    if (!user) return;
    setDisconnectingProvider(provider);

    const connectorName = AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name;

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

      const apiUrl = `${baseUrl}/connectors/${provider}/${encodeURIComponent(user.id)}`;

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await refetchPlatformStatus();

      toast({
        title: "Disconnected",
        description: `${connectorName} has been disconnected`,
      });
    } catch (error: unknown) {
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
        setCurrentStep(2);

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

  const sortConnectors = (connectors: typeof AVAILABLE_CONNECTORS) => {
    return [...connectors].sort((a, b) => {
      const aConnected = connectedServices.includes(a.provider);
      const bConnected = connectedServices.includes(b.provider);
      if (aConnected && !bConnected) return -1;
      if (!aConnected && bConnected) return 1;
      return 0;
    });
  };

  const availableConnectors = AVAILABLE_CONNECTORS.filter(c => !c.comingSoon);
  const browsingConnectors = sortConnectors(availableConnectors.filter(c => c.category === 'browsing'));
  const entertainmentConnectors = sortConnectors(availableConnectors.filter(c => c.category === 'entertainment'));
  const healthConnectors = sortConnectors(availableConnectors.filter(c => c.category === 'health'));
  const socialConnectors = sortConnectors(availableConnectors.filter(c => c.category === 'social'));
  const professionalConnectors = sortConnectors(availableConnectors.filter(c => c.category === 'professional'));

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
    <div className="max-w-[680px] mx-auto px-6 py-16">

      {/* Header */}
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Connect Your Platforms
      </h1>
      <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Link your digital footprints to build your soul signature
      </p>

      {/* Demo notice */}
      {isDemoMode && (
        <div
          className="flex items-center gap-2 mb-8 text-sm"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>Demo mode — all platforms shown as connected with sample data.</span>
        </div>
      )}

      {/* Connection status */}
      {connectedServices.length > 0 && currentStep === 1 && (
        <div
          className="flex items-center gap-3 mb-8 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <CheckCircle2
            className="w-4 h-4 flex-shrink-0"
            style={{ color: expiredConnections.length > 0 ? 'rgba(255,255,255,0.5)' : '#10b77f' }}
          />
          <div>
            <span className="text-sm" style={{ color: 'var(--foreground)' }}>
              {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
            </span>
            {expiredConnections.length > 0 && (
              <span className="text-sm ml-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                ({expiredConnections.length} need{expiredConnections.length === 1 ? 's' : ''} reconnection)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Archetype reveal */}
      {currentStep === 2 && (
        <div className="flex flex-col items-center justify-center py-16">
          {!revealedArchetype ? (
            <div className="flex flex-col items-center gap-6">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10b77f' }} />
              <div className="text-center">
                <h2
                  className="text-xl mb-2"
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontWeight: 400,
                    color: 'var(--foreground)',
                  }}
                >
                  Discovering your archetype...
                </h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Weaving your digital footprint into a soul signature
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-lg text-center">
              <span
                className="text-[11px] font-medium tracking-widest uppercase block mb-4"
                style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
              >
                Your Soul Archetype
              </span>

              <h2
                className="text-3xl mb-3"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontStyle: 'italic',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--foreground)',
                }}
              >
                {revealedArchetype.archetype_name}
              </h2>

              {revealedArchetype.signature_quote && (
                <p className="text-sm italic mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {revealedArchetype.signature_quote}
                </p>
              )}

              {Array.isArray(revealedArchetype.core_traits) && revealedArchetype.core_traits.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {revealedArchetype.core_traits.slice(0, 5).map((trait, i) => {
                    const label = typeof trait === 'string' ? trait : (trait as { trait?: string })?.trait ?? '';
                    if (!label) return null;
                    return (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full text-xs"
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}

              {revealedArchetype.first_impression && (
                <p
                  className="text-sm leading-relaxed mb-8"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  {revealedArchetype.first_impression}
                </p>
              )}

              <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

              <button
                onClick={() => navigate('/soul-signature')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: '#10b77f',
                  color: '#0a0f0a',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Enter your Twin
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Platform connections */}
      {currentStep === 1 && (
        <div className="space-y-8">
          <SoulRichnessBar connectedPlatforms={activeConnections} />

          <SectionLabel label="Browsing" />
          <PlatformCategorySection
            categoryName="Browsing"
            categorySubtext="Universal web tracking"
            categoryColor={colors.categoryBrowsing}
            connectors={browsingConnectors}
            animationDelay={0}
            dotDelay={0}
            {...categoryProps}
          />

          <SectionLabel label="Entertainment" />
          <PlatformCategorySection
            categoryName="Entertainment"
            categorySubtext="Music, videos, streaming"
            categoryColor={colors.categoryEntertainment}
            connectors={entertainmentConnectors}
            animationDelay={0}
            dotDelay={0}
            {...categoryProps}
          />

          <SectionLabel label="Health" />
          <PlatformCategorySection
            categoryName="Health"
            categorySubtext="Recovery, sleep, fitness"
            categoryColor={colors.categoryHealth}
            connectors={healthConnectors}
            animationDelay={0}
            dotDelay={0}
            {...categoryProps}
          />

          <SectionLabel label="Social" />
          <PlatformCategorySection
            categoryName="Social"
            categorySubtext="Communities, discussions"
            categoryColor={colors.categorySocial}
            connectors={socialConnectors}
            animationDelay={0}
            dotDelay={0}
            {...categoryProps}
          />

          <SectionLabel label="Professional" />
          <PlatformCategorySection
            categoryName="Professional"
            categorySubtext="Work, coding, email"
            categoryColor={colors.categoryProfessional}
            connectors={professionalConnectors}
            animationDelay={0}
            dotDelay={0}
            {...categoryProps}
          />

          {connectedServices.length > 0 && (
            <DataVerification
              userId={user?.id || 'demo-user'}
              connectedServices={connectedServices}
            />
          )}

          {/* Upload historical data */}
          {user && (
            <>
              <Divider />
              <SectionLabel label="Upload Historical Data" />
              <DataUploadPanel userId={user.id} />
            </>
          )}

          {/* Generate CTA */}
          {connectedServices.length > 0 && (
            <>
              <Divider />
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
                    {expiredConnections.length > 0 && (
                      <span className="ml-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        ({expiredConnections.length} expired)
                      </span>
                    )}
                  </span>
                </div>
                <button
                  onClick={startTwinGeneration}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: '#10b77f',
                    color: '#0a0f0a',
                    fontFamily: "'Inter', sans-serif",
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Discovering your archetype...
                    </>
                  ) : (
                    <>
                      Reveal Your Soul Archetype
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default InstantTwinOnboarding;
