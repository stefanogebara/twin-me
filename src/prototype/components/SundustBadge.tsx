import React from 'react';

type BadgeVariant = 'connected' | 'disconnected' | 'active' | 'custom';

interface SundustBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  color?: string;
  bg?: string;
  border?: string;
  dot?: boolean;
}

export const SundustBadge: React.FC<SundustBadgeProps> = ({
  children, variant = 'custom', color, bg, border, dot = false,
}) => (
  <span
    className={variant !== 'custom' ? `sd-status-badge ${variant}` : 'sd-status-badge'}
    style={variant === 'custom' ? { color, background: bg, border: border ? `1px solid ${border}` : undefined } : undefined}
  >
    {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />}
    {children}
  </span>
);
