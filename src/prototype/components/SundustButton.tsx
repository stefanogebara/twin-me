import React from 'react';

interface SundustButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'accent' | 'ghost' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  type?: 'button' | 'submit';
}

export const SundustButton: React.FC<SundustButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  className = '',
  style,
  type = 'button',
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`sd-btn sd-btn-${size} sd-btn-${variant} ${className}`}
    style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
  >
    {children}
  </button>
);
