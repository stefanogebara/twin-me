import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
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

const INSIGHT_BG_COLORS: Record<string, { dark: string; light: string }> = {
  'music-soul': { dark: 'rgba(29, 185, 84, 0.15)', light: 'rgba(29, 185, 84, 0.1)' },
  'body-stories': { dark: 'rgba(0, 165, 224, 0.15)', light: 'rgba(0, 165, 224, 0.1)' },
  'time-patterns': { dark: 'rgba(66, 133, 244, 0.15)', light: 'rgba(66, 133, 244, 0.1)' },
  'content-world': { dark: 'rgba(255, 0, 0, 0.12)', light: 'rgba(255, 0, 0, 0.08)' },
  'gaming-world': { dark: 'rgba(145, 70, 255, 0.15)', light: 'rgba(145, 70, 255, 0.1)' },
  'digital-life': { dark: 'rgba(88, 101, 242, 0.15)', light: 'rgba(88, 101, 242, 0.1)' },
};

export const TwinInsightsGrid: React.FC<TwinInsightsGridProps> = ({
  insightLinks,
  onNavigate,
}) => {
  const { theme } = useTheme();

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-1 h-5 rounded-full"
          style={{
            background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(212, 168, 83, 0.2))'
          }}
        />
        <h3
          className="text-sm uppercase tracking-wider font-semibold"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}
        >
          Twin Insights
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insightLinks.map((insight, idx) => {
          const Icon = insight.icon;
          const clayIcon = CLAY_3D_MAP[insight.id];
          const bgColors = INSIGHT_BG_COLORS[insight.id];

          const iconBgStyle = insight.hasData && bgColors
            ? { backgroundColor: theme === 'dark' ? bgColors.dark : bgColors.light }
            : { backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)' };

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
                  style={iconBgStyle}
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
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    {insight.title}
                  </h4>
                  <p
                    className="text-xs mb-2"
                    style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
                  >
                    {insight.description}
                  </p>
                  <span
                    className="text-xs px-3 py-1 rounded-full inline-block font-medium"
                    style={{
                      backgroundColor: insight.hasData
                        ? (theme === 'dark' ? 'rgba(224, 184, 96, 0.15)' : 'rgba(212, 168, 83, 0.12)')
                        : (theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.06)'),
                      color: insight.hasData
                        ? (theme === 'dark' ? '#E0B860' : '#B8942E')
                        : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c')
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
