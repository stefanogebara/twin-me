import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Download,
  Upload,
  Save,
  Eye,
  Lock,
  Users,
  Briefcase,
  Heart,
  Palette,
  Music,
  GraduationCap,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Settings,
  BarChart3
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudienceSelector, DEFAULT_AUDIENCES, type Audience } from './AudienceSelector';
import { PrivacyTemplates, DEFAULT_TEMPLATES, type PrivacyTemplate } from './PrivacyTemplates';
import { PrivacyPreview } from './PrivacyPreview';
import { ClusterControl, type LifeCluster, type SubCluster, type Platform } from './ClusterControl';
import { IntensitySlider } from './IntensitySlider';
import { useToast } from '@/hooks/use-toast';

interface EnhancedPrivacySpectrumDashboardProps {
  userId?: string;
  onSave?: (settings: PrivacySettings) => Promise<void>;
  onExport?: () => void;
  onImport?: (config: any) => void;
}

export interface PrivacySettings {
  globalPrivacy: number;
  selectedAudienceId: string;
  selectedTemplateId?: string;
  clusters: LifeCluster[];
  audienceSpecificSettings: Record<string, Record<string, number>>;
}

// Default life clusters with realistic data
const DEFAULT_CLUSTERS: LifeCluster[] = [
  {
    id: 'hobbies',
    name: 'Hobbies & Interests',
    category: 'personal',
    icon: Heart,
    color: '#EC4899',
    description: 'Your passions, curiosities, and recreational activities',
    privacyLevel: 65,
    enabled: true,
    totalDataPoints: 245,
    subclusters: [
      {
        id: 'entertainment',
        name: 'Entertainment Choices',
        description: 'Movies, TV shows, music preferences',
        privacyLevel: 70,
        dataPoints: 120,
        enabled: true,
        platforms: [
          { name: 'Netflix', dataPoints: 45, enabled: true },
          { name: 'Spotify', dataPoints: 55, enabled: true },
          { name: 'YouTube', dataPoints: 20, enabled: true }
        ]
      },
      {
        id: 'gaming',
        name: 'Gaming & Interactive',
        description: 'Game preferences, playstyle patterns',
        privacyLevel: 60,
        dataPoints: 78,
        enabled: true,
        platforms: [
          { name: 'Steam', dataPoints: 58, enabled: true },
          { name: 'Discord', dataPoints: 20, enabled: true }
        ]
      },
      {
        id: 'reading',
        name: 'Reading & Learning',
        description: 'Book preferences, reading habits',
        privacyLevel: 55,
        dataPoints: 47,
        enabled: true,
        platforms: [
          { name: 'Goodreads', dataPoints: 47, enabled: true }
        ]
      }
    ]
  },
  {
    id: 'sports',
    name: 'Sports & Fitness',
    category: 'personal',
    icon: TrendingUp,
    color: '#10B981',
    description: 'Physical activities, health patterns, athletic interests',
    privacyLevel: 45,
    enabled: true,
    totalDataPoints: 123,
    subclusters: [
      {
        id: 'activities',
        name: 'Activity Tracking',
        description: 'Workouts, running, cycling data',
        privacyLevel: 40,
        dataPoints: 89,
        enabled: true,
        platforms: [
          { name: 'Strava', dataPoints: 65, enabled: true },
          { name: 'Apple Health', dataPoints: 24, enabled: true }
        ]
      },
      {
        id: 'nutrition',
        name: 'Health & Nutrition',
        description: 'Diet preferences, health metrics',
        privacyLevel: 30,
        dataPoints: 34,
        enabled: false,
        platforms: [
          { name: 'MyFitnessPal', dataPoints: 34, enabled: true }
        ]
      }
    ]
  },
  {
    id: 'education',
    name: 'Studies & Education',
    category: 'professional',
    icon: GraduationCap,
    color: '#F59E0B',
    description: 'Academic history, learning patterns, courses',
    privacyLevel: 72,
    enabled: true,
    totalDataPoints: 156,
    subclusters: [
      {
        id: 'courses',
        name: 'Online Learning',
        description: 'Courses, certifications, skill development',
        privacyLevel: 80,
        dataPoints: 98,
        enabled: true,
        platforms: [
          { name: 'Coursera', dataPoints: 56, enabled: true },
          { name: 'YouTube', dataPoints: 42, enabled: true }
        ]
      },
      {
        id: 'academic',
        name: 'Academic Records',
        description: 'Degrees, transcripts, research',
        privacyLevel: 50,
        dataPoints: 58,
        enabled: true,
        platforms: [
          { name: 'LinkedIn', dataPoints: 58, enabled: true }
        ]
      }
    ]
  },
  {
    id: 'career',
    name: 'Career & Jobs',
    category: 'professional',
    icon: Briefcase,
    color: '#3B82F6',
    description: 'Work history, professional achievements, career trajectory',
    privacyLevel: 88,
    enabled: true,
    totalDataPoints: 298,
    subclusters: [
      {
        id: 'work-history',
        name: 'Employment History',
        description: 'Previous roles, companies, responsibilities',
        privacyLevel: 90,
        dataPoints: 145,
        enabled: true,
        platforms: [
          { name: 'LinkedIn', dataPoints: 145, enabled: true }
        ]
      },
      {
        id: 'communication',
        name: 'Work Communication',
        description: 'Email patterns, meeting frequency',
        privacyLevel: 75,
        dataPoints: 153,
        enabled: true,
        platforms: [
          { name: 'Gmail', dataPoints: 98, enabled: true },
          { name: 'Slack', dataPoints: 55, enabled: true }
        ]
      }
    ]
  },
  {
    id: 'skills',
    name: 'Skills & Expertise',
    category: 'professional',
    icon: Settings,
    color: '#8B5CF6',
    description: 'Technical abilities, domain knowledge, certifications',
    privacyLevel: 95,
    enabled: true,
    totalDataPoints: 367,
    subclusters: [
      {
        id: 'technical',
        name: 'Technical Skills',
        description: 'Programming, tools, technologies',
        privacyLevel: 100,
        dataPoints: 234,
        enabled: true,
        platforms: [
          { name: 'GitHub', dataPoints: 198, enabled: true },
          { name: 'LinkedIn', dataPoints: 36, enabled: true }
        ]
      },
      {
        id: 'soft-skills',
        name: 'Soft Skills',
        description: 'Leadership, communication, teamwork',
        privacyLevel: 85,
        dataPoints: 133,
        enabled: true,
        platforms: [
          { name: 'LinkedIn', dataPoints: 133, enabled: true }
        ]
      }
    ]
  },
  {
    id: 'creative',
    name: 'Artistic Expression',
    category: 'creative',
    icon: Palette,
    color: '#EC4899',
    description: 'Creative works, artistic preferences, design sense',
    privacyLevel: 58,
    enabled: true,
    totalDataPoints: 134,
    subclusters: [
      {
        id: 'visual',
        name: 'Visual Arts',
        description: 'Photography, design, illustration',
        privacyLevel: 65,
        dataPoints: 78,
        enabled: true,
        platforms: [
          { name: 'Instagram', dataPoints: 56, enabled: true },
          { name: 'DeviantArt', dataPoints: 22, enabled: true }
        ]
      },
      {
        id: 'writing',
        name: 'Writing & Storytelling',
        description: 'Blog posts, articles, creative writing',
        privacyLevel: 45,
        dataPoints: 56,
        enabled: true,
        platforms: [
          { name: 'Medium', dataPoints: 56, enabled: true }
        ]
      }
    ]
  },
  {
    id: 'musical',
    name: 'Musical Identity',
    category: 'creative',
    icon: Music,
    color: '#10B981',
    description: 'Music taste, listening patterns, creative expression',
    privacyLevel: 91,
    enabled: true,
    totalDataPoints: 456,
    subclusters: [
      {
        id: 'listening',
        name: 'Listening Habits',
        description: 'Genres, artists, playlists, mood patterns',
        privacyLevel: 95,
        dataPoints: 398,
        enabled: true,
        platforms: [
          { name: 'Spotify', dataPoints: 398, enabled: true }
        ]
      },
      {
        id: 'creation',
        name: 'Music Creation',
        description: 'Instruments, compositions, performances',
        privacyLevel: 70,
        dataPoints: 58,
        enabled: true,
        platforms: [
          { name: 'SoundCloud', dataPoints: 58, enabled: true }
        ]
      }
    ]
  }
];

