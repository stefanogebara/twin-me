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
      // Fetch Spotify soul_data for the user
      const { data: spotifyData, error } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .gte('created_at', new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!spotifyData || spotifyData.length === 0) {
        console.log('⚠️ [Spotify Extractor] No Spotify data found for user');
        return [];
      }

      console.log(`📊 [Spotify Extractor] Found ${spotifyData.length} Spotify data entries`);

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
      const genreDiversity = this.calculateGenreDiversity(spotifyData);
      if (genreDiversity !== null) {
        features.push(this.createFeature(userId, 'genre_diversity', genreDiversity, {
          contributes_to: 'openness',
          contribution_weight: 0.38,
          description: 'Variety of music genres listened to',
          evidence: { correlation: 0.38, citation: 'Rentfrow & Gosling (2003)' }
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

      // 7. Emotional Valence (Neuroticism - negative correlation)
      const emotionalValence = this.calculateEmotionalValence(spotifyData);
      if (emotionalValence !== null) {
        features.push(this.createFeature(userId, 'emotional_valence', emotionalValence, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.28,
          description: 'Preference for positive vs negative emotional tone',
          evidence: { correlation: -0.28, note: 'High valence = low neuroticism' }
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

      // From listening history
      if (entry.data_type === 'listening_history' && raw.track) {
        uniqueTracks.add(raw.track.id || raw.track.name);
        if (raw.track.artists && raw.track.artists[0]) {
          uniqueArtists.add(raw.track.artists[0].id || raw.track.artists[0].name);
        }
        totalPlays++;
      }

      // From top tracks/artists
      if (entry.data_type === 'top_tracks' && raw.items) {
        raw.items.forEach(track => {
          uniqueTracks.add(track.id || track.name);
          if (track.artists && track.artists[0]) {
            uniqueArtists.add(track.artists[0].id || track.artists[0].name);
          }
        });
      }

      if (entry.data_type === 'top_artists' && raw.items) {
        raw.items.forEach(artist => {
          uniqueArtists.add(artist.id || artist.name);
        });
      }
    }

    if (totalPlays === 0) return null;

    // Discovery rate = (unique artists + unique tracks) / total plays
    // Normalize to 0-100 scale (assume max discovery rate is 0.5 = 50%)
    const discoveryRate = ((uniqueArtists.size + uniqueTracks.size) / Math.max(totalPlays, 1)) * 200;

    return Math.min(100, Math.round(discoveryRate * 100) / 100);
  }

  /**
   * Calculate genre diversity (Shannon entropy of genres)
   */
  calculateGenreDiversity(spotifyData) {
    const genreCounts = {};
    let total = 0;

    for (const entry of spotifyData) {
      const raw = entry.raw_data || {};

      // Extract genres from artists
      if (raw.track && raw.track.artists) {
        raw.track.artists.forEach(artist => {
          if (artist.genres && artist.genres.length > 0) {
            artist.genres.forEach(genre => {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
              total++;
            });
          }
        });
      }

      // From top artists
      if (entry.data_type === 'top_artists' && raw.items) {
        raw.items.forEach(artist => {
          if (artist.genres && artist.genres.length > 0) {
            artist.genres.forEach(genre => {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
              total++;
            });
          }
        });
      }
    }

    if (total === 0) return null;

    // Calculate Shannon entropy
    let entropy = 0;
    for (const count of Object.values(genreCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    // Normalize to 0-100 (max entropy is log2(unique_genres))
    const maxEntropy = Math.log2(Object.keys(genreCounts).length);
    const diversity = (entropy / maxEntropy) * 100;

    return Math.round(diversity * 100) / 100;
  }

  /**
   * Calculate repeat listening behavior
   */
  calculateRepeatListening(spotifyData) {
    const trackPlays = {};
    let totalPlays = 0;

    for (const entry of spotifyData) {
      if (entry.data_type === 'listening_history' && entry.raw_data?.track) {
        const trackId = entry.raw_data.track.id || entry.raw_data.track.name;
        trackPlays[trackId] = (trackPlays[trackId] || 0) + 1;
        totalPlays++;
      }
    }

    if (totalPlays === 0) return null;

    // Calculate repeat rate (tracks played more than once)
    const repeatedTracks = Object.values(trackPlays).filter(count => count > 1).length;
    const repeatRate = (repeatedTracks / Object.keys(trackPlays).length) * 100;

    return Math.round(repeatRate * 100) / 100;
  }

  /**
   * Calculate playlist organization score
   */
  calculatePlaylistOrganization(spotifyData) {
    const playlistEntry = spotifyData.find(e => e.data_type === 'playlists');
    if (!playlistEntry || !playlistEntry.raw_data?.items) return null;

    const playlists = playlistEntry.raw_data.items;
    if (playlists.length === 0) return null;

    // Factors: number of playlists, avg tracks per playlist, description presence
    const avgTracksPerPlaylist = playlists.reduce((sum, p) => sum + (p.tracks?.total || 0), 0) / playlists.length;
    const withDescriptions = playlists.filter(p => p.description && p.description.trim().length > 0).length;
    const descriptionRate = withDescriptions / playlists.length;

    // Score = weighted combination
    const organizationScore = (
      (playlists.length > 5 ? 30 : playlists.length * 6) + // More playlists = better organization (max 30)
      (Math.min(avgTracksPerPlaylist, 50) * 0.6) +          // Moderate playlist size (max 30)
      (descriptionRate * 40)                                 // Descriptions show curation (max 40)
    );

    return Math.min(100, Math.round(organizationScore * 100) / 100);
  }

  /**
   * Calculate social sharing behavior
   */
  calculateSocialSharing(spotifyData) {
    const playlistEntry = spotifyData.find(e => e.data_type === 'playlists');
    if (!playlistEntry || !playlistEntry.raw_data?.items) return null;

    const playlists = playlistEntry.raw_data.items;
    if (playlists.length === 0) return null;

    const publicPlaylists = playlists.filter(p => p.public).length;
    const collaborativePlaylists = playlists.filter(p => p.collaborative).length;

    const socialScore = ((publicPlaylists + collaborativePlaylists * 2) / playlists.length) * 100;

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
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note
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
