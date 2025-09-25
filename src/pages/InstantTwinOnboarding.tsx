/**
 * InstantTwinOnboarding - Revolutionary 60-Second Twin Generation
 * Connect your digital life and get an instant working twin
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
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
  Gmail,
  Calendar,
  MessageSquare,
  Linkedin,
  Twitter,
  Github,
  Music,
  Play,
  Settings,
  Eye,
  EyeOff
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
    icon: <Gmail className="w-6 h-6" />,
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
    icon: <Linkedin className="w-6 h-6" />,
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
  const { user } = useUser();
  const { toast } = useToast();

  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnectors, setSelectedConnectors] = useState<DataProvider[]>([]);
  const [connectedServices, setConnectedServices] = useState<DataProvider[]>([]);
  const [generationProgress, setGenerationProgress] = useState<TwinGenerationProgress | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
      // In production, this would initiate OAuth flow
      const authUrl = `https://accounts.google.com/oauth?provider=${provider}&redirect=${window.location.origin}/oauth/callback`;

      toast({
        title: "Connecting...",
        description: `Redirecting to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
      });

      // Simulate OAuth flow
      setTimeout(() => {
        setConnectedServices(prev => [...prev, provider]);
        toast({
          title: "Connected!",
          description: `Successfully connected to ${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name}`,
        });
      }, 1500);

    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Please try again or skip this service",
        variant: "destructive"
      });
    }
  }, [toast]);

  const startTwinGeneration = useCallback(async () => {
    if (!user) return;

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

    // Complete
    setTimeout(() => {
      navigate('/twin-dashboard');
    }, 2000);

  }, [user, selectedConnectors, navigate]);

  // ====================================================================
  // RENDER HELPERS
  // ====================================================================

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-12">
      <div className="flex items-center space-x-4">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all duration-300 ${
              currentStep >= step.id
                ? 'bg-[hsl(var(--_color-theme---button-primary--background))] text-white'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {currentStep > step.id ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                step.id
              )}
            </div>
            <div className="ml-2 text-sm">
              <div className={`font-medium ${currentStep >= step.id ? 'text-[hsl(var(--_color-theme---text))]' : 'text-gray-500'}`}>
                {step.name}
              </div>
              <div className="text-gray-400 text-xs">{step.description}</div>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`w-8 h-px mx-4 transition-colors duration-300 ${
                currentStep > step.id ? 'bg-[hsl(var(--_color-theme---button-primary--background))]' : 'bg-gray-200'
              }`} />
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
        className={`relative p-6 rounded-2xl border-2 transition-all duration-300 cursor-pointer hover:shadow-lg ${
          isSelected
            ? 'border-[hsl(var(--_color-theme---button-primary--background))] bg-[hsl(var(--_color-theme---button-primary--background))]/5'
            : 'border-[hsl(var(--_color-theme---border))] hover:border-[hsl(var(--_color-theme---border-hover))]'
        }`}
        onClick={() => handleConnectorToggle(connector.provider)}
      >
        {/* Connection status indicator */}
        {isConnected && (
          <div className="absolute top-4 right-4">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
        )}

        {/* Service icon and name */}
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
            style={{ backgroundColor: connector.color }}
          >
            {connector.icon}
          </div>
          <div>
            <h3 className="font-medium text-lg" style={{ color: 'var(--_color-theme---text)' }}>
              {connector.name}
            </h3>
            <p className="text-sm text-gray-500">{connector.setupTime} setup</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm mb-4" style={{ color: 'var(--_color-theme---text)' }}>
          {connector.description}
        </p>

        {/* Data insights preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Insights Generated:</span>
            <span className="font-medium" style={{ color: 'var(--_color-theme---text)' }}>
              ~{connector.estimatedInsights}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {connector.dataTypes.slice(0, 3).map((type) => (
              <span
                key={type}
                className="px-2 py-1 text-xs rounded-full"
                style={{
                  backgroundColor: 'var(--_color-theme---background-secondary)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                {type}
              </span>
            ))}
          </div>
        </div>

        {/* Privacy indicator */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
          <Shield className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">
            Privacy: {connector.privacyLevel}
          </span>
        </div>
      </div>
    );
  };

  const renderGenerationProgress = () => {
    if (!generationProgress) return null;

    return (
      <div className="text-center">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div
              className="absolute inset-0 rounded-full border-4 border-[hsl(var(--_color-theme---button-primary--background))] transition-all duration-500"
              style={{
                clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos((generationProgress.progress * 3.6 - 90) * Math.PI / 180)}% ${50 + 50 * Math.sin((generationProgress.progress * 3.6 - 90) * Math.PI / 180)}%, 50% 50%)`
              }}
            ></div>
            <div className="absolute inset-4 rounded-full bg-[hsl(var(--_color-theme---button-primary--background))] flex items-center justify-center">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-medium mb-2" style={{ color: 'var(--_color-theme---text)' }}>
            {generationProgress.progress === 100 ? 'Your Twin is Ready!' : 'Creating Your Digital Twin'}
          </h2>

          <p className="text-gray-500 mb-6">{generationProgress.currentTask}</p>

          {/* Progress bar */}
          <div className="max-w-md mx-auto mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${generationProgress.progress}%`,
                  backgroundColor: 'var(--_color-theme---button-primary--background)'
                }}
              ></div>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-gray-500">{generationProgress.progress}% complete</span>
              <span className="text-gray-500">
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
              <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---button-primary--background)' }}>
                {generationProgress.connectorsConnected.length}
              </div>
              <div className="text-xs text-gray-500">Services</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---button-primary--background)' }}>
                {generationProgress.dataPointsIngested}
              </div>
              <div className="text-xs text-gray-500">Data Points</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--_color-theme---button-primary--background)' }}>
                {generationProgress.insightsGenerated}
              </div>
              <div className="text-xs text-gray-500">Insights</div>
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
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b" style={{ borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-sm hover:opacity-70 transition-opacity"
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="text-center">
              <h1 className="text-xl font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                Create Your Instant Twin
              </h1>
              <p className="text-sm text-gray-500">
                Connect your digital life and get a working twin in 60 seconds
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="text-gray-500">60s setup</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {renderStepIndicator()}

        {/* Step 1: Connect Services */}
        {currentStep === 1 && (
          <div>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-medium mb-4" style={{ color: 'var(--_color-theme---text)' }}>
                Connect Your Digital Services
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                Your twin learns from your actual behavior across platforms. Connect the services you use most
                to get the most accurate personality representation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {AVAILABLE_CONNECTORS.map(renderConnectorCard)}
            </div>

            <div className="text-center">
              <button
                onClick={() => setCurrentStep(2)}
                disabled={selectedConnectors.length === 0}
                className="btn-anthropic-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
              >
                Continue with {selectedConnectors.length} service{selectedConnectors.length !== 1 ? 's' : ''}
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-sm text-gray-500 mt-2">
                You can always add more services later
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Privacy Settings */}
        {currentStep === 2 && (
          <div>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-medium mb-4" style={{ color: 'var(--_color-theme---text)' }}>
                Privacy & Data Control
              </h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                Your data security is our priority. All processing happens with military-grade encryption,
                and you maintain full control over what information is used.
              </p>
            </div>

            <div className="max-w-2xl mx-auto space-y-6 mb-12">
              <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: 'var(--_color-theme---border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-green-500" />
                    <h3 className="font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                      Data Encryption
                    </h3>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm text-gray-500">
                  All data is encrypted in transit and at rest using AES-256 encryption
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: 'var(--_color-theme---border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-blue-500" />
                    <h3 className="font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                      Data Transparency
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                    className="text-sm text-blue-500 hover:underline"
                  >
                    {showPrivacyDetails ? 'Hide' : 'View'} Details
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  You can see exactly what data is being processed and how it's used
                </p>

                {showPrivacyDetails && (
                  <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
                    {selectedConnectors.map(provider => {
                      const connector = AVAILABLE_CONNECTORS.find(c => c.provider === provider);
                      return connector ? (
                        <div key={provider} className="flex items-center justify-between text-sm">
                          <span>{connector.name}:</span>
                          <span className="text-gray-500">{connector.dataTypes.join(', ')}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: 'var(--_color-theme---border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-purple-500" />
                    <h3 className="font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                      Data Retention
                    </h3>
                  </div>
                  <span className="text-sm text-gray-500">30 days default</span>
                </div>
                <p className="text-sm text-gray-500">
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
              <p className="text-sm text-gray-500 mt-2">
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