import { useState, useEffect } from 'react';

interface WeatherData {
  city: string;
  temperature: number;
  condition: string;
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

export function useWeather(): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    // Only use geolocation if permission already granted — never trigger popup
    navigator.permissions?.query({ name: 'geolocation' }).then(perm => {
      if (perm.state !== 'granted') return;

      navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const [weatherRes, geoRes] = await Promise.all([
            fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`
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
          const temp = Math.round(weatherData.current?.temperature_2m || 0);
          const code = weatherData.current?.weather_code || 0;
          const condition = mapWeatherCode(code);

          setWeather({ city, temperature: temp, condition });
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
