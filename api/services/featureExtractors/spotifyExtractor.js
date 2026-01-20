/**
 * Spotify Feature Extractor
 *
 * Extracts behavioral features from Spotify listening data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Discovery rate → Openness (r=0.40)
 * - Genre diversity → Openness (r=0.38)
 * - Repeat listening → Conscientiousness (r=-0.35)
 * - Playlist organization → Conscientiousness (r=0.42)
 * - Social playlist sharing → Extraversion (r=0.45)
 * - Energy preferences → Extraversion (r=0.33)
 * - Emotional valence → Neuroticism (r=-0.28)
 * - Liveness preference → Extraversion (r=0.18)
 * - Mode preference → Neuroticism (r=-0.15)
 * - Skip rate → Neuroticism (r=0.25)
 * - Arousal preference → Extraversion (r=0.33)
 * - Playlist curation style → Conscientiousness (r=0.38)
 * - Musical sophistication → Openness (r=0.35)
 */

import { supabaseAdmin } from '../database.js';

class SpotifyFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90; // Analyze last 3 months of data
  }

  /**
   * Extract all behavioral features from Spotify data
   */
  async extractFeatures(userId) {
    console.log(`🎵 [Spotify Extractor] Extracting features for user ${userId}`);

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fetch from BOTH tables to get all Spotify data
      // Primary source: user_platform_data (11,000+ records)
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .gte('extracted_at', cutoffDate)
        .order('extracted_at', { ascending: false });

      if (platformError) {
        console.warn('⚠️ [Spotify Extractor] Error fetching user_platform_data:', platformError.message);
      }

      // Secondary source: soul_data (legacy, 18 records)
      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false });

      if (soulError) {
        console.warn('⚠️ [Spotify Extractor] Error fetching soul_data:', soulError.message);
      }

      // Normalize data from both tables
      const normalizedPlatformData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at, // Normalize timestamp field
        raw_data: entry.raw_data || {}
      }));

      const normalizedSoulData = (soulData || []).map(entry => ({
        ...entry,
        raw_data: entry.raw_data || {}
      }));

      // Combine all data sources
      const spotifyData = [...normalizedPlatformData, ...normalizedSoulData];

      if (spotifyData.length === 0) {
        console.log('⚠️ [Spotify Extractor] No Spotify data found for user in either table');
        return [];
      }

      console.log(`📊 [Spotify Extractor] Found ${spotifyData.length} Spotify data entries (${normalizedPlatformData.length} from user_platform_data, ${normalizedSoulData.length} from soul_data)`);

      // Extract features
      const features = [];

      // 1. Discovery Rate (Openness)
      const discoveryRate = this.calculateDiscoveryRate(spotifyData);
      if (discoveryRate !== null) {
        features.push(this.createFeature(userId, 'discovery_rate', discoveryRate, {
          contributes_to: 'openness',
          contribution_weight: 0.40,
          description: 'Rate of discovering new artists and songs',
          evidence: { correlation: 0.40, citation: 'Greenberg et al. (2016)' }
        }));
      }

      // 2. Genre Diversity (Openness)
      const genreDiversityResult = this.calculateGenreDiversity(spotifyData);
      if (genreDiversityResult !== null) {
        const genreValue = typeof genreDiversityResult === 'object' ? genreDiversityResult.value : genreDiversityResult;
        const genreRawValue = typeof genreDiversityResult === 'object' ? genreDiversityResult.rawValue : {};
        features.push(this.createFeature(userId, 'genre_diversity', genreValue, {
          contributes_to: 'openness',
          contribution_weight: 0.38,
          description: 'Variety of music genres listened to',
          evidence: { correlation: 0.38, citation: 'Rentfrow & Gosling (2003)' },
          raw_value: genreRawValue
        }));
      }

      // 3. Repeat Listening (Conscientiousness - negative correlation)
      const repeatListening = this.calculateRepeatListening(spotifyData);
      if (repeatListening !== null) {
        features.push(this.createFeature(userId, 'repeat_listening', repeatListening, {
          contributes_to: 'conscientiousness',
          contribution_weight: -0.35,
          description: 'Tendency to replay the same songs frequently',
          evidence: { correlation: -0.35, note: 'High repeat = low conscientiousness' }
        }));
      }

      // 4. Playlist Organization (Conscientiousness)
      const playlistOrg = this.calculatePlaylistOrganization(spotifyData);
      if (playlistOrg !== null) {
        features.push(this.createFeature(userId, 'playlist_organization', playlistOrg, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.42,
          description: 'How well playlists are organized and curated',
          evidence: { correlation: 0.42 }
        }));
      }

      // 5. Social Playlist Sharing (Extraversion)
      const socialSharing = this.calculateSocialSharing(spotifyData);
      if (socialSharing !== null) {
        features.push(this.createFeature(userId, 'social_sharing', socialSharing, {
          contributes_to: 'extraversion',
          contribution_weight: 0.45,
          description: 'Frequency of collaborative/public playlists',
          evidence: { correlation: 0.45 }
        }));
      }

      // 6. Energy Preferences (Extraversion)
      const energyPreference = this.calculateEnergyPreference(spotifyData);
      if (energyPreference !== null) {
        features.push(this.createFeature(userId, 'energy_preference', energyPreference, {
          contributes_to: 'extraversion',
          contribution_weight: 0.33,
          description: 'Preference for high-energy vs calm music',
          evidence: { correlation: 0.33, citation: 'Langmeyer et al. (2012)' }
        }));
      }

      // 7. Valence Preference (Neuroticism, Extraversion, Agreeableness)
      const emotionalValence = this.calculateEmotionalValence(spotifyData);
      if (emotionalValence !== null) {
        features.push(this.createFeature(userId, 'valence_preference', emotionalValence, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.30,
          description: 'Preference for positive vs negative emotional tone in music',
          evidence: { correlation: -0.30, note: 'High valence = low neuroticism, also correlates with extraversion (r=0.25) and agreeableness (r=0.15)' }
        }));
      }

      // 8. Liveness Preference (Extraversion)
      const livenessPreference = this.calculateLivenessPreference(spotifyData);
      if (livenessPreference !== null) {
        features.push(this.createFeature(userId, 'liveness_preference', livenessPreference.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.18,
          description: 'Preference for live vs studio recordings',
          evidence: { correlation: 0.18, citation: 'Anderson et al. (2020)' },
          raw_value: livenessPreference.rawValue
        }));
      }

      // 9. Mode Preference (Neuroticism - negative correlation)
      const modePreference = this.calculateModePreference(spotifyData);
      if (modePreference !== null) {
        features.push(this.createFeature(userId, 'mode_preference', modePreference.value, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.15,
          description: 'Preference for major (positive) vs minor (melancholic) keys',
          evidence: { correlation: -0.15, citation: 'Greenberg et al. (2016)', note: 'High major key preference = low neuroticism' },
          raw_value: modePreference.rawValue
        }));
      }

      // 10. Skip Rate (Neuroticism)
      const skipRate = this.calculateSkipRate(spotifyData);
      if (skipRate !== null) {
        features.push(this.createFeature(userId, 'skip_rate', skipRate.value, {
          contributes_to: 'neuroticism',
          contribution_weight: 0.25,
          description: 'Frequency of skipping tracks before completion',
          evidence: { correlation: 0.25, citation: 'Hongpanarak et al. (2021)' },
          raw_value: skipRate.rawValue
        }));
      }

      // 11. Arousal Preference (Extraversion)
      const arousalPreference = this.calculateArousalPreference(spotifyData);
      if (arousalPreference !== null) {
        features.push(this.createFeature(userId, 'arousal_preference', arousalPreference, {
          contributes_to: 'extraversion',
          contribution_weight: 0.33,
          description: 'Preference for high-arousal, stimulating music',
          evidence: { correlation: 0.33, citation: 'Cambridge myPersonality (2015)' }
        }));
      }

      // 12. Playlist Curation Style (Conscientiousness)
      const playlistCuration = this.calculatePlaylistCurationStyle(spotifyData);
      if (playlistCuration !== null) {
        features.push(this.createFeature(userId, 'playlist_curation_style', playlistCuration.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.38,
          description: 'Quality and organization of playlists',
          evidence: { correlation: 0.38, citation: 'Ferwerda et al. (2017)' },
          raw_value: playlistCuration.rawValue
        }));
      }

      // 13. Musical Sophistication (Openness)
      const musicalSophistication = this.calculateMusicalSophistication(spotifyData);
      if (musicalSophistication !== null) {
        features.push(this.createFeature(userId, 'musical_sophistication', musicalSophistication.value, {
          contributes_to: 'openness',
          contribution_weight: 0.35,
          description: 'Engagement with complex or niche music',
          evidence: { correlation: 0.35, citation: 'Greenberg et al. (2016)' },
          raw_value: musicalSophistication.rawValue
        }));
      }

      console.log(`✅ [Spotify Extractor] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [Spotify Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Calculate discovery rate (new artists/tracks per week)
   */
  calculateDiscoveryRate(spotifyData) {
    const uniqueArtists = new Set();
    const uniqueTracks = new Set();
    let totalPlays = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';

      // From listening history / recently_played
      if ((dataType === 'listening_history' || dataType === 'recently_played') && raw.track) {
        uniqueTracks.add(raw.track.id || raw.track.name);
        if (raw.track.artists && raw.track.artists[0]) {
          uniqueArtists.add(raw.track.artists[0].id || raw.track.artists[0].name);
        }
        totalPlays++;
      }

      // Handle recently_played with items array (user_platform_data format)
      if (dataType === 'recently_played' && raw.items) {
        raw.items.forEach(item => {
          const track = item.track || item;
          uniqueTracks.add(track.id || track.name);
          if (track.artists && track.artists[0]) {
            uniqueArtists.add(track.artists[0].id || track.artists[0].name);
          }
          totalPlays++;
        });
      }

      // From top tracks/artists (handle multiple naming conventions)
      const isTopTracks = ['top_tracks', 'top_track', 'top_tracks_short_term', 'top_tracks_medium_term', 'top_tracks_long_term'].includes(dataType);
      if (isTopTracks) {
        // Handle both formats: raw.items array or individual track
        const items = raw.items || (raw.name ? [raw] : []);
        items.forEach(track => {
          uniqueTracks.add(track.id || track.name);
          if (track.artists && track.artists[0]) {
            uniqueArtists.add(track.artists[0].id || track.artists[0].name);
          }
        });
      }

      const isTopArtists = ['top_artists', 'top_artist', 'top_artists_short_term', 'top_artists_medium_term', 'top_artists_long_term'].includes(dataType);
      if (isTopArtists) {
        // Handle both formats: raw.items array or individual artist
        const items = raw.items || (raw.name ? [raw] : []);
        items.forEach(artist => {
          uniqueArtists.add(artist.id || artist.name);
        });
      }
    }

    // Even without plays, calculate based on unique items discovered
    const totalItems = uniqueArtists.size + uniqueTracks.size;
    if (totalItems === 0) return null;

    // Discovery rate based on variety of unique content
    // More unique items = higher discovery (normalized to 0-100)
    // Assume 200+ unique items is maximum discovery
    const discoveryRate = Math.min(100, (totalItems / 200) * 100);

    return Math.round(discoveryRate * 100) / 100;
  }

  /**
   * Calculate genre diversity (Shannon entropy of genres)
   * Returns { value, rawValue } for template interpolation
   */
  calculateGenreDiversity(spotifyData) {
    const genreCounts = {};
    let total = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';

      // Helper to extract genres from an artist
      const extractGenres = (artist) => {
        if (artist.genres && artist.genres.length > 0) {
          artist.genres.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            total++;
          });
        }
      };

      // Extract genres from tracks with nested artists
      if (raw.track && raw.track.artists) {
        raw.track.artists.forEach(extractGenres);
      }

      // Handle recently_played items array
      if (dataType === 'recently_played' && raw.items) {
        raw.items.forEach(item => {
          const track = item.track || item;
          if (track.artists) {
            track.artists.forEach(extractGenres);
          }
        });
      }

      // From top artists (handle multiple formats)
      const isTopArtists = ['top_artists', 'top_artist', 'top_artists_short_term', 'top_artists_medium_term', 'top_artists_long_term'].includes(dataType);
      if (isTopArtists) {
        const items = raw.items || (raw.genres ? [raw] : []);
        items.forEach(extractGenres);
      }
    }

    const genreCount = Object.keys(genreCounts).length;
    if (total === 0 || genreCount === 0) return null;

    // Calculate Shannon entropy
    let entropy = 0;
    for (const count of Object.values(genreCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    // Normalize to 0-100 (max entropy is log2(unique_genres))
    const maxEntropy = Math.log2(genreCount);
    const diversity = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

    return {
      value: Math.round(diversity * 100) / 100,
      rawValue: { genre_count: genreCount }
    };
  }

  /**
   * Calculate repeat listening behavior
   */
  calculateRepeatListening(spotifyData) {
    const trackPlays = {};
    let totalPlays = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';

      // From listening_history or recently_played (single track format)
      if ((dataType === 'listening_history' || dataType === 'recently_played') && raw.track) {
        const trackId = raw.track.id || raw.track.name;
        trackPlays[trackId] = (trackPlays[trackId] || 0) + 1;
        totalPlays++;
      }

      // Handle recently_played with items array
      if (dataType === 'recently_played' && raw.items) {
        raw.items.forEach(item => {
          const track = item.track || item;
          const trackId = track.id || track.name;
          if (trackId) {
            trackPlays[trackId] = (trackPlays[trackId] || 0) + 1;
            totalPlays++;
          }
        });
      }
    }

    if (totalPlays === 0 || Object.keys(trackPlays).length === 0) return null;

    // Calculate repeat rate (tracks played more than once)
    const repeatedTracks = Object.values(trackPlays).filter(count => count > 1).length;
    const repeatRate = (repeatedTracks / Object.keys(trackPlays).length) * 100;

    return Math.round(repeatRate * 100) / 100;
  }

  /**
   * Calculate playlist organization score
   */
  calculatePlaylistOrganization(spotifyData) {
    // Find playlist entries from either table format
    const playlistEntries = spotifyData.filter(e =>
      e.data_type === 'playlists' || e.data_type === 'playlist'
    );

    if (playlistEntries.length === 0) return null;

    // Collect all playlists from all entries
    let allPlaylists = [];
    for (const entry of playlistEntries) {
      const raw = entry.raw_data || {};
      if (raw.items) {
        allPlaylists.push(...raw.items);
      } else if (raw.name) {
        // Individual playlist record
        allPlaylists.push(raw);
      }
    }

    if (allPlaylists.length === 0) return null;

    // Factors: number of playlists, avg tracks per playlist, description presence
    const avgTracksPerPlaylist = allPlaylists.reduce((sum, p) => sum + (p.tracks?.total || 0), 0) / allPlaylists.length;
    const withDescriptions = allPlaylists.filter(p => p.description && p.description.trim().length > 0).length;
    const descriptionRate = withDescriptions / allPlaylists.length;

    // Score = weighted combination
    const organizationScore = (
      (allPlaylists.length > 5 ? 30 : allPlaylists.length * 6) + // More playlists = better organization (max 30)
      (Math.min(avgTracksPerPlaylist, 50) * 0.6) +               // Moderate playlist size (max 30)
      (descriptionRate * 40)                                      // Descriptions show curation (max 40)
    );

    return Math.min(100, Math.round(organizationScore * 100) / 100);
  }

  /**
   * Calculate social sharing behavior
   */
  calculateSocialSharing(spotifyData) {
    // Find playlist entries from either table format
    const playlistEntries = spotifyData.filter(e =>
      e.data_type === 'playlists' || e.data_type === 'playlist'
    );

    if (playlistEntries.length === 0) return null;

    // Collect all playlists
    let allPlaylists = [];
    for (const entry of playlistEntries) {
      const raw = entry.raw_data || {};
      if (raw.items) {
        allPlaylists.push(...raw.items);
      } else if (raw.name) {
        allPlaylists.push(raw);
      }
    }

    if (allPlaylists.length === 0) return null;

    const publicPlaylists = allPlaylists.filter(p => p.public).length;
    const collaborativePlaylists = allPlaylists.filter(p => p.collaborative).length;

    const socialScore = ((publicPlaylists + collaborativePlaylists * 2) / allPlaylists.length) * 100;

    return Math.min(100, Math.round(socialScore * 100) / 100);
  }

  /**
   * Calculate energy preference
   */
  calculateEnergyPreference(spotifyData) {
    let totalEnergy = 0;
    let count = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};

      // From listening history with audio features
      if (raw.track && raw.track.energy !== undefined) {
        totalEnergy += raw.track.energy;
        count++;
      }

      // From audio features entries
      if (entry.data_type === 'audio_features' && raw.energy !== undefined) {
        totalEnergy += raw.energy;
        count++;
      }
    }

    if (count === 0) return null;

    // Average energy (0-1 scale) converted to 0-100
    const avgEnergy = (totalEnergy / count) * 100;
    return Math.round(avgEnergy * 100) / 100;
  }

  /**
   * Calculate emotional valence (positive vs negative)
   */
  calculateEmotionalValence(spotifyData) {
    let totalValence = 0;
    let count = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};

      // From listening history with audio features
      if (raw.track && raw.track.valence !== undefined) {
        totalValence += raw.track.valence;
        count++;
      }

      // From audio features entries
      if (entry.data_type === 'audio_features' && raw.valence !== undefined) {
        totalValence += raw.valence;
        count++;
      }
    }

    if (count === 0) return null;

    // Average valence (0-1 scale) converted to 0-100
    const avgValence = (totalValence / count) * 100;
    return Math.round(avgValence * 100) / 100;
  }

  /**
   * Calculate liveness preference (live vs studio recordings)
   * Research: Higher liveness correlates with extraversion (r=0.18)
   */
  calculateLivenessPreference(spotifyData) {
    let totalLiveness = 0;
    let count = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};

      // From listening history with audio features
      if (raw.track && raw.track.liveness !== undefined) {
        totalLiveness += raw.track.liveness;
        count++;
      }

      // From audio features entries
      if (entry.data_type === 'audio_features' && raw.liveness !== undefined) {
        totalLiveness += raw.liveness;
        count++;
      }
    }

    if (count === 0) return null;

    const avgLiveness = (totalLiveness / count) * 100;
    return {
      value: Math.round(avgLiveness * 100) / 100,
      rawValue: { liveness_percent: Math.round(avgLiveness) }
    };
  }

  /**
   * Calculate mode preference (major vs minor keys)
   * Mode=1 (major) vs Mode=0 (minor)
   * Research: Major key preference correlates negatively with neuroticism (r=-0.15)
   */
  calculateModePreference(spotifyData) {
    let majorCount = 0;
    let minorCount = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};

      // From listening history with audio features
      if (raw.track && raw.track.mode !== undefined) {
        if (raw.track.mode === 1) majorCount++;
        else minorCount++;
      }

      // From audio features entries
      if (entry.data_type === 'audio_features' && raw.mode !== undefined) {
        if (raw.mode === 1) majorCount++;
        else minorCount++;
      }
    }

    const total = majorCount + minorCount;
    if (total === 0) return null;

    const majorKeyPercent = (majorCount / total) * 100;
    return {
      value: Math.round(majorKeyPercent * 100) / 100,
      rawValue: { major_key_percent: Math.round(majorKeyPercent), minor_key_percent: Math.round(100 - majorKeyPercent) }
    };
  }

  /**
   * Calculate skip rate (tracks skipped before completion)
   * Research: Higher skip rate correlates with neuroticism (r=0.25)
   * Note: Spotify API doesn't directly provide skip data, so we infer from listening patterns
   */
  calculateSkipRate(spotifyData) {
    // We can approximate skip rate by looking at:
    // 1. Time spent on tracks vs track duration (if available)
    // 2. Recently played items that reappear quickly (potential skip-restart)

    const recentlyPlayedEntries = spotifyData.filter(e =>
      e.data_type === 'recently_played' || e.data_type === 'listening_history'
    );

    if (recentlyPlayedEntries.length === 0) return null;

    // Collect all play events with timestamps
    const playEvents = [];
    for (const entry of recentlyPlayedEntries) {
      const raw = entry.raw_data || {};

      if (raw.items) {
        raw.items.forEach(item => {
          const track = item.track || item;
          playEvents.push({
            trackId: track.id || track.name,
            duration: track.duration_ms,
            playedAt: item.played_at
          });
        });
      } else if (raw.track) {
        playEvents.push({
          trackId: raw.track.id || raw.track.name,
          duration: raw.track.duration_ms,
          playedAt: raw.played_at || entry.created_at
        });
      }
    }

    if (playEvents.length < 5) return null;

    // Sort by played time
    playEvents.sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));

    // Estimate skips: if time between plays is much less than track duration
    let estimatedSkips = 0;
    for (let i = 1; i < playEvents.length; i++) {
      const timeBetween = new Date(playEvents[i].playedAt) - new Date(playEvents[i-1].playedAt);
      const prevDuration = playEvents[i-1].duration || 180000; // Default 3 min

      // If time between is less than 50% of track duration, likely a skip
      if (timeBetween < prevDuration * 0.5) {
        estimatedSkips++;
      }
    }

    const skipPercent = (estimatedSkips / (playEvents.length - 1)) * 100;
    return {
      value: Math.round(skipPercent * 100) / 100,
      rawValue: { skip_percent: Math.round(skipPercent), total_plays: playEvents.length }
    };
  }

  /**
   * Calculate arousal preference (high-arousal, stimulating music)
   * Research: Correlates with extraversion (r=0.33)
   * Arousal = combination of energy + tempo + loudness
   */
  calculateArousalPreference(spotifyData) {
    let totalArousal = 0;
    let count = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};

      const calculateArousal = (features) => {
        // Arousal model: energy (0-1), tempo (normalized), loudness (normalized from -60 to 0)
        const energy = features.energy !== undefined ? features.energy : null;
        const tempo = features.tempo !== undefined ? Math.min(features.tempo / 200, 1) : null; // Normalize tempo to 0-1
        const loudness = features.loudness !== undefined ? (features.loudness + 60) / 60 : null; // Normalize -60 to 0 => 0 to 1

        const validValues = [energy, tempo, loudness].filter(v => v !== null);
        if (validValues.length === 0) return null;

        return validValues.reduce((a, b) => a + b, 0) / validValues.length;
      };

      // From track with audio features
      if (raw.track) {
        const arousal = calculateArousal(raw.track);
        if (arousal !== null) {
          totalArousal += arousal;
          count++;
        }
      }

      // From audio features entries
      if (entry.data_type === 'audio_features') {
        const arousal = calculateArousal(raw);
        if (arousal !== null) {
          totalArousal += arousal;
          count++;
        }
      }
    }

    if (count === 0) return null;

    const avgArousal = (totalArousal / count) * 100;
    return Math.round(avgArousal * 100) / 100;
  }

  /**
   * Calculate playlist curation style (quality and organization)
   * Research: Correlates with conscientiousness (r=0.38)
   */
  calculatePlaylistCurationStyle(spotifyData) {
    const playlistEntries = spotifyData.filter(e =>
      e.data_type === 'playlists' || e.data_type === 'playlist'
    );

    if (playlistEntries.length === 0) return null;

    let allPlaylists = [];
    for (const entry of playlistEntries) {
      const raw = entry.raw_data || {};
      if (raw.items) {
        allPlaylists.push(...raw.items);
      } else if (raw.name) {
        allPlaylists.push(raw);
      }
    }

    if (allPlaylists.length === 0) return null;

    // Curation factors:
    // 1. Has descriptions
    // 2. Reasonable playlist sizes (not empty, not overwhelming)
    // 3. Named thoughtfully (not default names)

    const withDescriptions = allPlaylists.filter(p => p.description && p.description.trim().length > 10).length;
    const wellSized = allPlaylists.filter(p => {
      const trackCount = p.tracks?.total || 0;
      return trackCount >= 5 && trackCount <= 100;
    }).length;
    const thoughtfulNames = allPlaylists.filter(p => {
      const name = (p.name || '').toLowerCase();
      return !name.includes('playlist #') && !name.includes('my playlist') && name.length > 3;
    }).length;

    const total = allPlaylists.length;
    const curationScore = (
      (withDescriptions / total) * 35 +
      (wellSized / total) * 35 +
      (thoughtfulNames / total) * 30
    );

    return {
      value: Math.round(curationScore * 100) / 100,
      rawValue: {
        playlist_count: total,
        with_descriptions: withDescriptions,
        well_sized: wellSized
      }
    };
  }

  /**
   * Calculate musical sophistication (engagement with complex/niche music)
   * Research: Correlates with openness (r=0.35)
   */
  calculateMusicalSophistication(spotifyData) {
    // Sophistication factors:
    // 1. Genre diversity (already calculated, but different weighting)
    // 2. Instrumentalness preference
    // 3. Complexity indicators (time signature variety, key variety)
    // 4. Niche artist engagement (popularity < 50)

    let instrumentalnessSum = 0;
    let instrumentalnessCount = 0;
    let nicheArtistCount = 0;
    let totalArtists = 0;
    const timeSignatures = new Set();
    const keys = new Set();

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';

      // Instrumentalness from audio features
      if (raw.instrumentalness !== undefined) {
        instrumentalnessSum += raw.instrumentalness;
        instrumentalnessCount++;
      }
      if (raw.track && raw.track.instrumentalness !== undefined) {
        instrumentalnessSum += raw.track.instrumentalness;
        instrumentalnessCount++;
      }

      // Time signature and key variety
      if (raw.time_signature !== undefined) timeSignatures.add(raw.time_signature);
      if (raw.key !== undefined) keys.add(raw.key);
      if (raw.track) {
        if (raw.track.time_signature !== undefined) timeSignatures.add(raw.track.time_signature);
        if (raw.track.key !== undefined) keys.add(raw.track.key);
      }

      // Artist popularity (niche = < 50 popularity)
      const isTopArtists = ['top_artists', 'top_artist', 'top_artists_short_term', 'top_artists_medium_term', 'top_artists_long_term'].includes(dataType);
      if (isTopArtists) {
        const items = raw.items || (raw.popularity !== undefined ? [raw] : []);
        items.forEach(artist => {
          totalArtists++;
          if (artist.popularity !== undefined && artist.popularity < 50) {
            nicheArtistCount++;
          }
        });
      }
    }

    // Calculate sophistication score
    let sophisticationScore = 0;
    let factorsUsed = 0;

    // Instrumentalness (0-1, higher = more sophisticated)
    if (instrumentalnessCount > 0) {
      const avgInstrumentalness = instrumentalnessSum / instrumentalnessCount;
      sophisticationScore += avgInstrumentalness * 25;
      factorsUsed++;
    }

    // Time signature variety (max 3 unique = 25 points)
    if (timeSignatures.size > 0) {
      sophisticationScore += Math.min(timeSignatures.size / 3, 1) * 25;
      factorsUsed++;
    }

    // Key variety (max 8 unique keys = 25 points)
    if (keys.size > 0) {
      sophisticationScore += Math.min(keys.size / 8, 1) * 25;
      factorsUsed++;
    }

    // Niche artist preference
    if (totalArtists > 0) {
      sophisticationScore += (nicheArtistCount / totalArtists) * 25;
      factorsUsed++;
    }

    if (factorsUsed === 0) return null;

    // Normalize to 0-100
    const normalizedScore = (sophisticationScore / factorsUsed) * (100 / 25);

    return {
      value: Math.round(normalizedScore * 100) / 100,
      rawValue: {
        niche_artist_percent: totalArtists > 0 ? Math.round((nicheArtistCount / totalArtists) * 100) : 0,
        unique_time_signatures: timeSignatures.size,
        unique_keys: keys.size
      }
    };
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'spotify',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100, // Normalize to 0-1
      confidence_score: 75, // Default confidence for Spotify features
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: {
        raw_value: metadata.raw_value || {}
      },
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || {}
      }
    };
  }

  /**
   * Save features to database
   */
  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    console.log(`💾 [Spotify Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`✅ [Spotify Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      console.error('❌ [Spotify Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const spotifyFeatureExtractor = new SpotifyFeatureExtractor();
export default spotifyFeatureExtractor;
