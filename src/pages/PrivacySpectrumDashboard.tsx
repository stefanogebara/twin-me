/**
 * Privacy Spectrum Dashboard
 *
 * Control what your twin knows and shares. Manage contextual twins,
 * global privacy level, and per-cluster revelation settings, in the page kit:
 * sections of rows, ink text, and each life area's colour kept to a small mark.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Page, PageHead, Section, List, Empty } from '@/components/register';
import '@/styles/register-settings.css';

import ContextualTwinsSection from './components/privacy/ContextualTwinsSection';
import GlobalPrivacySection from './components/privacy/GlobalPrivacySection';
import OverviewSection from './components/privacy/OverviewSection';

// Each life area's colour, as a mark beside its ink label: the register's
// signatures (register.css), never a text colour (none reaches 4.5:1).
const CATEGORY_COLORS = {
  personal: 'var(--rg-orchid)',
  professional: 'var(--rg-periwinkle)',
  creative: 'var(--rg-iris)',
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
  // Re-sync the slider/badge when the refetched cluster prop changes (e.g. after
  // a server-driven mutation invalidates ['user-clusters']) so the cached initial
  // value doesn't go stale (audit-2026-06-10).
  useEffect(() => {
    setLocalLevel(cluster.privacyLevel);
  }, [cluster.privacyLevel]);

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
    <li className={`rs-cluster${cluster.isEnabled ? '' : ' is-off'}`}>
      {/* Toggle: pressed while the area is on */}
      <button
        type="button"
        onClick={() => onToggle(cluster.clusterId, !cluster.isEnabled)}
        aria-pressed={cluster.isEnabled}
        aria-label={`${cluster.name}: ${cluster.isEnabled ? 'on' : 'off'}`}
        title={cluster.isEnabled ? 'Turn off' : 'Turn on'}
        className="rs-toggle"
      >
        {cluster.isEnabled ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      </button>

      <span className="rs-cluster-name">{cluster.name}</span>

      <Slider
        value={[localLevel]}
        min={0}
        max={100}
        step={5}
        disabled={!cluster.isEnabled}
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit}
        className="rs-slider"
        aria-label={`${cluster.name} privacy level`}
      />

      <span className="rs-figure">{localLevel}%</span>
    </li>
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
  const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? 'var(--rg-mark)';
  const label = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          aria-expanded={!collapsed}
          className="rs-group"
        >
          <span className="rs-mark" style={{ background: color }} aria-hidden="true" />
          <span className="rs-strong">{label}</span>
          <span className="rs-quiet">
            {clusters.filter(c => c.isEnabled).length} of {clusters.length} on
          </span>
          {collapsed ? <ChevronDown className="rs-chev" aria-hidden="true" /> : <ChevronUp className="rs-chev" aria-hidden="true" />}
        </button>
      </li>

      {!collapsed && clusters.map(cluster => (
        <ClusterRow
          key={cluster.clusterId}
          cluster={cluster}
          onPrivacyChange={onPrivacyChange}
          onToggle={onToggle}
        />
      ))}
    </>
  );
};

// --- Main Dashboard ---
const PrivacySpectrumDashboard: React.FC = () => {
  useDocumentTitle('Privacy Spectrum');
  const { settings, isLoading: settingsLoading, updateSettings, isUpdating } = usePrivacySettings();
  const { twins, activeTwin, isLoading: twinsLoading, activateTwin, deactivateAllTwins } = useContextualTwins();
  const {
    clusters,
    isLoading: clustersLoading,
    error: clustersError,
    refetch: refetchClusters,
    updateClusterPrivacy,
    toggleCluster,
  } = useUserClusters();
  const { statistics, isLoading: statsLoading } = usePrivacyStatistics();
  const { presets } = useAudiencePresets();

  const [globalLevel, setGlobalLevel] = useState<number | null>(null);

  const currentGlobal = globalLevel ?? settings?.global_privacy ?? 50;

  // audit-2026-06-10: success toasts used to fire synchronously BEFORE the
  // mutation settled, and no mutation had an onError — failed saves looked
  // successful and silently reverted on next load. Toast on actual outcomes.
  const handleGlobalCommit = useCallback(
    (values: number[]) => {
      const level = values[0];
      setGlobalLevel(level);
      updateSettings({ globalPrivacy: level } as Parameters<typeof updateSettings>[0], {
        onSuccess: () => toast.success(`Global privacy set to ${level}%`),
        onError: () => {
          setGlobalLevel(null);
          toast.error('Could not save your privacy level. Please try again.');
        },
      });
    },
    [updateSettings]
  );

  const handlePresetApply = useCallback(
    (level: number) => {
      setGlobalLevel(level);
      updateSettings({ globalPrivacy: level } as Parameters<typeof updateSettings>[0], {
        onSuccess: () => toast.success(`Privacy level set to ${level}%`),
        onError: () => {
          setGlobalLevel(null);
          toast.error('Could not apply the preset. Please try again.');
        },
      });
    },
    [updateSettings]
  );

  const handleClusterPrivacy = useCallback(
    (clusterId: string, value: number) => {
      updateClusterPrivacy(
        { clusterId, privacyLevel: value },
        { onError: () => toast.error('Could not save the cluster privacy level.') }
      );
    },
    [updateClusterPrivacy]
  );

  const handleClusterToggle = useCallback(
    (clusterId: string, enabled: boolean) => {
      toggleCluster(
        { clusterId, enabled },
        { onError: () => toast.error('Could not toggle the cluster.') }
      );
    },
    [toggleCluster]
  );

  const handleActivateTwin = useCallback(
    (twinId: string) => {
      if (activeTwin?.id === twinId) {
        deactivateAllTwins(undefined, {
          onSuccess: () => toast.success('Twin deactivated'),
          onError: () => toast.error('Could not deactivate the twin. Please try again.'),
        });
      } else {
        activateTwin(twinId, {
          onSuccess: () => toast.success('Twin activated'),
          onError: () => toast.error('Could not activate the twin. Please try again.'),
        });
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
      <Page className="rs">
        <p className="rs-quiet" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading your privacy settings
        </p>
      </Page>
    );
  }

  return (
    <Page className="rs">
      <PageHead title="Privacy spectrum" line="What your twin knows, and what it shares." />

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
      <Section title="Areas of your life" line="Set each one on its own.">
        <List label="Areas of your life">
          {clusters.length === 0 ? (
            // Load has settled by here (the page-level isLoading gate already
            // covers clustersLoading), so zero clusters means a fetch error or a
            // genuinely empty result — never "still loading" (audit-2026-06-10).
            <li>
              <Empty>
                {clustersError
                  ? "Couldn't load your life areas."
                  : 'No life areas yet. They appear as your twin learns about you.'}
              </Empty>
              {clustersError && (
                <button
                  type="button"
                  onClick={() => refetchClusters()}
                  className="n-btn n-btn--ghost"
                  style={{ margin: '12px 0 0 12px' }}
                >
                  Try again
                </button>
              )}
            </li>
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
        </List>
      </Section>

      {/* --- Statistics --- */}
      <OverviewSection
        activeClusters={activeClusters}
        totalClusters={totalClusters}
        averagePrivacy={averagePrivacy}
        currentGlobal={currentGlobal}
      />
    </Page>
  );
};

export default PrivacySpectrumDashboard;
