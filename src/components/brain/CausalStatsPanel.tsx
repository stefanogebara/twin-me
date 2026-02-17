import React from 'react';
import { GitBranch } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { type VisualizationData } from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from './BrainTheme';

export const CausalStatsPanel: React.FC<{
  visualization: VisualizationData | null;
}> = ({ visualization }) => {
  const { textColor, textMuted } = useBrainThemeColors();

  if (!visualization?.stats?.causal ||
      (visualization.stats.causal.causalEdges === 0 && visualization.stats.causal.correlationalEdges === 0)) {
    return null;
  }

  return (
    <GlassPanel className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" style={{ color: '#E74C3C' }} />
          <span className="text-sm font-medium" style={{ color: textColor }}>Relationship Types</span>
        </div>
        <span className="text-xs px-2 py-1 rounded-lg" style={{
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          color: '#E74C3C'
        }}>
          {Math.round(visualization.stats.causal.causalRatio * 100)}% causal
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(231, 76, 60, 0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E74C3C' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Causal</span>
          </div>
          <div className="text-xl font-bold" style={{ color: '#E74C3C' }}>
            {visualization.stats.causal.causalEdges}
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            cause &rarr; effect
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(108, 92, 231, 0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6C5CE7' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Correlational</span>
          </div>
          <div className="text-xl font-bold" style={{ color: '#6C5CE7' }}>
            {visualization.stats.causal.correlationalEdges}
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            co-occurrence
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(150, 206, 180, 0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#96CEB4' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Other</span>
          </div>
          <div className="text-xl font-bold" style={{ color: '#96CEB4' }}>
            {visualization.stats.causal.otherEdges}
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            structural
          </div>
        </div>
      </div>
    </GlassPanel>
  );
};
