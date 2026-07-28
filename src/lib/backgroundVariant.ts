import type { ResolvedTheme } from '@/contexts/ThemeContext';

export type BackgroundMode = 'natural' | 'dark';
export type BackgroundVariant = 'daynight' | 'ambient';

/**
 * Which full-viewport background to paint behind the app.
 * Light theme always gets the ambient canvas: the DayNight photo set carries
 * night scrims tuned for light-on-dark text and would fight light-theme ink.
 */
export function pickBackgroundVariant(mode: BackgroundMode, resolvedTheme: ResolvedTheme): BackgroundVariant {
  if (resolvedTheme === 'light') return 'ambient';
  return mode === 'natural' ? 'daynight' : 'ambient';
}
