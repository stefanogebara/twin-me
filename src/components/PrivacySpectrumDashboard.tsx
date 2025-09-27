import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Briefcase, Palette, Music, Film, Book, Heart, Brain,
  Globe, Shield, Eye, EyeOff, Sparkles, Fingerprint,
  ChevronRight, Lock, Unlock, Users, UserCheck, Clock,
  MapPin, Wifi, Calendar, Zap, Settings
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ClusterData {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  subclusters: SubclusterData[];
  intensity: number;
  privacyLevel: number;
}

interface SubclusterData {
  id: string;
  name: string;
  dataPoints: DataPoint[];
  intensity: number;
  privacyLevel: number;
}

interface DataPoint {
  id: string;
  type: string;
  value: any;
  source: string;
  timestamp: string;
  sensitivity: number;
}

interface ContextualData {
  timeOfDay: 'morning' | 'work' | 'evening' | 'night';
  location: 'home' | 'office' | 'public' | 'unknown';
  deviceType: 'mobile' | 'desktop' | 'tablet';
  networkType: 'private' | 'corporate' | 'public';
  activityLevel: number; // 0-100
  socialContext: 'alone' | 'family' | 'colleagues' | 'friends';
}

interface PrivacyRecommendation {
  context: string;
  suggestedLevel: number;
  reason: string;
  confidence: number;
  icon: React.ReactNode;
}

