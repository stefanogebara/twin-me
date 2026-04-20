/**
 * InstantTwinOnboarding - Connect Your Platforms
 *
 * Thin orchestrator: manages step/state progression and delegates
 * rendering to sub-components in components/onboarding/.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { getAccessToken, authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useToast } from '@/components/ui/use-toast';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { DataProvider } from '@/types/data-integration';

import {
  OnboardingHeader,
  ArchetypeReveal,
  PlatformConnectionsStep,
  GenerateCTA,
  DemoValueModal,
  usePlatformConnect,
} from './components/onboarding';
import { ExpiredTokenBanner } from './components/dashboard-v2/ExpiredTokenBanner';
import type { RevealedArchetype } from './components/onboarding';
import { GarminCredentialsModal } from './components/settings/GarminCredentialsModal';
import { SteamConnectModal } from './components/settings/SteamConnectModal';
import { CONNECTION_INSIGHT_MESSAGES } from './components/onboarding/connectionInsights';
import ConnectionRevealCard from './components/onboarding/ConnectionRevealCard';

const InstantTwinOnboarding = () => {
  useDocumentTitle('Connect Platforms');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDemoMode } = useDemo();
  const { trackFunnel } = useAnalytics();
  const { toast } = useToast();

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

  const discoveredSet = new Set([
    ...(enrichmentData?.discoveredPlatforms || []).map((p: string) => p.toLowerCase()),
    ...(enrichmentData?.breachIntegrations || []).map((p: string) => p.toLowerCase()),
  ]);

  // --- Local state ---
  const [demoModalPlatform, setDemoModalPlatform] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<DataProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<DataProvider | null>(null);
  const [garminModalOpen, setGarminModalOpen] = useState(false);
  const [steamModalOpen, setSteamModalOpen] = useState(false);
  const [revealedArchetype, setRevealedArchetype] = useState<RevealedArchetype | null>(null);

  // Provider of the just-completed OAuth connection. Drives the
  // first-connection reveal card — the "wow, it already noticed something"
  // moment that makes the freshly connected data feel alive. Cleared when
  // the user dismisses or moves on.
  const [revealProvider, setRevealProvider] = useState<string | null>(null);

  const connectedServices = connectedProviders as DataProvider[];

  const activeConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    return !status?.tokenExpired && status?.status !== 'token_expired';
  });
  const expiredConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    return status?.tokenExpired || status?.status === 'token_expired';
  });

  // --- OAuth message listener ---
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const provider = urlParams.get('provider');

    if (connected === 'true' && provider) {
      toast({
        title: "Connected",
        description: CONNECTION_INSIGHT_MESSAGES[provider] || `${provider.replace('_', ' ')} is now connected`,
        variant: "default",
      });
      setConnectingProvider(null);
      // Show the "your twin just noticed..." reveal card above the platform
      // grid. It polls the memory stream for observations created in the last
      // few minutes tagged with this provider and surfaces up to 3.
      setRevealProvider(provider);
      setTimeout(() => refetchPlatformStatus(), 1500);

      // Strip the URL params so a refresh doesn't re-trigger the reveal
      // (the toast + reveal are a one-time moment).
      try {
        const cleanSearch = window.location.search
          .replace(/[?&]connected=[^&]*/g, '')
          .replace(/[?&]provider=[^&]*/g, '')
          .replace(/^\?$/, '');
        const newUrl = window.location.pathname + (cleanSearch || '');
        window.history.replaceState({}, '', newUrl);
      } catch {
        // Non-fatal
      }

      // Fire-and-forget: trigger proactive insight generation for this user.
      // The OAuth callback handles extraction + observation ingestion inline,
      // but insight generation (~40s LLM call) is deferred to avoid exceeding
      // Vercel's 60s maxDuration. Endpoint is idempotent over 10 min so
      // accidental double-invocations (page refresh, HMR) won't duplicate cost.
      authFetch('/insights/proactive/generate', { method: 'POST' }).catch(() => {
        // Non-fatal — hourly `deliver-insights` cron is the backstop.
      });
    }

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth-success' && event.data?.provider) {
        const rawProvider = event.data.provider as string;
        const providerName = rawProvider.replace('google_', '').replace('_', ' ');
        const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
        toast({
          title: "Connected",
          description: CONNECTION_INSIGHT_MESSAGES[rawProvider] || `${displayName} is now connected`,
          variant: "default",
        });
        setConnectingProvider(null);
        setRevealProvider(rawProvider);
        setTimeout(() => refetchPlatformStatus(), 1500);

        // Mirror of redirect-flow handling above: trigger insight generation.
        // Idempotent 10-min window on the server prevents duplicate cost when
        // both flows fire for the same user.
        authFetch('/insights/proactive/generate', { method: 'POST' }).catch(() => {});
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [refetchPlatformStatus, toast]);

  // --- Platform connect/disconnect ---
  const { connectService, disconnectService } = usePlatformConnect({
    userId: user?.id,
    isDemoMode,
    refetchPlatformStatus,
    optimisticDisconnect,
    revertOptimisticUpdate,
    setConnectingProvider,
    setDisconnectingProvider,
    setDemoModalPlatform,
    setGarminModalOpen,
    setSteamModalOpen,
  });

  // --- Twin generation ---
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

  // --- Render ---
  return (
    <>
      <div className="max-w-[680px] mx-auto px-6 py-16">
        {!isDemoMode && expiredConnections.length > 0 && (
          <ExpiredTokenBanner userId={user?.id} />
        )}

        <OnboardingHeader
          isDemoMode={isDemoMode}
          connectedServices={connectedServices}
          activeConnections={activeConnections}
          expiredConnections={expiredConnections}
          currentStep={currentStep}
        />

        {!isDemoMode && currentStep === 1 && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => navigate('/interview')}
              className="text-[12px] transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
            >
              Tell Your Story instead
            </button>
          </div>
        )}

        {currentStep === 2 && (
          <ArchetypeReveal
            revealedArchetype={revealedArchetype}
            onEnterTwin={() => navigate('/soul-signature')}
          />
        )}

        {currentStep === 1 && revealProvider && !isDemoMode && (
          <ConnectionRevealCard
            provider={revealProvider}
            onDismiss={() => setRevealProvider(null)}
          />
        )}

        {currentStep === 1 && (
          <>
            <PlatformConnectionsStep
              userId={user?.id}
              isDemoMode={isDemoMode}
              connectedServices={connectedServices}
              activeConnections={activeConnections}
              platformStatusData={platformStatusData}
              connectingProvider={connectingProvider}
              disconnectingProvider={disconnectingProvider}
              discoveredSet={discoveredSet}
              connectService={connectService}
              disconnectService={disconnectService}
              navigate={navigate}
            />
            <GenerateCTA
              connectedServices={connectedServices}
              activeConnections={activeConnections}
              expiredConnections={expiredConnections}
              isGenerating={isGenerating}
              onGenerate={startTwinGeneration}
              onSkip={() => {
                trackFunnel('onboarding_skipped_no_platforms', { page: 'get-started' });
                navigate('/dashboard');
              }}
            />
          </>
        )}
      </div>

      <DemoValueModal
        platform={demoModalPlatform}
        onClose={() => setDemoModalPlatform(null)}
        onSignUp={() => {
          setDemoModalPlatform(null);
          navigate('/auth');
        }}
      />

      <GarminCredentialsModal
        open={garminModalOpen}
        onClose={() => setGarminModalOpen(false)}
        onSuccess={() => refetchPlatformStatus()}
      />

      <SteamConnectModal
        open={steamModalOpen}
        onClose={() => setSteamModalOpen(false)}
        onSuccess={() => refetchPlatformStatus()}
      />
    </>
  );
};

export default InstantTwinOnboarding;
