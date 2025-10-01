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
  Fingerprint
} from 'lucide-react';

import UserProfile from '../components/UserProfile';
import { DataVerification } from '../components/DataVerification';
import ThemeToggle from '../components/ThemeToggle';

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
    provider: 'netflix',
    name: 'Netflix',
    description: 'Entertainment preferences and narrative interests',
    icon: <Film className="w-6 h-6" />,
    color: '#E50914',
    dataTypes: ['Genre Preferences', 'Narrative Themes', 'Viewing Habits'],
    estimatedInsights: 8,
    setupTime: '10 seconds',
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
    provider: 'steam',
    name: 'Steam',
    description: 'Gaming preferences and interactive experiences',
    icon: <Gamepad2 className="w-6 h-6" />,
    color: '#171A21',
    dataTypes: ['Gaming Style', 'Strategic Thinking', 'Social Gaming'],
    estimatedInsights: 6,
    setupTime: '5 seconds',
    privacyLevel: 'low'
  },
  {
    provider: 'goodreads',
    name: 'Goodreads',
    description: 'Reading preferences and intellectual interests',
    icon: <Book className="w-6 h-6" />,
    color: '#372213',
    dataTypes: ['Literary Taste', 'Knowledge Areas', 'Reading Patterns'],
    estimatedInsights: 7,
    setupTime: '5 seconds',
    privacyLevel: 'low'
  }
];

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
  const [hasCheckedConnection, setHasCheckedConnection] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<DataProvider | null>(null);
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
      }, 1000); // Reduced delay
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

      // Use email as userId since it's more reliable than id
      const userId = user?.email || user?.id || 'demo-user';

      console.log('🔑 Using userId:', userId);

      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      // Get OAuth authorization URL from backend
      const apiUrl = `http://localhost:3001/api/connectors/auth/${provider}?userId=${encodeURIComponent(userId)}`;
      console.log('🌐 Making request to:', apiUrl);
      console.log('🔑 API URL env var:', import.meta.env.VITE_API_URL);
      console.log('🔧 Using hardcoded URL to bypass caching issue');

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

        // Redirect to Google OAuth consent screen
        window.location.href = result.data.authUrl;
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

    } catch (error: any) {
      console.error('Error connecting service:', error);
      toast({
        title: "Connection failed",
        description: "Please try again or skip this service",
        variant: "destructive"
      });
    } finally {
      setConnectingProvider(null);
    }
  }, [toast]);

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
      const twinData = {
        name: user.fullName || user.firstName || 'My Soul Signature',
        description: 'AI twin created from soul signature discovery through connected digital platforms',
        subject_area: 'Soul Signature Analysis',
        twin_type: 'personal',
        personality_traits: {
          communication_style: 'Reflecting true self from connected platform analysis',
          humor_style: 'Adaptive to authentic personality traits',
          authenticity: 'Based on discovered personality patterns'
        },
        teaching_style: {
          philosophy: 'Authentic self-expression derived from digital soul signature',
          interaction: 'Natural and genuine based on discovered personality patterns'
        },
        common_phrases: ['Let me share my authentic perspective', 'Based on my digital soul signature'],
        favorite_analogies: ['Like searching in the branches for what we find in the roots']
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

      if (response.ok && result.id) {
        // Navigate to the Soul Signature Dashboard
        setTimeout(() => {
          navigate('/soul-signature');
        }, 2000);
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
      }, 2000);
    }

  }, [user, selectedConnectors, navigate]);

  // ====================================================================
  // RENDER HELPERS
  // ====================================================================

  // Apple-style Step Indicator with Consistent Design
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
              className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-all duration-300 border-2"
              style={{
                backgroundColor: currentStep >= step.id ? 'var(--_color-theme---accent)' : 'var(--_color-theme---surface)',
                borderColor: currentStep >= step.id ? 'var(--_color-theme---accent)' : 'var(--_color-theme---border)',
                color: currentStep >= step.id ? 'white' : 'var(--_color-theme---text)',
                cursor: step.id <= currentStep ? 'pointer' : 'default'
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
                className="font-heading font-medium"
                style={{
                  color: currentStep >= step.id ? 'var(--_color-theme---text)' : 'var(--_color-theme---text-secondary)',
                  opacity: currentStep >= step.id ? 1 : 0.6,
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                {step.name}
              </div>
              <div
                className="font-heading text-xs"
                style={{
                  color: 'var(--_color-theme---text-secondary)',
                  opacity: currentStep >= step.id ? 1 : 0.4,
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                {step.description}
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className="w-12 h-0.5 mx-4 transition-colors duration-300"
                style={{
                  backgroundColor: currentStep > step.id ? 'var(--_color-theme---accent)' : 'var(--_color-theme---border)'
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
        className={`relative p-6 rounded-2xl transition-all duration-300 cursor-pointer group hover:shadow-xl hover:-translate-y-1 border ${
          isConnected
            ? 'border-2 shadow-lg'
            : isSelected
            ? 'border-2 shadow-md'
            : 'hover:shadow-md'
        }`}
        style={{
          backgroundColor: 'var(--_color-theme---surface)',
          borderColor: isConnected || isSelected ? 'var(--_color-theme---accent)' : 'var(--_color-theme---border)'
        }}
        onClick={() => !isConnected && handleConnectorToggle(connector.provider)}
      >
        {/* Connection status indicator */}
        {isConnected && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="rounded-full p-2" style={{ backgroundColor: 'var(--_color-theme---accent)', color: 'white' }}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Service icon and name - Apple-style clean layout */}
        <div className="relative flex items-center gap-4 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center transform transition-transform group-hover:scale-110"
            style={{ backgroundColor: connector.color, color: 'white' }}
          >
            {connector.icon}
          </div>
          <div className="flex-1">
            <h3
              className="font-heading font-semibold text-lg"
              style={{
                color: 'var(--_color-theme---text)',
                fontFamily: 'var(--_typography---font--styrene-a)'
              }}
            >
              {connector.name}
            </h3>
            <p
              className="text-xs"
              style={{ color: 'var(--_color-theme---text-secondary)' }}
            >
              {connector.setupTime} setup
            </p>
          </div>
        </div>

        {/* Simplified description - Apple's progressive disclosure */}
        <p
          className="font-heading text-sm mb-3 leading-relaxed"
          style={{
            color: 'var(--_color-theme---text-secondary)',
            fontFamily: 'var(--_typography---font--styrene-a)'
          }}
        >
          {connector.description}
        </p>

        {/* Data types shown directly - simplified approach */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-1">
            {connector.dataTypes.slice(0, 2).map((type, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  backgroundColor: 'var(--_color-theme---surface-raised)',
                  color: 'var(--_color-theme---text-secondary)'
                }}
              >
                {type}
              </span>
            ))}
            {connector.dataTypes.length > 2 && (
              <span
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  backgroundColor: 'var(--_color-theme---surface-raised)',
                  color: 'var(--_color-theme---text-secondary)'
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
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--_color-theme---accent)', color: 'black', fontFamily: 'var(--_typography---font--styrene-a)' }}
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

        {/* Connection Success State - Apple-style clean */}
        {isConnected && (
          <div
            className="mt-3 p-3 rounded-xl border"
            style={{
              backgroundColor: 'var(--_color-theme---surface-raised)',
              borderColor: 'var(--_color-theme---accent)'
            }}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--_color-theme---accent)' }} />
              <span
                className="text-sm font-semibold font-heading"
                style={{
                  color: 'var(--_color-theme---accent)',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                Connected
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGenerationProgress = () => {
    if (!generationProgress) return null;

    return (
      <div className="text-center">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-4 relative">
            {/* Background circle */}
            <div
              className="absolute inset-0 rounded-full border-4"
              style={{ borderColor: 'var(--_color-theme---border)' }}
            ></div>
            {/* Progress circle */}
            <svg className="absolute inset-0 w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--_color-theme---accent)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - generationProgress.progress / 100)}`}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            {/* Center icon */}
            <div className="absolute inset-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
              <Brain className="w-8 h-8" style={{ color: 'white' }} />
            </div>
          </div>

          <h2 className="text-2xl font-medium mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
            {generationProgress.progress === 100 ? 'Your Soul Signature is Ready!' : 'Discovering Your Soul Signature'}
          </h2>

          <p
            className="mb-6"
            style={{ color: 'var(--_color-theme---text-secondary)' }}
          >
            {generationProgress.currentTask}
          </p>

          {/* Progress bar */}
          <div className="max-w-md mx-auto mb-6">
            <div
              className="w-full rounded-full h-2"
              style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}
            >
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${generationProgress.progress}%`,
                  backgroundColor: 'var(--_color-theme---accent)'
                }}
              ></div>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span style={{ color: 'var(--_color-theme---text-secondary)' }}>
                {generationProgress.progress}% complete
              </span>
              <span style={{ color: 'var(--_color-theme---text-secondary)' }}>
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
                className="text-2xl font-bold"
                style={{ color: 'var(--_color-theme---accent)' }}
              >
                {generationProgress.connectorsConnected.length}
              </div>
              <div
                className="text-xs"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Services
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl font-bold"
                style={{ color: 'var(--_color-theme---accent)' }}
              >
                {generationProgress.dataPointsIngested}
              </div>
              <div
                className="text-xs"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Data Points
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl font-bold"
                style={{ color: 'var(--_color-theme---accent)' }}
              >
                {generationProgress.insightsGenerated}
              </div>
              <div
                className="text-xs"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Insights
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-sm border-b" style={{ backgroundColor: 'var(--_color-theme---background)/90', borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Apple-style Back Navigation with Clear Context */}
            <button
              onClick={() => {
                if (currentStep > 1) {
                  setCurrentStep(currentStep - 1);
                } else {
                  navigate('/');
                }
              }}
              className="flex items-center gap-2 text-sm hover:opacity-70 transition-all hover:scale-105 px-3 py-2 rounded-lg"
              style={{ color: 'var(--_color-theme---text)', backgroundColor: 'var(--_color-theme---surface)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {currentStep > 1 ? `Back to ${STEPS[currentStep - 2].name}` : 'Back to Home'}
            </button>

            <div className="text-center">
              <h1
                className="text-2xl font-bold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                Discover Your Soul Signature
              </h1>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
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

              <h2 className="text-4xl md:text-5xl font-bold mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Discover Your Soul Signature
              </h2>

              <p className="text-base max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                "Perhaps we are searching in the branches for what we only find in the roots." Connect your digital life - Netflix, Spotify, Discord, and 30+ platforms - to discover what makes you authentically you.
              </p>

              {/* Stats Row */}
              <div className="flex justify-center items-center gap-8 mt-8">
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---accent)' }}>30+</div>
                  <div className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>Platforms</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---accent)' }}>100%</div>
                  <div className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>Authentic</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---accent)' }}>∞</div>
                  <div className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>Sharable</div>
                </div>
              </div>
            </div>

            {/* Apple-style Progressive Disclosure for Connectors */}
            <div className="mb-16">
              <h3
                className="text-2xl font-semibold text-center mb-4"
                style={{
                  color: 'var(--_color-theme---text)',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                Connect Your Soul's Digital Canvas
              </h3>
              <p
                className="text-center mb-8 max-w-2xl mx-auto"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Each platform reveals a different facet of your authentic self. Start with the ones that feel most "you."
              </p>

              {/* Essential Connectors First - Progressive Disclosure */}
              <div className="space-y-8">
                {/* Primary/Essential Connectors */}
                <div>
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <div
                      className="px-3 py-1 border rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: 'var(--_color-theme---surface)',
                        borderColor: 'var(--_color-theme---accent)',
                        color: 'var(--_color-theme---accent)'
                      }}
                    >
                      Essential
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                    {AVAILABLE_CONNECTORS.slice(0, 3).map(renderConnectorCard)}
                  </div>
                </div>

                {/* Show More Button - Apple-style Progressive Disclosure */}
                {!showAllConnectors && AVAILABLE_CONNECTORS.length > 3 && (
                  <div className="text-center">
                    <button
                      onClick={() => setShowAllConnectors(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-medium transition-all hover:shadow-md"
                      style={{
                        backgroundColor: 'var(--_color-theme---surface)',
                        borderColor: 'var(--_color-theme---border)',
                        color: 'var(--_color-theme---text)'
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Show {AVAILABLE_CONNECTORS.length - 3} More Options
                    </button>
                    <p
                      className="text-xs mt-2"
                      style={{ color: 'var(--_color-theme---text-secondary)' }}
                    >
                      Professional tools, social platforms, and more
                    </p>
                  </div>
                )}

                {/* Additional Connectors - Revealed Progressively */}
                {showAllConnectors && (
                  <div className="animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <div
                        className="px-3 py-1 border rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: 'var(--_color-theme---surface)',
                          borderColor: 'var(--_color-theme---border)',
                          color: 'var(--_color-theme---text-secondary)'
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
                        className="text-sm transition-colors"
                        style={{ color: 'var(--_color-theme---text-secondary)' }}
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
                userId={user?.email || user?.id || 'demo-user'}
                connectedServices={connectedServices}
              />
            )}

            {/* Action Section */}
            <div
              className="text-center rounded-3xl p-8 border"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              {connectedServices.length > 0 ? (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-center gap-2 mb-4" style={{ color: 'var(--_color-theme---accent)' }}>
                    <CheckCircle2 className="w-6 h-6" />
                    <span className="text-lg font-semibold">
                      Perfect! {connectedServices.length} platform{connectedServices.length !== 1 ? 's' : ''} connected
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="btn-anthropic-primary text-lg px-8 py-4 flex items-center gap-3 mx-auto transform hover:scale-105 transition-transform"
                  >
                    <Fingerprint className="w-5 h-5" />
                    Discover Your Soul Signature
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  <p
                    className="font-heading text-sm mt-3"
                    style={{
                      color: 'var(--_color-theme---text-secondary)',
                      fontFamily: 'var(--_typography---font--styrene-a)'
                    }}
                  >
                    Your soul signature will emerge in moments
                  </p>
                </div>
              ) : (
                <div>
                  <div
                    className="text-lg font-semibold mb-4"
                    style={{
                      color: 'var(--_color-theme---text)',
                      fontFamily: 'var(--_typography---font--styrene-a)'
                    }}
                  >
                    Connect at least one platform to begin
                  </div>
                  <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
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
              <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---accent)', boxShadow: '0 0 30px rgba(217, 119, 6, 0.3)' }}>
                <Shield className="w-10 h-10" style={{ color: 'white' }} />
              </div>
              <h2 className="text-3xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Your Privacy Matters
              </h2>
              <p className="text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                Your soul signature is precious. We protect it with the highest standards while giving you complete control.
              </p>
            </div>

            {/* Visual Privacy Features */}
            <div className="max-w-4xl mx-auto mb-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Military Grade Encryption */}
                <div className="text-center p-6 rounded-2xl border hover:shadow-lg transition-all" style={{ backgroundColor: 'var(--_color-theme---surface)', borderColor: 'var(--_color-theme---border)' }}>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                    <Shield className="w-8 h-8" style={{ color: 'var(--_color-theme---accent)' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--_color-theme---text)' }}>
                    Military-Grade Security
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                    AES-256 encryption protects your data at every step
                  </p>
                </div>

                {/* You Control Everything */}
                <div className="text-center p-6 rounded-2xl border hover:shadow-lg transition-all" style={{ backgroundColor: 'var(--_color-theme---surface)', borderColor: 'var(--_color-theme---border)' }}>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                    <Settings className="w-8 h-8" style={{ color: 'var(--_color-theme---accent)' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--_color-theme---text)' }}>
                    You're In Control
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                    Choose what to reveal, what to share, with whom
                  </p>
                </div>

                {/* Zero Data Retention */}
                <div className="text-center p-6 rounded-2xl border hover:shadow-lg transition-all" style={{ backgroundColor: 'var(--_color-theme---surface)', borderColor: 'var(--_color-theme---border)' }}>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                    <Eye className="w-8 h-8" style={{ color: 'var(--_color-theme---accent)' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--_color-theme---text)' }}>
                    Complete Transparency
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                    See exactly how your data creates your soul signature
                  </p>
                </div>
              </div>
            </div>

            {/* What Makes This Special */}
            <div className="max-w-2xl mx-auto mb-12 text-center">
              <div className="p-8 rounded-3xl border" style={{ backgroundColor: 'var(--_color-theme---surface)', borderColor: 'var(--_color-theme---accent)' }}>
                <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--_color-theme---text)' }}>
                  ✨ What makes this different?
                </h3>
                <p className="text-base leading-relaxed" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                  Unlike other platforms that harvest your data, we discover your soul signature and then
                  <span style={{ color: 'var(--_color-theme---accent)' }}> delete the raw data</span>.
                  You keep the insights, we keep nothing.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <button
                onClick={startTwinGeneration}
                className="btn-anthropic-primary flex items-center gap-3 mx-auto text-lg px-10 py-4 transform hover:scale-105 transition-all shadow-lg hover:shadow-xl"
              >
                <Sparkles className="w-6 h-6" />
                Reveal My Soul Signature
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-sm mt-4 max-w-md mx-auto" style={{ color: 'var(--_color-theme---text-secondary)' }}>
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