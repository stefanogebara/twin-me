import React from 'react';
import { Network, Zap, TrendingUp, Layers } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { type BrainHealth, type VisualizationData } from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from './BrainTheme';

export const BrainStatsRow: React.FC<{
  health: BrainHealth | null;
  visualization: VisualizationData | null;
}> = ({ health, visualization }) => {
  const { textColor, textMuted } = useBrainThemeColors();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(78, 205, 196, 0.1)'
          }}>
            <Network className="w-5 h-5" style={{ color: '#4ECDC4' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {health?.total_nodes || 0}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Knowledge Nodes
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(69, 183, 209, 0.1)'
          }}>
            <Zap className="w-5 h-5" style={{ color: '#45B7D1' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {health?.total_edges || 0}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Connections
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(150, 206, 180, 0.1)'
          }}>
            <TrendingUp className="w-5 h-5" style={{ color: '#96CEB4' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {Math.round((health?.avg_confidence || 0) * 100)}%
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Avg Confidence
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(221, 160, 221, 0.1)'
          }}>
            <Layers className="w-5 h-5" style={{ color: '#DDA0DD' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {visualization?.clusters.length || 0}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Categories
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};
