import React from 'react';
import { useBrainThemeColors } from './BrainTheme';

export const SectionHeader: React.FC<{ title: string; icon?: React.ElementType }> = ({ title, icon: Icon }) => {
  const { theme, textMuted } = useBrainThemeColors();
  return (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="w-1 h-5 rounded-full"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
            : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
        }}
      />
      {Icon && <Icon className="w-4 h-4" style={{ color: textMuted }} />}
      <h3
        className="text-sm uppercase tracking-wider"
        style={{ color: textMuted }}
      >
        {title}
      </h3>
    </div>
  );
};
