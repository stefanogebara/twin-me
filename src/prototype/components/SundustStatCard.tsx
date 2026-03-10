import React from 'react';

interface SundustStatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export const SundustStatCard: React.FC<SundustStatCardProps> = ({ label, value, sub, trend, className = '' }) => (
  <div className={`sd-stat-card ${className}`}>
    <div className="sd-section-label" style={{ marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--sd-fg)', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: 12, color: 'var(--sd-text-muted)', marginTop: 4 }}>{sub}</div>
    )}
    {trend && (
      <div style={{
        fontSize: 11,
        marginTop: 6,
        color: trend === 'up' ? '#34d399' : trend === 'down' ? '#f87171' : 'var(--sd-text-muted)',
      }}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
      </div>
    )}
  </div>
);
