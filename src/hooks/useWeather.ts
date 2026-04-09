import { useState, useEffect } from 'react';

interface WeatherData {
  city: string;
  temperature: number;
  condition: string;
  timezone: string;     // IANA timezone (e.g. "America/Sao_Paulo")
  latitude: number;
  longitude: number;
}

function mapWeatherCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code >= 1 && code <= 3) return 'Partly cloudy';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 56 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Clear';
}

const WEATHER_CACHE_KEY = 'twinme_weather_cache_v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readCache(): WeatherData | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.data || !parsed.ts) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data as WeatherData;
  } catch {
    return null;
  }
}

function writeCache(data: WeatherData): void {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // LocalStorage unavailable — non-fatal
  }
}

export function useWeather(): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(() => readCache());

  useEffect(() => {
    if (!navigator.geolocation) return;

    // Only use geolocation if permission already granted — never trigger popup
    navigator.permissions?.query({ name: 'geolocation' }).then(perm => {
      if (perm.state !== 'granted') return;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          try {
            // open-meteo returns timezone when we request timezone=auto
            const [weatherRes, geoRes] = await Promise.all([
              fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
              ),
              fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
                { headers: { 'User-Agent': 'TwinMe/1.0' } }
              ),
            ]);

            const weatherData = await weatherRes.json();
            const geoData = await geoRes.json();

            const city =
              geoData.address?.city ||
              geoData.address?.town ||
              geoData.address?.village ||
              'Unknown';
            const temp = Math.round(weatherData.current?.temperature_2m ?? 0);
            const code = weatherData.current?.weather_code ?? 0;
            const condition = mapWeatherCode(code);
            // Fall back to Intl browser timezone if open-meteo didn't return one
            const timezone =
              weatherData.timezone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              'UTC';

            const nextWeather: WeatherData = {
              city,
              temperature: temp,
              condition,
              timezone,
              latitude,
              longitude,
            };
            setWeather(nextWeather);
            writeCache(nextWeather);
          } catch {
            // Silently fail — weather is not critical
          }
        },
        () => {
          // Geolocation denied — silently fail
        },
        { timeout: 5000 }
      );
    }).catch(() => {}); // permissions API not available
  }, []);

  return weather;
}

/**
 * Get the user's current local hour in the given timezone.
 * Falls back to the browser's local time if timezone is not provided
 * or if the Intl API fails.
 */
export function getLocalHour(timezone?: string): number {
  if (!timezone) return new Date().getHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const hourPart = parts.find(p => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

/**
 * Format a date in a given timezone with weekday + month + day.
 */
export function formatDateInTimezone(timezone?: string): string {
  const now = new Date();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
    const month = now.toLocaleDateString('en-US', { month: 'long', timeZone: tz });
    const dayStr = now.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz });
    const day = parseInt(dayStr, 10);
    const suffix =
      day % 10 === 1 && day !== 11
        ? 'st'
        : day % 10 === 2 && day !== 12
          ? 'nd'
          : day % 10 === 3 && day !== 13
            ? 'rd'
            : 'th';
    return `${dayName}, ${month} ${day}${suffix}`;
  } catch {
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    const day = now.getDate();
    return `${dayName}, ${month} ${day}`;
  }
}
