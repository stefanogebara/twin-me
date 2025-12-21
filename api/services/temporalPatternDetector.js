/**
 * SQL-Based Temporal Pattern Detector
 *
 * Detects temporal patterns between calendar events and music listening behavior
 * using Supabase (PostgreSQL) without requiring Neo4j.
 *
 * Pattern Types Detected:
 * 1. Pre-event music patterns: "User listens to X genre before Y event type"
 * 2. Event importance prediction: "Calm music precedes important events"
 * 3. Energy level correlation: "High-energy music before exercise events"
 */

import { supabaseAdmin } from './database.js';

class TemporalPatternDetector {
  constructor() {
    this.minOccurrences = 3; // Minimum pattern occurrences to be considered
    this.timeWindowMinutes = 240; // Look for music 4 hours before events
    this.precedesWindowMin = 10; // Minimum minutes before event
    this.precedesWindowMax = 30; // Maximum minutes before event (prime prediction window)
  }

  /**
   * Detect temporal patterns between music and calendar events
   * Returns patterns like "user listens to jazz 15-20 minutes before presentations"
   */
  async detectPatterns(userId, options = {}) {
    const {
      minOccurrences = this.minOccurrences,
      minConfidence = 0.7,
      lookbackDays = 90
    } = options;

    console.log(`🔍 [Pattern Detector] Analyzing patterns for user ${userId}...`);

    try {
      // Get calendar events from the last lookbackDays
      const { data: events, error: eventsError } = await supabaseAdmin
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .gte('start_time', new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: false });

      if (eventsError) {
        console.error('[Pattern Detector] Error fetching events:', eventsError);
        return [];
      }

      console.log(`📅 [Pattern Detector] Found ${events?.length || 0} calendar events`);

      // Get music listening history
      const { data: musicHistory, error: musicError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .in('data_type', ['listening_history', 'top_tracks'])
        .gte('created_at', new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);

      if (musicError) {
        console.error('[Pattern Detector] Error fetching music:', musicError);
        return [];
      }

      console.log(`🎵 [Pattern Detector] Found ${musicHistory?.length || 0} music activities`);

      if (!events || !musicHistory || events.length === 0 || musicHistory.length === 0) {
        console.log('⚠️ [Pattern Detector] Insufficient data for pattern detection');
        return [];
      }

      // Build temporal relationships
      const temporalRelationships = this.buildTemporalRelationships(events, musicHistory);

      console.log(`🔗 [Pattern Detector] Found ${temporalRelationships.length} temporal relationships`);

      // Detect recurring patterns
      const patterns = this.aggregatePatterns(temporalRelationships, minOccurrences, minConfidence);

      console.log(`✅ [Pattern Detector] Detected ${patterns.length} behavioral patterns`);

      return patterns;
    } catch (error) {
      console.error('❌ [Pattern Detector] Error:', error);
      return [];
    }
  }

