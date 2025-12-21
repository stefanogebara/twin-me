import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle,
  Info,
  Sparkles,
  TrendingUp,
  Music,
  Film,
  Book,
  Gamepad2,
  Code,
  Mail,
  Calendar
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface DataPoint {
  id: string;
  type: string;
  platform: string;
  category: string;
  sensitivity: number;
  value: string;
  revealed: boolean;
}

interface ClusterPreview {
  id: string;
  name: string;
  category: 'personal' | 'professional' | 'creative';
  privacyLevel: number;
  dataPoints: DataPoint[];
  icon: React.ElementType;
}

interface PrivacyPreviewProps {
  clusters: ClusterPreview[];
  audienceName: string;
  className?: string;
}

// Platform icon mapping
const PLATFORM_ICONS: Record<string, React.ElementType> = {
  spotify: Music,
  netflix: Film,
  youtube: Film,
  goodreads: Book,
  steam: Gamepad2,
  github: Code,
  gmail: Mail,
  calendar: Calendar,
};

// Get icon for platform or default
const getPlatformIcon = (platform: string): React.ElementType => {
  return PLATFORM_ICONS[platform.toLowerCase()] || Sparkles;
};

export const PrivacyPreview: React.FC<PrivacyPreviewProps> = ({
  clusters,
  audienceName,
  className
}) => {
  const [viewMode, setViewMode] = useState<'revealed' | 'hidden' | 'all'>('revealed');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'personal' | 'professional' | 'creative'>('all');

  // Calculate statistics
  const stats = useMemo(() => {
    const allDataPoints = clusters.flatMap(c => c.dataPoints);
    const revealed = allDataPoints.filter(dp => dp.revealed).length;
    const hidden = allDataPoints.length - revealed;
    const totalSensitive = allDataPoints.filter(dp => dp.sensitivity > 70).length;
    const revealedSensitive = allDataPoints.filter(dp => dp.revealed && dp.sensitivity > 70).length;

    return {
      total: allDataPoints.length,
      revealed,
      hidden,
      totalSensitive,
      revealedSensitive,
      percentageRevealed: allDataPoints.length > 0 ? Math.round((revealed / allDataPoints.length) * 100) : 0
    };
  }, [clusters]);

  // Filter clusters by category
  const filteredClusters = useMemo(() => {
    if (selectedCategory === 'all') return clusters;
    return clusters.filter(c => c.category === selectedCategory);
  }, [clusters, selectedCategory]);

  // Filter data points by view mode
  const getFilteredDataPoints = (cluster: ClusterPreview) => {
    if (viewMode === 'all') return cluster.dataPoints;
    if (viewMode === 'revealed') return cluster.dataPoints.filter(dp => dp.revealed);
    return cluster.dataPoints.filter(dp => !dp.revealed);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with Stats */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-stone-900">Privacy Preview</h3>
            <p className="text-sm text-stone-500">
              What {audienceName} will see about you
            </p>
          </div>

          <Badge
            variant="outline"
            className="text-sm px-3 py-1"
          >
            {stats.percentageRevealed}% Visible
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 border-stone-200">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-green-600" />
              <span className="text-xs text-stone-500">Revealed</span>
            </div>
            <p className="text-2xl font-semibold text-stone-900">{stats.revealed}</p>
          </Card>

          <Card className="p-3 border-stone-200">
            <div className="flex items-center gap-2 mb-1">
              <EyeOff className="w-4 h-4 text-gray-600" />
              <span className="text-xs text-stone-500">Hidden</span>
            </div>
            <p className="text-2xl font-semibold text-stone-900">{stats.hidden}</p>
          </Card>

          <Card className="p-3 border-stone-200">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-stone-500">Sensitive</span>
            </div>
            <p className="text-2xl font-semibold text-stone-900">{stats.totalSensitive}</p>
          </Card>

          <Card className="p-3 border-stone-200">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-stone-500">Protected</span>
            </div>
            <p className="text-2xl font-semibold text-stone-900">
              {stats.totalSensitive - stats.revealedSensitive}
            </p>
          </Card>
        </div>

        {/* Sensitive Data Warning */}
        {stats.revealedSensitive > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200"
          >
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-orange-900 mb-1">
                Sensitive Data Shared
              </h4>
              <p className="text-xs text-orange-700 leading-relaxed">
                {stats.revealedSensitive} sensitive data point{stats.revealedSensitive !== 1 ? 's' : ''} will be visible to {audienceName}.
                Review your privacy settings if this seems too high.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* View Controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Category Filter */}
        <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
            <TabsTrigger value="professional" className="text-xs">Professional</TabsTrigger>
            <TabsTrigger value="creative" className="text-xs">Creative</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* View Mode Filter */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
          <Button
            variant={viewMode === 'revealed' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode('revealed')}
          >
            <Eye className="w-3 h-3 mr-1" />
            Revealed
          </Button>
          <Button
            variant={viewMode === 'hidden' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode('hidden')}
          >
            <EyeOff className="w-3 h-3 mr-1" />
            Hidden
          </Button>
          <Button
            variant={viewMode === 'all' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode('all')}
          >
            All
          </Button>
        </div>
      </div>

      {/* Clusters Preview */}
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {filteredClusters.map((cluster) => {
            const Icon = cluster.icon;
            const filteredDataPoints = getFilteredDataPoints(cluster);

            if (filteredDataPoints.length === 0 && viewMode !== 'all') return null;

            return (
              <motion.div
                key={cluster.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="p-4 border-stone-200">
                  {/* Cluster Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-stone-100">
                        <Icon className="w-5 h-5 text-stone-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-stone-900">{cluster.name}</h4>
                        <p className="text-xs text-stone-500">
                          {filteredDataPoints.length} data point{filteredDataPoints.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {cluster.privacyLevel}% open
                      </Badge>
                      {cluster.privacyLevel >= 70 ? (
                        <Unlock className="w-4 h-4 text-green-600" />
                      ) : cluster.privacyLevel >= 40 ? (
                        <Eye className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-gray-600" />
                      )}
                    </div>
                  </div>

                  {/* Data Points List */}
                  {filteredDataPoints.length > 0 ? (
                    <div className="space-y-2">
                      {filteredDataPoints.slice(0, 5).map((dataPoint) => {
                        const PlatformIcon = getPlatformIcon(dataPoint.platform);

                        return (
                          <motion.div
                            key={dataPoint.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg border transition-all duration-200",
                              dataPoint.revealed
                                ? "bg-green-50 border-green-200"
                                : "bg-gray-50 border-gray-200"
                            )}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <PlatformIcon
                                className={cn(
                                  "w-4 h-4",
                                  dataPoint.revealed ? "text-green-600" : "text-gray-400"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-stone-900 truncate">
                                  {dataPoint.value}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-stone-500">{dataPoint.platform}</span>
                                  {dataPoint.sensitivity > 70 && (
                                    <Badge variant="outline" className="text-xs px-1 py-0">
                                      Sensitive
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {dataPoint.revealed ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <EyeOff className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </motion.div>
                        );
                      })}

                      {filteredDataPoints.length > 5 && (
                        <p className="text-xs text-stone-500 text-center py-2">
                          + {filteredDataPoints.length - 5} more data points
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Info className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                      <p className="text-sm text-stone-500">No data points to display</p>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredClusters.length === 0 && (
          <div className="text-center py-12">
            <Info className="w-12 h-12 text-stone-600 mx-auto mb-3" />
            <p className="text-sm text-stone-500">No clusters in this category</p>
          </div>
        )}
      </div>
    </div>
  );
};
