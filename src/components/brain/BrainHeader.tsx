import React from 'react';
import { RefreshCw } from 'lucide-react';
import { type BrainHealth } from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from './BrainTheme';

export const BrainHeader: React.FC<{
  health: BrainHealth | null;
  selectedContext: string;
  onRefresh: () => void;
}> = ({ health, selectedContext, onRefresh }) => {
  const { textColor, textSecondary, textMuted, subtleBg } = useBrainThemeColors();
  const healthPercentage = Math.round((health?.health_score || 0) * 100);

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h2
          className="text-3xl md:text-4xl mb-2"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 400,
            color: textColor
          }}
        >
          Your Twin's Brain
        </h2>
        <p style={{ color: textSecondary }}>
          An immersive 3D map of your interests, patterns, and connections
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <svg className="w-20 h-20 transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke={subtleBg}
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke={healthPercentage > 70 ? '#4ECDC4' : healthPercentage > 40 ? '#FFEAA7' : '#FF6B6B'}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${healthPercentage * 2.26} 226`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold" style={{ color: textColor }}>{healthPercentage}%</span>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>Health</span>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
          style={{ backgroundColor: subtleBg, color: textColor }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    </div>
  );
};
