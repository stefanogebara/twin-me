import React from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface InsightsPageHeaderProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBgColor: string;
  textColor: string;
  textSecondaryColor: string;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const InsightsPageHeader: React.FC<InsightsPageHeaderProps> = ({
  title,
  subtitle,
  icon,
  iconColor,
  iconBgColor,
  textColor,
  textSecondaryColor,
  onBack,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg"
          style={{ border: '1px solid var(--glass-surface-border)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>

        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: iconBgColor }}
        >
          {icon}
        </div>

        <div>
          <h1
            className="text-2xl"
            style={{
              color: textColor,
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 400,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          <p className="text-sm" style={{ color: textSecondaryColor }}>
            {subtitle}
          </p>
        </div>
      </div>

      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="p-2 rounded-lg"
        title="Get a fresh observation"
        style={{ border: '1px solid var(--glass-surface-border)' }}
      >
        <RefreshCw
          className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ color: textColor }}
        />
      </button>
    </div>
  );
};
