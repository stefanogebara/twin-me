import type { ResolvedTheme } from '@/contexts/ThemeContext';

export type BackgroundMode = 'natural' | 'dark';
export type BackgroundVariant = 'daynight' | 'ambient';

/**
 * Which full-viewport background to paint behind the app.
 * Light theme always gets the ambient canvas: the DayNight photo set carries
 * night scrims tuned for light-on-dark text and would fight light-theme ink.
 */
export function pickBackgroundVariant(_mode: BackgroundMode, _resolvedTheme: ResolvedTheme): BackgroundVariant {
  // Nocturne flip (2026-09-01): one canvas, no photography. The DayNight photo
  // set is retired with the rest of the legacy backgrounds; 'ambient' now
  // paints flat obsidian (see ClassicBackground). Signature intact so callers
  // and the bg_mode preference plumbing stay untouched.
  return 'ambient';
}
