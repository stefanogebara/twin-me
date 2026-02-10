/**
 * ClusterPersonalityVisualization Component
 *
 * Visualizes Big Five personality profiles across different life clusters:
 * - Personal (Spotify, Netflix, Discord)
 * - Professional (Calendar, GitHub, LinkedIn)
 * - Health (Whoop, Apple Health)
 * - Creative (Instagram, TikTok)
 *
 * Shows personality divergence between clusters with radar charts and insights.
 */

import React, { useState, useEffect } from 'react';
import {
  Music,
  Briefcase,
  Heart,
  Palette,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  RefreshCw,
  Info
} from 'lucide-react';

interface BigFiveScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

interface ClusterProfile {
  cluster: string;
  name: string;
  personality: BigFiveScores;
  communication_style?: string;
  energy_pattern?: string;
  social_preference?: string;
  confidence: number;
  data_points_count: number;
  last_updated?: string;
}

interface ClusterDivergence {
  cluster_a: string;
  cluster_b: string;
  average_divergence: number;
  trait_differences: Record<string, number>;
  summary: string;
}

interface ClusterDefinition {
  name: string;
  platforms: string[];
  description: string;
}

interface ClusterPersonalityVisualizationProps {
  userId?: string;
  onClusterSelect?: (cluster: string) => void;
  connectedPlatformCount?: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TRAIT_LABELS: Record<string, string> = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  neuroticism: 'Neuroticism'
};

const TRAIT_DESCRIPTIONS: Record<string, { high: string; low: string }> = {
  openness: { high: 'Creative & curious', low: 'Practical & consistent' },
  conscientiousness: { high: 'Organized & disciplined', low: 'Flexible & spontaneous' },
  extraversion: { high: 'Outgoing & energetic', low: 'Reserved & reflective' },
  agreeableness: { high: 'Cooperative & trusting', low: 'Analytical & direct' },
  neuroticism: { high: 'Sensitive & emotional', low: 'Calm & resilient' }
};

const CLUSTER_ICONS: Record<string, React.ReactNode> = {
  personal: <Music className="w-5 h-5" />,
  professional: <Briefcase className="w-5 h-5" />,
  health: <Heart className="w-5 h-5" />,
  creative: <Palette className="w-5 h-5" />
};

const CLUSTER_COLORS: Record<string, { bg: string; text: string; border: string; chart: string }> = {
  personal: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', chart: '#a855f7' },
  professional: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', chart: '#3b82f6' },
  health: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', chart: '#22c55e' },
  creative: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30', chart: '#ec4899' }
};

