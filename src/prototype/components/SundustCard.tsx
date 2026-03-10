import React from 'react';

interface SundustCardProps {
  children: React.ReactNode;
  variant?: 'glass' | 'panel';
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const SundustCard: React.FC<SundustCardProps> = ({
  children,
  variant = 'glass',
  className = '',
  style,
  onClick,
}) => (
  <div
    className={`${variant === 'glass' ? 'sd-card' : 'sd-panel'} ${className}`}
    style={style}
    onClick={onClick}
  >
    {children}
  </div>
);
