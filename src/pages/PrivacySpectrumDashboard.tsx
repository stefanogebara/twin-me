/**
 * Privacy Spectrum Dashboard
 *
 * Control what your twin knows and shares. Manage contextual twins,
 * global privacy level, and per-cluster revelation settings.
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  Briefcase,
  Users,
  Heart,
  Globe,
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// --- Design tokens ---
const TEXT_PRIMARY = '#000000';
const TEXT_SECONDARY = '#8A857D';
const BORDER_COLOR = 'rgba(0, 0, 0, 0.08)';
const CARD_BG = 'rgba(255,255,255,0.55)';

const CATEGORY_COLORS = {
  personal: '#EC4899',
  professional: '#3B82F6',
  creative: '#8B5CF6',
} as const;

const TWIN_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  professional: Briefcase,
  social: Users,
  dating: Heart,
  public: Globe,
  custom: Sparkles,
};

const TWIN_COLORS: Record<string, string> = {
  professional: '#3B82F6',
  social: '#10B981',
  dating: '#EC4899',
  public: '#6B7280',
  custom: '#8B5CF6',
};

// Built-in presets used when the DB table is empty
const BUILT_IN_PRESETS = [
  { key: 'hidden', label: 'Hidden', level: 0, color: '#6B7280' },
  { key: 'minimal', label: 'Minimal', level: 20, color: '#8B5CF6' },
  { key: 'balanced', label: 'Balanced', level: 50, color: '#3B82F6' },
  { key: 'open', label: 'Open', level: 80, color: '#10B981' },
  { key: 'full', label: 'Full', level: 100, color: '#F59E0B' },
];

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
  const color = CATEGORY_COLORS[cluster.category as keyof typeof CATEGORY_COLORS] ?? '#8A857D';

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
  const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8A857D';
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
      // clusters from hook have shape { clusterId, name, category, privacyLevel, isEnabled }
      const cat = (cluster as unknown as { category: string }).category ?? 'personal';
      if (!map[cat]) map[cat] = [];
      map[cat].push(cluster);
    }
    return map;
  }, [clusters]);

  const totalClusters = clusters.length;
  const activeClusters = clusters.filter(c => (c as unknown as { isEnabled: boolean }).isEnabled).length;

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
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '32px 20px 80px',
        fontFamily: 'inherit',
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ marginBottom: 32 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Shield size={20} color="#8B5CF6" />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              margin: 0,
              fontFamily: "Halant, var(--font-heading), Georgia, serif",
            }}
          >
            Privacy Spectrum
          </h1>
        </div>
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: 0 }}>
          Control what your twin knows and shares
        </p>
      </motion.div>

      {/* --- Contextual Twins --- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        style={{
          background: CARD_BG,
          borderRadius: 16,
          border: `1px solid ${BORDER_COLOR}`,
          padding: '20px 24px',
          marginBottom: 20,
          backdropFilter: 'blur(8px)',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 4px' }}>
          Contextual Twins
        </h2>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: '0 0 16px' }}>
          Choose which version of yourself to present
        </p>

        {twins.length === 0 ? (
          <p style={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: 'italic' }}>
            No contextual twins configured yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {twins.map(twin => {
              const IconComponent = TWIN_ICONS[twin.twin_type] ?? Sparkles;
              const twinColor = twin.color ?? TWIN_COLORS[twin.twin_type] ?? '#8A857D';
              const isActive = twin.isActive;

              return (
                <button
                  key={twin.id}
                  onClick={() => handleActivateTwin(twin.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '14px 10px',
                    borderRadius: 12,
                    border: `1.5px solid ${isActive ? twinColor : BORDER_COLOR}`,
                    background: isActive ? `${twinColor}12` : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: twinColor,
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${twinColor}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: twinColor,
                    }}
                  >
                    <IconComponent size={18} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? twinColor : TEXT_PRIMARY }}>
                    {twin.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeTwin && (
          <p style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 12, fontStyle: 'italic' }}>
            Active: {activeTwin.name} — click again to deactivate
          </p>
        )}
      </motion.section>

      {/* --- Global Privacy --- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          background: CARD_BG,
          borderRadius: 16,
          border: `1px solid ${BORDER_COLOR}`,
          padding: '20px 24px',
          marginBottom: 20,
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>
            Global Privacy
          </h2>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: TEXT_PRIMARY,
              fontFamily: "Halant, var(--font-heading), Georgia, serif",
            }}
          >
            {currentGlobal}%
          </span>
        </div>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: '0 0 16px' }}>
          Master control for all data sharing
        </p>

        <Slider
          value={[currentGlobal]}
          min={0}
          max={100}
          step={5}
          onValueChange={values => setGlobalLevel(values[0])}
          onValueCommit={handleGlobalCommit}
          style={{ marginBottom: 16 }}
        />

        {/* Preset buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(presets.length > 0 ? presets : BUILT_IN_PRESETS).map(preset => {
            const key = (preset as unknown as { preset_key?: string; key?: string }).preset_key
              ?? (preset as unknown as { key?: string }).key
              ?? String(preset.name ?? '');
            const level = (preset as unknown as { global_privacy?: number; level?: number }).global_privacy
              ?? (preset as unknown as { level?: number }).level
              ?? 50;
            const label = (preset as { name?: string; label?: string }).name
              ?? (preset as { label?: string }).label
              ?? key;
            const color = (preset as unknown as { color?: string }).color ?? '#8A857D';

            return (
              <button
                key={key}
                onClick={() => handlePresetApply(level)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: `1.5px solid ${currentGlobal === level ? color : BORDER_COLOR}`,
                  background: currentGlobal === level ? `${color}15` : 'transparent',
                  fontSize: 12,
                  fontWeight: 600,
                  color: currentGlobal === level ? color : TEXT_SECONDARY,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {isUpdating && (
          <p style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            Saving…
          </p>
        )}
      </motion.section>

      {/* --- Life Clusters --- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{
          background: CARD_BG,
          borderRadius: 16,
          border: `1px solid ${BORDER_COLOR}`,
          padding: '20px 24px',
          marginBottom: 20,
          backdropFilter: 'blur(8px)',
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
            Loading clusters…
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
      </motion.section>

      {/* --- Statistics --- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          background: CARD_BG,
          borderRadius: 16,
          border: `1px solid ${BORDER_COLOR}`,
          padding: '20px 24px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>
          Overview
        </h2>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <StatCard
            label="Clusters active"
            value={`${activeClusters} / ${totalClusters}`}
            color="#10B981"
          />
          <StatCard
            label="Avg. privacy"
            value={
              statistics
                ? `${(statistics as unknown as { averageRevelation?: number }).averageRevelation ?? 50}%`
                : statsLoading
                ? '…'
                : `${currentGlobal}%`
            }
            color="#3B82F6"
          />
          <StatCard
            label="Global level"
            value={`${currentGlobal}%`}
            color="#8B5CF6"
          />
        </div>
      </motion.section>
    </div>
  );
};

// --- Stat Card ---
const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div
    style={{
      flex: '1 1 120px',
      background: `${color}0D`,
      borderRadius: 10,
      border: `1px solid ${color}30`,
      padding: '12px 16px',
    }}
  >
    <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "Halant, var(--font-heading), Georgia, serif" }}>
      {value}
    </div>
    <div style={{ fontSize: 11, color: '#8A857D', marginTop: 2, fontWeight: 500 }}>
      {label}
    </div>
  </div>
);

export default PrivacySpectrumDashboard;
