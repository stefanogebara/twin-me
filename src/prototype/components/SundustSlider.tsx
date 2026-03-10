import React from 'react';

interface SundustSliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
  description?: string;
}

export const SundustSlider: React.FC<SundustSliderProps> = ({
  value, onChange, min = 0, max = 100, label, description,
}) => (
  <div style={{ width: '100%' }}>
    {label && (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--sd-text-muted)' }}>{value}%</span>
      </div>
    )}
    {description && (
      <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>{description}</div>
    )}
    <input
      type="range"
      className="sd-slider"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
    />
  </div>
);