export const ClusterPersonalityVisualization: React.FC<ClusterPersonalityVisualizationProps> = ({
  userId,
  onClusterSelect,
  connectedPlatformCount = 0
}) => {
  const [clusters, setClusters] = useState<Record<string, ClusterProfile>>({});
  const [divergences, setDivergences] = useState<ClusterDivergence[]>([]);
  const [definitions, setDefinitions] = useState<Record<string, ClusterDefinition>>({});
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [compareCluster, setCompareCluster] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebuildAttempted, setRebuildAttempted] = useState(false);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchClusterData();
  }, [userId]);

  const fetchClusterData = async (autoRebuild = true) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setLoading(false);
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${API_BASE}/moltbot/clusters`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch cluster data');
      }

      const data = await response.json();
      const fetchedClusters = data.clusters || {};
      setClusters(fetchedClusters);
      setDivergences(data.divergences || []);
      setDefinitions(data.availableClusters?.reduce((acc: Record<string, ClusterDefinition>, c: string) => {
        acc[c] = fetchedClusters[c]?.definition || { name: c, platforms: [], description: '' };
        return acc;
      }, {}) || {});

      // Auto-select first cluster with data
      const firstCluster = Object.keys(fetchedClusters)[0];
      if (firstCluster && !selectedCluster) {
        setSelectedCluster(firstCluster);
      }

      // Auto-trigger rebuild if clusters are empty and we haven't tried yet
      const hasClusterData = Object.keys(fetchedClusters).length > 0;
      if (!hasClusterData && autoRebuild && !rebuildAttempted) {
        setRebuildAttempted(true);
        console.log('[ClusterPersonality] No cluster data found, auto-triggering rebuild...');
        await handleRebuild();
        return; // handleRebuild will re-fetch
      }

      setError(null);
    } catch (err) {
      console.error('[ClusterPersonality] Error:', err);
      setError('Failed to load personality clusters');
    } finally {
      setLoading(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildMessage(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/moltbot/clusters/rebuild`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // Server auto-fetches behavioral_features from DB
      });

      const result = await response.json();

      if (response.ok && result.success) {
        if (result.message) {
          // Server returned a message (e.g., no behavioral features found)
          setRebuildMessage(result.message);
        }
        await fetchClusterData(false); // Don't auto-rebuild again
      } else {
        setRebuildMessage('Cluster analysis is temporarily unavailable. We will build your clusters when the service is ready.');
      }
    } catch (err) {
      console.error('[ClusterPersonality] Rebuild error:', err);
      setRebuildMessage('Cluster analysis is temporarily unavailable. We will build your clusters when the service is ready.');
    } finally {
      setRebuilding(false);
    }
  };

  const handleClusterSelect = (cluster: string) => {
    if (compareCluster === cluster) {
      setCompareCluster(null);
    } else if (selectedCluster === cluster) {
      setSelectedCluster(null);
    } else if (selectedCluster && !compareCluster) {
      setCompareCluster(cluster);
    } else {
      setSelectedCluster(cluster);
      setCompareCluster(null);
    }
    onClusterSelect?.(cluster);
  };

  const getTraitIndicator = (score: number) => {
    if (score >= 60) return { icon: <TrendingUp className="w-3 h-3" />, color: 'text-green-400' };
    if (score <= 40) return { icon: <TrendingDown className="w-3 h-3" />, color: 'text-orange-400' };
    return { icon: <Minus className="w-3 h-3" />, color: 'text-gray-400' };
  };

  const renderRadarChart = (profile: ClusterProfile, compareProfile?: ClusterProfile) => {
    const traits = Object.keys(TRAIT_LABELS) as (keyof BigFiveScores)[];
    const centerX = 100;
    const centerY = 100;
    const radius = 70;
    const angleStep = (2 * Math.PI) / traits.length;

    // Calculate points for main profile
    const points = traits.map((trait, idx) => {
      const angle = idx * angleStep - Math.PI / 2;
      const value = (profile.personality[trait] || 50) / 100;
      return {
        x: centerX + Math.cos(angle) * radius * value,
        y: centerY + Math.sin(angle) * radius * value
      };
    });

    // Calculate points for comparison profile if exists
    const comparePoints = compareProfile ? traits.map((trait, idx) => {
      const angle = idx * angleStep - Math.PI / 2;
      const value = (compareProfile.personality[trait] || 50) / 100;
      return {
        x: centerX + Math.cos(angle) * radius * value,
        y: centerY + Math.sin(angle) * radius * value
      };
    }) : [];

    const mainColor = CLUSTER_COLORS[profile.cluster]?.chart || '#6b7280';
    const compareColor = compareProfile ? CLUSTER_COLORS[compareProfile.cluster]?.chart || '#9ca3af' : '';

    return (
      <svg viewBox="0 0 200 200" className="w-full max-w-[300px] mx-auto">
        {/* Grid circles */}
        {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => (
          <circle
            key={scale}
            cx={centerX}
            cy={centerY}
            r={radius * scale}
            fill="none"
            stroke="#374151"
            strokeWidth="1"
            opacity={0.5}
          />
        ))}

        {/* Axis lines and labels */}
        {traits.map((trait, idx) => {
          const angle = idx * angleStep - Math.PI / 2;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          const labelX = centerX + Math.cos(angle) * (radius + 25);
          const labelY = centerY + Math.sin(angle) * (radius + 25);

          return (
            <g key={trait}>
              <line
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                stroke="#374151"
                strokeWidth="1"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-gray-400 text-[8px] font-medium"
              >
                {trait.slice(0, 1).toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Comparison profile area */}
        {compareProfile && comparePoints.length > 0 && (
          <polygon
            points={comparePoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill={compareColor}
            fillOpacity={0.15}
            stroke={compareColor}
            strokeWidth="2"
            strokeDasharray="4,4"
          />
        )}

        {/* Main profile area */}
        <polygon
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill={mainColor}
          fillOpacity={0.25}
          stroke={mainColor}
          strokeWidth="2"
        />

        {/* Data points */}
        {points.map((point, idx) => (
          <circle
            key={idx}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={mainColor}
          />
        ))}
      </svg>
    );
  };

  const renderTraitBar = (trait: keyof BigFiveScores, score: number, compareScore?: number) => {
    const indicator = getTraitIndicator(score);
    const description = score >= 50 ? TRAIT_DESCRIPTIONS[trait].high : TRAIT_DESCRIPTIONS[trait].low;

    return (
      <div key={trait} className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">{TRAIT_LABELS[trait]}</span>
            <span className={indicator.color}>{indicator.icon}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{Math.round(score)}</span>
            {compareScore !== undefined && (
              <span className="text-xs text-gray-500">
                ({compareScore > score ? '+' : ''}{Math.round(compareScore - score)})
              </span>
            )}
          </div>
        </div>
        <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${score}%` }}
          />
          {compareScore !== undefined && (
            <div
              className="absolute h-full w-1 bg-white/50 rounded-full transition-all duration-500"
              style={{ left: `${compareScore}%` }}
            />
          )}
        </div>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    );
  };

  const selectedProfile = selectedCluster ? clusters[selectedCluster] : null;
  const compareProfile = compareCluster ? clusters[compareCluster] : null;

  if (loading) {
    return (
      <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-800 rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Cluster Personalities</h3>
            <p className="text-xs text-gray-500 mt-1">
              Your personality varies across different life contexts
            </p>
          </div>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
            {rebuilding ? 'Rebuilding...' : 'Rebuild'}
          </button>
        </div>
      </div>

      {/* Cluster Selector */}
      <div className="p-4 border-b border-gray-800">
        <p className="text-xs text-gray-500 mb-3">
          Select clusters to view and compare (click two to compare)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(CLUSTER_COLORS).map(([cluster, colors]) => {
            const profile = clusters[cluster];
            const isSelected = selectedCluster === cluster;
            const isCompare = compareCluster === cluster;

            return (
              <button
                key={cluster}
                onClick={() => handleClusterSelect(cluster)}
                className={`p-3 rounded-xl border transition-all ${
                  isSelected || isCompare
                    ? `${colors.bg} ${colors.border} border-2`
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                    <span className={colors.text}>{CLUSTER_ICONS[cluster]}</span>
                  </div>
                  <span className="text-sm font-medium text-white capitalize">{cluster}</span>
                </div>
                {profile ? (
                  <div className="text-xs text-gray-400">
                    {profile.data_points_count} data points
                    <span className="ml-2 text-gray-500">
                      {Math.round(profile.confidence * 100)}% conf.
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    {rebuildAttempted ? 'Awaiting analysis' : 'No data yet'}
                  </div>
                )}
                {(isSelected || isCompare) && (
                  <div className={`mt-2 text-[10px] font-medium ${colors.text}`}>
                    {isSelected ? 'Primary' : 'Compare'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      {error ? (
        <div className="p-6 text-center text-gray-500">
          <p>{error}</p>
          <button onClick={() => fetchClusterData()} className="mt-2 text-blue-400 text-sm hover:underline">
            Retry
          </button>
        </div>
      ) : rebuildMessage ? (
        <div className="p-6 text-center">
          <Info className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">{rebuildMessage}</p>
          <p className="text-xs text-gray-500 mt-2">
            Your connected platforms will be analyzed to build personality clusters.
          </p>
        </div>
      ) : !selectedProfile ? (
        <div className="p-6 text-center">
          <Info className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Select a cluster to view its personality profile</p>
          <p className="text-xs text-gray-500 mt-1">
            Connect platforms to build your cluster personalities
          </p>
        </div>
      ) : (
        <div className="p-4">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: CLUSTER_COLORS[selectedProfile.cluster]?.chart }} />
                  <span className="text-sm text-gray-300 capitalize">{selectedProfile.cluster}</span>
                </div>
                {compareProfile && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border-2 border-dashed`} style={{ borderColor: CLUSTER_COLORS[compareProfile.cluster]?.chart }} />
                    <span className="text-sm text-gray-300 capitalize">{compareProfile.cluster}</span>
                  </div>
                )}
              </div>
              {renderRadarChart(selectedProfile, compareProfile)}
            </div>

            {/* Trait Breakdown */}
            <div className="space-y-4">
              {(Object.keys(TRAIT_LABELS) as (keyof BigFiveScores)[]).map(trait =>
                renderTraitBar(
                  trait,
                  selectedProfile.personality[trait] || 50,
                  compareProfile?.personality[trait]
                )
              )}
            </div>
          </div>

          {/* Divergences */}
          {divergences.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-800">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Personality Divergences</h4>
              <div className="space-y-2">
                {divergences.slice(0, 3).map((div, idx) => (
                  <div key={idx} className="p-3 bg-gray-800/30 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-300">
                        <span className="capitalize">{div.cluster_a}</span>
                        {' vs '}
                        <span className="capitalize">{div.cluster_b}</span>
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        div.average_divergence > 15
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {Math.round(div.average_divergence)}% divergence
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{div.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClusterPersonalityVisualization;
