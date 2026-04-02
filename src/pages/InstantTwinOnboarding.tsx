/**
 * InstantTwinOnboarding - Connect Your Platforms
 *
 * Typography-driven design — no glass panels, no PageLayout wrapper
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { getAccessToken, authFetch } from '@/services/api/apiBase';
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
import GoogleWorkspaceConnect from './components/settings/GoogleWorkspaceConnect';

import {
  DataProvider
} from '@/types/data-integration';

import { AVAILABLE_CONNECTORS } from './onboarding/components/connectorConfig';
import { PlatformCategorySection } from './onboarding/components/PlatformCategorySection';
import { PlatformTile } from './onboarding/components/PlatformTile';

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
  'whoop': 'whoop',
  'oura': 'oura',
  'microsoft_outlook': 'outlook',
};

// ====================================================================
// SUB-COMPONENTS
// ====================================================================

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <span
    className="text-[12px] font-medium tracking-[0.08em] uppercase block mb-4"
    style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
  >
    {label}
  </span>
);

const Divider: React.FC = () => (
  <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
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
    categoryBrowsing: 'var(--accent-vibrant)',
    connected: 'var(--text-secondary)',
  };

  const {
    data: platformStatusData,
    connectedProviders,
    refetch: refetchPlatformStatus,
    optimisticDisconnect,
    revertOptimisticUpdate
  } = usePlatformStatus(user?.id);

  // Fetch discovered platforms from enrichment (Holehe + breach data)
  const { data: enrichmentData } = useQuery({
    queryKey: ['enrichment', 'discovered-platforms', user?.id],
    queryFn: async () => {
      const res = await authFetch(`/enrichment/status/${user?.id}`);
      if (!res.ok) return null;
      const json = await res.json();
      const profile = json.data || {};
      return {
        discoveredPlatforms: profile.discovered_platforms || [],
        breachIntegrations: profile.breach_mapped_integrations || [],
      };
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user && !isDemoMode,
  });

  // Platforms we found the user on (for "We found your account" badges)
  const discoveredSet = new Set([
    ...(enrichmentData?.discoveredPlatforms || []).map((p: string) => p.toLowerCase()),
    ...(enrichmentData?.breachIntegrations || []).map((p: string) => p.toLowerCase()),
  ]);

  const [demoModalPlatform, setDemoModalPlatform] = useState<string | null>(null);
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
      trackFunnel('demo_mode_platform_click', { platform: provider });
      setDemoModalPlatform(provider);
      return;
    }

    // Handle external URL connectors (e.g. Browser Extension → Chrome Web Store)
    const connector = AVAILABLE_CONNECTORS.find(c => c.provider === provider);
    if (connector?.externalUrl) {
      trackFunnel('platform_external_link', { platform: provider });
      window.open(connector.externalUrl, '_blank');
      setConnectingProvider(null);
      return;
    }

    setConnectingProvider(provider);
    try {
      const userId = user?.id || 'demo-user';
      toast({
        title: "Connecting...",
        description: `Redirecting to ${connector?.name || provider}`,
      });

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

      // Platform routing: each platform goes to its correct backend endpoint
      // Entertainment (direct OAuth): spotify, discord, youtube, reddit, linkedin, github, strava, oura, slack
      // Google (direct OAuth): google_calendar, google_gmail
      // Nango (managed OAuth): fitbit, garmin, microsoft_outlook, whoop, twitch
      const googlePlatforms = ['google_calendar', 'google_gmail'];
      const nangoPlatforms = ['fitbit', 'garmin', 'microsoft_outlook', 'whoop', 'twitch'];

      let apiUrl: string;
      let fetchOptions: RequestInit;
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`,
      };

      if (nangoPlatforms.includes(provider as string)) {
        const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
        apiUrl = `${baseUrl}/nango/connect-session`;
        fetchOptions = {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ integrationId: nangoIntegrationId }),
        };
      } else {
        // All other platforms use entertainment connect (including Google, oura, strava, slack)
        apiUrl = `${baseUrl}/entertainment/connect/${provider}`;
        fetchOptions = {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ userId }),
        };
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
          trackFunnel('oauth_popup_blocked', { platform: provider });
          sessionStorage.setItem('connecting_provider', provider);
          window.location.href = result.connectUrl;
          return;
        }

        const platformName = AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name || provider;
        let retryCount = 0;
        const maxRetries = 3;

        const verifyConnection = async () => {
          const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
          try {
            const verifyResponse = await fetch(`${baseUrl}/nango/verify-connection`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`
              },
              body: JSON.stringify({ integrationId: nangoIntegrationId })
            });
            const verifyResult = await verifyResponse.json();

            if (verifyResult.success && verifyResult.connected) {
              toast({ title: 'Connected', description: `${platformName} is now connected` });
              trackFunnel('platform_connection_verified', { platform: provider, retries: retryCount });
              await refetchPlatformStatus();
              setConnectingProvider(null);
              return;
            }

            // Not connected — retry
            if (retryCount < maxRetries) {
              retryCount++;
              trackFunnel('platform_connection_verify_retry', { platform: provider, attempt: retryCount });
              setTimeout(verifyConnection, 1500);
              return;
            }

            // Max retries exhausted
            toast({
              title: 'Connection not verified',
              description: `${platformName} authorization may not have completed. Try again.`,
              variant: 'destructive',
            });
            trackFunnel('platform_connection_verify_failed', { platform: provider, retries: maxRetries });
            setConnectingProvider(null);
          } catch (err) {
            console.error('Verify failed:', err);
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(verifyConnection, 1500);
              return;
            }
            toast({
              title: 'Network error',
              description: 'Unable to verify connection. Check your internet and try again.',
              variant: 'destructive',
            });
            trackFunnel('platform_connection_network_error', { platform: provider });
            setConnectingProvider(null);
          }
        };

        const pollInterval = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(pollInterval);
            toast({ title: 'Verifying connection...', description: `Checking ${platformName} authorization` });
            verifyConnection();
          }
        }, 500);

        // Safety: if popup open > 2 min, assume abandoned
        setTimeout(() => {
          clearInterval(pollInterval);
          if (popup && !popup.closed) popup.close();
          trackFunnel('platform_connection_abandoned', { platform: provider });
          setConnectingProvider(null);
        }, 120000);

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
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

      const fetchOptions: RequestInit = {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`
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
    if (!user || connectedServices.length === 0) return;

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

      const token = getAccessToken() || localStorage.getItem('auth_token');
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
      // Discovered platforms (from enrichment) sort higher
      const aDiscovered = discoveredSet.has(a.provider);
      const bDiscovered = discoveredSet.has(b.provider);
      if (aDiscovered && !bDiscovered) return -1;
      if (!aDiscovered && bDiscovered) return 1;
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
    discoveredPlatforms: discoveredSet,
  };

  return (
    <><div className="max-w-[680px] mx-auto px-6 py-16">

      {/* Header */}
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '32px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.03em',
        }}
      >
        Connect Your Platforms
      </h1>
      <p
        className="text-[14px] leading-relaxed mb-10"
        style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Link your digital footprints to build your soul signature
      </p>

      {/* Demo notice */}
      {isDemoMode && (
        <div
          className="flex items-center gap-2 mb-8 text-[13px]"
          style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>Demo mode — all platforms shown as connected with sample data.</span>
        </div>
      )}

      {/* Connection status */}
      {connectedServices.length > 0 && currentStep === 1 && (
        <div
          className="flex items-center gap-3 mb-8 px-4 py-3 rounded-xl"
          style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <CheckCircle2
            className="w-4 h-4 flex-shrink-0"
            style={{ color: expiredConnections.length > 0 ? '#C9B99A' : '#10b981' }}
          />
          <div>
            <span
              className="text-[13px]"
              style={{ color: 'rgba(255,255,255,0.60)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
            >
              {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
            </span>
            {expiredConnections.length > 0 && (
              <span
                className="text-[13px] ml-2"
                style={{ color: '#C9B99A', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
              >
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
                          border: '1px solid var(--border)',
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

              <div className="my-8" style={{ borderTop: '1px solid var(--border-glass)' }} />

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

      {/* Step 1: Platform connections — Dimension.dev-inspired layout */}
      {currentStep === 1 && (
        <div className="space-y-8">
          <SoulRichnessBar connectedPlatforms={activeConnections} />

          {/* ── Connected Section ── */}
          {connectedServices.length > 0 && (
            <>
              <SectionLabel label="Connected" />
              <div className="space-y-2">
                {sortConnectors(availableConnectors)
                  .filter(c => connectedServices.includes(c.provider))
                  .map(c => (
                    <PlatformTile
                      key={c.provider}
                      name={c.name}
                      description={c.description}
                      icon={c.icon}
                      color={c.color}
                      connected={true}
                      syncing={connectingProvider === c.provider}
                      onConnect={() => connectService(c.provider)}
                      onManage={() => disconnectService(c.provider, c.name)}
                    />
                  ))}
              </div>
              <Divider />
            </>
          )}

          {/* ── Google Workspace ── */}
          <SectionLabel label="Google Workspace" />
          <p
            className="text-[13px] -mt-2 mb-4 leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Access emails, calendar, Drive files, Docs, and Sheets — your twin reads and understands your work
          </p>
          <GoogleWorkspaceConnect
            connectorStatus={platformStatusData}
            isDemoMode={isDemoMode}
            navigate={navigate}
          />

          {/* ── Entertainment ── (hidden when all connected) */}
          {entertainmentConnectors.some(c => !connectedServices.includes(c.provider)) && (
            <>
              <Divider />
              <SectionLabel label="Entertainment" />
              <div className="space-y-2">
                {sortConnectors(entertainmentConnectors)
                  .filter(c => !connectedServices.includes(c.provider))
                  .map(c => (
                    <PlatformTile
                      key={c.provider}
                      name={c.name}
                      description={c.description}
                      icon={c.icon}
                      color={c.color}
                      connected={false}
                      comingSoon={c.comingSoon}
                      syncing={connectingProvider === c.provider}
                      onConnect={() => connectService(c.provider)}
                    />
                  ))}
              </div>
            </>
          )}

          {/* ── Health & Fitness ── (hidden when all connected) */}
          {healthConnectors.some(c => !connectedServices.includes(c.provider)) && (
            <>
              <Divider />
              <SectionLabel label="Health & Fitness" />
              <div className="space-y-2">
                {sortConnectors(healthConnectors)
                  .filter(c => !connectedServices.includes(c.provider))
                  .map(c => (
                    <PlatformTile
                      key={c.provider}
                      name={c.name}
                      description={c.description}
                      icon={c.icon}
                      color={c.color}
                      connected={false}
                      comingSoon={c.comingSoon}
                      syncing={connectingProvider === c.provider}
                      onConnect={() => connectService(c.provider)}
                    />
                  ))}
              </div>
            </>
          )}

          {/* ── Social & Community ── (hidden when all connected) */}
          {socialConnectors.some(c => !connectedServices.includes(c.provider)) && (
            <>
              <Divider />
              <SectionLabel label="Social & Community" />
              <div className="space-y-2">
                {sortConnectors(socialConnectors)
                  .filter(c => !connectedServices.includes(c.provider))
                  .map(c => (
                    <PlatformTile
                      key={c.provider}
                      name={c.name}
                      description={c.description}
                      icon={c.icon}
                      color={c.color}
                      connected={false}
                      comingSoon={c.comingSoon}
                      syncing={connectingProvider === c.provider}
                      onConnect={() => connectService(c.provider)}
                    />
                  ))}
              </div>
            </>
          )}

          {/* ── Professional ── (hidden when all connected) */}
          {[...professionalConnectors, ...browsingConnectors].some(c => !connectedServices.includes(c.provider)) && (
            <>
              <Divider />
              <SectionLabel label="Professional" />
              <div className="space-y-2">
                {sortConnectors([...professionalConnectors, ...browsingConnectors])
                  .filter(c => !connectedServices.includes(c.provider))
                  .map(c => (
                    <PlatformTile
                      key={c.provider}
                      name={c.name}
                      description={c.description}
                      icon={c.icon}
                      color={c.color}
                      connected={false}
                      comingSoon={c.comingSoon}
                      syncing={connectingProvider === c.provider}
                      onConnect={() => connectService(c.provider)}
                    />
                  ))}
              </div>
            </>
          )}

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
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  <span
                    className="text-[13px]"
                    style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
                  >
                    {activeConnections.length} platform{activeConnections.length !== 1 ? 's' : ''} active
                    {expiredConnections.length > 0 && (
                      <span className="ml-1" style={{ color: '#C9B99A' }}>
                        ({expiredConnections.length} expired)
                      </span>
                    )}
                  </span>
                </div>
                <button
                  onClick={startTwinGeneration}
                  disabled={isGenerating || connectedServices.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-medium transition-all duration-150 hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: connectedServices.length > 0 ? '#F5F5F4' : 'rgba(245,245,244,0.1)',
                    color: connectedServices.length > 0 ? '#110f0f' : 'rgba(245,245,244,0.4)',
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    cursor: isGenerating || connectedServices.length === 0 ? 'not-allowed' : 'pointer',
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
                {connectedServices.length === 0 && !isGenerating && (
                  <button
                    onClick={() => {
                      trackFunnel('onboarding_skipped_no_platforms', { page: 'get-started' });
                      navigate('/dashboard');
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70 mt-3"
                    style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
                  >
                    Skip for now — I'll connect later
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>

      {/* Demo Value Modal — Dimension.dev style, forced dark theme */}
      <AnimatePresence>
        {demoModalPlatform && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onClick={() => setDemoModalPlatform(null)}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="relative max-w-md w-full rounded-[24px] overflow-hidden"
              style={{
                background: '#1a1820',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.6)',
              }}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Amber accent bar */}
              <div
                className="h-[2px] w-full"
                style={{ background: 'linear-gradient(90deg, transparent, #ff8400, transparent)' }}
              />

              <div className="px-6 py-6">
                <h3
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontStyle: 'italic',
                    fontSize: '22px',
                    color: '#F5F5F4',
                    letterSpacing: '-0.02em',
                  }}
                >
                  What you'd discover with {formatPlatformName(demoModalPlatform)}
                </h3>
                <p className="text-xs mt-1 mb-5" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                  Sample insights from real user data
                </p>

                <div className="space-y-3 mb-6">
                  {getDemoInsights(demoModalPlatform).map((insight, i) => (
                    <motion.div
                      key={i}
                      className="flex items-start gap-3 px-4 py-3 rounded-[16px]"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.12, duration: 0.4, ease: 'easeOut' }}
                    >
                      <span className="text-base mt-0.5 flex-shrink-0">{insight.emoji}</span>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}>
                        {insight.text}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <motion.button
                    onClick={() => {
                      setDemoModalPlatform(null);
                      navigate('/auth');
                    }}
                    className="flex-1 py-3 rounded-[100px] text-sm font-medium"
                    style={{ background: '#ff8400', color: '#0a0909', fontFamily: "'Inter', sans-serif" }}
                    whileHover={{ scale: 1.02, opacity: 0.9 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Sign up to see your real data
                  </motion.button>
                  <button
                    onClick={() => setDemoModalPlatform(null)}
                    className="px-4 py-3 rounded-[100px] text-sm"
                    style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: "'Inter', sans-serif" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

function formatPlatformName(platform: string): string {
  const names: Record<string, string> = {
    spotify: 'Spotify', youtube: 'YouTube', github: 'GitHub', discord: 'Discord',
    google_calendar: 'Google Calendar', linkedin: 'LinkedIn', reddit: 'Reddit',
    twitch: 'Twitch', whoop: 'WHOOP', gmail: 'Gmail', slack: 'Slack',
    strava: 'Strava', fitbit: 'Fitbit', garmin: 'Garmin', oura: 'Oura Ring',
  };
  return names[platform] || platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getDemoInsights(platform: string): { emoji: string; text: string }[] {
  const insights: Record<string, { emoji: string; text: string }[]> = {
    spotify: [
      { emoji: '🎵', text: 'Your top genres reveal your mood patterns — lo-fi for focus, hip-hop for energy' },
      { emoji: '🌙', text: 'Late-night listening spikes show when your creative brain turns on' },
      { emoji: '🔁', text: 'Artists you replay vs. discover tell us about your openness to new experiences' },
    ],
    google_calendar: [
      { emoji: '📅', text: 'Meeting density shows your social energy levels throughout the week' },
      { emoji: '⏰', text: 'Your free blocks reveal when you do your best deep work' },
      { emoji: '🔄', text: 'Schedule patterns predict burnout before you feel it' },
    ],
    youtube: [
      { emoji: '📺', text: 'Watch history reveals hidden curiosities you might not even notice' },
      { emoji: '🧠', text: 'Educational vs. entertainment ratio shows your learning drive' },
      { emoji: '🕐', text: 'Binge patterns correlate with stress or creative exploration' },
    ],
    discord: [
      { emoji: '💬', text: 'Server activity reveals your community interests and social style' },
      { emoji: '🎮', text: 'Gaming channels vs. learning channels map your leisure personality' },
      { emoji: '🤝', text: 'Active hours show when you seek connection vs. solitude' },
    ],
    github: [
      { emoji: '💻', text: 'Commit patterns reveal your coding rhythm — late-night builder or morning planner?' },
      { emoji: '🔧', text: 'Languages and frameworks show what problems excite you most' },
      { emoji: '⭐', text: 'Starred repos reveal your aspirational interests' },
    ],
    linkedin: [
      { emoji: '💼', text: 'Career trajectory shows whether you optimize for growth or stability' },
      { emoji: '🏢', text: 'Company choices reveal your values — startup energy or enterprise structure' },
      { emoji: '📊', text: 'Skills and endorsements map your professional identity' },
    ],
    reddit: [
      { emoji: '📱', text: 'Subreddit subscriptions are the most honest map of your interests' },
      { emoji: '💡', text: 'Comment patterns show what topics make you engage vs. lurk' },
      { emoji: '🔥', text: 'Upvote history reveals what genuinely resonates with you' },
    ],
    twitch: [
      { emoji: '🎮', text: 'Followed channels reveal your gaming identity and community belonging' },
      { emoji: '📺', text: 'Watch patterns show when you unwind vs. when you engage socially' },
      { emoji: '💬', text: 'Chat activity reveals how you interact in real-time communities' },
    ],
    whoop: [
      { emoji: '💪', text: 'Recovery scores correlate with your productivity and mood patterns' },
      { emoji: '😴', text: 'Sleep consistency reveals how you manage energy across the week' },
      { emoji: '📈', text: 'Strain trends show whether you push too hard or coast too long' },
    ],
    strava: [
      { emoji: '🏃', text: 'Training patterns reveal your discipline and how you push limits' },
      { emoji: '📍', text: 'Route choices show whether you explore or stick to routines' },
      { emoji: '⚡', text: 'Effort distribution reveals your relationship with challenge' },
    ],
    gmail: [
      { emoji: '📧', text: 'Response times reveal your communication priorities and energy' },
      { emoji: '🕸', text: 'Contact patterns map your real social network — who matters most' },
      { emoji: '📝', text: 'Writing style in emails reflects your personality more than you think' },
    ],
    slack: [
      { emoji: '💬', text: 'Channel activity shows where your professional curiosity lives' },
      { emoji: '⏰', text: 'Message timing reveals your work rhythm and availability patterns' },
      { emoji: '🤝', text: 'Reaction patterns show how you build relationships at work' },
    ],
  };
  return insights[platform] || [
    { emoji: '✨', text: 'Connect this platform to discover patterns about yourself you never noticed' },
    { emoji: '🔮', text: 'Your twin gets smarter with every data source you add' },
    { emoji: '🧩', text: 'Cross-platform insights are where the real magic happens' },
  ];
}

export default InstantTwinOnboarding;
