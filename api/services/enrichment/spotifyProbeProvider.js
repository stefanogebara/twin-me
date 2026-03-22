/**
 * Spotify Probe Provider — check if a Spotify user profile exists.
 * FREE, no API key. Extracts display name from page meta tags.
 */

import { createLogger } from '../logger.js';

const log = createLogger('SpotifyProbe');
const TIMEOUT_MS = 4000;

export async function probeSpotify(username) {
  if (!username || username.length < 2) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `https://open.spotify.com/user/${encodeURIComponent(username)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TwinMe/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    // Try to extract display name from og:title meta tag
    const html = await res.text();
    let displayName = null;

    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    if (ogTitle?.[1]) {
      // og:title is typically "Display Name | Spotify"
      displayName = ogTitle[1].replace(/\s*\|\s*Spotify\s*$/i, '').trim() || null;
    }

    // Check for playlist count in description
    const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    const hasPlaylists = ogDesc?.[1]?.toLowerCase().includes('playlist');

    log.info('Spotify found', { username, displayName, hasPlaylists });

    return {
      exists: true,
      profileUrl: url,
      displayName,
      hasPlaylists,
    };
  } catch (err) {
    if (err.name !== 'AbortError') log.warn('Spotify probe failed', { username, error: err.message });
    return null;
  }
}
