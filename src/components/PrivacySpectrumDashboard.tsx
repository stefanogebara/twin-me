import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Briefcase, Palette, Music, Film, Book, Heart, Brain,
  Globe, Shield, Eye, EyeOff, Sparkles, Fingerprint,
  ChevronRight, Lock, Unlock, Users, UserCheck
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

const PrivacySpectrumDashboard: React.FC = () => {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [audienceMode, setAudienceMode] = useState<'everyone' | 'professional' | 'friends' | 'intimate'>('friends');
  const [globalPrivacy, setGlobalPrivacy] = useState(50);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

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
                <Button className="bg-gradient-to-r from-purple-500 to-blue-500">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Preview My Twin
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