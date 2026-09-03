import React from 'react';

/**
 * Retired by the Nocturne flip (2026-09-01).
 *
 * This used to paint a full-bleed cinematic photograph behind nine pages
 * (settings, identity, chat, waitlist, money, exports, voice, onboarding,
 * 404) under a theme-aware veil. Nocturne has no photography: the canvas is
 * flat obsidian, painted once by ClassicBackground, and depth is a surface
 * step (Law 1). See src/styles/nocturne.css and /nocturne/system.
 *
 * Kept as an inert no-op rather than deleted so the nine call sites stay
 * valid and can drop their <ClauraZonedBackground /> line during the
 * per-page polish pass. The prop shape is preserved for the same reason.
 */
interface ClauraZonedBackgroundProps {
  dark?: string;
  light?: string;
  darkPosition?: string;
  lightPosition?: string;
  veil?: 'standard' | 'deep';
}

export const ClauraZonedBackground: React.FC<ClauraZonedBackgroundProps> = () => null;

export default ClauraZonedBackground;
