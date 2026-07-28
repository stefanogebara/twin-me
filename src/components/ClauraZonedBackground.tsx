import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Claura zoned photographic background for full-page surfaces.
 * A cinematic scene sits full-bleed behind the page — vivid up top, fading
 * through a theme-aware veil (night ink / warm paper) into the working area.
 * Renders fixed at z -1 inside the app's content layer, so it covers the
 * ambient orbs but stays behind the page content.
 * Photos come from the deployed prototype set at /cinematic/assets/.
 */
interface ClauraZonedBackgroundProps {
  dark: string;
  light: string;
  darkPosition?: string;
  lightPosition?: string;
  /**
   * standard — hero zone vivid, fades to solid canvas (dashboards, settings).
   * deep — reading surfaces where text scrolls over the whole photo (chat):
   * the veil starts heavier so type stays legible from the first pixel.
   */
  veil?: 'standard' | 'deep';
}

const VEILS = {
  standard:
    'linear-gradient(180deg, rgba(var(--claura-scrim-rgb),0.5) 0%, rgba(var(--claura-scrim-rgb),0.62) 36%, rgba(var(--claura-scrim-rgb),0.9) 72%, var(--claura-bg) 100%)',
  deep:
    'linear-gradient(180deg, rgba(var(--claura-scrim-rgb),0.62) 0%, rgba(var(--claura-scrim-rgb),0.78) 34%, rgba(var(--claura-scrim-rgb),0.94) 62%, var(--claura-bg) 92%)',
} as const;

export const ClauraZonedBackground: React.FC<ClauraZonedBackgroundProps> = ({
  dark,
  light,
  darkPosition = 'center 30%',
  lightPosition = 'center 30%',
  veil = 'standard',
}) => {
  const { resolvedTheme } = useTheme();
  const img = resolvedTheme === 'light' ? light : dark;
  const pos = resolvedTheme === 'light' ? lightPosition : darkPosition;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url('/cinematic/assets/${img}')`,
          backgroundSize: 'cover',
          backgroundPosition: pos,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: VEILS[veil],
        }}
      />
    </div>
  );
};
