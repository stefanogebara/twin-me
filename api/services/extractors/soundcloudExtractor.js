/**
 * SoundCloud Data Extractor (API v2)
 *
 * Pulls a user's likes, followings, playlists, and own uploaded tracks
 * from SoundCloud and emits natural-language observations into the
 * memory stream. SoundCloud is an underrated taste fingerprint — it
 * surfaces the indie, electronic, and DJ-mix preferences that Spotify
 * typically misses.
 *
 * Auth model: OAuth 2.1 with PKCE, Bearer tokens, refreshable (~1h).
 * Pagination: cursor-based via `next_href` when
 *   `linked_partitioning=true` is requested.
 * API docs: https://developers.soundcloud.com/docs/api/guide
 */

import { supabaseAdmin } from '../database.js';
import { decryptToken } from '../encryption.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('SoundCloudExtractor');

const SOUNDCLOUD_API_BASE = 'https://api.soundcloud.com';

// Keep extraction under Vercel's 60s maxDuration.
const MAX_PAGES_PER_ENDPOINT = 3;
const PAGE_SIZE_LARGE = 100;
const PAGE_SIZE_MEDIUM = 50;
const MAX_LIKED_TRACK_OBSERVATIONS = 100;
const MAX_FOLLOWING_ROLLUP = 20;
const MAX_OBSERVATION_CHARS = 500;

class SoundCloudExtractor {
  constructor(userId) {
    this.userId = userId;
    this.accessToken = null;
  }

  async loadToken() {
    const { data, error } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token')
      .eq('user_id', this.userId)
      .eq('platform', 'soundcloud')
      .single();

    if (error || !data?.access_token) {
      throw new Error('No SoundCloud connection found for user');
    }

    this.accessToken = decryptToken(data.access_token);
  }

  async makeRequest(urlOrPath, { params = null } = {}) {
    if (!this.accessToken) throw new Error('SoundCloud access token not loaded');

    // `next_href` comes back as a fully-qualified URL; everything else we
    // pass in as a path relative to the API base.
    let url = urlOrPath.startsWith('http')
      ? urlOrPath
      : `${SOUNDCLOUD_API_BASE}${urlOrPath}`;

    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json; charset=utf-8',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SoundCloud API GET ${urlOrPath} failed (${response.status}): ${errText}`);
    }

