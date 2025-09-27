/**
 * InstantTwinOnboarding - Revolutionary 60-Second Twin Generation
 * Connect your digital life and get an instant working twin
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
  Plus
} from 'lucide-react';

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
  }
];

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const InstantTwinOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Parse URL parameters once
  const urlParams = new URLSearchParams(window.location.search);
  const twinType = urlParams.get('type') || 'educational'; // Default to educational
  const isPersonalTwin = twinType === 'personal';
  // Map frontend types to API types
  const apiTwinType = isPersonalTwin ? 'personal' : 'professor';

  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnectors, setSelectedConnectors] = useState<DataProvider[]>([]);
  const [connectedServices, setConnectedServices] = useState<DataProvider[]>([]);
  const [generationProgress, setGenerationProgress] = useState<TwinGenerationProgress | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasCheckedConnection, setHasCheckedConnection] = useState(false);
  // Progressive disclosure state
  const [showAllConnectors, setShowAllConnectors] = useState(false);

  // Check for OAuth callback success
  useEffect(() => {
    if (!user?.id || hasCheckedConnection) return;

    const currentUrlParams = new URLSearchParams(window.location.search);
    const connected = currentUrlParams.get('connected');

    if (connected === 'true') {
      // A connection was successful, check connection status with longer delay
      console.log('🔗 OAuth callback detected, checking connection status...');
      setTimeout(() => {
        checkConnectionStatus();
        setHasCheckedConnection(true);
      }, 2000); // Increased delay to ensure backend processing is complete
    } else {
      // Reset connection status on fresh page load (no OAuth callback)
      resetConnectionStatus();
      setHasCheckedConnection(true);
    }
  }, [user]);

  const resetConnectionStatus = async () => {
    try {
      if (!user?.id) return;

      console.log('🔄 Resetting connection status for fresh page load');
      const response = await fetch(`http://localhost:3001/api/connectors/reset/${user.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (result.success) {
        setConnectedServices([]);
        console.log('✅ Connection status reset successfully');
      }
    } catch (error) {
      console.error('❌ Error resetting connection status:', error);
      // Clear local state anyway
      setConnectedServices([]);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      if (!user?.id) return;

      const response = await fetch(`http://localhost:3001/api/connectors/status/${user.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success) {
        // Update connected services based on actual backend status
        const connectedProviders = Object.keys(result.data || {}) as DataProvider[];
        console.log('🔍 Connection status check:', {
          success: result.success,
          resultData: result.data,
          connectedProviders,
          currentConnectedServices: connectedServices,
          dataKeys: Object.keys(result.data || {}),
          dataValues: Object.values(result.data || {})
        });

        setConnectedServices(connectedProviders);
        console.log('📝 Updated connectedServices state to:', connectedProviders);

        if (connectedProviders.length > 0) {
          toast({
            title: "Connection Updated",
            description: `${connectedProviders.length} service${connectedProviders.length !== 1 ? 's' : ''} connected`,
          });
        }
      } else {
        console.warn('❌ Connection status check failed:', result);
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
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
    try {
      console.log('🔍 Connect service called with:', { provider, userId: user?.id, user });
      console.log('🌐 Current VITE_API_URL:', import.meta.env.VITE_API_URL);
      console.log('🌐 All env vars:', import.meta.env);

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      // Get OAuth authorization URL from backend
      const apiUrl = `http://localhost:3001/api/connectors/auth/${provider}?userId=${user.id}`;
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
      console.log('OAuth auth response:', result);

      if (result.success && result.data?.authUrl) {
        // Redirect to OAuth provider
        window.location.href = result.data.authUrl;
      } else {
        throw new Error(result.error || 'Failed to get authorization URL');
      }

    } catch (error: any) {
      console.error('Error connecting service:', error);
      toast({
        title: "Connection failed",
        description: "Please try again or skip this service",
        variant: "destructive"
      });
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

    // Create the twin first, then navigate to its dashboard
    try {
      const twinData = {
        name: user.fullName || user.firstName || `My ${isPersonalTwin ? 'Personal' : 'Educational'} Twin`,
        user_id: user.id,
        twin_type: apiTwinType,
        teaching_philosophy: isPersonalTwin
          ? 'Personal knowledge and experiences from connected data sources'
          : 'Generated from connected data sources',
        student_interaction: isPersonalTwin
          ? 'Casual and personalized based on communication style'
          : 'Personalized based on your communication patterns',
        humor_style: 'Adaptive',
        communication_style: 'Based on your connected platform analysis',
        expertise: ['Data-driven insights from your digital footprint'],
        is_active: true
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL}/twins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(twinData)
      });

      const result = await response.json();

      if (result.success && result.data?.id) {
        // Navigate to the specific twin dashboard based on twin type
        setTimeout(() => {
          if (isPersonalTwin) {
            navigate(`/twin-dashboard/${result.data.id}`);
          } else {
            navigate(`/twin-dashboard/${result.data.id}`);
          }
        }, 2000);
      } else {
        throw new Error('Failed to create twin');
      }
    } catch (error) {
      console.error('Error creating twin:', error);
      toast({
        title: "Error",
        description: "Failed to create your digital twin. Please try again.",
        variant: "destructive"
      });
      // Fallback navigation based on twin type
      setTimeout(() => {
        navigate(isPersonalTwin ? '/personal-dashboard' : '/professor-dashboard');
      }, 2000);
    }

  }, [user, selectedConnectors, navigate, isPersonalTwin, apiTwinType]);

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
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
              style={{ backgroundColor: 'var(--_color-theme---accent)', color: 'black', fontFamily: 'var(--_typography---font--styrene-a)' }}
            >
              Connect
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
            <div
              className="absolute inset-0 rounded-full border-4"
              style={{ borderColor: 'var(--_color-theme---border)' }}
            ></div>
            <div
              className="absolute inset-0 rounded-full border-4 transition-all duration-500"
              style={{
                borderColor: 'var(--_color-theme---accent)',
                clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos((generationProgress.progress * 3.6 - 90) * Math.PI / 180)}% ${50 + 50 * Math.sin((generationProgress.progress * 3.6 - 90) * Math.PI / 180)}%, 50% 50%)`
              }}
            ></div>
            <div
              className="absolute inset-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--_color-theme---accent)' }}
            >
              <Brain className="w-8 h-8" style={{ color: 'white' }} />
            </div>
          </div>

          <h2 className="text-2xl font-medium mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
            {generationProgress.progress === 100 ? 'Your Twin is Ready!' : 'Creating Your Digital Twin'}
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
                Create Your {isPersonalTwin ? 'Personal' : 'Educational'} AI Twin
              </h1>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                {isPersonalTwin
                  ? 'Connect apps and get instant AI personality'
                  : 'Connect tools and get instant teaching AI'
                }
              </p>
            </div>

            <div
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-full font-semibold"
              style={{ backgroundColor: 'var(--_color-theme---accent)', color: 'white' }}
            >
              <Zap className="w-4 h-4" />
              <span>60s setup</span>
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
                {isPersonalTwin
                  ? 'Create Your Digital Twin'
                  : 'Transform Your Teaching'
                }
              </h2>

              <p className="text-base max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                {isPersonalTwin
                  ? 'Connect your apps and get an instant AI that captures your personality. Your twin learns your style, humor, and expertise from real data.'
                  : 'Connect your digital teaching footprint and get an AI that teaches exactly like you. Your students get 24/7 access to your expertise and teaching style.'
                }
              </p>

              {/* Stats Row */}
              <div className="flex justify-center items-center gap-8 mt-8">
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---accent)' }}>60s</div>
                  <div className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>Setup Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---accent)' }}>100%</div>
                  <div className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>Your Style</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---accent)' }}>24/7</div>
                  <div className="text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>Available</div>
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
                Choose Your Digital Footprint
              </h3>
              <p
                className="text-center mb-8 max-w-2xl mx-auto"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Start with the essentials. You can always add more services later.
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
                      Great! You're connected to {connectedServices.length} service{connectedServices.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="btn-anthropic-primary text-lg px-8 py-4 flex items-center gap-3 mx-auto transform hover:scale-105 transition-transform"
                  >
                    <User className="w-5 h-5" />
                    Build Your AI Twin
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  <p
                    className="font-heading text-sm mt-3"
                    style={{
                      color: 'var(--_color-theme---text-secondary)',
                      fontFamily: 'var(--_typography---font--styrene-a)'
                    }}
                  >
                    Your AI will be ready in under 60 seconds
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
                    Connect at least one service to continue
                  </div>
                  <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
                    Each connection makes your AI twin more accurate and personalized
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Privacy Settings */}
        {currentStep === 2 && (
          <div>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Privacy & Data Control
              </h2>
              <p
                className="max-w-2xl mx-auto"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Your data security is our priority. All processing happens with military-grade encryption,
                and you maintain full control over what information is used.
              </p>
            </div>

            <div className="max-w-2xl mx-auto space-y-6 mb-12">
              <div
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                    <h3
                      className="font-medium"
                      style={{
                        color: 'var(--_color-theme---text)',
                        fontFamily: 'var(--_typography---font--styrene-a)'
                      }}
                    >
                      Data Encryption
                    </h3>
                  </div>
                  <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                </div>
                <p
                  className="text-sm"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  All data is encrypted in transit and at rest using AES-256 encryption
                </p>
              </div>

              <div
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                    <h3
                      className="font-medium"
                      style={{
                        color: 'var(--_color-theme---text)',
                        fontFamily: 'var(--_typography---font--styrene-a)'
                      }}
                    >
                      Data Transparency
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                    className="text-sm hover:underline"
                    style={{ color: 'var(--_color-theme---accent)' }}
                  >
                    {showPrivacyDetails ? 'Hide' : 'View'} Details
                  </button>
                </div>
                <p
                  className="text-sm mb-4"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  You can see exactly what data is being processed and how it's used
                </p>

                {showPrivacyDetails && (
                  <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
                    {selectedConnectors.map(provider => {
                      const connector = AVAILABLE_CONNECTORS.find(c => c.provider === provider);
                      return connector ? (
                        <div key={provider} className="flex items-center justify-between text-sm">
                          <span>{connector.name}:</span>
                          <span style={{ color: 'var(--_color-theme---text-secondary)' }}>
                            {connector.dataTypes.join(', ')}
                          </span>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5" style={{ color: 'var(--_color-theme---accent)' }} />
                    <h3
                      className="font-medium"
                      style={{
                        color: 'var(--_color-theme---text)',
                        fontFamily: 'var(--_typography---font--styrene-a)'
                      }}
                    >
                      Data Retention
                    </h3>
                  </div>
                  <span
                    className="text-sm"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    30 days default
                  </span>
                </div>
                <p
                  className="text-sm"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  Raw data is automatically deleted after processing. Only anonymized insights are kept.
                </p>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={startTwinGeneration}
                className="btn-anthropic-primary flex items-center gap-2 mx-auto text-lg px-8 py-4"
              >
                <Sparkles className="w-5 h-5" />
                Generate My Twin (60s)
              </button>
              <p
                className="text-sm mt-2"
                style={{ color: 'var(--_color-theme---text-secondary)' }}
              >
                Your twin will be ready in about 60 seconds
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