const PrivacySpectrumDashboard: React.FC = () => {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [audienceMode, setAudienceMode] = useState<'everyone' | 'professional' | 'friends' | 'intimate'>('friends');
  const [globalPrivacy, setGlobalPrivacy] = useState(50);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

  // Context-aware features
  const [contextAwareMode, setContextAwareMode] = useState(true);
  const [currentContext, setCurrentContext] = useState<ContextualData>({
    timeOfDay: 'work',
    location: 'office',
    deviceType: 'desktop',
    networkType: 'corporate',
    activityLevel: 75,
    socialContext: 'colleagues'
  });
  const [privacyRecommendations, setPrivacyRecommendations] = useState<PrivacyRecommendation[]>([]);
  const [lastContextUpdate, setLastContextUpdate] = useState(new Date());
  const [realTimeData, setRealTimeData] = useState<{[key: string]: any}>({});
  const [isExtractingData, setIsExtractingData] = useState(false);
  const [dataStream, setDataStream] = useState<DataPoint[]>([]);
  const [connectionPulse, setConnectionPulse] = useState<{[key: string]: boolean}>({});

  // Identity clusters with beautiful visualization
  const [clusters, setClusters] = useState<ClusterData[]>([
    {
      id: 'personal',
      name: 'Personal Identity',
      icon: <Heart className="w-5 h-5" />,
      color: 'from-purple-500 to-pink-500',
      intensity: 75,
      privacyLevel: 30,
      subclusters: [
        {
          id: 'entertainment',
          name: 'Entertainment & Culture',
          dataPoints: [],
          intensity: 80,
          privacyLevel: 60
        },
        {
          id: 'hobbies',
          name: 'Hobbies & Passions',
          dataPoints: [],
          intensity: 65,
          privacyLevel: 40
        },
        {
          id: 'lifestyle',
          name: 'Lifestyle & Values',
          dataPoints: [],
          intensity: 70,
          privacyLevel: 20
        }
      ]
    },
    {
      id: 'professional',
      name: 'Professional Identity',
      icon: <Briefcase className="w-5 h-5" />,
      color: 'from-blue-500 to-cyan-500',
      intensity: 85,
      privacyLevel: 70,
      subclusters: [
        {
          id: 'expertise',
          name: 'Skills & Knowledge',
          dataPoints: [],
          intensity: 90,
          privacyLevel: 80
        },
        {
          id: 'workstyle',
          name: 'Work Patterns',
          dataPoints: [],
          intensity: 75,
          privacyLevel: 60
        }
      ]
    },
    {
      id: 'creative',
      name: 'Creative Expression',
      icon: <Palette className="w-5 h-5" />,
      color: 'from-orange-500 to-red-500',
      intensity: 60,
      privacyLevel: 50,
      subclusters: [
        {
          id: 'artistic',
          name: 'Artistic Output',
          dataPoints: [],
          intensity: 70,
          privacyLevel: 70
        },
        {
          id: 'innovation',
          name: 'Ideas & Vision',
          dataPoints: [],
          intensity: 55,
          privacyLevel: 40
        }
      ]
    }
  ]);

  // Privacy level descriptions
  const privacyLevels = [
    { value: 0, label: 'Hidden', icon: <Lock className="w-4 h-4" />, color: 'text-red-500' },
    { value: 25, label: 'Intimate', icon: <Heart className="w-4 h-4" />, color: 'text-pink-500' },
    { value: 50, label: 'Friends', icon: <Users className="w-4 h-4" />, color: 'text-blue-500' },
    { value: 75, label: 'Professional', icon: <Briefcase className="w-4 h-4" />, color: 'text-green-500' },
    { value: 100, label: 'Public', icon: <Globe className="w-4 h-4" />, color: 'text-purple-500' }
  ];

  const getPrivacyLabel = (value: number) => {
    return privacyLevels.reduce((prev, curr) =>
      Math.abs(curr.value - value) < Math.abs(prev.value - value) ? curr : prev
    );
  };

  // Context-aware privacy intelligence
  const detectCurrentContext = (): ContextualData => {
    const hour = new Date().getHours();
    const timeOfDay = hour < 9 ? 'morning' : hour < 18 ? 'work' : hour < 22 ? 'evening' : 'night';

    // Simulate context detection (in real app, this would use actual sensors/APIs)
    return {
      timeOfDay,
      location: timeOfDay === 'work' ? 'office' : 'home',
      deviceType: 'desktop', // Could detect from navigator.userAgent
      networkType: timeOfDay === 'work' ? 'corporate' : 'private',
      activityLevel: Math.floor(Math.random() * 100),
      socialContext: timeOfDay === 'work' ? 'colleagues' : 'alone'
    };
  };

  const generatePrivacyRecommendations = (context: ContextualData): PrivacyRecommendation[] => {
    const recommendations: PrivacyRecommendation[] = [];

    // Work context recommendations
    if (context.timeOfDay === 'work' && context.location === 'office') {
      recommendations.push({
        context: 'Work Environment Detected',
        suggestedLevel: 75,
        reason: 'Professional setting - increase visibility for networking',
        confidence: 90,
        icon: <Briefcase className="w-4 h-4" />
      });
    }

    // Evening context recommendations
    if (context.timeOfDay === 'evening' && context.location === 'home') {
      recommendations.push({
        context: 'Personal Time',
        suggestedLevel: 25,
        reason: 'Evening relaxation - reduce professional visibility',
        confidence: 85,
        icon: <Heart className="w-4 h-4" />
      });
    }

    // Public network warning
    if (context.networkType === 'public') {
      recommendations.push({
        context: 'Public Network',
        suggestedLevel: 0,
        reason: 'Unsecured connection detected - maximize privacy',
        confidence: 95,
        icon: <Shield className="w-4 h-4" />
      });
    }

    // High activity recommendation
    if (context.activityLevel > 80) {
      recommendations.push({
        context: 'High Activity Period',
        suggestedLevel: 50,
        reason: 'Intense work detected - balanced visibility for collaboration',
        confidence: 70,
        icon: <Zap className="w-4 h-4" />
      });
    }

    return recommendations;
  };

  // Context-aware privacy adjustment
  const applyContextualPrivacy = () => {
    const newContext = detectCurrentContext();
    const recommendations = generatePrivacyRecommendations(newContext);

    setCurrentContext(newContext);
    setPrivacyRecommendations(recommendations);
    setLastContextUpdate(new Date());

    if (contextAwareMode && recommendations.length > 0) {
      // Apply the highest confidence recommendation
      const bestRecommendation = recommendations.reduce((prev, curr) =>
        curr.confidence > prev.confidence ? curr : prev
      );

      setGlobalPrivacy(bestRecommendation.suggestedLevel);
      applyGlobalPrivacy();
    }
  };

  // Real-time soul signature extraction
  const extractSoulSignatureData = async () => {
    setIsExtractingData(true);

    // Simulate real-time data extraction from different platforms
    const platforms = ['spotify', 'youtube', 'netflix', 'goodreads', 'steam'];

    for (const platform of platforms) {
      // Simulate connection pulse
      setConnectionPulse(prev => ({ ...prev, [platform]: true }));

      try {
        // Simulate API call to our soul extraction endpoint
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

        const mockData = {
          platform,
          extractedAt: new Date(),
          soulSignature: {
            authenticityScore: Math.floor(Math.random() * 30) + 70, // 70-100
            personalityTraits: generateMockTraits(platform),
            emotionalResonance: Math.floor(Math.random() * 100),
            creativityIndex: Math.floor(Math.random() * 100)
          }
        };

        // Add to data stream
        setDataStream(prev => [...prev.slice(-20), {
          id: `${platform}-${Date.now()}`,
          type: 'extraction',
          value: mockData,
          source: platform,
          timestamp: new Date().toISOString(),
          sensitivity: Math.floor(Math.random() * 100)
        }]);

        // Update cluster data
        updateClusterWithRealData(platform, mockData);

      } catch (error) {
        console.error(`Failed to extract from ${platform}:`, error);
      } finally {
        setTimeout(() => {
          setConnectionPulse(prev => ({ ...prev, [platform]: false }));
        }, 1000);
      }
    }

    setIsExtractingData(false);
  };

  const generateMockTraits = (platform: string) => {
    const traitsByPlatform = {
      spotify: ['music-passionate', 'rhythm-sensitive', 'mood-expressive'],
      youtube: ['knowledge-seeker', 'visual-learner', 'trend-aware'],
      netflix: ['story-lover', 'emotional-depth', 'culture-curious'],
      goodreads: ['intellectual', 'imaginative', 'introspective'],
      steam: ['strategic-thinker', 'competitive', 'immersive-focused']
    };
    return traitsByPlatform[platform as keyof typeof traitsByPlatform] || ['unique-individual'];
  };

  const updateClusterWithRealData = (platform: string, data: any) => {
    setClusters(prev => prev.map(cluster => {
      if (cluster.id === 'personal' && ['spotify', 'youtube', 'netflix'].includes(platform)) {
        return {
          ...cluster,
          intensity: Math.min(100, cluster.intensity + 2),
          subclusters: cluster.subclusters.map(sub =>
            sub.id === 'entertainment'
              ? { ...sub, intensity: Math.min(100, sub.intensity + 5) }
              : sub
          )
        };
      }
      if (cluster.id === 'creative' && ['spotify', 'goodreads', 'youtube'].includes(platform)) {
        return {
          ...cluster,
          intensity: Math.min(100, cluster.intensity + 3),
          subclusters: cluster.subclusters.map(sub =>
            sub.id === 'artistic'
              ? { ...sub, intensity: Math.min(100, sub.intensity + 4) }
              : sub
          )
        };
      }
      if (cluster.id === 'professional' && ['goodreads', 'youtube'].includes(platform)) {
        return {
          ...cluster,
          intensity: Math.min(100, cluster.intensity + 1),
          subclusters: cluster.subclusters.map(sub =>
            sub.id === 'expertise'
              ? { ...sub, intensity: Math.min(100, sub.intensity + 2) }
              : sub
          )
        };
      }
      return cluster;
    }));
  };

  const handleClusterPrivacyChange = (clusterId: string, value: number[]) => {
    setClusters(prev => prev.map(cluster =>
      cluster.id === clusterId
        ? { ...cluster, privacyLevel: value[0] }
        : cluster
    ));
  };

  const handleSubclusterPrivacyChange = (clusterId: string, subclusterId: string, value: number[]) => {
    setClusters(prev => prev.map(cluster =>
      cluster.id === clusterId
        ? {
            ...cluster,
            subclusters: cluster.subclusters.map(sub =>
              sub.id === subclusterId
                ? { ...sub, privacyLevel: value[0] }
                : sub
            )
          }
        : cluster
    ));
  };

  const applyGlobalPrivacy = () => {
    setClusters(prev => prev.map(cluster => ({
      ...cluster,
      privacyLevel: globalPrivacy,
      subclusters: cluster.subclusters.map(sub => ({
        ...sub,
        privacyLevel: globalPrivacy
      }))
    })));
  };

  // Initialize context-aware features
  useEffect(() => {
    // Initial context detection
    applyContextualPrivacy();

    // Set up periodic context updates (every 5 minutes in real app)
    const interval = setInterval(() => {
      if (contextAwareMode) {
        applyContextualPrivacy();
      }
    }, 30000); // 30 seconds for demo

    return () => clearInterval(interval);
  }, [contextAwareMode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            Your Soul Signature Dashboard
          </h1>
          <p className="text-gray-400">
            Control what aspects of yourself to reveal and to whom
          </p>
        </motion.div>

        {/* Global Controls */}
        <Card className="bg-gray-900/50 backdrop-blur border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Global Privacy Settings</h3>
              <p className="text-sm text-gray-400">Apply uniform privacy across all clusters</p>
            </div>
            <Button
              onClick={applyGlobalPrivacy}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              Apply to All
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <Eye className="w-5 h-5 text-gray-400" />
            <Slider
              value={[globalPrivacy]}
              onValueChange={(v) => setGlobalPrivacy(v[0])}
              max={100}
              step={25}
              className="flex-1"
            />
            <EyeOff className="w-5 h-5 text-gray-400" />
            <Badge className={cn("ml-2", getPrivacyLabel(globalPrivacy).color)}>
              {getPrivacyLabel(globalPrivacy).label}
            </Badge>
          </div>
        </Card>

        {/* Context-Aware Intelligence Panel */}
        <AnimatePresence>
          {contextAwareMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <Card className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 backdrop-blur border-blue-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Brain className="w-6 h-6 text-blue-400" />
                    <div>
                      <h3 className="text-lg font-semibold">Context Intelligence</h3>
                      <p className="text-sm text-gray-400">
                        Privacy auto-adjusting based on your current environment
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setContextAwareMode(false)}
                    className="border-gray-600 text-gray-400"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Manual Mode
                  </Button>
                </div>

                {/* Current Context Display */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/50">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <div>
                      <p className="text-xs text-gray-400">Time</p>
                      <p className="text-sm font-medium capitalize">{currentContext.timeOfDay}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/50">
                    <MapPin className="w-4 h-4 text-green-400" />
                    <div>
                      <p className="text-xs text-gray-400">Location</p>
                      <p className="text-sm font-medium capitalize">{currentContext.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/50">
                    <Wifi className="w-4 h-4 text-purple-400" />
                    <div>
                      <p className="text-xs text-gray-400">Network</p>
                      <p className="text-sm font-medium capitalize">{currentContext.networkType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/50">
                    <Users className="w-4 h-4 text-orange-400" />
                    <div>
                      <p className="text-xs text-gray-400">Context</p>
                      <p className="text-sm font-medium capitalize">{currentContext.socialContext}</p>
                    </div>
                  </div>
                </div>

                {/* Privacy Recommendations */}
                {privacyRecommendations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-blue-400 mb-2">Smart Recommendations</h4>
                    {privacyRecommendations.slice(0, 2).map((rec, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-gray-800/50 to-gray-700/30 border border-gray-600/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded bg-blue-500/20 text-blue-400">
                            {rec.icon}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{rec.context}</p>
                            <p className="text-xs text-gray-400">{rec.reason}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("text-xs", getPrivacyLabel(rec.suggestedLevel).color)}
                          >
                            {getPrivacyLabel(rec.suggestedLevel).label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setGlobalPrivacy(rec.suggestedLevel);
                              setTimeout(applyGlobalPrivacy, 100);
                            }}
                            className="text-xs h-7 px-2"
                          >
                            Apply
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                  <div className="text-xs text-gray-400">
                    Last updated: {lastContextUpdate.toLocaleTimeString()}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={applyContextualPrivacy}
                    className="text-xs"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    Refresh Context
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual Mode Button */}
        {!contextAwareMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8"
          >
            <Card className="bg-gray-900/30 border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">Manual Privacy Mode</p>
                    <p className="text-xs text-gray-400">Context intelligence disabled</p>
                  </div>
                </div>
                <Button
                  onClick={() => setContextAwareMode(true)}
                  className="bg-gradient-to-r from-blue-500 to-purple-600"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Enable Smart Mode
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Audience Mode Selector */}
        <Tabs value={audienceMode} onValueChange={(v: any) => setAudienceMode(v)} className="mb-8">
          <TabsList className="grid w-full grid-cols-4 bg-gray-800">
            <TabsTrigger value="intimate" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-red-500">
              <Heart className="w-4 h-4 mr-2" />
              Intimate
            </TabsTrigger>
            <TabsTrigger value="friends" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500">
              <Users className="w-4 h-4 mr-2" />
              Friends
            </TabsTrigger>
            <TabsTrigger value="professional" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500">
              <Briefcase className="w-4 h-4 mr-2" />
              Professional
            </TabsTrigger>
            <TabsTrigger value="everyone" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500">
              <Globe className="w-4 h-4 mr-2" />
              Everyone
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Real-time Data Stream Panel */}
        {dataStream.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="bg-gradient-to-r from-green-900/20 to-cyan-900/20 backdrop-blur border-green-500/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Zap className="w-6 h-6 text-green-400" />
                    <motion.div
                      className="absolute inset-0 bg-green-400 rounded-full"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Live Soul Signature Stream</h3>
                    <p className="text-sm text-gray-400">
                      Real-time personality insights flowing from connected platforms
                    </p>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  {dataStream.length} insights
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {dataStream.slice(-5).map((dataPoint, index) => (
                  <motion.div
                    key={dataPoint.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-3 rounded-lg bg-gradient-to-br from-gray-800/80 to-gray-700/60 border border-gray-600/30"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        connectionPulse[dataPoint.source] ? "bg-green-400 animate-pulse" : "bg-gray-500"
                      )} />
                      <span className="text-xs font-medium capitalize">{dataPoint.source}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">
                      {new Date(dataPoint.timestamp).toLocaleTimeString()}
                    </p>
                    <div className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-blue-400" />
                      <span className="text-xs text-blue-400">
                        {dataPoint.value?.soulSignature?.authenticityScore || 'N/A'}% authentic
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {isExtractingData && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30"
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <span className="text-sm text-blue-400">
                      Extracting soul signature from connected platforms...
                    </span>
                  </div>
                </motion.div>
              )}
            </Card>
          </motion.div>
        )}

        {/* Identity Clusters Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {clusters.map((cluster) => (
            <motion.div
              key={cluster.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
              onMouseEnter={() => setHoveredCluster(cluster.id)}
              onMouseLeave={() => setHoveredCluster(null)}
            >
              <Card className={cn(
                "relative overflow-hidden border-gray-700 bg-gradient-to-br",
                "from-gray-900/90 to-gray-800/90 backdrop-blur",
                "transition-all duration-300",
                hoveredCluster === cluster.id && "ring-2 ring-blue-500"
              )}>
                {/* Gradient Background */}
                <div className={cn(
                  "absolute inset-0 opacity-20 bg-gradient-to-br",
                  cluster.color
                )} />

                {/* Content */}
                <div className="relative p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg bg-gradient-to-br",
                        cluster.color,
                        "text-white"
                      )}>
                        {cluster.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold">{cluster.name}</h3>
                        <p className="text-xs text-gray-400">
                          {cluster.subclusters.length} subcategories
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCluster(cluster.id)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Intensity Meter */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Data Richness</span>
                      <span>{cluster.intensity}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        className={cn("h-full bg-gradient-to-r", cluster.color)}
                        initial={{ width: 0 }}
                        animate={{ width: `${cluster.intensity}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      />
                    </div>
                  </div>

                  {/* Privacy Control */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>Privacy Level</span>
                      <Badge variant="outline" className={cn("text-xs", getPrivacyLabel(cluster.privacyLevel).color)}>
                        {getPrivacyLabel(cluster.privacyLevel).label}
                      </Badge>
                    </div>
                    <Slider
                      value={[cluster.privacyLevel]}
                      onValueChange={(v) => handleClusterPrivacyChange(cluster.id, v)}
                      max={100}
                      step={25}
                      className="mb-4"
                    />
                  </div>

                  {/* Subclusters */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-gray-700">
                    {cluster.subclusters.map((subcluster) => (
                      <div key={subcluster.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">{subcluster.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("text-xs", getPrivacyLabel(subcluster.privacyLevel).color)}
                            >
                              {getPrivacyLabel(subcluster.privacyLevel).icon}
                            </Badge>
                          </div>
                        </div>
                        <Slider
                          value={[subcluster.privacyLevel]}
                          onValueChange={(v) => handleSubclusterPrivacyChange(cluster.id, subcluster.id, v)}
                          max={100}
                          step={25}
                          className="h-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Soul Signature Fingerprint */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 backdrop-blur border-purple-500/30 p-8">
            <div className="text-center">
              <Fingerprint className="w-16 h-16 mx-auto mb-4 text-purple-400" />
              <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Your Unique Soul Signature
              </h3>
              <p className="text-gray-400 mb-6">
                A combination of {clusters.reduce((acc, c) => acc + c.subclusters.length, 0)} unique data dimensions
                creating your authentic digital identity
              </p>
              <div className="flex justify-center gap-4">
                <Button
                  className="bg-gradient-to-r from-purple-500 to-blue-500"
                  disabled={isExtractingData}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Preview My Twin
                </Button>
                <Button
                  onClick={extractSoulSignatureData}
                  disabled={isExtractingData}
                  className="bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600"
                >
                  {isExtractingData ? (
                    <>
                      <motion.div
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Start Real-time Extraction
                    </>
                  )}
                </Button>
                <Button variant="outline" className="border-purple-500 text-purple-400">
                  <Shield className="w-4 h-4 mr-2" />
                  Export Privacy Settings
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacySpectrumDashboard;