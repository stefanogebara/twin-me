/**
 * InstantTwinOnboarding - Soul Signature Discovery Journey
 * Connect your digital life to discover and share your authentic soul signature
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
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

  // Soul Signature Discovery - no twin types needed
  const urlParams = new URLSearchParams(window.location.search);

  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnectors, setSelectedConnectors] = useState<DataProvider[]>([]);
  const [connectedServices, setConnectedServices] = useState<DataProvider[]>(() => {
    // Initialize from localStorage on mount
    const stored = localStorage.getItem('connectedServices');
    const parsed = stored ? JSON.parse(stored) : [];
    console.log('🏗️ Initial connectedServices state:', parsed);
    return parsed;
  });
  const [generationProgress, setGenerationProgress] = useState<TwinGenerationProgress | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showExtractionProgress, setShowExtractionProgress] = useState(false);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const [hasCheckedConnection, setHasCheckedConnection] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<DataProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<DataProvider | null>(null);
  // Progressive disclosure state
  const [showAllConnectors, setShowAllConnectors] = useState(false);

  // Load connections from localStorage on mount
  useEffect(() => {
    const storedConnections = localStorage.getItem('connectedServices');
    if (storedConnections) {
      const parsed = JSON.parse(storedConnections);
      console.log('📦 Loaded connections from localStorage:', parsed);
      setConnectedServices(parsed);
    }
  }, []);

  // Check for OAuth callback success
  useEffect(() => {
    if (!user?.id || hasCheckedConnection) return;

    const currentUrlParams = new URLSearchParams(window.location.search);
    const connected = currentUrlParams.get('connected');

    if (connected === 'true') {
      // A connection was successful, check connection status with longer delay
      console.log('🔗 OAuth callback detected, checking connection status...');

      // Don't reset - preserve connections and update state immediately
      const currentConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
      console.log('📦 Preserving existing connections:', currentConnections);
      setConnectedServices(currentConnections);

      setTimeout(() => {
        checkConnectionStatus();
        setHasCheckedConnection(true);
      }, 500); // Minimal delay for UI smoothness
    } else {
      // Only reset on fresh page load if no connections exist
      const existingConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
      if (existingConnections.length === 0) {
        resetConnectionStatus();
      } else {
        // Preserve existing connections on page refresh
        console.log('📦 Preserving existing connections on refresh:', existingConnections);
        setConnectedServices(existingConnections);
        checkConnectionStatus();
      }
      setHasCheckedConnection(true);
    }
  }, [user]);

  // Listen for postMessage from OAuth popup to avoid COOP errors
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        console.warn('⚠️ Ignoring message from untrusted origin:', event.origin);
        return;
      }

      // Check if this is an OAuth success message
      if (event.data?.type === 'oauth-success') {
        console.log('✅ Received OAuth success message:', event.data);
        const provider = event.data.provider;

        // Update connected services
        const existingConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
        if (provider && !existingConnections.includes(provider)) {
          existingConnections.push(provider);
          localStorage.setItem('connectedServices', JSON.stringify(existingConnections));
          setConnectedServices(existingConnections);
        }

        // Refresh connection status after a short delay
        setTimeout(() => {
          console.log('🔄 Refreshing connection status after OAuth success');
          checkConnectionStatus();
        }, 500); // Reduced delay for faster feedback
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const resetConnectionStatus = async () => {
    try {
      // Clear localStorage connections on fresh load (no OAuth callback)
      localStorage.removeItem('connectedServices');
      setConnectedServices([]);
      console.log('🔄 Reset connection status for fresh page load');

      if (!user?.id) return;

      // Also try to reset backend
      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/reset/${user.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (result.success) {
        console.log('✅ Backend connection status reset');
      }
    } catch (error) {
      console.error('❌ Error resetting connection status:', error);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      // First check localStorage for persisted connections
      const storedConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
      if (storedConnections.length > 0) {
        console.log('📱 Found stored connections:', storedConnections);
        setConnectedServices(storedConnections);

        // Get the provider from URL params
        const currentUrlParams = new URLSearchParams(window.location.search);
        const provider = currentUrlParams.get('provider');

        if (provider) {
          toast({
            title: "✅ Connected Successfully",
            description: `${provider.replace('_', ' ')} is now connected to your Twin Me account`,
            variant: "default",
          });
        } else if (storedConnections.length > 0) {
          toast({
            title: "Connections Restored",
            description: `${storedConnections.length} service${storedConnections.length !== 1 ? 's' : ''} connected`,
          });
        }
      }

      // Also check backend status if user is logged in
      if (!user?.id) return;

      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/status/${user.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success && Object.keys(result.data || {}).length > 0) {
        // Merge backend status with localStorage
        const backendProviders = Object.keys(result.data || {}) as DataProvider[];
        const mergedProviders = [...new Set([...storedConnections, ...backendProviders])];

        console.log('🔄 Merged connection status:', mergedProviders);
        setConnectedServices(mergedProviders);

        // Update localStorage with merged data
        localStorage.setItem('connectedServices', JSON.stringify(mergedProviders));
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
      // Fallback to localStorage only
      const storedConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
      if (storedConnections.length > 0) {
        setConnectedServices(storedConnections);
      }
    }
  };

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

        // Open OAuth in new window/tab
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        const popup = window.open(
          result.data.authUrl,
          'oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no`
        );

        // Use postMessage instead of polling to avoid COOP errors
        // The OAuth callback will send a message when it completes
        console.log('🪟 OAuth popup opened, waiting for completion message...');
      } else if (result.success) {
        // Fallback for test connections (shouldn't happen with real OAuth)
        console.warn('⚠️ No OAuth URL received, using test connection');

        // Store connection in localStorage
        const existingConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
        if (!existingConnections.includes(provider)) {
          existingConnections.push(provider);
          localStorage.setItem('connectedServices', JSON.stringify(existingConnections));
        }

        // Update local state immediately
        setConnectedServices(prev => {
          const updated = prev.includes(provider) ? prev : [...prev, provider];
          console.log('📝 Updated connected services:', updated);
          return updated;
        });

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
  }, [toast]);

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

      // Remove from localStorage
      const existingConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
      const updated = existingConnections.filter((p: string) => p !== provider);
      localStorage.setItem('connectedServices', JSON.stringify(updated));

      // Update state
      setConnectedServices(updated);

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
  }, [user, toast]);

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
    setCurrentStep(3);
    setShowExtractionProgress(true); // Enable extraction progress display
    setExtractionComplete(false); // Reset extraction completion flag

    const config: InstantTwinConfig = {
      userId: user.id,
      selectedProviders: selectedConnectors,
      dataTimeRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
      },
      processingPriority: 'fast',
      privacyLevel: 'standard'
    };

    // Simulate twin generation progress
    const progressStages = [
      { stage: 'connecting', progress: 10, task: 'Establishing secure connections...', time: 1000 },
      { stage: 'ingesting', progress: 30, task: 'Analyzing your communication patterns...', time: 2000 },
      { stage: 'ingesting', progress: 50, task: 'Processing calendar and work data...', time: 2000 },
      { stage: 'analyzing', progress: 70, task: 'Extracting personality insights...', time: 3000 },
      { stage: 'analyzing', progress: 85, task: 'Identifying expertise areas...', time: 2000 },
      { stage: 'generating', progress: 95, task: 'Creating your digital twin...', time: 2000 },
      { stage: 'ready', progress: 100, task: 'Your twin is ready!', time: 1000 }
    ];

    for (const stage of progressStages) {
      await new Promise(resolve => setTimeout(resolve, stage.time));

      setGenerationProgress({
        userId: user.id,
        stage: stage.stage as any,
        progress: stage.progress,
        currentTask: stage.task,
        estimatedTimeRemaining: Math.max(0, 60 - (stage.progress * 0.6)),
        connectorsConnected: selectedConnectors,
        dataPointsIngested: Math.floor(stage.progress * 5),
        insightsGenerated: Math.floor(stage.progress * 0.2)
      });
    }

    // Create the soul signature twin, then navigate to dashboard
    try {
      // Step 1: Check if user has connected platforms
      let soulSignature = null;
      let hasExtractedData = false;

      if (selectedConnectors.length > 0) {
        // Step 2: Extract data from connected platforms and build soul signature
        console.log('🔄 Extracting soul signature from connected platforms...');

        try {
          const extractResponse = await fetch(`${import.meta.env.VITE_API_URL}/soul-data/build-soul-signature`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: user.id })
          });

          const extractResult = await extractResponse.json();

          if (extractResult.success && extractResult.soulSignature) {
            soulSignature = extractResult.soulSignature;
            hasExtractedData = true;
            console.log('✅ Soul signature extracted:', soulSignature);
          } else {
            console.warn('⚠️ No soul signature data available yet:', extractResult.message);
          }
        } catch (extractError) {
          console.error('❌ Error extracting soul signature:', extractError);
        }
      }

      // Step 3: Build twin data from real soul signature OR use basic fallback
      const twinData = hasExtractedData && soulSignature ? {
        // REAL DATA from soul extraction
        name: user.fullName || user.firstName || 'My Soul Signature',
        description: `AI twin created from analyzing ${selectedConnectors.join(', ')} platforms`,
        subject_area: 'Soul Signature Analysis',
        twin_type: 'personal',
        personality_traits: soulSignature.personality_traits || {
          openness: 0.7,
          conscientiousness: 0.6,
          extraversion: 0.5,
          agreeableness: 0.7,
          neuroticism: 0.4
        },
        teaching_style: {
          communication_style: soulSignature.communication_style || 'balanced',
          philosophy: `Authentic self-expression derived from ${soulSignature.data_sources?.join(', ') || 'platform'} analysis`
        },
        common_phrases: soulSignature.common_phrases || ['Working on something interesting'],
        favorite_analogies: soulSignature.favorite_analogies || ['Like searching in the branches for what we find in the roots'],
        soul_signature: soulSignature,
        connected_platforms: selectedConnectors,
        knowledge_base_status: 'ready'
      } : {
        // FALLBACK: Basic twin without soul extraction (no platforms connected)
        name: user.fullName || user.firstName || 'My Soul Signature',
        description: 'AI twin ready for soul signature discovery. Connect platforms to enhance.',
        subject_area: 'Soul Signature Analysis',
        twin_type: 'personal',
        personality_traits: {
          openness: 0.7,
          conscientiousness: 0.6,
          extraversion: 0.5,
          agreeableness: 0.7,
          neuroticism: 0.4
        },
        teaching_style: {
          communication_style: 'balanced',
          philosophy: 'Ready to learn from your connected platforms'
        },
        common_phrases: ['Connect platforms to discover my authentic voice'],
        favorite_analogies: ['Like searching in the branches for what we find in the roots'],
        connected_platforms: [],
        knowledge_base_status: 'empty'
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
      console.log('🔍 API Response:', { status: response.status, result });

      if (response.ok && (result.id || result.twin?.id)) {
        // Navigate to the Soul Signature Dashboard
        setTimeout(() => {
          navigate('/soul-signature');
        }, 500); // Reduced from 2000ms - navigate faster
      } else {
        console.error('🚨 API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          result
        });
        throw new Error(`Failed to create soul signature: ${result.error || result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating soul signature:', error);
      toast({
        title: "Error",
        description: "Failed to create your soul signature. Please try again.",
        variant: "destructive"
      });
      // Fallback navigation to Soul Signature Dashboard
      setTimeout(() => {
        navigate('/soul-signature');
      }, 500); // Reduced from 2000ms - navigate faster even on error
    }

  }, [user, selectedConnectors, navigate]);

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

    // Debug connection status for Gmail and Calendar
    if (connector.provider === 'google_gmail' || connector.provider === 'google_calendar') {
      console.log(`🎨 Rendering ${connector.provider}:`, {
        provider: connector.provider,
        isConnected,
        connectedServices,
        localStorage: JSON.parse(localStorage.getItem('connectedServices') || '[]')
      });
    }

    // Debug logging for connection status
    if (connector.provider === 'google_gmail') {
      console.log('🎨 Rendering Gmail card:', {
        provider: connector.provider,
        isConnected,
        connectedServices,
        selectedConnectors
      });
    }

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

        {/* Step 3: Generation Progress */}
        {currentStep === 3 && (
          <div>
            {renderGenerationProgress()}
          </div>
        )}
      </div>
    </div>
  );
};

export default InstantTwinOnboarding;