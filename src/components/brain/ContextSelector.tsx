import React from 'react';
import { Users } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { CONTEXT_CONFIG } from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from './BrainTheme';

export const ContextSelector: React.FC<{
  selectedContext: string;
  setSelectedContext: (ctx: string) => void;
}> = ({ selectedContext, setSelectedContext }) => {
  const { textColor, textMuted } = useBrainThemeColors();

  return (
    <GlassPanel className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7' }} />
          <span className="text-sm font-medium" style={{ color: textColor }}>Personality Context</span>
        </div>
        <span className="text-xs px-2 py-1 rounded-lg" style={{
          backgroundColor: `${CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7'}20`,
          color: CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7'
        }}>
          {CONTEXT_CONFIG[selectedContext]?.label || 'Global'} View
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: textMuted }}>
        Your personality may express differently in various contexts. Select a context to see how your traits vary.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(CONTEXT_CONFIG).map(([contextId, config]) => {
          const Icon = config.icon;
          const isActive = selectedContext === contextId;
          return (
            <button
              key={contextId}
              onClick={() => setSelectedContext(contextId)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] flex items-center gap-1.5"
              style={{
                backgroundColor: isActive ? `${config.color}20` : 'rgba(193, 192, 182, 0.05)',
                color: isActive ? config.color : textMuted,
                border: isActive ? `1px solid ${config.color}40` : '1px solid transparent'
              }}
            >
              <Icon className="w-3 h-3" />
              {config.label}
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
};