export const EnhancedPrivacySpectrumDashboard: React.FC<EnhancedPrivacySpectrumDashboardProps> = ({
  userId,
  onSave,
  onExport,
  onImport
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'clusters' | 'templates' | 'preview'>('overview');

  // State
  const [globalPrivacy, setGlobalPrivacy] = useState(65);
  const [audiences] = useState<Audience[]>(DEFAULT_AUDIENCES);
  const [selectedAudienceId, setSelectedAudienceId] = useState('social');
  const [templates, setTemplates] = useState<PrivacyTemplate[]>(DEFAULT_TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>();
  const [clusters, setClusters] = useState<LifeCluster[]>(DEFAULT_CLUSTERS);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Mark changes when settings update
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [globalPrivacy, clusters, selectedAudienceId]);

  // Apply global privacy to all clusters
  const applyGlobalPrivacy = useCallback(() => {
    setClusters(prev => prev.map(cluster => ({
      ...cluster,
      privacyLevel: globalPrivacy,
      subclusters: cluster.subclusters.map(sub => ({
        ...sub,
        privacyLevel: globalPrivacy
      }))
    })));

    toast({
      title: "Global privacy applied",
      description: `All clusters set to ${globalPrivacy}% visibility`
    });
  }, [globalPrivacy, toast]);

  // Apply template
  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    setGlobalPrivacy(template.settings.globalPrivacy);

    // Apply cluster-specific settings
    setClusters(prev => prev.map(cluster => {
      const clusterSetting = template.settings.clusterSettings[cluster.category];
      return {
        ...cluster,
        privacyLevel: clusterSetting || template.settings.globalPrivacy,
        subclusters: cluster.subclusters.map(sub => ({
          ...sub,
          privacyLevel: clusterSetting || template.settings.globalPrivacy
        }))
      };
    }));

    setActiveTemplateId(templateId);

    // Update template usage
    setTemplates(prev => prev.map(t =>
      t.id === templateId
        ? { ...t, lastUsed: new Date(), usageCount: (t.usageCount || 0) + 1 }
        : t
    ));

    toast({
      title: "Template applied",
      description: `Privacy settings updated to "${template.name}"`
    });
  }, [templates, toast]);

  // Save current settings as template
  const handleSaveAsTemplate = useCallback(() => {
    const newTemplate: PrivacyTemplate = {
      id: `custom-${Date.now()}`,
      name: `Custom Template ${templates.filter(t => t.isCustom).length + 1}`,
      description: 'Custom privacy configuration',
      icon: Shield,
      color: '#8B5CF6',
      isCustom: true,
      settings: {
        globalPrivacy,
        clusterSettings: clusters.reduce((acc, cluster) => {
          acc[cluster.category] = cluster.privacyLevel;
          return acc;
        }, {} as Record<string, number>)
      }
    };

    setTemplates(prev => [...prev, newTemplate]);

    toast({
      title: "Template saved",
      description: "Your current settings have been saved as a template"
    });
  }, [globalPrivacy, clusters, templates, toast]);

  // Export settings
  const handleExport = useCallback(() => {
    const settings = {
      globalPrivacy,
      selectedAudienceId,
      activeTemplateId,
      clusters,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privacy-settings-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Settings exported",
      description: "Privacy configuration downloaded successfully"
    });

    onExport?.();
  }, [globalPrivacy, selectedAudienceId, activeTemplateId, clusters, toast, onExport]);

  // Save settings
  const handleSave = useCallback(async () => {
    const settings: PrivacySettings = {
      globalPrivacy,
      selectedAudienceId,
      selectedTemplateId: activeTemplateId,
      clusters,
      audienceSpecificSettings: {}
    };

    try {
      await onSave?.(settings);
      setHasUnsavedChanges(false);

      toast({
        title: "Settings saved",
        description: "Your privacy preferences have been updated"
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Could not save privacy settings. Please try again.",
        variant: "destructive"
      });
    }
  }, [globalPrivacy, selectedAudienceId, activeTemplateId, clusters, onSave, toast]);

  // Prepare preview data
  const previewClusters = clusters.map(cluster => ({
    ...cluster,
    dataPoints: cluster.subclusters.flatMap(sub =>
      sub.platforms.map((platform, idx) => ({
        id: `${sub.id}-${platform.name}-${idx}`,
        type: sub.name,
        platform: platform.name,
        category: cluster.category,
        sensitivity: Math.random() * 100,
        value: `${platform.name} - ${sub.name} data`,
        revealed: cluster.privacyLevel >= 50 && sub.privacyLevel >= 50
      }))
    )
  }));

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900 mb-2">
              What's To Reveal, What's To Share
            </h1>
            <p className="text-stone-600">
              Sophisticated privacy controls for your soul signature
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Unsaved changes
              </Badge>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button onClick={handleSave} disabled={!hasUnsavedChanges}>
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>

        {/* Audience Selector */}
        <Card className="p-6 border-stone-200">
          <AudienceSelector
            audiences={audiences}
            selectedAudienceId={selectedAudienceId}
            onSelectAudience={setSelectedAudienceId}
          />
        </Card>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="clusters">
              <Settings className="w-4 h-4 mr-2" />
              Life Clusters
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Sparkles className="w-4 h-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Global Privacy Control */}
            <Card className="p-6 border-stone-200">
              <IntensitySlider
                value={globalPrivacy}
                onChange={setGlobalPrivacy}
                label="Global Privacy Level"
                description="Master control for all life clusters"
              />
              <div className="mt-4 flex justify-end">
                <Button onClick={applyGlobalPrivacy} variant="outline">
                  Apply to All Clusters
                </Button>
              </div>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6 border-stone-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-100">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-medium text-stone-900">Active Clusters</h3>
                </div>
                <p className="text-3xl font-semibold text-stone-900">
                  {clusters.filter(c => c.enabled).length}
                  <span className="text-base text-stone-500 ml-2">/ {clusters.length}</span>
                </p>
              </Card>

              <Card className="p-6 border-stone-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <Eye className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-medium text-stone-900">Total Data Points</h3>
                </div>
                <p className="text-3xl font-semibold text-stone-900">
                  {clusters.reduce((sum, c) => sum + c.totalDataPoints, 0).toLocaleString()}
                </p>
              </Card>

              <Card className="p-6 border-stone-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-medium text-stone-900">Current Audience</h3>
                </div>
                <p className="text-xl font-semibold text-stone-900">
                  {audiences.find(a => a.id === selectedAudienceId)?.name}
                </p>
              </Card>
            </div>

            {/* Cluster Summary */}
            <Card className="p-6 border-stone-200">
              <h3 className="text-lg font-medium text-stone-900 mb-4">Cluster Overview</h3>
              <div className="space-y-3">
                {clusters.map((cluster) => {
                  const Icon = cluster.icon;
                  return (
                    <div
                      key={cluster.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer"
                      onClick={() => setActiveTab('clusters')}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className="p-2 rounded-lg"
                          style={{
                            backgroundColor: `${cluster.color}15`,
                            color: cluster.color
                          }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-stone-900">{cluster.name}</h4>
                          <p className="text-sm text-stone-500">
                            {cluster.totalDataPoints} data points • {cluster.subclusters.length} subcategories
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-stone-900">{cluster.privacyLevel}%</p>
                          <p className="text-xs text-stone-500">visible</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-stone-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="clusters" className="space-y-4">
            {clusters.map((cluster) => (
              <ClusterControl
                key={cluster.id}
                cluster={cluster}
                onChange={(updated) => {
                  setClusters(prev => prev.map(c =>
                    c.id === cluster.id ? updated : c
                  ));
                }}
              />
            ))}
          </TabsContent>

          <TabsContent value="templates">
            <PrivacyTemplates
              templates={templates}
              activeTemplateId={activeTemplateId}
              onApplyTemplate={handleApplyTemplate}
              onSaveAsTemplate={handleSaveAsTemplate}
              onExportTemplate={(id) => {
                // Export specific template
                const template = templates.find(t => t.id === id);
                if (template) {
                  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `template-${template.name.toLowerCase().replace(/\s+/g, '-')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              onDeleteTemplate={(id) => {
                setTemplates(prev => prev.filter(t => t.id !== id));
                if (activeTemplateId === id) {
                  setActiveTemplateId(undefined);
                }
              }}
            />
          </TabsContent>

          <TabsContent value="preview">
            <PrivacyPreview
              clusters={previewClusters}
              audienceName={audiences.find(a => a.id === selectedAudienceId)?.name || 'Unknown'}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EnhancedPrivacySpectrumDashboard;