    return response.json();
  }

  /**
   * Fetch a paginated collection via SoundCloud's cursor-based pagination.
   * Requires `linked_partitioning=true` on the first request; subsequent
   * pages use `next_href` from the response.
   */
  async fetchPaginated(path, pageSize) {
    const items = [];
    let nextHref = null;
    let firstRequest = true;

    for (let page = 0; page < MAX_PAGES_PER_ENDPOINT; page++) {
      let response;
      if (firstRequest) {
        response = await this.makeRequest(path, {
          params: {
            limit: String(pageSize),
            linked_partitioning: 'true',
          },
        });
        firstRequest = false;
      } else if (nextHref) {
        response = await this.makeRequest(nextHref);
      } else {
        break;
      }

      const collection = Array.isArray(response?.collection)
        ? response.collection
        : Array.isArray(response)
          ? response
          : [];
      items.push(...collection);

      nextHref = response?.next_href || null;
      if (!nextHref) break;
    }

    return items;
  }

  async fetchProfile() {
    return this.makeRequest('/me');
  }

  /**
   * Main entry point — extract all reachable SoundCloud content.
   */
  async extractAll(userId, _connectorId) {
    log.info('Starting SoundCloud extraction', { userId });
    await this.loadToken();

    let observationsStored = 0;

    // 1. Profile
    let profile = null;
    try {
      profile = await this.fetchProfile();
    } catch (err) {
      log.error('SoundCloud profile fetch failed', { error: err.message });
      return { success: false, error: err.message, itemsExtracted: 0 };
    }

    const followerCount = profile?.followers_count ?? 0;
    const followingCount = profile?.followings_count ?? 0;
    const likedCount = profile?.public_favorites_count ?? profile?.likes_count ?? 0;
    const username = profile?.username || profile?.permalink || 'anonymous';

    try {
      const content = `Your SoundCloud profile (@${username}) has ${followerCount} followers, follows ${followingCount} accounts, and has ${likedCount} liked tracks`;
      const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
        ingestion_source: 'soundcloud_profile',
        soundcloud_user_id: profile?.id || null,
        username,
        followers_count: followerCount,
        followings_count: followingCount,
      });
      if (ok) observationsStored++;
    } catch (err) {
      log.warn('Failed to store SoundCloud profile observation', { error: err.message });
    }

    // 2. Liked tracks
    let likedTracks = [];
    try {
      likedTracks = await this.fetchPaginated('/me/likes/tracks', PAGE_SIZE_LARGE);
      log.info('Fetched SoundCloud liked tracks', { count: likedTracks.length });
    } catch (err) {
      log.warn('SoundCloud likes fetch failed', { error: err.message });
    }

    // Top-artist rollup from liked tracks
    const artistCounts = new Map();
    const genreCounts = new Map();
    for (const track of likedTracks) {
      const artist = track?.user?.username?.trim();
      if (artist) artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      const genre = (track?.genre || '').trim();
      if (genre) genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    }

    if (artistCounts.size > 0) {
      const top = [...artistCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `${name} (${count})`);
      try {
        const content = `Top artists you like on SoundCloud: ${top.join(', ')}`;
        const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
          ingestion_source: 'soundcloud_liked_rollup',
          total_liked_sampled: likedTracks.length,
        });
        if (ok) observationsStored++;
      } catch (err) {
        log.warn('Failed to store liked rollup', { error: err.message });
      }
    }

    if (genreCounts.size > 0) {
      const topGenres = [...genreCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([g, count]) => `${g} (${count})`);
      try {
        const content = `Your SoundCloud liked-track genres lean toward: ${topGenres.join(', ')}`;
        const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
          ingestion_source: 'soundcloud_genre_inference',
        });
        if (ok) observationsStored++;
      } catch (err) {
        log.warn('Failed to store genre observation', { error: err.message });
      }
    }

    // Per-track observations (capped)
    for (const track of likedTracks.slice(0, MAX_LIKED_TRACK_OBSERVATIONS)) {
      const title = (track?.title || '').trim();
      const artist = (track?.user?.username || '').trim();
      if (!title || !artist) continue;
      try {
        let content = `You liked "${title}" by ${artist} on SoundCloud`;
        if (track?.genre) content += ` (genre: ${track.genre})`;
        const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
          ingestion_source: 'soundcloud_liked_track',
          track_id: track.id,
          track_title: title,
          artist,
          genre: track.genre || null,
          permalink_url: track.permalink_url || null,
        });
        if (ok) observationsStored++;
      } catch (err) {
        log.warn('Failed to store liked track', { trackId: track?.id, error: err.message });
      }
    }

    // 3. Followings (artists/users)
    let followings = [];
    try {
      followings = await this.fetchPaginated('/me/followings', PAGE_SIZE_LARGE);
      log.info('Fetched SoundCloud followings', { count: followings.length });
    } catch (err) {
      log.warn('SoundCloud followings fetch failed', { error: err.message });
    }

    if (followings.length > 0) {
      const names = followings
        .map((u) => u?.username || u?.permalink)
        .filter(Boolean)
        .slice(0, MAX_FOLLOWING_ROLLUP);
      try {
        const content = `Artists you follow on SoundCloud include: ${names.join(', ')}`;
        const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
          ingestion_source: 'soundcloud_followings_rollup',
          total_followings_sampled: followings.length,
        });
        if (ok) observationsStored++;
      } catch (err) {
        log.warn('Failed to store followings rollup', { error: err.message });
      }
    }

    // 4. Playlists
    let playlists = [];
    try {
      playlists = await this.fetchPaginated('/me/playlists', PAGE_SIZE_MEDIUM);
      log.info('Fetched SoundCloud playlists', { count: playlists.length });
    } catch (err) {
      log.warn('SoundCloud playlists fetch failed', { error: err.message });
    }

    if (playlists.length > 0) {
      const titles = playlists
        .map((p) => (p?.title || '').trim())
        .filter(Boolean)
        .slice(0, 15);
      try {
        const content = `Your SoundCloud playlists: ${titles.join(', ')}`;
        const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
          ingestion_source: 'soundcloud_playlists_rollup',
          total_playlists: playlists.length,
        });
        if (ok) observationsStored++;
      } catch (err) {
        log.warn('Failed to store playlists rollup', { error: err.message });
      }
    }

    // 5. Own uploaded tracks
    let uploads = [];
    try {
      uploads = await this.fetchPaginated('/me/tracks', PAGE_SIZE_MEDIUM);
      log.info('Fetched SoundCloud uploads', { count: uploads.length });
    } catch (err) {
      log.warn('SoundCloud uploads fetch failed', { error: err.message });
    }

    if (uploads.length > 0) {
      try {
        const content = `You've uploaded ${uploads.length} tracks to SoundCloud — creator signal, not just listener`;
        const ok = await addPlatformObservation(userId, content.slice(0, MAX_OBSERVATION_CHARS), 'soundcloud', {
          ingestion_source: 'soundcloud_own_uploads',
          upload_count: uploads.length,
        });
        if (ok) observationsStored++;
      } catch (err) {
        log.warn('Failed to store uploads observation', { error: err.message });
      }
    }

    log.info('SoundCloud extraction complete', {
      userId,
      observationsStored,
      likedTracks: likedTracks.length,
      followings: followings.length,
      playlists: playlists.length,
      uploads: uploads.length,
    });

    return {
      success: true,
      itemsExtracted: observationsStored,
    };
  }
}

export async function extractAll(userId, connectorId) {
  const extractor = new SoundCloudExtractor(userId);
  return extractor.extractAll(userId, connectorId);
}

export default SoundCloudExtractor;