  /**
   * Build temporal relationships: music activity → calendar event
   */
  buildTemporalRelationships(events, musicHistory) {
    const relationships = [];

    for (const music of musicHistory) {
      const musicTimestamp = new Date(music.created_at || music.raw_data?.played_at);
      if (!musicTimestamp || isNaN(musicTimestamp.getTime())) continue;

      // Find events that occur after this music activity
      for (const event of events) {
        const eventStartTime = new Date(event.start_time);
        if (isNaN(eventStartTime.getTime())) continue;

        const minutesBefore = (eventStartTime - musicTimestamp) / (1000 * 60);

        // Check if music precedes event within our window
        if (minutesBefore >= this.precedesWindowMin && minutesBefore <= this.precedesWindowMax) {
          // Extract genre from music data
          const rawData = music.raw_data || {};
          const track = rawData.track || {};
          const artist = track.artists?.[0] || {};
          const genre = this.extractGenre(track, artist, rawData);

          relationships.push({
            musicGenre: genre,
            musicEnergy: rawData.audioFeatures?.energy || track.energy || 0.5,
            musicValence: rawData.audioFeatures?.valence || track.valence || 0.5,
            eventType: event.event_type || 'general',
            eventImportance: event.is_important ? 85 : 50,
            eventTitle: event.title,
            minutesBefore: Math.round(minutesBefore),
            musicTimestamp: musicTimestamp.toISOString(),
            eventTimestamp: eventStartTime.toISOString()
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Extract genre from Spotify track data
   */
  extractGenre(track, artist, rawData) {
    // Try various sources for genre
    if (track.genre) return track.genre;
    if (artist.genres && artist.genres.length > 0) return artist.genres[0];
    if (rawData.genre) return rawData.genre;

    // Fallback: infer from audio features
    const energy = track.energy || rawData.audioFeatures?.energy || 0.5;
    if (energy < 0.3) return 'calm';
    if (energy < 0.6) return 'moderate';
    return 'energetic';
  }

  /**
   * Aggregate relationships into recurring patterns
   */
  aggregatePatterns(relationships, minOccurrences, minConfidence) {
    // Group by genre + event type combination
    const grouped = {};

    for (const rel of relationships) {
      const key = `${rel.musicGenre}__${rel.eventType}`;

      if (!grouped[key]) {
        grouped[key] = {
          genre: rel.musicGenre,
          eventType: rel.eventType,
          occurrences: [],
          avgMinutesBefore: 0,
          avgEnergy: 0,
          avgValence: 0,
          exampleEvents: []
        };
      }

      grouped[key].occurrences.push(rel);
      if (grouped[key].exampleEvents.length < 3) {
        grouped[key].exampleEvents.push(rel.eventTitle);
      }
    }

    // Calculate statistics and filter by min occurrences
    const patterns = [];

    for (const [key, group] of Object.entries(grouped)) {
      const count = group.occurrences.length;

      if (count < minOccurrences) continue;

      // Calculate averages
      const avgMinutes = group.occurrences.reduce((sum, r) => sum + r.minutesBefore, 0) / count;
      const avgEnergy = group.occurrences.reduce((sum, r) => sum + r.musicEnergy, 0) / count;
      const avgValence = group.occurrences.reduce((sum, r) => sum + r.musicValence, 0) / count;

      // Calculate confidence (based on frequency and consistency)
      const frequency = Math.min(count / 10, 1); // Normalize to 0-1
      const stdDev = this.calculateStdDev(group.occurrences.map(r => r.minutesBefore));
      const consistency = Math.max(0, 1 - stdDev / 10); // Lower std dev = higher consistency
      const confidence = frequency * 0.5 + consistency * 0.5;

      if (confidence < minConfidence) continue;

      patterns.push({
        pattern_type: 'temporal_music_before_event',
        trigger: {
          type: 'calendar_event',
          event_type: group.eventType
        },
        response: {
          type: 'music_activity',
          genre: group.genre,
          avg_energy: Math.round(avgEnergy * 100) / 100,
          avg_valence: Math.round(avgValence * 100) / 100
        },
        time_offset_minutes: Math.round(avgMinutes),
        occurrence_count: count,
        confidence_score: Math.round(confidence * 100),
        consistency_rate: Math.round(consistency * 100),
        example_events: group.exampleEvents,
        description: `User listens to ${group.genre} music ${Math.round(avgMinutes)} minutes before ${group.eventType} events`,
        source: 'sql_temporal_detector'
      });
    }

    // Sort by confidence and occurrence count
    return patterns.sort((a, b) => {
      if (b.confidence_score !== a.confidence_score) {
        return b.confidence_score - a.confidence_score;
      }
      return b.occurrence_count - a.occurrence_count;
    });
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(values) {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Get recommended music for upcoming event based on detected patterns
   */
  async getRecommendedMusicForEvent(userId, eventType, minutesUntilEvent) {
    console.log(`🎯 [Pattern Detector] Finding music recommendations for ${eventType} event in ${minutesUntilEvent} minutes`);

    const patterns = await this.detectPatterns(userId);

    // Find patterns matching this event type
    const relevantPatterns = patterns.filter(p =>
      p.trigger.event_type === eventType &&
      Math.abs(p.time_offset_minutes - minutesUntilEvent) <= 10 // Within 10 minutes of the pattern time
    );

    if (relevantPatterns.length === 0) {
      console.log('⚠️ [Pattern Detector] No matching patterns found');
      return null;
    }

    // Get the highest confidence pattern
    const bestPattern = relevantPatterns[0];

    console.log(`✅ [Pattern Detector] Recommending "${bestPattern.response.genre}" music (confidence: ${bestPattern.confidence_score}%)`);

    return {
      recommendedGenre: bestPattern.response.genre,
      targetEnergy: bestPattern.response.avg_energy,
      targetValence: bestPattern.response.avg_valence,
      confidence: bestPattern.confidence_score,
      pattern: bestPattern
    };
  }

  /**
   * Save detected patterns to database for future use
   */
  async savePatterns(userId, patterns) {
    console.log(`💾 [Pattern Detector] Saving ${patterns.length} patterns for user ${userId}...`);

    try {
      for (const pattern of patterns) {
        await supabaseAdmin
          .from('behavioral_patterns')
          .upsert({
            user_id: userId,
            pattern_type: pattern.pattern_type,
            trigger_event: pattern.trigger.event_type,
            response_action: pattern.response.type,
            time_offset_minutes: pattern.time_offset_minutes,
            occurrence_count: pattern.occurrence_count,
            confidence_score: pattern.confidence_score,
            consistency_rate: pattern.consistency_rate,
            description: pattern.description,
            is_active: true,
            source: pattern.source,
            metadata: {
              genre: pattern.response.genre,
              avg_energy: pattern.response.avg_energy,
              avg_valence: pattern.response.avg_valence,
              example_events: pattern.example_events
            }
          }, {
            onConflict: 'user_id,pattern_type,trigger_event,response_action'
          });
      }

      console.log('✅ [Pattern Detector] Patterns saved successfully');
      return { success: true, savedCount: patterns.length };
    } catch (error) {
      console.error('❌ [Pattern Detector] Error saving patterns:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const temporalPatternDetector = new TemporalPatternDetector();
export default temporalPatternDetector;
