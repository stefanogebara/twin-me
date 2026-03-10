import React from 'react';

interface SundustInsightCardProps {
  icon: string;
  iconColor?: string;
  badge: string;
  badgeColor?: string;
  badgeTextColor?: string;
  badgeBorder?: string;
  title: string;
  body: string;
  className?: string;
}

export const SundustInsightCard: React.FC<SundustInsightCardProps> = ({
  icon, iconColor = 'var(--sd-fg)',
  badge, badgeColor = 'rgba(255,255,255,0.08)', badgeTextColor = 'var(--sd-fg)', badgeBorder = 'rgba(255,255,255,0.12)',
  title, body, className = '',
}) => (
  <div className={`sd-insight-card ${className}`}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 20, lineHeight: 1, color: iconColor }}>{icon}</span>
      <span className="sd-status-badge" style={{ background: badgeColor, color: badgeTextColor, border: `1px solid ${badgeBorder}`, borderRadius: 100 }}>
        {badge}
      </span>
    </div>
    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 8, lineHeight: 1.4 }}>
      {title}
    </div>
    <div style={{ fontSize: 13, color: 'var(--sd-text-secondary)', lineHeight: 1.6 }}>
      {body}
    </div>
  </div>
);
