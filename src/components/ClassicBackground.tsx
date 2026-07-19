import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

// Claura ambient canvas, both appearances. Dark: the four fixed orbs
// (amber - copper - rust - purple) on the night sky. Light: the same
// geometry softened to pastel warmth on warm paper — daylight photography
// carries the scene on ported screens, so the orbs stay quiet here.
const ORBS = {
  dark: {
    canvas: '#13121a',
    stops: [
      'radial-gradient(ellipse 60% 50% at 15% 15%, rgba(210,145,55,0.38) 0%, transparent 65%)',
      'radial-gradient(ellipse 50% 45% at 82% 12%, rgba(180,110,65,0.30) 0%, transparent 60%)',
      'radial-gradient(ellipse 55% 50% at 50% 90%, rgba(160,95,55,0.34) 0%, transparent 65%)',
      'radial-gradient(ellipse 45% 40% at 70% 55%, rgba(55,45,140,0.28) 0%, transparent 60%)',
    ],
  },
  light: {
    canvas: '#f6f3ee',
    stops: [
      'radial-gradient(ellipse 60% 50% at 15% 15%, rgba(210,145,55,0.12) 0%, transparent 65%)',
      'radial-gradient(ellipse 50% 45% at 82% 12%, rgba(180,110,65,0.09) 0%, transparent 60%)',
      'radial-gradient(ellipse 55% 50% at 50% 90%, rgba(160,95,55,0.10) 0%, transparent 65%)',
      'radial-gradient(ellipse 45% 40% at 70% 55%, rgba(93,92,174,0.08) 0%, transparent 60%)',
    ],
  },
} as const;

export const ClassicBackground: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const orbs = ORBS[resolvedTheme];
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        backgroundColor: orbs.canvas,
        backgroundImage: orbs.stops.join(','),
        backgroundAttachment: 'fixed',
        transition: 'background-color 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    />
  );
};
