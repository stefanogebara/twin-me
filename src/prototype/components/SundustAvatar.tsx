import React from 'react';

interface SundustAvatarProps {
  initials: string;
  size?: number;
  color?: string;
}

export const SundustAvatar: React.FC<SundustAvatarProps> = ({ initials, size = 32, color = 'rgba(255,115,0,0.6)' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: size <= 32 ? 6 : '50%',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.375,
    fontWeight: 600,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
    flexShrink: 0,
  }}>
    {initials}
  </div>
);
