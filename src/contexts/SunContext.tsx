import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSunPosition, type SunState } from '../hooks/useSunPosition';
import { computeSkyGradients } from '../utils/skyGradients';
import { useTheme } from './ThemeContext';
import { authFetch } from '../services/api/apiBase';

const SunContext = createContext<SunState | undefined>(undefined);

export function SunProvider({ children }: { children: React.ReactNode }) {
  const sunState = useSunPosition();
  const { resolvedTheme } = useTheme();
  const lastPostedRef = useRef<string>('');

  // Apply sun-driven CSS vars to :root whenever sun state or theme changes
  useEffect(() => {
    const { orbs } = computeSkyGradients(sunState, resolvedTheme);
    const root = document.documentElement;

    orbs.forEach((orb, i) => {
      const n = i + 1;
      root.style.setProperty(`--body-gradient-${n}`, orb.color);
      root.style.setProperty(`--bg-pos-${n}`, orb.position);
      root.style.setProperty(`--bg-size-${n}`, orb.size);
      root.style.setProperty(`--bg-spread-${n}`, orb.spread);
    });
  }, [sunState, resolvedTheme]);

  // Persist location to backend when it changes (debounced — only on source/phase change)
  useEffect(() => {
    const { location, sunPhase } = sunState;
    const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${location.source},${sunPhase}`;

    // Skip if nothing meaningful changed or if using default timezone fallback
    if (key === lastPostedRef.current) return;
    if (location.source === 'default') return;

    lastPostedRef.current = key;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    authFetch('/location/current', {
      method: 'POST',
      body: JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: tz,
        sunPhase,
        source: location.source,
      }),
    }).catch(() => {
      // Non-fatal — twin chat still works without it
    });
  }, [sunState]);

  return (
    <SunContext.Provider value={sunState}>
      {children}
    </SunContext.Provider>
  );
}

export function useSun() {
  const context = useContext(SunContext);
  if (!context) throw new Error('useSun must be used within a SunProvider');
  return context;
}
