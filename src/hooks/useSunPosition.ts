import { useState, useEffect, useRef } from 'react';
import SunCalc from 'suncalc';

export type SunPhase = 'night' | 'dawn' | 'sunrise' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'dusk';

interface Location {
  latitude: number;
  longitude: number;
  source: 'gps' | 'ip' | 'timezone' | 'default';
}

export interface SunState {
  sunPhase: SunPhase;
  elevation: number;   // degrees, negative = below horizon
  azimuth: number;     // degrees, 0 = south, positive = west
  progress: number;    // 0 at sunrise, 1 at sunset
  isDay: boolean;
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  location: Location;
}

// Timezone → representative coordinates for fallback
const TZ_COORDS: Record<string, [number, number]> = {
  'America/New_York': [40.71, -74.01],
  'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/Buenos_Aires': [-34.60, -58.38],
  'America/Mexico_City': [19.43, -99.13],
  'America/Toronto': [43.65, -79.38],
  'Europe/London': [51.51, -0.13],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Berlin': [52.52, 13.41],
  'Europe/Madrid': [40.42, -3.70],
  'Europe/Rome': [41.90, 12.50],
  'Europe/Istanbul': [41.01, 28.98],
  'Asia/Tokyo': [35.68, 139.69],
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Dubai': [25.20, 55.27],
  'Asia/Kolkata': [28.61, 77.23],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Seoul': [37.57, 126.98],
  'Australia/Sydney': [-33.87, 151.21],
  'Pacific/Auckland': [-36.85, 174.76],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Cairo': [30.04, 31.24],
};

function getTimezoneLocation(): [number, number] {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_COORDS[tz]) return TZ_COORDS[tz];
  } catch { /* ignore */ }
  return [40.71, -74.01]; // NYC default
}

async function fetchIPLocation(): Promise<[number, number] | null> {
  try {
    // Use ipwho.is (free, HTTPS, no CORS issues, no API key)
    const res = await fetch('https://ipwho.is/', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success !== false && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return [data.latitude, data.longitude];
    }
  } catch { /* ignore */ }
  return null;
}

function safeDateOrNoon(date: Date, now: Date): Date {
  if (!date || isNaN(date.getTime())) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  }
  return date;
}

function computeSunState(lat: number, lng: number, source: Location['source']): SunState {
  const now = new Date();
  const pos = SunCalc.getPosition(now, lat, lng);
  const times = SunCalc.getTimes(now, lat, lng);

  const elevation = pos.altitude * (180 / Math.PI);
  const azimuth = pos.azimuth * (180 / Math.PI);

  const solarNoon = safeDateOrNoon(times.solarNoon, now);
  const sunrise = safeDateOrNoon(times.sunrise, now);
  const sunset = safeDateOrNoon(times.sunset, now);

  const isMorning = now.getTime() < solarNoon.getTime();

  let sunPhase: SunPhase;
  if (elevation < -12) {
    sunPhase = 'night';
  } else if (elevation < -6) {
    sunPhase = isMorning ? 'dawn' : 'dusk';
  } else if (elevation < 0) {
    sunPhase = isMorning ? 'sunrise' : 'sunset';
  } else if (elevation < 15) {
    sunPhase = isMorning ? 'morning' : 'afternoon';
  } else {
    sunPhase = 'noon';
  }

  // Day progress: 0 at sunrise, 1 at sunset
  const sunriseMs = sunrise.getTime();
  const sunsetMs = sunset.getTime();
  const nowMs = now.getTime();
  let progress: number;
  if (nowMs <= sunriseMs) progress = 0;
  else if (nowMs >= sunsetMs) progress = 1;
  else progress = (nowMs - sunriseMs) / (sunsetMs - sunriseMs);

  return {
    sunPhase,
    elevation,
    azimuth,
    progress,
    isDay: elevation > 0,
    sunrise,
    sunset,
    solarNoon,
    location: { latitude: lat, longitude: lng, source },
  };
}

export function useSunPosition(): SunState {
  const [location, setLocation] = useState<Location>(() => {
    const [lat, lng] = getTimezoneLocation();
    return { latitude: lat, longitude: lng, source: 'timezone' as const };
  });

  const [sunState, setSunState] = useState<SunState>(() =>
    computeSunState(location.latitude, location.longitude, location.source)
  );

  const locationRef = useRef(location);
  locationRef.current = location;

  // Attempt better geolocation on mount: GPS → IP → keep timezone
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Try GPS
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 300_000,
            });
          });
          if (!cancelled) {
            setLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              source: 'gps',
            });
            return;
          }
        } catch { /* GPS unavailable */ }
      }

      // Try IP
      const ipLoc = await fetchIPLocation();
      if (!cancelled && ipLoc) {
        setLocation({ latitude: ipLoc[0], longitude: ipLoc[1], source: 'ip' });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Recompute when location changes
  useEffect(() => {
    setSunState(computeSunState(location.latitude, location.longitude, location.source));
  }, [location]);

  // Refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      const loc = locationRef.current;
      setSunState(computeSunState(loc.latitude, loc.longitude, loc.source));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return sunState;
}
