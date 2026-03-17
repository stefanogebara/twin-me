/**
 * Design Tokens — Opacity Scale
 * Centralized opacity values used across the app.
 * All values are for white text/elements on dark backgrounds: rgba(255,255,255,{value})
 */
export const OPACITY = {
  /** Barely visible — skeleton backgrounds, divider borders */
  '02': 'rgba(255,255,255,0.02)',
  '03': 'rgba(255,255,255,0.03)',
  '04': 'rgba(255,255,255,0.04)',
  '06': 'rgba(255,255,255,0.06)',
  '08': 'rgba(255,255,255,0.08)',
  '10': 'rgba(255,255,255,0.1)',
  '15': 'rgba(255,255,255,0.15)',
  '20': 'rgba(255,255,255,0.2)',
  '25': 'rgba(255,255,255,0.25)',
  '30': 'rgba(255,255,255,0.3)',
  '35': 'rgba(255,255,255,0.35)',
  '40': 'rgba(255,255,255,0.4)',
  '50': 'rgba(255,255,255,0.5)',
  '60': 'rgba(255,255,255,0.6)',
  '70': 'rgba(255,255,255,0.7)',
  '80': 'rgba(255,255,255,0.8)',
  '95': 'rgba(255,255,255,0.95)',
} as const;

/** Semantic aliases for common patterns */
export const TEXT = {
  primary: OPACITY['95'],
  secondary: OPACITY['50'],
  muted: OPACITY['35'],
  placeholder: OPACITY['25'],
  disabled: OPACITY['20'],
} as const;

export const SURFACE = {
  border: OPACITY['06'],
  borderStrong: OPACITY['08'],
  hover: OPACITY['04'],
  active: OPACITY['06'],
  skeleton: OPACITY['06'],
  skeletonSubtle: OPACITY['04'],
} as const;
