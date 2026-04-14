import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSunPosition, type SunState } from '../hooks/useSunPosition';
import { computeSkyGradients } from '../utils/skyGradients';
import { useTheme } from './ThemeContext';
import { authFetch, getAccessToken } from '../services/api/apiBase';

const SunContext = createContext<SunState | undefined>(undefined);

/**
 * Resolve IANA timezone from GPS coordinates via open-meteo.
 * This is the authoritative timezone for the user's current location,
 * not the browser's timezone (which may be wrong under VPN).
 */
async function resolveTimezoneFromCoords(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&timezone=auto`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.timezone === 'string' ? data.timezone : null;
  } catch {
    return null;
  }
}

const RESOLVED_TZ_CACHE_KEY = 'twinme_resolved_tz_v1';

export function SunProvider({ children }: { children: React.ReactNode }) {
  const sunState = useSunPosition();
  const { resolvedTheme } = useTheme();
  const lastPostedRef = useRef<string>('');
  const [resolvedTimezone, setResolvedTimezone] = useState<string | null>(() => {
    try {
      return localStorage.getItem(RESOLVED_TZ_CACHE_KEY);
    } catch {
      return null;
    }
  });

  // Derive authoritative timezone from actual GPS coordinates whenever they change.
  // Falls back to browser timezone if open-meteo is unavailable.
  useEffect(() => {
    const { location } = sunState;
    if (location.source !== 'gps') return;
    let cancelled = false;
    resolveTimezoneFromCoords(location.latitude, location.longitude).then(tz => {
      if (cancelled || !tz) return;
      setResolvedTimezone(tz);
      try { localStorage.setItem(RESOLVED_TZ_CACHE_KEY, tz); } catch { /* non-fatal */ }
    });
    return () => { cancelled = true; };
  }, [sunState.location.latitude, sunState.location.longitude, sunState.location.source]);

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
    const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${location.source},${sunPhase},${resolvedTimezone || ''}`;

    // Skip if nothing meaningful changed or if using default timezone fallback
    if (key === lastPostedRef.current) return;
    if (location.source === 'default') return;

    lastPostedRef.current = key;

    // Prefer GPS-derived timezone (from open-meteo) over browser timezone.
    // This fixes cases where the browser timezone is wrong (VPN, manual override).
    const tz = resolvedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Post location to backend — retry briefly if auth token isn't ready yet
    // (race condition on first login: SunProvider fires before token is stored)
    const postLocation = () => {
      const token = getAccessToken() || localStorage.getItem('token');
      if (!token) return false;

      authFetch('/location/current', {
        method: 'POST',
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: tz,
          sunPhase,
          source: location.source,
        }),
      }).catch(() => { /* Non-fatal */ });

      return true;
    };

    if (!postLocation()) {
      // Token not ready — retry up to 5 times at 2s intervals (covers first-login race)
      let attempts = 0;
      const retryId = setInterval(() => {
        attempts++;
        if (postLocation() || attempts >= 5) {
          clearInterval(retryId);
        }
      }, 2000);
      return () => clearInterval(retryId);
    }
  }, [sunState, resolvedTimezone]);

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
