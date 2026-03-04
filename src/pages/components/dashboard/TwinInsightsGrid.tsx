import React from 'react';
import { Globe } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Clay3DIcon } from '@/components/Clay3DIcon';

interface Pattern {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  actionLabel?: string;
  actionPath?: string;
  hasData?: boolean;
}

interface TwinInsightsGridProps {
  insightLinks: Pattern[];
  onNavigate: (path: string) => void;
}

const CLAY_3D_MAP: Record<string, string> = {
  'music-soul': 'headphones',
  'body-stories': 'lightning',
  'time-patterns': 'compass',
  'content-world': 'star',
  'gaming-world': 'game-controller',
  'digital-life': 'globe',
};

const INSIGHT_BG_COLORS: Record<string, string> = {
  'music-soul': 'rgba(29, 185, 84, 0.1)',
  'body-stories': 'rgba(0, 165, 224, 0.1)',
  'time-patterns': 'rgba(66, 133, 244, 0.1)',
  'content-world': 'rgba(255, 0, 0, 0.08)',
  'gaming-world': 'rgba(145, 70, 255, 0.1)',
  'digital-life': 'rgba(88, 101, 242, 0.1)',
};

export const TwinInsightsGrid: React.FC<TwinInsightsGridProps> = ({
  insightLinks,
  onNavigate,
}) => {
  return (
    <div className="mb-12">
      <div className="flex items-center gap-2 mb-6">
        <div
          className="w-1 h-5 rounded-full"
          style={{
            background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(212, 168, 83, 0.2))'
          }}
        />
        <h3
          className="text-sm uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          Twin Insights
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {insightLinks.map((insight, idx) => {
          const Icon = insight.icon;
          const clayIcon = CLAY_3D_MAP[insight.id];
          const iconBgColor = insight.hasData && INSIGHT_BG_COLORS[insight.id]
            ? INSIGHT_BG_COLORS[insight.id]
            : 'rgba(255, 255, 255, 0.05)';

          return (
            <GlassPanel
              key={insight.id}
              hover
              className={`cursor-pointer ${insight.hasData ? 'gradient-accent-bar' : ''}`}
              delay={0.05 + idx * 0.06}
              onClick={() => onNavigate(insight.actionPath!)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: iconBgColor }}
                >
                  {clayIcon ? (
                    <Clay3DIcon name={clayIcon} size={24} className={insight.hasData ? '' : 'opacity-50 grayscale'} />
                  ) : (
                    <Icon className={`w-5 h-5 ${insight.color}`} />
                  )}
                </div>
                <div className="flex-1">
                  <h4
                    className="text-sm mb-1"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 500,
                      color: 'var(--foreground)'
                    }}
                  >
                    {insight.title}
                  </h4>
                  <p
                    className="text-xs mb-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {insight.description}
                  </p>
                  <span
                    className="text-xs px-3 py-1 rounded-full inline-block font-medium"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {insight.actionLabel} →
                  </span>
                </div>
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
};
