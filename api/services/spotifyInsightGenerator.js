/**
 * Spotify Insight Generator Service
 *
 * Reads computed Spotify data from soul_data table and generates
 * user-friendly insights for both Soul Signature and Dashboard.
 *
 * The data is already computed by spotifyEnhancedExtractor.js - this service
 * just formats it for display.
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class SpotifyInsightGenerator {
  constructor() {
    // Big Five trait mappings from Spotify patterns
    this.traitDescriptions = {
      openness: {
        high: 'Curious and adventurous - you explore diverse genres and new artists',
        moderate: 'Balanced between familiar favorites and new discoveries',
        low: 'Comfort-focused - you know what you like and stick to it'
      },
      conscientiousness: {
        high: 'Organized listener - you curate playlists meticulously',
        moderate: 'Flexible approach to music organization',
        low: 'Spontaneous listener - you go with the flow'
      },
      extraversion: {
        high: 'High-energy preferences - upbeat tracks fuel your day',
        moderate: 'Balanced energy in your music choices',
        low: 'Introspective listener - calm and contemplative tracks'
      },
      agreeableness: {
        high: 'Collaborative curator - you share and create together',
        moderate: 'Mix of personal and shared playlists',
        low: 'Private listener - your music is personal'
      },
      neuroticism: {
        high: 'Emotionally expressive - music helps process feelings',
        moderate: 'Balanced emotional range in music',
        low: 'Emotionally stable - consistent mood in choices'
      }
    };

    // Musical archetype definitions
    this.archetypes = {
      'eclectic-explorer': {
        name: 'Eclectic Explorer',
        description: 'You traverse the entire musical landscape, never settling in one genre',
        traits: ['Open-minded', 'Curious', 'Adventurous']
      },
      'underground-connoisseur': {
        name: 'Underground Connoisseur',
        description: 'You discover artists before they hit mainstream',
        traits: ['Trendsetter', 'Authentic', 'Discerning']
      },
      'mainstream-enthusiast': {
        name: 'Mainstream Enthusiast',
        description: 'You stay connected with popular culture through music',
        traits: ['Social', 'Connected', 'Current']
      },
      'comfort-curator': {
        name: 'Comfort Curator',
        description: 'You build deep relationships with familiar artists',
        traits: ['Loyal', 'Consistent', 'Nostalgic']
      },
      'mood-matcher': {
        name: 'Mood Matcher',
        description: 'You select music precisely based on your emotional state',
        traits: ['Self-aware', 'Intentional', 'Adaptive']
      }
    };
  }

  /**
   * Get personality insights for Soul Signature Dashboard
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Formatted personality insights
   */
  async getPersonalityInsights(userId) {
    console.log(`[SpotifyInsightGenerator] Getting personality insights for user ${userId}`);

    try {
      // Fetch the most recent Spotify extraction from soul_data
      const { data, error } = await supabase
        .from('soul_data')
        .select('extracted_patterns, extracted_at, data_quality')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .order('extracted_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.log('[SpotifyInsightGenerator] No Spotify data found for user');
        return this.getDefaultInsights();
      }

      const patterns = data.extracted_patterns;
      if (!patterns) {
        return this.getDefaultInsights();
      }

      // Format Big Five traits from Spotify data
      const bigFive = this.calculateBigFive(patterns);

      // Determine musical archetype
      const archetype = this.determineArchetype(patterns);

      // Extract top genres and listening patterns
      const topGenres = this.extractTopGenres(patterns);
      const listeningPatterns = this.extractListeningPatterns(patterns);

      return {
        success: true,
        dataTimestamp: data.extracted_at,
        dataQuality: data.data_quality || 'medium',
        bigFive,
        archetype,
        topGenres,
        listeningPatterns,
        discoveryBehavior: patterns.discoveryBehavior || null,
        emotionalProfile: patterns.emotionalProfile || null
      };

    } catch (error) {
      console.error('[SpotifyInsightGenerator] Error getting personality insights:', error);
      return this.getDefaultInsights();
    }
  }

  /**
   * Get current mood insights for Dashboard
   * Based on recent listening patterns
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Current mood insight
   */
  async getCurrentMoodInsights(userId) {
    console.log(`[SpotifyInsightGenerator] Getting current mood for user ${userId}`);

    try {
      // Get the most recent extraction
      const { data, error } = await supabase
        .from('soul_data')
        .select('extracted_patterns, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .order('extracted_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data || !data.extracted_patterns) {
        return null;
      }

      const patterns = data.extracted_patterns;
      const emotionalProfile = patterns.emotionalProfile || {};
      const audioPersonality = patterns.audioPersonality || {};

      // Determine current mood label and description
      const mood = this.determineMood(emotionalProfile, audioPersonality);

      return {
        success: true,
        mood,
        audioFeatures: {
          energy: audioPersonality.averageFeatures?.energy || 0.5,
          valence: audioPersonality.averageFeatures?.valence || 0.5,
          danceability: audioPersonality.averageFeatures?.danceability || 0.5,
          tempo: audioPersonality.averageFeatures?.tempo || 120
        },
        timestamp: data.extracted_at
      };

    } catch (error) {
      console.error('[SpotifyInsightGenerator] Error getting mood insights:', error);
      return null;
    }
  }

  /**
   * Calculate Big Five personality traits from Spotify data
   */
  calculateBigFive(patterns) {
    const overallMetrics = patterns.overallMetrics || {};
    const discoveryBehavior = patterns.discoveryBehavior || {};
    const audioPersonality = patterns.audioPersonality || {};
    const playlistBehavior = patterns.playlistBehavior || {};
    const artistLoyalty = patterns.artistLoyalty || {};

    // Openness: exploration + diversity + sophistication
    const opennessScore = Math.round(
      ((overallMetrics.openness?.score || 0.5) * 100)
    );
    const opennessLevel = opennessScore > 70 ? 'high' : opennessScore > 40 ? 'moderate' : 'low';

    // Conscientiousness: organization + consistency + loyalty
    const conscientiousnessScore = Math.round(
      ((overallMetrics.conscientiousness?.score || 0.5) * 100)
    );
    const conscientiousnessLevel = conscientiousnessScore > 70 ? 'high' : conscientiousnessScore > 40 ? 'moderate' : 'low';

    // Extraversion: energy levels + social playlist sharing
    const energyLevel = audioPersonality.averageFeatures?.energy || 0.5;
    const socialOpenness = playlistBehavior.socialOpenness || 'moderate';
    const extraversionScore = Math.round(
      (energyLevel * 0.6 + (socialOpenness === 'high' ? 0.4 : socialOpenness === 'moderate' ? 0.2 : 0)) * 100
    );
    const extraversionLevel = extraversionScore > 70 ? 'high' : extraversionScore > 40 ? 'moderate' : 'low';

    // Agreeableness: collaborative playlists + public sharing
    const collaborativeRatio = playlistBehavior.collaborativeRatio || 0;
    const publicRatio = playlistBehavior.publicVsPrivate || 0;
    const agreeablenessScore = Math.round(
      ((collaborativeRatio * 0.5 + publicRatio * 0.5) * 100)
    );
    const agreeablenessLevel = agreeablenessScore > 50 ? 'high' : agreeablenessScore > 25 ? 'moderate' : 'low';

    // Neuroticism: emotional variance + valence patterns
    const emotionalVariance = audioPersonality.variance?.overall || 0.05;
    const avgValence = audioPersonality.averageFeatures?.valence || 0.5;
    // Lower valence + higher variance = higher neuroticism
    const neuroticismScore = Math.round(
      ((0.5 - avgValence) * 0.5 + emotionalVariance * 5) * 100
    );
    const neuroticismLevel = neuroticismScore > 60 ? 'high' : neuroticismScore > 30 ? 'moderate' : 'low';

    return {
      openness: {
        score: Math.min(100, Math.max(0, opennessScore)),
        level: opennessLevel,
        description: this.traitDescriptions.openness[opennessLevel]
      },
      conscientiousness: {
        score: Math.min(100, Math.max(0, conscientiousnessScore)),
        level: conscientiousnessLevel,
        description: this.traitDescriptions.conscientiousness[conscientiousnessLevel]
      },
      extraversion: {
        score: Math.min(100, Math.max(0, extraversionScore)),
        level: extraversionLevel,
        description: this.traitDescriptions.extraversion[extraversionLevel]
      },
      agreeableness: {
        score: Math.min(100, Math.max(0, agreeablenessScore)),
        level: agreeablenessLevel,
        description: this.traitDescriptions.agreeableness[agreeablenessLevel]
      },
      neuroticism: {
        score: Math.min(100, Math.max(0, neuroticismScore)),
        level: neuroticismLevel,
        description: this.traitDescriptions.neuroticism[neuroticismLevel]
      }
    };
  }

  /**
   * Determine musical archetype from patterns
   */
  determineArchetype(patterns) {
    const discoveryBehavior = patterns.discoveryBehavior || {};
    const musicalSophistication = patterns.musicalSophistication || {};
    const artistLoyalty = patterns.artistLoyalty || {};

    const undergroundScore = discoveryBehavior.undergroundScore || 0.5;
    const genreDiversity = discoveryBehavior.genreDiversity || 0.5;
    const loyaltyScore = artistLoyalty.loyaltyScore || 0.5;
    const newArtistRate = discoveryBehavior.newArtistRate || 0.5;

    // Determine primary archetype based on scores
    let archetypeKey = 'mood-matcher'; // default

    if (genreDiversity > 0.7 && newArtistRate > 0.5) {
      archetypeKey = 'eclectic-explorer';
    } else if (undergroundScore > 0.6 && musicalSophistication.sophisticationScore > 0.5) {
      archetypeKey = 'underground-connoisseur';
    } else if (undergroundScore < 0.4 && genreDiversity < 0.5) {
      archetypeKey = 'mainstream-enthusiast';
    } else if (loyaltyScore > 0.6 && newArtistRate < 0.3) {
      archetypeKey = 'comfort-curator';
    }

    const archetype = this.archetypes[archetypeKey];

    return {
      key: archetypeKey,
      ...archetype,
      confidence: Math.round(
        ((genreDiversity + (1 - loyaltyScore) + newArtistRate) / 3) * 100
      )
    };
  }

  /**
   * Extract top genres from patterns
   */
  extractTopGenres(patterns) {
    const genreEvolution = patterns.genreEvolution || {};
    const currentGenres = genreEvolution.currentGenres || [];
    const historicalGenres = genreEvolution.historicalGenres || [];

    return {
      current: currentGenres.slice(0, 5),
      allTime: historicalGenres.slice(0, 5),
      stability: genreEvolution.genreStability || { score: 0.5, label: 'moderate' }
    };
  }

  /**
   * Extract listening patterns
   */
  extractListeningPatterns(patterns) {
    const temporalPatterns = patterns.temporalPatterns || {};

    return {
      peakHours: temporalPatterns.peakListeningHours || [],
      personality: temporalPatterns.listeningPersonality || ['balanced'],
      weekdayVsWeekend: temporalPatterns.weekdayVsWeekend || { weekday: 70, weekend: 30 },
      consistency: temporalPatterns.consistency || { score: 0.5, label: 'moderate' }
    };
  }

  /**
   * Determine current mood from emotional profile
   */
  determineMood(emotionalProfile, audioPersonality) {
    const currentMood = emotionalProfile.currentMood || 'neutral';
    const avgValence = audioPersonality.averageFeatures?.valence || 0.5;
    const avgEnergy = audioPersonality.averageFeatures?.energy || 0.5;

    // Map mood states to labels and descriptions
    const moodMap = {
      'energetic-positive': {
        label: 'Energized',
        emoji: '⚡',
        description: 'upbeat and positive',
        color: '#22c55e'
      },
      'happy-energized': {
        label: 'Energized',
        emoji: '⚡',
        description: 'upbeat and positive',
        color: '#22c55e'
      },
      'peaceful-content': {
        label: 'Peaceful',
        emoji: '😌',
        description: 'calm and content',
        color: '#3b82f6'
      },
      'calm-content': {
        label: 'Peaceful',
        emoji: '😌',
        description: 'calm and content',
        color: '#3b82f6'
      },
      'intense-agitated': {
        label: 'Intense',
        emoji: '🔥',
        description: 'energetic but processing emotions',
        color: '#f59e0b'
      },
      'stressed-anxious': {
        label: 'Processing',
        emoji: '💭',
        description: 'working through something',
        color: '#f59e0b'
      },
      'melancholic-reflective': {
        label: 'Reflective',
        emoji: '🌙',
        description: 'introspective and contemplative',
        color: '#8b5cf6'
      },
      'sad-tired': {
        label: 'Restful',
        emoji: '🌙',
        description: 'winding down',
        color: '#8b5cf6'
      },
      'neutral': {
        label: 'Balanced',
        emoji: '⚖️',
        description: 'steady and focused',
        color: '#6b7280'
      },
      'neutral-balanced': {
        label: 'Balanced',
        emoji: '⚖️',
        description: 'steady and focused',
        color: '#6b7280'
      }
    };

    const mood = moodMap[currentMood] || moodMap['neutral'];

    return {
      ...mood,
      valence: Math.round(avgValence * 100),
      energy: Math.round(avgEnergy * 100),
      raw: currentMood
    };
  }

  /**
   * Get default insights when no data is available
   */
  getDefaultInsights() {
    return {
      success: false,
      message: 'Connect Spotify to discover your musical personality',
      bigFive: null,
      archetype: null,
      topGenres: null,
      listeningPatterns: null
    };
  }
}

export default new SpotifyInsightGenerator();
