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
  Settings,
  Eye,
  Plus,
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
// SVG LOGO COMPONENTS
// ====================================================================

const SpotifyLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const YoutubeLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const DiscordLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const RedditLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
  </svg>
);

const GmailLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
  </svg>
);

const CalendarLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
  </svg>
);

const SlackLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
);

const LinkedinLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const GithubLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const WhoopLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 1332 999" fill="currentColor">
    <path d="m969.3 804.3l-129.4-426.3h-118.7l189.2 620.8h117.8l303.7-998h-118.7zm-851.3-803.5h-117.9l188.4 620.7h118.6zm488.6 0l-302.8 997.9h117.8l303.7-997.9z"/>
  </svg>
);

const OuraLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

const GarminLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 512 512" fill="currentColor">
    <path d="M256 0C114.6 0 0 114.6 0 256s114.6 256 256 256 256-114.6 256-256S397.4 0 256 0zm0 472c-119.3 0-216-96.7-216-216S136.7 40 256 40s216 96.7 216 216-96.7 216-216 216zm0-392c-97.2 0-176 78.8-176 176s78.8 176 176 176 176-78.8 176-176S353.2 80 256 80zm0 312c-75.1 0-136-60.9-136-136s60.9-136 136-136 136 60.9 136 136-60.9 136-136 136z"/>
    <path d="M256 168c-48.6 0-88 39.4-88 88s39.4 88 88 88 88-39.4 88-88-39.4-88-88-88zm0 136c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z"/>
  </svg>
);

const PolarLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
  </svg>
);

const SuuntoLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 6v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const AppleHealthLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
);

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
  category: 'entertainment' | 'social' | 'professional' | 'health';
}

