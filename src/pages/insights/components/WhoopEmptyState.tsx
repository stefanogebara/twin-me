import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Activity, Heart, Zap, TrendingUp } from 'lucide-react';

interface WhoopEmptyStateProps {
  colors: {
    text: string;
    textSecondary: string;
    whoopTeal: string;
  };
  theme?: string;
  onConnect: () => void;
}

export const WhoopEmptyState: React.FC<WhoopEmptyStateProps> = ({
  colors,
  onConnect,
}) => {
  return (
    <div className="space-y-4">
      <GlassPanel className="text-center py-10">
        <Activity className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
        <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
          Your twin is learning your rhythms
        </h3>
        <p className="mt-2 mb-6 max-w-sm mx-auto" style={{ color: colors.textSecondary }}>
          As your Whoop tracks your recovery and strain, your twin will share what it notices.
        </p>
        <button
          onClick={onConnect}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ backgroundColor: colors.whoopTeal, color: '#fff' }}
        >
          Connect Whoop
        </button>
        <div
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(0, 180, 216, 0.05)',
            color: colors.whoopTeal,
            border: '1px solid rgba(0, 180, 216, 0.2)',
          }}
        >
          <div aria-hidden="true" className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.whoopTeal }} />
          Your twin is collecting data... check back soon
        </div>
      </GlassPanel>

      {/* Preview cards showing what insights will look like */}
      <div aria-hidden="true" className="opacity-50 pointer-events-none space-y-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
          Preview of your insights
        </p>
        {/* Placeholder: Metrics Grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Recovery', value: '--%', icon: <Heart className="w-4 h-4" /> },
            { label: 'Strain', value: '--', icon: <Zap className="w-4 h-4" /> },
            { label: 'HRV', value: '-- ms', icon: <Activity className="w-4 h-4" /> },
          ].map((metric, i) => (
            <GlassPanel key={i} className="!p-4" style={{ border: '1px dashed' }}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: colors.textSecondary }}>{metric.icon}</span>
                <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>{metric.label}</span>
              </div>
              <div className="h-6 rounded animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }} />
            </GlassPanel>
          ))}
        </div>
        {/* Placeholder: Recovery Chart */}
        <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm" style={{ color: colors.textSecondary }}>7-Day Recovery Trend</span>
          </div>
          <div className="flex items-end gap-2 h-20">
            {[45, 70, 35, 60, 55, 80, 50].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t animate-pulse" style={{
                  height: `${h}%`,
                  backgroundColor: 'rgba(0,0,0,0.04)',
                }} />
                <span className="text-[9px]" style={{ color: colors.textSecondary }}>{['M','T','W','T','F','S','S'][i]}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
