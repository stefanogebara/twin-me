import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Download,
  Maximize2,
  Minimize2,
  Heart,
  Briefcase,
  Palette,
  Music,
  Film,
  Gamepad2,
  BookOpen,
  Users,
  Trophy,
  Code,
  Sparkles,
  TrendingUp,
  Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import html2canvas from 'html2canvas';

// ====================================================================
// TYPES & INTERFACES
// ====================================================================

export interface LifeCluster {
  name: string;
  category: 'personal' | 'professional' | 'creative';
  intensity: number; // 0-100
  dataPoints: number;
  platforms: string[];
  confidenceScore: number; // 0-100
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SoulSignatureData {
  clusters: LifeCluster[];
  overallScore: number;
  totalDataPoints: number;
  lastUpdated: Date;
}

interface VisualizationProps {
  data: SoulSignatureData;
  showExportButton?: boolean;
  interactive?: boolean;
  height?: number;
}

// ====================================================================
// CLUSTER ICON MAPPING
// ====================================================================

const getClusterIcon = (clusterName: string) => {
  const name = clusterName.toLowerCase();

  // Personal clusters
  if (name.includes('hobbies') || name.includes('interests')) return Heart;
  if (name.includes('sports') || name.includes('fitness')) return TrendingUp;
  if (name.includes('spiritual') || name.includes('religion')) return Sparkles;
  if (name.includes('entertainment')) return Film;
  if (name.includes('social')) return Users;

  // Professional clusters
  if (name.includes('education') || name.includes('studies')) return BookOpen;
  if (name.includes('career') || name.includes('jobs')) return Briefcase;
  if (name.includes('skills') || name.includes('expertise')) return Code;
  if (name.includes('achievements')) return Trophy;

  // Creative clusters
  if (name.includes('artistic') || name.includes('art')) return Palette;
  if (name.includes('content creation')) return Database;
  if (name.includes('music')) return Music;
  if (name.includes('gaming')) return Gamepad2;

  return Sparkles;
};

// ====================================================================
// CATEGORY COLORS
// ====================================================================

const getCategoryColor = (category: 'personal' | 'professional' | 'creative'): string => {
  switch (category) {
    case 'personal':
      return '#D97706'; // Orange - warm, authentic
    case 'professional':
      return '#3B82F6'; // Blue - trustworthy, professional
    case 'creative':
      return '#8B5CF6'; // Purple - imaginative, creative
    default:
      return '#6B7280'; // Gray fallback
  }
};

// ====================================================================
// CUSTOM TOOLTIP
// ====================================================================

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const Icon = getClusterIcon(data.cluster);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-4 shadow-lg max-w-xs"
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${data.color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: data.color }} />
        </div>
        <h4 className="font-semibold text-[hsl(var(--claude-text))]">
          {data.cluster}
        </h4>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[hsl(var(--claude-text-muted))]">Intensity</span>
          <span className="text-sm font-semibold" style={{ color: data.color }}>
            {data.intensity}%
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[hsl(var(--claude-text-muted))]">Data Points</span>
          <span className="text-sm text-[hsl(var(--claude-text))]">
            {data.dataPoints.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[hsl(var(--claude-text-muted))]">Confidence</span>
          <span className="text-sm text-[hsl(var(--claude-text))]">
            {data.confidence}%
          </span>
        </div>

        {data.platforms && data.platforms.length > 0 && (
          <div className="pt-2 border-t border-[hsl(var(--claude-border))]">
            <span className="text-xs text-[hsl(var(--claude-text-muted))] mb-1 block">
              Data Sources
            </span>
            <div className="flex flex-wrap gap-1">
              {data.platforms.map((platform: string) => (
                <Badge
                  key={platform}
                  className="text-xs px-2 py-0.5 bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))] border-none"
                >
                  {platform}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ====================================================================
// MAIN COMPONENT
// ====================================================================

export const SoulSignatureVisualization: React.FC<VisualizationProps> = ({
  data,
  showExportButton = true,
  interactive = true,
  height = 500
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<LifeCluster | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Transform data for radar chart
  const chartData = data.clusters.map(cluster => ({
    cluster: cluster.name,
    intensity: cluster.intensity,
    dataPoints: cluster.dataPoints,
    confidence: cluster.confidenceScore,
    color: getCategoryColor(cluster.category),
    platforms: cluster.platforms,
    category: cluster.category,
    trend: cluster.trend
  }));

  // Group clusters by category for legend
  const personalClusters = data.clusters.filter(c => c.category === 'personal');
  const professionalClusters = data.clusters.filter(c => c.category === 'professional');
  const creativeClusters = data.clusters.filter(c => c.category === 'creative');

  // Export chart as image
  const handleExport = async () => {
    if (!chartRef.current) return;

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#FFFFFF',
        scale: 2,
        logging: false
      });

      const link = document.createElement('a');
      link.download = `soul-signature-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export chart:', error);
    }
  };

  const containerHeight = isFullscreen ? '100vh' : height;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`${isFullscreen ? 'fixed inset-0 z-50 bg-[hsl(var(--claude-bg))] p-8' : ''}`}
    >
      <Card className="bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[hsl(var(--claude-border))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#D97706]/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#D97706]" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[hsl(var(--claude-text))] font-heading">
                  Soul Signature Visualization
                </h2>
                <p className="text-sm text-[hsl(var(--claude-text-muted))]">
                  Your authentic identity across {data.clusters.length} life dimensions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {showExportButton && (
                <Button
                  onClick={handleExport}
                  variant="outline"
                  size="sm"
                  className="border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))]"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              )}

              <Button
                onClick={() => setIsFullscreen(!isFullscreen)}
                variant="outline"
                size="sm"
                className="border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))]"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
              <div className="text-2xl font-bold text-[hsl(var(--claude-text))]">
                {data.overallScore}%
              </div>
              <div className="text-xs text-[hsl(var(--claude-text-muted))] mt-1">
                Overall Authenticity
              </div>
            </div>

            <div className="text-center p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
              <div className="text-2xl font-bold text-[hsl(var(--claude-text))]">
                {data.totalDataPoints.toLocaleString()}
              </div>
              <div className="text-xs text-[hsl(var(--claude-text-muted))] mt-1">
                Total Data Points
              </div>
            </div>

            <div className="text-center p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
              <div className="text-2xl font-bold text-[hsl(var(--claude-text))]">
                {data.clusters.length}
              </div>
              <div className="text-xs text-[hsl(var(--claude-text-muted))] mt-1">
                Life Clusters
              </div>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div ref={chartRef} className="p-8" style={{ height: containerHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData}>
              <PolarGrid
                stroke="#141413"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
              <PolarAngleAxis
                dataKey="cluster"
                tick={{
                  fill: '#595959',
                  fontSize: 12,
                  fontFamily: 'DM Sans'
                }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: '#8C8C8C', fontSize: 10 }}
              />

              {/* Personal Clusters */}
              <Radar
                name="Personal"
                dataKey="intensity"
                stroke={getCategoryColor('personal')}
                fill={getCategoryColor('personal')}
                fillOpacity={0.2}
                strokeWidth={2}
                data={chartData.filter(d => d.category === 'personal')}
                dot={{ r: 4, fill: getCategoryColor('personal'), strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
              />

              {/* Professional Clusters */}
              <Radar
                name="Professional"
                dataKey="intensity"
                stroke={getCategoryColor('professional')}
                fill={getCategoryColor('professional')}
                fillOpacity={0.2}
                strokeWidth={2}
                data={chartData.filter(d => d.category === 'professional')}
                dot={{ r: 4, fill: getCategoryColor('professional'), strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
              />

              {/* Creative Clusters */}
              <Radar
                name="Creative"
                dataKey="intensity"
                stroke={getCategoryColor('creative')}
                fill={getCategoryColor('creative')}
                fillOpacity={0.2}
                strokeWidth={2}
                data={chartData.filter(d => d.category === 'creative')}
                dot={{ r: 4, fill: getCategoryColor('creative'), strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
              />

              {interactive && <RechartsTooltip content={<CustomTooltip />} />}

              <Legend
                wrapperStyle={{
                  paddingTop: '20px',
                  fontFamily: 'DM Sans',
                  fontSize: '14px'
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Cluster Details Grid */}
        <div className="p-6 border-t border-[hsl(var(--claude-border))] bg-[hsl(var(--claude-surface-raised))]">
          <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-4">
            Life Cluster Breakdown
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Personal Clusters */}
            {personalClusters.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-4 h-4 text-[#D97706]" />
                  <h4 className="font-medium text-[hsl(var(--claude-text))]">Personal</h4>
                </div>
                <div className="space-y-2">
                  {personalClusters.map(cluster => {
                    const Icon = getClusterIcon(cluster.name);
                    return (
                      <motion.div
                        key={cluster.name}
                        whileHover={{ scale: 1.02 }}
                        className="p-3 rounded-lg bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] cursor-pointer"
                        onClick={() => setSelectedCluster(cluster)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3 h-3 text-[#D97706]" />
                            <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
                              {cluster.name}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[#D97706]">
                            {cluster.intensity}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-[hsl(var(--claude-surface-raised))] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${cluster.intensity}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="h-full bg-[#D97706] rounded-full"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Professional Clusters */}
            {professionalClusters.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-4 h-4 text-[#3B82F6]" />
                  <h4 className="font-medium text-[hsl(var(--claude-text))]">Professional</h4>
                </div>
                <div className="space-y-2">
                  {professionalClusters.map(cluster => {
                    const Icon = getClusterIcon(cluster.name);
                    return (
                      <motion.div
                        key={cluster.name}
                        whileHover={{ scale: 1.02 }}
                        className="p-3 rounded-lg bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] cursor-pointer"
                        onClick={() => setSelectedCluster(cluster)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3 h-3 text-[#3B82F6]" />
                            <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
                              {cluster.name}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[#3B82F6]">
                            {cluster.intensity}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-[hsl(var(--claude-surface-raised))] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${cluster.intensity}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="h-full bg-[#3B82F6] rounded-full"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Creative Clusters */}
            {creativeClusters.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-4 h-4 text-[#8B5CF6]" />
                  <h4 className="font-medium text-[hsl(var(--claude-text))]">Creative</h4>
                </div>
                <div className="space-y-2">
                  {creativeClusters.map(cluster => {
                    const Icon = getClusterIcon(cluster.name);
                    return (
                      <motion.div
                        key={cluster.name}
                        whileHover={{ scale: 1.02 }}
                        className="p-3 rounded-lg bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] cursor-pointer"
                        onClick={() => setSelectedCluster(cluster)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3 h-3 text-[#8B5CF6]" />
                            <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
                              {cluster.name}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[#8B5CF6]">
                            {cluster.intensity}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-[hsl(var(--claude-surface-raised))] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${cluster.intensity}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="h-full bg-[#8B5CF6] rounded-full"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Cluster Detail Modal */}
        <AnimatePresence>
          {selectedCluster && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedCluster(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[hsl(var(--claude-surface))] rounded-lg p-6 max-w-md w-full border border-[hsl(var(--claude-border))] shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  {React.createElement(getClusterIcon(selectedCluster.name), {
                    className: 'w-8 h-8',
                    style: { color: getCategoryColor(selectedCluster.category) }
                  })}
                  <h3 className="text-xl font-semibold text-[hsl(var(--claude-text))]">
                    {selectedCluster.name}
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[hsl(var(--claude-text-muted))]">Intensity Level</span>
                      <span
                        className="text-2xl font-bold"
                        style={{ color: getCategoryColor(selectedCluster.category) }}
                      >
                        {selectedCluster.intensity}%
                      </span>
                    </div>
                    <div className="h-2 bg-[hsl(var(--claude-surface-raised))] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${selectedCluster.intensity}%`,
                          backgroundColor: getCategoryColor(selectedCluster.category)
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
                      <div className="text-xs text-[hsl(var(--claude-text-muted))] mb-1">Data Points</div>
                      <div className="text-lg font-semibold text-[hsl(var(--claude-text))]">
                        {selectedCluster.dataPoints.toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
                      <div className="text-xs text-[hsl(var(--claude-text-muted))] mb-1">Confidence</div>
                      <div className="text-lg font-semibold text-[hsl(var(--claude-text))]">
                        {selectedCluster.confidenceScore}%
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-[hsl(var(--claude-text-muted))] mb-2">Contributing Platforms</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCluster.platforms.map(platform => (
                        <Badge
                          key={platform}
                          className="bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))] border border-[hsl(var(--claude-border))]"
                        >
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
                    <TrendingUp className="w-4 h-4 text-[hsl(var(--success))]" />
                    <span className="text-sm text-[hsl(var(--claude-text))]">
                      {selectedCluster.trend === 'increasing' && 'Trending upward'}
                      {selectedCluster.trend === 'decreasing' && 'Trending downward'}
                      {selectedCluster.trend === 'stable' && 'Stable over time'}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => setSelectedCluster(null)}
                  className="w-full mt-6 bg-[hsl(var(--claude-accent))] text-white hover:bg-[hsl(var(--claude-accent))]/90"
                >
                  Close
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};

export default SoulSignatureVisualization;
