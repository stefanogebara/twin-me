import React from 'react';

// Default label ink is the theme foreground; the leading dot renders only when
// a caller passes a custom (accent) color.
const DEFAULT_LABEL_COLOR = 'var(--foreground)';

export const SectionLabel: React.FC<{ label: string; color?: string }> = ({ label, color = DEFAULT_LABEL_COLOR }) => (
  <div className="flex items-center gap-2 mb-4">
    {color !== DEFAULT_LABEL_COLOR && (
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    )}
    <h2
      className="text-[11px] font-medium tracking-widest uppercase"
      style={{ color, fontFamily: 'Inter, sans-serif' }}
    >
      {label}
    </h2>
  </div>
);

export const Divider: React.FC = () => (
  <div className="my-10" style={{ borderTop: '1px solid var(--border-glass)' }} />
);

export const OceanBar: React.FC<{ trait: string; value: number }> = ({ trait, value }) => (
  <div className="flex items-center gap-3">
    <span className="text-[13px] w-36 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
      {trait}
    </span>
    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'var(--glass-surface-bg)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${value}%`,
          backgroundColor: 'var(--accent-vibrant)',
          opacity: 0.6,
        }}
      />
    </div>
    <span className="text-[13px] w-10 text-right flex-shrink-0" style={{ color: 'var(--foreground)' }}>
      {value}%
    </span>
  </div>
);
