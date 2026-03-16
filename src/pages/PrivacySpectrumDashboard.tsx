/**
 * Privacy Spectrum Dashboard
 *
 * Control what your twin knows and shares. Manage contextual twins,
 * global privacy level, and per-cluster revelation settings.
 */

import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import {
  usePrivacySettings,
  useContextualTwins,
  useUserClusters,
  usePrivacyStatistics,
  useAudiencePresets,
} from '@/hooks/usePrivacySettings';
import {
  Shield,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import ContextualTwinsSection from './components/privacy/ContextualTwinsSection';
import GlobalPrivacySection from './components/privacy/GlobalPrivacySection';
import OverviewSection from './components/privacy/OverviewSection';

// --- Design tokens ---
const TEXT_PRIMARY = 'var(--foreground)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const BORDER_COLOR = 'rgba(255,255,255,0.06)';
const CARD_BG = 'rgba(255,255,255,0.02)';

const CATEGORY_COLORS = {
  personal: '#f472b6',
  professional: '#60a5fa',
  creative: '#a78bfa',
} as const;

// --- Cluster Row ---
interface ClusterRowProps {
  cluster: {
    clusterId: string;
    name: string;
    category: string;
    privacyLevel: number;
    isEnabled: boolean;
  };
  onPrivacyChange: (clusterId: string, value: number) => void;
  onToggle: (clusterId: string, enabled: boolean) => void;
}

const ClusterRow: React.FC<ClusterRowProps> = ({ cluster, onPrivacyChange, onToggle }) => {
  const [localLevel, setLocalLevel] = useState(cluster.privacyLevel);
  const color = CATEGORY_COLORS[cluster.category as keyof typeof CATEGORY_COLORS] ?? 'rgba(255,255,255,0.4)';

  const handleSliderChange = useCallback(
    (values: number[]) => {
      setLocalLevel(values[0]);
    },
    []
  );

  const handleSliderCommit = useCallback(
    (values: number[]) => {
      onPrivacyChange(cluster.clusterId, values[0]);
    },
    [cluster.clusterId, onPrivacyChange]
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: `1px solid ${BORDER_COLOR}`,
        opacity: cluster.isEnabled ? 1 : 0.45,
      }}
    >
      {/* Toggle */}
      <button
        onClick={() => onToggle(cluster.clusterId, !cluster.isEnabled)}
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: 8,
          border: `1.5px solid ${cluster.isEnabled ? color : BORDER_COLOR}`,
          background: cluster.isEnabled ? `${color}18` : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: cluster.isEnabled ? color : TEXT_SECONDARY,
          transition: 'all 0.2s',
        }}
        title={cluster.isEnabled ? 'Disable cluster' : 'Enable cluster'}
      >
        {cluster.isEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>

      {/* Name */}
      <span
        style={{
          flex: '0 0 160px',
          fontSize: 13,
          fontWeight: 500,
          color: TEXT_PRIMARY,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {cluster.name}
      </span>

      {/* Slider */}
      <div style={{ flex: 1 }}>
        <Slider
          value={[localLevel]}
          min={0}
          max={100}
          step={5}
          disabled={!cluster.isEnabled}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          style={{ '--slider-color': color } as React.CSSProperties}
        />
      </div>

      {/* Level badge */}
      <span
        style={{
          flexShrink: 0,
          width: 36,
          textAlign: 'right',
          fontSize: 12,
          fontWeight: 600,
          color: cluster.isEnabled ? color : TEXT_SECONDARY,
        }}
      >
        {localLevel}%
      </span>
    </div>
  );
};

// --- Category Section ---
interface CategorySectionProps {
  category: string;
  clusters: Array<{
    clusterId: string;
    name: string;
    category: string;
    privacyLevel: number;
    isEnabled: boolean;
  }>;
  onPrivacyChange: (clusterId: string, value: number) => void;
  onToggle: (clusterId: string, enabled: boolean) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({ category, clusters, onPrivacyChange, onToggle }) => {
  const [collapsed, setCollapsed] = useState(false);
  const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? 'rgba(255,255,255,0.4)';
  const label = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 0',
          width: '100%',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: color,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 4 }}>
          ({clusters.filter(c => c.isEnabled).length}/{clusters.length})
        </span>
        <span style={{ marginLeft: 'auto', color: TEXT_SECONDARY }}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {!collapsed && (
        <div style={{ paddingLeft: 16 }}>
          {clusters.map(cluster => (
            <ClusterRow
              key={cluster.clusterId}
              cluster={cluster}
              onPrivacyChange={onPrivacyChange}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Dashboard ---
const PrivacySpectrumDashboard: React.FC = () => {
  const { settings, isLoading: settingsLoading, updateSettings, isUpdating } = usePrivacySettings();
  const { twins, activeTwin, isLoading: twinsLoading, activateTwin, deactivateAllTwins } = useContextualTwins();
  const { clusters, isLoading: clustersLoading, updateClusterPrivacy, toggleCluster } = useUserClusters();
  const { statistics, isLoading: statsLoading } = usePrivacyStatistics();
  const { presets } = useAudiencePresets();

  const [globalLevel, setGlobalLevel] = useState<number | null>(null);

  const currentGlobal = globalLevel ?? settings?.global_privacy ?? 50;

  const handleGlobalCommit = useCallback(
    (values: number[]) => {
      const level = values[0];
      setGlobalLevel(level);
      updateSettings({ globalPrivacy: level } as Parameters<typeof updateSettings>[0]);
      toast.success(`Global privacy set to ${level}%`);
    },
    [updateSettings]
  );

  const handlePresetApply = useCallback(
    (level: number) => {
      setGlobalLevel(level);
      updateSettings({ globalPrivacy: level } as Parameters<typeof updateSettings>[0]);
      toast.success(`Privacy level set to ${level}%`);
    },
    [updateSettings]
  );

  const handleClusterPrivacy = useCallback(
    (clusterId: string, value: number) => {
      updateClusterPrivacy({ clusterId, privacyLevel: value });
    },
    [updateClusterPrivacy]
  );

  const handleClusterToggle = useCallback(
    (clusterId: string, enabled: boolean) => {
      toggleCluster({ clusterId, enabled });
    },
    [toggleCluster]
  );

  const handleActivateTwin = useCallback(
    (twinId: string) => {
      if (activeTwin?.id === twinId) {
        deactivateAllTwins(undefined);
        toast.success('Twin deactivated');
      } else {
        activateTwin(twinId);
        toast.success('Twin activated');
      }
    },
    [activeTwin, activateTwin, deactivateAllTwins]
  );

  // Group clusters by category
  const clustersByCategory = React.useMemo(() => {
    const map: Record<string, typeof clusters> = {};
    for (const cluster of clusters) {
      const cat = (cluster as unknown as { category: string }).category ?? 'personal';
      if (!map[cat]) map[cat] = [];
      map[cat].push(cluster);
    }
    return map;
  }, [clusters]);

  const totalClusters = clusters.length;
  const activeClusters = clusters.filter(c => (c as unknown as { isEnabled: boolean }).isEnabled).length;

  const averagePrivacy = statistics
    ? `${(statistics as unknown as { averageRevelation?: number }).averageRevelation ?? 50}%`
    : statsLoading
    ? '...'
    : `${currentGlobal}%`;

  const isLoading = settingsLoading || twinsLoading || clustersLoading;

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: TEXT_SECONDARY,
        }}
      >
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div
      className="max-w-[900px] mx-auto px-6 py-16"
      style={{ fontFamily: 'inherit' }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Shield size={20} color="#8B5CF6" />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              margin: 0,
              fontFamily: "'Instrument Serif', Georgia, serif",
            }}
          >
            Privacy Spectrum
          </h1>
        </div>
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: 0 }}>
          Control what your twin knows and shares
        </p>
      </div>

      {/* --- Contextual Twins --- */}
      <ContextualTwinsSection
        twins={twins}
        activeTwinId={activeTwin?.id}
        activeTwinName={activeTwin?.name}
        onActivateTwin={handleActivateTwin}
      />

      {/* --- Global Privacy --- */}
      <GlobalPrivacySection
        currentGlobal={currentGlobal}
        presets={presets}
        isUpdating={isUpdating}
        onSliderChange={values => setGlobalLevel(values[0])}
        onSliderCommit={handleGlobalCommit}
        onPresetApply={handlePresetApply}
      />

      {/* --- Life Clusters --- */}
      <section
        style={{
          background: CARD_BG,
          borderRadius: 16,
          border: `1px solid ${BORDER_COLOR}`,
          padding: '20px 24px',
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 4px' }}>
          Life Clusters
        </h2>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: '0 0 16px' }}>
          Fine-tune privacy for each area of your life
        </p>

        {clusters.length === 0 ? (
          <p style={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: 'italic' }}>
            Loading clusters...
          </p>
        ) : (
          ['personal', 'professional', 'creative'].map(category => {
            const categoryClusters = clustersByCategory[category] ?? [];
            if (categoryClusters.length === 0) return null;
            return (
              <CategorySection
                key={category}
                category={category}
                clusters={categoryClusters as Array<{
                  clusterId: string;
                  name: string;
                  category: string;
                  privacyLevel: number;
                  isEnabled: boolean;
                }>}
                onPrivacyChange={handleClusterPrivacy}
                onToggle={handleClusterToggle}
              />
            );
          })
        )}
      </section>

      {/* --- Statistics --- */}
      <OverviewSection
        activeClusters={activeClusters}
        totalClusters={totalClusters}
        averagePrivacy={averagePrivacy}
        currentGlobal={currentGlobal}
      />
    </div>
  );
};

export default PrivacySpectrumDashboard;
