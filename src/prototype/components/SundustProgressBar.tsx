import React from 'react';

interface SundustProgressBarProps {
  value: number; // 0-100
  color?: string;
  label?: string;
  showValue?: boolean;
  height?: number;
}

export const SundustProgressBar: React.FC<SundustProgressBarProps> = ({
  value, color = 'var(--sd-fg)', label, showValue = false, height = 4,
}) => (
  <div style={{ width: '100%' }}>
    {(label || showValue) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--sd-text-secondary)' }}>
        {label && <span>{label}</span>}
        {showValue && <span style={{ color: 'var(--sd-text-muted)' }}>{value}%</span>}
      </div>
    )}
    <div className="sd-progress-track" style={{ height }}>
      <div className="sd-progress-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  </div>
);
