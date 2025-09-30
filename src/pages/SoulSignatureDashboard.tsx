import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Sparkles, Music, Film, Book, Gamepad2, Heart, Brain, Globe,
  ChevronRight, Play, Pause, Lock, Unlock, Fingerprint,
  User, Briefcase, Palette, Calendar, Mail, MessageSquare,
  Instagram, Twitter, Github, Linkedin, Youtube, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PrivacySpectrumDashboard from '@/components/PrivacySpectrumDashboard';
import ThemeToggle from '../components/ThemeToggle';

interface ConnectionStatus {
  spotify: boolean;
  netflix: boolean;
  youtube: boolean;
  steam: boolean;
  goodreads: boolean;
  gmail: boolean;
  calendar: boolean;
  teams: boolean;
  slack: boolean;
  discord: boolean;
}

const SoulSignatureDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const [activeCluster, setActiveCluster] = useState<string>('personal');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [connections, setConnections] = useState<ConnectionStatus>({
    spotify: false,
    netflix: false,
    youtube: false,
    steam: false,
    goodreads: false,
    gmail: true,
    calendar: true,
    teams: false,
    slack: false,
    discord: false
  });

  // Authentication check
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
      return;
    }
  }, [isSignedIn, navigate]);

  // Animated extraction simulation
  useEffect(() => {
    if (isExtracting) {
      const interval = setInterval(() => {
        setExtractionProgress(prev => {
          if (prev >= 100) {
            setIsExtracting(false);
            return 100;
          }
          return prev + 2;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isExtracting]);

  const clusters = [
    {
      id: 'personal',
      name: 'Personal Soul',
      description: 'Your authentic self through entertainment, creativity, and personal interests',
      icon: <Heart className="w-6 h-6" />,
      gradient: 'from-purple-600 via-pink-500 to-red-500',
      glowColor: 'rgba(219, 39, 119, 0.5)',
      connectors: [
        // Entertainment & Media
        { name: 'Spotify', icon: <Music />, status: connections.spotify, key: 'spotify', category: 'Entertainment' },
        { name: 'Netflix', icon: <Film />, status: connections.netflix, key: 'netflix', category: 'Entertainment' },
        { name: 'YouTube', icon: <Youtube />, status: connections.youtube, key: 'youtube', category: 'Entertainment' },
        { name: 'Steam', icon: <Gamepad2 />, status: connections.steam, key: 'steam', category: 'Gaming' },
        { name: 'Goodreads', icon: <Book />, status: connections.goodreads, key: 'goodreads', category: 'Reading' },
        // Social & Creative (merged from Creative Expression)
        { name: 'Instagram', icon: <Instagram />, status: false, key: 'instagram', category: 'Social' },
        { name: 'Twitter', icon: <Twitter />, status: false, key: 'twitter', category: 'Social' },
        { name: 'GitHub', icon: <Github />, status: false, key: 'github', category: 'Creative' },
        { name: 'Discord', icon: <Users />, status: connections.discord, key: 'discord', category: 'Community' }
      ],
      insights: [
        '🎵 Musical Identity: Eclectic Explorer with deep emotional connection',
        '🎬 Entertainment DNA: Seeks complex narratives and meaningful stories',
        '🎮 Gaming Persona: Strategic thinker who values collaborative experiences',
        '📚 Learning Style: Philosophy seeker with sci-fi imagination',
        '🎨 Creative Expression: Boundary pusher who thinks across domains',
        '💬 Social Engagement: Community builder with authentic connections'
      ],
      analysisActions: [
        {
          id: 'entertainment-analysis',
          name: 'Analyze Entertainment Soul',
          description: 'Extract personality from entertainment platforms',
          platforms: ['spotify', 'netflix', 'youtube']
        },
        {
          id: 'complete-personal',
          name: 'Complete Personal Analysis',
          description: 'Comprehensive personal profile analysis',
          platforms: 'all'
        }
      ]
    },
    {
      id: 'professional',
      name: 'Professional Identity',
      description: 'Your work persona through communication, collaboration, and productivity patterns',
      icon: <Briefcase className="w-6 h-6" />,
      gradient: 'from-blue-600 via-cyan-500 to-teal-500',
      glowColor: 'rgba(6, 182, 212, 0.5)',
      connectors: [
        { name: 'Gmail', icon: <Mail />, status: connections.gmail, key: 'gmail', category: 'Communication' },
        { name: 'Calendar', icon: <Calendar />, status: connections.calendar, key: 'calendar', category: 'Time Management' },
        { name: 'Teams', icon: <Users />, status: connections.teams, key: 'teams', category: 'Collaboration' },
        { name: 'Slack', icon: <MessageSquare />, status: connections.slack, key: 'slack', category: 'Collaboration' },
        { name: 'LinkedIn', icon: <Linkedin />, status: false, key: 'linkedin', category: 'Networking' }
      ],
      insights: [
        '📧 Communication DNA: Professional Communicator with adaptive tone',
        '🗓️ Time Management: Strategic scheduler with balanced meeting rhythm',
        '🤝 Collaboration Style: High-touch collaborative approach',
        '⚡ Productivity Pattern: Peak performance during business hours',
        '🎯 Professional Signature: External-focused networker with meeting-centric work style',
        '💼 Leadership Style: Servant leader with cross-functional expertise'
      ],
      analysisActions: [
        {
          id: 'communication-analysis',
          name: 'Analyze Communication Style',
          description: 'Extract communication patterns from Gmail',
          platforms: ['gmail']
        },
        {
          id: 'productivity-analysis',
          name: 'Analyze Work Patterns',
          description: 'Discover productivity and time patterns',
          platforms: ['calendar']
        },
        {
          id: 'complete-professional',
          name: 'Complete Professional Analysis',
          description: 'Comprehensive professional profile',
          platforms: ['gmail', 'calendar']
        }
      ]
    }
  ];

  const handleConnectorClick = async (clusterKey: string, connectorKey: string) => {
    if (!connections[connectorKey as keyof ConnectionStatus]) {
      // Start real connection process
      try {
        const response = await fetch(`/api/entertainment/connect/${connectorKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'current-user' })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authUrl) {
            window.open(data.authUrl, '_blank');
          }
          setConnections(prev => ({ ...prev, [connectorKey]: true }));
        }
      } catch (error) {
        console.error('Connection error:', error);
      }
    } else {
      // Platform is connected, extract soul signature
      await extractSoulSignature(connectorKey);
    }
  };

  const extractSoulSignature = async (platform: string) => {
    setIsExtracting(true);
    setExtractionProgress(0);

    try {
      console.log(`🧠 Extracting soul signature from ${platform}`);

      let response;
      const userId = user?.id || user?.email || 'anonymous-user'; // Use actual user ID

      // Handle different analysis types
      if (platform === 'communication-analysis' || platform === 'gmail') {
        console.log('📧 Analyzing Gmail communication patterns...');
        response = await fetch(`/api/soul/extract/gmail/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (platform === 'productivity-analysis' || platform === 'calendar') {
        console.log('🗓️ Analyzing Calendar time management patterns...');
        response = await fetch(`/api/soul/extract/calendar/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (platform === 'complete-professional' || platform === 'professional') {
        console.log('💼 Generating complete professional soul signature...');
        response = await fetch(`/api/soul/extract/professional/${userId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // For other platforms, try original route
        response = await fetch(`/api/soul/extract/platform/${platform}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            accessToken: null
          })
        });
      }

      if (response?.ok) {
        const data = await response.json();
        console.log('✨ Real soul signature extracted:', data);

        // Update UI with real insights
        if (data.data) {
          updateClusterInsights(platform, data.data);
        }
      } else {
        // Fallback to demo extraction for non-professional platforms
        if (!['gmail', 'calendar', 'professional'].includes(platform)) {
          const demoResponse = await fetch(`/api/soul/demo/${platform}`);
          if (demoResponse.ok) {
            const demoData = await demoResponse.json();
            console.log('🎭 Using demo soul signature:', demoData);
            updateClusterInsights(platform, demoData.data);
          }
        } else {
          // Show demo professional insights for Gmail/Calendar
          const demoInsights = {
            soulSignature: {
              communicationStyle: {
                communicationTone: 'Professional',
                responsePattern: 'Business Hours',
                formalityScore: 75,
                emailFrequency: 12
              },
              professionalIdentity: {
                collaborationStyle: 'High Collaboration',
                networkType: 'External Focused',
                networkDiversity: 15
              },
              personalityInsights: {
                communicationPersona: 'The Professional Communicator',
                workStyle: 'Traditional business hour focus',
                socialProfile: 'Team-oriented and meeting-focused'
              }
            }
          };
          updateClusterInsights(platform, demoInsights);
        }
      }
    } catch (error) {
      console.error('Soul extraction error:', error);
      // Show demo insights on error
      updateClusterInsights(platform, {
        soulSignature: {
          personalityInsights: {
            communicationPersona: `The ${platform.charAt(0).toUpperCase() + platform.slice(1)} Professional`
          }
        }
      });
    } finally {
      // Animate extraction progress
      const interval = setInterval(() => {
        setExtractionProgress(prev => {
          if (prev >= 100) {
            setIsExtracting(false);
            clearInterval(interval);
            return 100;
          }
          return prev + 8;
        });
      }, 80);
    }
  };

  const updateClusterInsights = (platform: string, soulSignature: any) => {
    // Find which cluster this platform belongs to
    const cluster = clusters.find(c =>
      c.connectors.some(conn => conn.key === platform)
    );

    if (cluster && soulSignature) {
      // Update cluster insights with real data
      const newInsights = soulSignature.uniquenessMarkers || cluster.insights;

      // This would update the cluster's insights in a real state management system
      console.log(`🌟 Updated ${cluster.name} with insights:`, newInsights);
    }
  };

  const startExtraction = () => {
    setIsExtracting(true);
    setExtractionProgress(0);
  };

  const currentCluster = clusters.find(c => c.id === activeCluster)!;

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${currentCluster.glowColor}, transparent 70%)`
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 p-8 max-w-7xl mx-auto">
        {/* Theme Toggle - Fixed Top Right */}
        <div className="fixed top-8 right-8 z-50">
          <ThemeToggle />
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <Fingerprint className="w-10 h-10 text-purple-400" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              Soul Signature Extraction
            </h1>
            <Sparkles className="w-10 h-10 text-cyan-400" />
          </div>
          <p className="text-gray-300 text-lg">
            Discovering your authentic digital essence through your choices and preferences
          </p>
          <div className="text-sm text-gray-400 mt-4 max-w-2xl mx-auto">
            <strong>Twin Me</strong> analyzes your digital footprint to create an authentic personality profile.
            Connect your platforms to discover insights about your Professional Identity and Personal Soul.
          </div>
        </motion.div>

        {/* Cluster Navigation */}
        <div className="flex justify-center gap-4 mb-12">
          {clusters.map((cluster) => (
            <motion.button
              key={cluster.id}
              onClick={() => setActiveCluster(cluster.id)}
              className={cn(
                "relative px-6 py-3 rounded-full transition-all duration-300",
                "border-2 backdrop-blur-sm",
                activeCluster === cluster.id
                  ? "border-white/50 bg-white/10"
                  : "border-white/20 bg-white/5 hover:bg-white/10"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className={cn(
                "absolute inset-0 rounded-full opacity-50 blur-xl",
                `bg-gradient-to-r ${cluster.gradient}`
              )} />
              <div className="relative flex items-center gap-2">
                <span className="text-white">{cluster.icon}</span>
                <span className="font-medium text-white">{cluster.name}</span>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Connectors Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gray-900/50 backdrop-blur border-gray-800 p-6 h-full">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white">
                <Globe className="w-5 h-5 text-white" />
                Data Sources
              </h3>
              <div className="space-y-3">
                {currentCluster.connectors.map((connector) => (
                  <motion.button
                    key={connector.key}
                    onClick={() => handleConnectorClick(activeCluster, connector.key)}
                    className={cn(
                      "w-full p-3 rounded-lg transition-all duration-300",
                      "flex items-center justify-between",
                      connector.status
                        ? "bg-green-500/20 border border-green-500/50"
                        : "bg-gray-800/50 border border-gray-700 hover:bg-gray-800"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white">{connector.icon}</span>
                      <span className="text-white">{connector.name}</span>
                    </div>
                    {connector.status ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                        Connected
                      </Badge>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                  </motion.button>
                ))}

                {/* Analysis Actions */}
                <motion.div
                  className="mt-6 pt-6 border-t border-gray-700"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <h4 className="text-sm font-medium text-white mb-4">Soul Analysis Options</h4>
                  <div className="space-y-3">
                    {currentCluster.analysisActions?.map((action, index) => (
                      <Button
                        key={action.id}
                        onClick={() => extractSoulSignature(action.id)}
                        disabled={isExtracting}
                        variant="outline"
                        className="w-full justify-start text-left p-4 h-auto bg-gray-800/30 border-gray-600 hover:bg-gray-700/50 text-white"
                      >
                        <div>
                          <div className="font-medium text-sm">{action.name}</div>
                          <div className="text-xs text-gray-400 mt-1">{action.description}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </motion.div>
              </div>
            </Card>
          </motion.div>

          {/* Central Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-gray-900/50 backdrop-blur border-gray-800 p-6 h-full">
              <h3 className="text-xl font-semibold mb-6 text-center text-white">
                Soul Signature Visualization
              </h3>

              {/* Animated Cluster Visual */}
              <div className="relative h-64 flex items-center justify-center">
                <motion.div
                  className={cn(
                    "absolute w-48 h-48 rounded-full",
                    `bg-gradient-to-r ${currentCluster.gradient}`
                  )}
                  animate={{
                    rotate: 360,
                    scale: [1, 1.1, 1]
                  }}
                  transition={{
                    rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                    scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                  }}
                  style={{ filter: 'blur(40px)', opacity: 0.5 }}
                />
                <div className="relative z-10 text-center">
                  <div className={cn(
                    "w-32 h-32 rounded-full flex items-center justify-center",
                    "bg-gradient-to-br backdrop-blur-sm border-2 border-white/20",
                    currentCluster.gradient
                  )}>
                    {currentCluster.icon}
                  </div>
                  <div className="mt-4">
                    <div className="text-sm text-gray-300">Uniqueness Score</div>
                    <div className="text-2xl font-bold text-white">87%</div>
                  </div>
                </div>
              </div>

              {/* Extraction Control */}
              <div className="mt-6 space-y-4">
                {isExtracting ? (
                  <div>
                    <div className="flex justify-between text-sm mb-2 text-white">
                      <span>Extracting Soul Signature...</span>
                      <span>{extractionProgress}%</span>
                    </div>
                    <Progress value={extractionProgress} className="h-2" />
                  </div>
                ) : (
                  <Button
                    onClick={startExtraction}
                    className={cn(
                      "w-full bg-gradient-to-r text-white font-medium",
                      currentCluster.gradient
                    )}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Extract {currentCluster.name}
                  </Button>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Insights Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-gray-900/50 backdrop-blur border-gray-800 p-6 h-full">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white">
                <Brain className="w-5 h-5 text-white" />
                Discovered Patterns
              </h3>
              <div className="space-y-3">
                {currentCluster.insights.map((insight, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + index * 0.1 }}
                    className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full mt-1.5",
                        `bg-gradient-to-r ${currentCluster.gradient}`
                      )} />
                      <p className="text-sm text-gray-300">{insight}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Privacy Controls Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <Button
            onClick={() => setShowPrivacyControls(!showPrivacyControls)}
            variant="outline"
            className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
          >
            {showPrivacyControls ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
            {showPrivacyControls ? 'Hide' : 'Show'} Privacy Controls
          </Button>
        </motion.div>

        {/* Privacy Spectrum Dashboard */}
        <AnimatePresence>
          {showPrivacyControls && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-8"
            >
              <PrivacySpectrumDashboard />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 flex justify-center gap-4"
        >
          <Button
            onClick={() => navigate('/twin-profile-preview')}
            className="bg-gradient-to-r from-purple-500 to-pink-500"
          >
            <Play className="w-4 h-4 mr-2" />
            Preview Your Twin
          </Button>
          <Button
            onClick={() => navigate('/twin-activation')}
            variant="outline"
            className="border-cyan-500/50 text-cyan-400"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Activate Twin
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default SoulSignatureDashboard;