// MVP Platforms Only: Spotify, Google Calendar, Whoop
const AVAILABLE_CONNECTORS: ConnectorConfig[] = [
  // Music - Personal insights from listening patterns
  {
    provider: 'spotify',
    name: 'Spotify',
    description: 'Your music reveals your mood patterns, energy levels, and authentic taste',
    icon: <SpotifyLogo className="w-6 h-6" />,
    color: '#1DB954',
    dataTypes: ['Music Taste', 'Mood Patterns', 'Energy Levels'],
    estimatedInsights: 12,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'entertainment'
  },
  // Calendar - Work and life patterns
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Your schedule reveals work patterns, social habits, and how you manage time',
    icon: <CalendarLogo className="w-6 h-6" />,
    color: '#4285F4',
    dataTypes: ['Work Patterns', 'Time Management', 'Event Context'],
    estimatedInsights: 8,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'professional'
  },
  // Health - Body signals and recovery
  {
    provider: 'whoop' as DataProvider,
    name: 'Whoop',
    description: 'Your body signals reveal recovery, strain, and optimal performance windows',
    icon: <WhoopLogo className="w-6 h-6" />,
    color: '#00A7E1',
    dataTypes: ['Recovery Score', 'Sleep Quality', 'Strain Level'],
    estimatedInsights: 15,
    setupTime: '10 seconds',
    privacyLevel: 'medium',
    category: 'health'
  },
  // Open Wearables - Additional fitness trackers via Open Wearables
  {
    provider: 'garmin' as DataProvider,
    name: 'Garmin',
    description: 'Your Garmin data reveals training patterns, GPS activities, and physiological metrics',
    icon: <GarminLogo className="w-6 h-6" />,
    color: '#007CC3',
    dataTypes: ['Activities', 'Heart Rate', 'Sleep'],
    estimatedInsights: 12,
    setupTime: '15 seconds',
    privacyLevel: 'medium',
    category: 'health'
  },
  {
    provider: 'polar' as DataProvider,
    name: 'Polar',
    description: 'Your Polar data reveals heart rate patterns, training load, and recovery insights',
    icon: <PolarLogo className="w-6 h-6" />,
    color: '#D32F2F',
    dataTypes: ['Heart Rate', 'Training Load', 'Recovery'],
    estimatedInsights: 10,
    setupTime: '15 seconds',
    privacyLevel: 'medium',
    category: 'health'
  },
  {
    provider: 'suunto' as DataProvider,
    name: 'Suunto',
    description: 'Your Suunto data reveals outdoor adventures, training metrics, and performance trends',
    icon: <SuuntoLogo className="w-6 h-6" />,
    color: '#1A1A1A',
    dataTypes: ['Activities', 'GPS Tracks', 'Performance'],
    estimatedInsights: 10,
    setupTime: '15 seconds',
    privacyLevel: 'medium',
    category: 'health'
  },
  {
    provider: 'apple_health' as DataProvider,
    name: 'Apple Health',
    description: 'Your Apple Health data reveals daily activity, workouts, and health metrics from your Apple Watch',
    icon: <AppleHealthLogo className="w-6 h-6" />,
    color: '#FF2D55',
    dataTypes: ['Activity', 'Workouts', 'Health Metrics'],
    estimatedInsights: 15,
    setupTime: '15 seconds',
    privacyLevel: 'medium',
    category: 'health'
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

  // MVP platforms only - exclude non-MVP platforms like LinkedIn from count
  const MVP_PLATFORMS = ['spotify', 'google_calendar', 'whoop'];

  // Calculate truly active connections (excluding expired tokens AND non-MVP platforms)
  const activeConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    const isNotExpired = !status?.tokenExpired && status?.status !== 'token_expired';
    const isMVPPlatform = MVP_PLATFORMS.includes(provider);
    return isNotExpired && isMVPPlatform;
  });
  const expiredConnections = connectedServices.filter(provider => {
    const status = platformStatusData[provider];
    const isExpired = status?.tokenExpired || status?.status === 'token_expired';
    const isMVPPlatform = MVP_PLATFORMS.includes(provider);
    return isExpired && isMVPPlatform;
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
    setConnectingProvider(provider);
    try {
      const userId = user?.id || 'demo-user';
      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      // Use wearables API for Open Wearables providers
      const openWearablesProviders = ['garmin', 'polar', 'suunto', 'apple_health'];
      // Use health connector route for health platforms (whoop, oura)
      const healthPlatforms = ['whoop', 'oura'];

      let apiUrl: string;
      let fetchOptions: RequestInit = {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      };

      if (openWearablesProviders.includes(provider as string)) {
        // Use Open Wearables API
        apiUrl = `${baseUrl}/wearables/connect`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ provider })
        };
      } else if (healthPlatforms.includes(provider as string)) {
        apiUrl = `${baseUrl}/health/connect/${provider}?userId=${encodeURIComponent(userId)}`;
      } else {
        apiUrl = `${baseUrl}/arctic/connect/${provider}?userId=${encodeURIComponent(userId)}`;
      }

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.authUrl) {
        sessionStorage.setItem('connecting_provider', provider);
        window.location.href = result.authUrl;
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
      const userId = user?.id;
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(
        `${baseUrl}/connectors/${provider}/${encodeURIComponent(userId)}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
      );

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
    const providerStatus = platformStatusData[connector.provider];
    const needsReconnect = providerStatus?.tokenExpired || providerStatus?.status === 'token_expired';

    return (
      <GlassPanel
        key={connector.provider}
        hover
        className="relative transition-all"
      >

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

        {isConnected && needsReconnect && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" style={{ color: '#C1C0B6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span
                  className="text-sm"
                  style={{
                    color: '#f59e0b',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Token Expired
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                connectService(connector.provider);
              }}
              disabled={connectingProvider === connector.provider}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(193, 192, 182, 0.15)',
                color: '#C1C0B6',
                border: '1px solid rgba(193, 192, 182, 0.3)',
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
                  Reconnecting...
                </>
              ) : (
                'Reconnect'
              )}
            </button>
          </div>
        )}

        {isConnected && !needsReconnect && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: colors.muted }} />
                <span
                  className="text-sm"
                  style={{
                    color: colors.muted,
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Connected
                  {providerStatus?.lastSync && (
                    <span className="ml-2 opacity-70">
                      · Synced {new Date(providerStatus.lastSync).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  disconnectService(connector.provider);
                }}
                disabled={disconnectingProvider === connector.provider}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'transparent',
                  color: colors.muted,
                  fontFamily: 'var(--font-body)'
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
  const healthConnectors = sortConnectors(AVAILABLE_CONNECTORS.filter(c => c.category === 'health'));
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
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
              style={{
                backgroundColor: colors.connected,
                color: 'white',
                fontFamily: 'var(--font-body)',
                fontWeight: 500
              }}
            >
              Continue to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </GlassPanel>
      )}

      {currentStep === 1 && (
        <div className="space-y-8">
          {/* PLAT 3.3: Only show categories that have connectors */}
          {entertainmentConnectors.length > 0 && (
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
          )}

          {healthConnectors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors.categoryHealth }}
                />
                <h3
                  className="text-lg"
                  style={{
                    color: colors.textPrimary,
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 400
                  }}
                >
                  Health
                </h3>
                <span
                  className="text-xs"
                  style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
                >
                  Recovery, sleep, fitness
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {healthConnectors.map(renderConnectorCard)}
              </div>
            </div>
          )}

          {socialConnectors.length > 0 && (
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
          )}

          {professionalConnectors.length > 0 && (
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
          )}

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
