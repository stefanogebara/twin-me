import React from 'react';
import { Eye, Activity } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { type BrainHealth, type VisualizationData, CATEGORY_CONFIG } from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from './BrainTheme';
import { SectionHeader } from './SectionHeader';

export const CategoryFilters: React.FC<{
  visualization: VisualizationData | null;
  filterCategory: string | null;
  setFilterCategory: (cat: string | null) => void;
}> = ({ visualization, filterCategory, setFilterCategory }) => {
  const { textColor, textMuted, subtleBg } = useBrainThemeColors();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setFilterCategory(null)}
        className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex items-center gap-2"
        style={{
          backgroundColor: !filterCategory ? 'rgba(193, 192, 182, 0.2)' : subtleBg,
          color: !filterCategory ? textColor : textMuted,
          border: !filterCategory ? '1px solid rgba(193, 192, 182, 0.3)' : '1px solid transparent'
        }}
      >
        <Eye className="w-4 h-4" />
        All Categories
      </button>
      {visualization?.clusters.map(cluster => {
        const config = CATEGORY_CONFIG[cluster.id] || CATEGORY_CONFIG.personal;
        const Icon = config.icon;
        const isActive = filterCategory === cluster.id;

        return (
          <button
            key={cluster.id}
            onClick={() => setFilterCategory(isActive ? null : cluster.id)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex items-center gap-2"
            style={{
              backgroundColor: isActive ? `${config.color}20` : subtleBg,
              color: isActive ? config.color : textMuted,
              border: isActive ? `1px solid ${config.color}40` : '1px solid transparent'
            }}
          >
            <Icon className="w-4 h-4" />
            {cluster.label}
            <span className="text-xs opacity-70">({cluster.nodeCount})</span>
          </button>
        );
      })}
    </div>
  );
};

export const CategoryDistribution: React.FC<{
  health: BrainHealth | null;
  filterCategory: string | null;
  setFilterCategory: (cat: string | null) => void;
}> = ({ health, filterCategory, setFilterCategory }) => {
  const { textColor, textMuted, textFaint } = useBrainThemeColors();

  if (!health?.category_distribution || Object.keys(health.category_distribution).length === 0) {
    return null;
  }

  return (
    <GlassPanel className="!p-5">
      <SectionHeader title="Knowledge Distribution" icon={Activity} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(health.category_distribution).map(([category, count]) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.personal;
          const Icon = config.icon;
          const percentage = Math.round((count / (health?.total_nodes || 1)) * 100);

          return (
            <div
              key={category}
              className="p-4 rounded-xl text-center transition-all hover:scale-[1.02] cursor-pointer"
              style={{
                backgroundColor: `${config.color}10`,
                border: `1px solid ${config.color}20`
              }}
              onClick={() => setFilterCategory(filterCategory === category ? null : category)}
            >
              <div
                className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center"
                style={{ backgroundColor: `${config.color}20` }}
              >
                <Icon className="w-5 h-5" style={{ color: config.color }} />
              </div>
              <div className="text-xl font-bold" style={{ color: config.color }}>
                {count}
              </div>
              <div className="text-xs capitalize" style={{ color: textMuted }}>
                {category}
              </div>
              <div className="text-xs mt-1" style={{ color: textFaint }}>
                {percentage}%
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
};
