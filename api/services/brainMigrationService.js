/**
 * Brain Migration Service
 *
 * Migrates existing data from various sources into the Twins Brain knowledge graph.
 * Sources: Platform data (Spotify, Calendar), Claude conversations, behavioral patterns
 */

import { supabaseAdmin } from './database.js';
import {
  twinsBrainService,
  NODE_TYPES,
  CATEGORIES,
  RELATIONSHIP_TYPES,
  SOURCE_TYPES
} from './twinsBrainService.js';

class BrainMigrationService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.stats = {
      nodesCreated: 0,
      nodesUpdated: 0,
      edgesCreated: 0,
      errors: []
    };
  }

  /**
   * Run full migration for a user
   */
  async migrateAllData(userId, options = {}) {
    const { dryRun = false, limit = 500 } = options;

    console.log(`[BrainMigration] Starting migration for user ${userId}`);
    console.log(`[BrainMigration] Options: dryRun=${dryRun}, limit=${limit}`);

    this.stats = { nodesCreated: 0, nodesUpdated: 0, edgesCreated: 0, errors: [] };

    try {
      // 1. Migrate Personality Scores (Big Five) - NEW
      await this.migratePersonalityScores(userId, { dryRun });

      // 2. Migrate Soul Signature traits with evidence - NEW
      await this.migrateSoulSignatureTraits(userId, { dryRun });

      // 3. Migrate MoltBot semantic memories - NEW
      await this.migrateMoltbotMemories(userId, { dryRun, limit });

      // 4. Migrate Spotify data
      await this.migrateSpotifyData(userId, { dryRun, limit });

      // 5. Migrate Calendar data
      await this.migrateCalendarData(userId, { dryRun, limit });

      // 6. Migrate Claude conversations
      await this.migrateClaudeConversations(userId, { dryRun, limit });

      // 7. Create cross-platform connections (enhanced)
      await this.createCrossPlatformEdges(userId, { dryRun });

      // 8. Create personality-to-behavior connections - NEW
      await this.createPersonalityBehaviorEdges(userId, { dryRun });

      // 9. Build provenance chains (connects abstraction levels) - NEW Phase 2
      await this.buildProvenanceChains(userId, { dryRun });

      // 10. Migrate Web Browsing data (from browser extension)
      await this.migrateWebBrowsingData(userId, { dryRun, limit });

      // 11. Create a snapshot after migration
      if (!dryRun) {
        await twinsBrainService.createSnapshot(userId, 'milestone', 'Full data migration with personality integration');
      }

      console.log(`[BrainMigration] Migration complete:`, this.stats);
      return this.stats;

    } catch (error) {
      console.error('[BrainMigration] Migration failed:', error);
      this.stats.errors.push(error.message);
      throw error;
    }
  }

  /**
   * Migrate Spotify listening data to brain nodes
   */
  async migrateSpotifyData(userId, options = {}) {
    const { dryRun = false, limit = 500 } = options;

    console.log('[BrainMigration] Processing Spotify data...');

    // Get Spotify data
    const { data: spotifyData, error } = await this.supabase
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .order('extracted_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[BrainMigration] Error fetching Spotify data:', error);
      return;
    }

    console.log(`[BrainMigration] Found ${spotifyData?.length || 0} Spotify records`);

    // Aggregate music preferences
    const genreCounts = {};
    const artistCounts = {};
    const trackFeatures = [];

    for (const record of spotifyData || []) {
      const raw = record.raw_data;

      // Extract genres (from top artists)
      if (record.data_type === 'top_artist' && raw.genres) {
        raw.genres.forEach(genre => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      }

      // Extract artists
      if (raw.artists || raw.artist) {
        const artistName = raw.artists?.[0]?.name || raw.artist;
        if (artistName) {
          artistCounts[artistName] = (artistCounts[artistName] || 0) + 1;
        }
      }

      // Track energy/mood patterns
      if (raw.energy !== undefined || raw.valence !== undefined) {
        trackFeatures.push({
          energy: raw.energy,
          valence: raw.valence,
          danceability: raw.danceability,
          timestamp: record.extracted_at
        });
      }
    }

    // Create nodes for top genres
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const genreNodes = [];
    for (const [genre, count] of topGenres) {
      if (dryRun) {
        console.log(`[DryRun] Would create genre node: ${genre} (${count} occurrences)`);
        continue;
      }

      try {
        const node = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.PREFERENCE,
          category: CATEGORIES.ENTERTAINMENT,
          label: `Music: ${this._capitalizeWords(genre)}`,
          confidence: Math.min(0.9, 0.5 + (count / 20)),
          strength: Math.min(1.0, count / 10),
          source_type: SOURCE_TYPES.PLATFORM_DATA,
          platform: 'spotify',
          data: { abstraction_level: 2, genre, occurrence_count: count }, // Level 2: Preferences
          tags: ['music', 'genre', genre]
        });
        genreNodes.push(node);
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Genre node error: ${err.message}`);
      }
    }

    // Create nodes for top artists
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const artistNodes = [];
    for (const [artist, count] of topArtists) {
      if (dryRun) {
        console.log(`[DryRun] Would create artist node: ${artist} (${count} plays)`);
        continue;
      }

      try {
        const node = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.PREFERENCE,
          category: CATEGORIES.ENTERTAINMENT,
          label: `Loves: ${artist}`,
          confidence: Math.min(0.9, 0.5 + (count / 30)),
          strength: Math.min(1.0, count / 15),
          source_type: SOURCE_TYPES.PLATFORM_DATA,
          platform: 'spotify',
          data: { abstraction_level: 2, artist, play_count: count }, // Level 2: Preferences
          tags: ['music', 'artist', artist.toLowerCase()]
        });
        artistNodes.push(node);
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Artist node error: ${err.message}`);
      }
    }

    // Analyze listening patterns
    if (trackFeatures.length > 10) {
      const avgEnergy = trackFeatures.reduce((sum, t) => sum + (t.energy || 0), 0) / trackFeatures.length;
      const avgValence = trackFeatures.reduce((sum, t) => sum + (t.valence || 0), 0) / trackFeatures.length;

      // Create mood-based node
      let moodLabel = 'Balanced Music Listener';
      if (avgEnergy > 0.7 && avgValence > 0.6) moodLabel = 'Upbeat Music Lover';
      else if (avgEnergy < 0.4 && avgValence < 0.4) moodLabel = 'Chill & Introspective Listener';
      else if (avgEnergy > 0.6) moodLabel = 'High-Energy Music Fan';
      else if (avgValence > 0.6) moodLabel = 'Positive Vibes Seeker';

      if (!dryRun) {
        try {
          const moodNode = await twinsBrainService.addNode(userId, {
            node_type: NODE_TYPES.TRAIT,
            category: CATEGORIES.ENTERTAINMENT,
            label: moodLabel,
            confidence: 0.7,
            strength: 0.8,
            source_type: SOURCE_TYPES.PLATFORM_DATA,
            platform: 'spotify',
            data: { abstraction_level: 3, avg_energy: avgEnergy, avg_valence: avgValence, sample_size: trackFeatures.length }, // Level 3: Personality Traits
            tags: ['music', 'personality', 'mood']
          });

          // Connect mood to genres
          for (const genreNode of genreNodes.slice(0, 3)) {
            await twinsBrainService.connectNodes(userId, moodNode.id, genreNode.id, {
              relationship_type: RELATIONSHIP_TYPES.CORRELATES_WITH,
              context: 'music_preference',
              strength: 0.7
            });
            this.stats.edgesCreated++;
          }
          this.stats.nodesCreated++;
        } catch (err) {
          this.stats.errors.push(`Mood node error: ${err.message}`);
        }
      }
    }

    // Connect related genres
    if (!dryRun && genreNodes.length > 1) {
      for (let i = 0; i < genreNodes.length - 1; i++) {
        try {
          await twinsBrainService.connectNodes(userId, genreNodes[i].id, genreNodes[i + 1].id, {
            relationship_type: RELATIONSHIP_TYPES.SIMILAR_TO,
            context: 'music_taste',
            strength: 0.6
          });
          this.stats.edgesCreated++;
        } catch (err) {
          // Ignore duplicate edge errors
        }
      }
    }

    console.log(`[BrainMigration] Spotify migration: ${genreNodes.length} genres, ${artistNodes.length} artists`);
  }

  /**
   * Migrate Calendar events to behavioral patterns
   */
  async migrateCalendarData(userId, options = {}) {
    const { dryRun = false, limit = 500 } = options;

    console.log('[BrainMigration] Processing Calendar data...');

    // Get calendar data
    const { data: calendarData, error } = await this.supabase
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .in('platform', ['calendar', 'google_calendar'])
      .order('extracted_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[BrainMigration] Error fetching Calendar data:', error);
      return;
    }

    console.log(`[BrainMigration] Found ${calendarData?.length || 0} Calendar records`);

    // Analyze event patterns
    const eventTypes = {};
    const hourCounts = Array(24).fill(0);
    const dayOfWeekCounts = Array(7).fill(0);

    for (const record of calendarData || []) {
      const raw = record.raw_data;
      const summary = (raw.summary || '').toLowerCase();

      // Classify event type
      const type = this._classifyEventType(summary);
      eventTypes[type] = (eventTypes[type] || 0) + 1;

      // Track time patterns
      const startTime = raw.start_time || raw.start?.dateTime;
      if (startTime) {
        const date = new Date(startTime);
        hourCounts[date.getHours()]++;
        dayOfWeekCounts[date.getDay()]++;
      }
    }

    // Create behavioral nodes
    const topEventTypes = Object.entries(eventTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [eventType, count] of topEventTypes) {
      if (dryRun) {
        console.log(`[DryRun] Would create event type node: ${eventType} (${count} events)`);
        continue;
      }

      try {
        await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.BEHAVIOR,
          category: CATEGORIES.PROFESSIONAL,
          label: `Schedule: ${this._capitalizeWords(eventType)}`,
          confidence: Math.min(0.9, 0.5 + (count / 50)),
          strength: Math.min(1.0, count / 30),
          source_type: SOURCE_TYPES.PLATFORM_DATA,
          platform: 'calendar',
          data: { abstraction_level: 2, event_type: eventType, occurrence_count: count }, // Level 2: Behavioral Preferences
          tags: ['calendar', 'schedule', eventType]
        });
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Calendar node error: ${err.message}`);
      }
    }

    // Detect work pattern (peak hours)
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakDay = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (!dryRun && calendarData?.length > 10) {
      // Create chronotype node
      let chronotypeLabel = 'Balanced Schedule';
      if (peakHour < 10) chronotypeLabel = 'Early Bird Scheduler';
      else if (peakHour >= 14 && peakHour < 18) chronotypeLabel = 'Afternoon Focus';
      else if (peakHour >= 18) chronotypeLabel = 'Night Owl Scheduler';

      try {
        await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.PATTERN,
          category: CATEGORIES.PROFESSIONAL,
          label: chronotypeLabel,
          confidence: 0.65,
          strength: 0.7,
          source_type: SOURCE_TYPES.PLATFORM_DATA,
          platform: 'calendar',
          data: {
            abstraction_level: 2, // Level 2: Behavioral Patterns
            peak_hour: peakHour,
            peak_day: dayNames[peakDay],
            sample_size: calendarData.length
          },
          tags: ['schedule', 'chronotype', 'work-pattern']
        });
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Chronotype node error: ${err.message}`);
      }
    }

    console.log(`[BrainMigration] Calendar migration: ${topEventTypes.length} event types`);
  }

  /**
   * Migrate Claude conversation topics to interests
   */
  async migrateClaudeConversations(userId, options = {}) {
    const { dryRun = false, limit = 500 } = options;

    console.log('[BrainMigration] Processing Claude conversations...');

    const { data: conversations, error } = await this.supabase
      .from('mcp_conversation_logs')
      .select('user_message, topics_detected, intent, writing_analysis')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[BrainMigration] Error fetching conversations:', error);
      return;
    }

    console.log(`[BrainMigration] Found ${conversations?.length || 0} conversations`);

    // Aggregate topics
    const topicCounts = {};
    const intentCounts = {};

    for (const conv of conversations || []) {
      // Count topics
      const topics = conv.topics_detected || [];
      topics.forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });

      // Count intents
      if (conv.intent) {
        intentCounts[conv.intent] = (intentCounts[conv.intent] || 0) + 1;
      }
    }

    // Create interest nodes for top topics (exclude vague 'general' topic)
    const topTopics = Object.entries(topicCounts)
      .filter(([topic]) => !['general', 'other', 'misc', 'unknown'].includes(topic.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const topicNodes = [];
    for (const [topic, count] of topTopics) {
      if (count < 3) continue; // Skip rare topics

      if (dryRun) {
        console.log(`[DryRun] Would create topic node: ${topic} (${count} mentions)`);
        continue;
      }

      try {
        const node = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.INTEREST,
          category: this._inferCategoryFromTopic(topic),
          label: `Interested in: ${this._capitalizeWords(topic)}`,
          confidence: Math.min(0.85, 0.4 + (count / 50)),
          strength: Math.min(1.0, count / 30),
          source_type: SOURCE_TYPES.CLAUDE_CONVERSATION,
          data: { abstraction_level: 2, topic, mention_count: count }, // Level 2: Preferences
          tags: ['conversation', 'interest', topic.toLowerCase()]
        });
        topicNodes.push(node);
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Topic node error: ${err.message}`);
      }
    }

    // Create thinking style nodes from intents
    const topIntents = Object.entries(intentCounts)
      .filter(([intent]) => !['general', 'imported_history'].includes(intent))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [intent, count] of topIntents) {
      if (dryRun) {
        console.log(`[DryRun] Would create intent node: ${intent} (${count} times)`);
        continue;
      }

      try {
        await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.BEHAVIOR,
          category: CATEGORIES.LEARNING,
          label: `Thinking Style: ${this._capitalizeWords(intent.replace(/_/g, ' '))}`,
          confidence: Math.min(0.8, 0.5 + (count / 100)),
          strength: Math.min(1.0, count / 50),
          source_type: SOURCE_TYPES.CLAUDE_CONVERSATION,
          data: { abstraction_level: 2, intent, occurrence_count: count }, // Level 2: Behavioral Patterns
          tags: ['conversation', 'thinking-style', intent]
        });
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Intent node error: ${err.message}`);
      }
    }

    // Connect related topics
    if (!dryRun && topicNodes.length > 1) {
      // Connect topics that appear in same conversations
      for (let i = 0; i < Math.min(topicNodes.length - 1, 5); i++) {
        try {
          await twinsBrainService.connectNodes(userId, topicNodes[i].id, topicNodes[i + 1].id, {
            relationship_type: RELATIONSHIP_TYPES.CORRELATES_WITH,
            context: 'conversation_topics',
            strength: 0.5
          });
          this.stats.edgesCreated++;
        } catch (err) {
          // Ignore duplicate edge errors
        }
      }
    }

    console.log(`[BrainMigration] Conversation migration: ${topicNodes.length} topics, ${topIntents.length} intents`);
  }

  /**
   * Create edges between related nodes across platforms
   */
  async createCrossPlatformEdges(userId, options = {}) {
    const { dryRun = false } = options;

    console.log('[BrainMigration] Creating cross-platform connections...');

    // Get all nodes
    const nodes = await twinsBrainService.getAllNodes(userId);

    // Find potential connections
    const musicNodes = nodes.filter(n => n.platform === 'spotify');
    const calendarNodes = nodes.filter(n => n.platform === 'calendar');
    const topicNodes = nodes.filter(n => n.source_type === SOURCE_TYPES.CLAUDE_CONVERSATION);

    // Connect music preferences to work patterns
    const focusNode = calendarNodes.find(n => n.label.toLowerCase().includes('focus'));
    const musicMoodNode = musicNodes.find(n => n.node_type === NODE_TYPES.TRAIT);

    if (!dryRun && focusNode && musicMoodNode) {
      try {
        await twinsBrainService.connectNodes(userId, focusNode.id, musicMoodNode.id, {
          relationship_type: RELATIONSHIP_TYPES.CORRELATES_WITH,
          context: 'work_music',
          strength: 0.7,
          evidence: [{ observation: 'Music preferences during work sessions' }]
        });
        this.stats.edgesCreated++;
        console.log('[BrainMigration] Connected focus work to music preferences');
      } catch (err) {
        // Ignore if already connected
      }
    }

    // Connect coding topics to professional behaviors
    const codingTopics = topicNodes.filter(n =>
      ['coding', 'programming', 'ai', 'data'].some(t => n.label.toLowerCase().includes(t))
    );

    const professionalBehaviors = calendarNodes.filter(n =>
      n.category === CATEGORIES.PROFESSIONAL
    );

    if (!dryRun && codingTopics.length > 0 && professionalBehaviors.length > 0) {
      try {
        await twinsBrainService.connectNodes(userId, codingTopics[0].id, professionalBehaviors[0].id, {
          relationship_type: RELATIONSHIP_TYPES.REINFORCES,
          context: 'professional_identity',
          strength: 0.65
        });
        this.stats.edgesCreated++;
        console.log('[BrainMigration] Connected coding interest to professional behavior');
      } catch (err) {
        // Ignore
      }
    }

    console.log(`[BrainMigration] Cross-platform edges created: ${this.stats.edgesCreated}`);
  }

  // ============================================================
  // NEW: PERSONALITY & SOUL SIGNATURE INTEGRATION
  // ============================================================

  /**
   * Migrate Big Five personality scores to brain nodes
   * Creates nodes for each OCEAN dimension with confidence and evidence
   */
  async migratePersonalityScores(userId, options = {}) {
    const { dryRun = false } = options;

    console.log('[BrainMigration] Processing Personality Scores (Big Five)...');

    // Get personality scores
    const { data: personality, error } = await this.supabase
      .from('personality_scores')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !personality) {
      console.log('[BrainMigration] No personality scores found for user');
      return;
    }

    console.log(`[BrainMigration] Found personality scores (source: ${personality.source_type})`);

    // Big Five dimension metadata
    const dimensions = [
      {
        key: 'openness',
        label: 'Openness to Experience',
        description: 'Curiosity, creativity, and preference for novelty',
        highLabel: 'Highly curious and creative',
        lowLabel: 'Practical and conventional'
      },
      {
        key: 'conscientiousness',
        label: 'Conscientiousness',
        description: 'Organization, dependability, and self-discipline',
        highLabel: 'Highly organized and disciplined',
        lowLabel: 'Flexible and spontaneous'
      },
      {
        key: 'extraversion',
        label: 'Extraversion',
        description: 'Sociability, assertiveness, and positive emotions',
        highLabel: 'Outgoing and energetic',
        lowLabel: 'Reserved and introspective'
      },
      {
        key: 'agreeableness',
        label: 'Agreeableness',
        description: 'Cooperation, trust, and helpfulness',
        highLabel: 'Compassionate and cooperative',
        lowLabel: 'Analytical and competitive'
      },
      {
        key: 'neuroticism',
        label: 'Emotional Stability',
        description: 'Emotional resilience and stress response',
        highLabel: 'Emotionally sensitive',
        lowLabel: 'Calm and resilient'
      }
    ];

    const personalityNodes = [];

    for (const dim of dimensions) {
      const score = personality[dim.key];
      const confidence = personality[`${dim.key}_confidence`] || 50;

      if (score === null || score === undefined) continue;

      // Determine trait label based on score
      const isHigh = score >= 60;
      const isLow = score <= 40;
      const traitLabel = isHigh ? dim.highLabel : (isLow ? dim.lowLabel : `Moderate ${dim.label}`);

      if (dryRun) {
        console.log(`[DryRun] Would create personality node: ${dim.label} = ${score} (${confidence}% confident)`);
        continue;
      }

      try {
        const node = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.TRAIT,
          category: CATEGORIES.PERSONAL,
          label: traitLabel,
          confidence: confidence / 100,
          strength: Math.abs(score - 50) / 50, // Strength = how far from neutral
          source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
          data: {
            abstraction_level: 3, // Level 3: Personality Traits
            dimension: dim.key,
            dimension_label: dim.label,
            score: score,
            score_confidence: confidence,
            description: dim.description,
            source_type: personality.source_type,
            sample_size: personality.sample_size,
            analyzed_platforms: personality.analyzed_platforms || [],
            evidence: this._buildPersonalityEvidence(dim.key, score, personality)
          },
          tags: ['personality', 'big-five', dim.key, personality.source_type]
        });
        personalityNodes.push(node);
        this.stats.nodesCreated++;
      } catch (err) {
        if (!err.message?.includes('duplicate')) {
          this.stats.errors.push(`Personality node error (${dim.key}): ${err.message}`);
        }
      }
    }

    // Connect related personality dimensions
    if (!dryRun && personalityNodes.length > 1) {
      // Openness often correlates with Extraversion
      const opennessNode = personalityNodes.find(n => n?.data?.dimension === 'openness');
      const extraversionNode = personalityNodes.find(n => n?.data?.dimension === 'extraversion');

      if (opennessNode && extraversionNode) {
        try {
          await twinsBrainService.connectNodes(userId, opennessNode.id, extraversionNode.id, {
            relationship_type: RELATIONSHIP_TYPES.CORRELATES_WITH,
            context: 'personality_structure',
            strength: 0.5,
            evidence: [{ observation: 'Big Five dimensions often show moderate correlations' }]
          });
          this.stats.edgesCreated++;
        } catch (err) {
          // Ignore duplicate edges
        }
      }
    }

    console.log(`[BrainMigration] Personality migration: ${personalityNodes.length} dimension nodes created`);
  }

  /**
   * Build evidence object for personality dimension
   */
  _buildPersonalityEvidence(dimension, score, personality) {
    const evidence = {
      score: score,
      confidence: personality[`${dimension}_confidence`] || 50,
      source: personality.source_type,
      platforms_analyzed: personality.analyzed_platforms || [],
      sample_size: personality.sample_size || 0,
      interpretation: this._interpretPersonalityScore(dimension, score),
      last_updated: personality.updated_at
    };

    // Add questionnaire info if applicable
    if (personality.questionnaire_version) {
      evidence.questionnaire = personality.questionnaire_version;
    }

    return evidence;
  }

  /**
   * Interpret what a personality score means
   */
  _interpretPersonalityScore(dimension, score) {
    const interpretations = {
      openness: {
        high: 'You actively seek new experiences and ideas. Your Spotify shows diverse genre exploration, and you likely enjoy learning new things.',
        low: 'You prefer familiar, practical approaches. Your choices tend toward proven, reliable options.',
        moderate: 'You balance curiosity with practicality, selectively exploring new things.'
      },
      conscientiousness: {
        high: 'You\'re organized and goal-oriented. Your calendar shows structured planning and follow-through.',
        low: 'You prefer flexibility and spontaneity over rigid schedules.',
        moderate: 'You balance structure with adaptability based on context.'
      },
      extraversion: {
        high: 'You energize through social interaction. Calendar shows frequent meetings and collaborative work.',
        low: 'You recharge through solitude. You prefer deep focus time and meaningful one-on-one connections.',
        moderate: 'You adapt your social energy to the situation - social when needed, reflective when not.'
      },
      agreeableness: {
        high: 'You prioritize harmony and cooperation. You\'re naturally empathetic and supportive.',
        low: 'You\'re analytically driven and comfortable with healthy conflict for better outcomes.',
        moderate: 'You balance cooperation with assertiveness based on context.'
      },
      neuroticism: {
        high: 'You experience emotions intensely. Your biometrics may show sensitivity to stress.',
        low: 'You\'re emotionally resilient. Whoop data likely shows stable HRV under pressure.',
        moderate: 'You have typical emotional variability with good recovery.'
      }
    };

    const level = score >= 60 ? 'high' : (score <= 40 ? 'low' : 'moderate');
    return interpretations[dimension]?.[level] || 'Personality dimension within normal range.';
  }

  /**
   * Migrate Soul Signature defining traits with evidence
   */
  async migrateSoulSignatureTraits(userId, options = {}) {
    const { dryRun = false } = options;

    console.log('[BrainMigration] Processing Soul Signature traits...');

    // Get soul signature
    const { data: soulSignature, error } = await this.supabase
      .from('soul_signatures')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !soulSignature) {
      console.log('[BrainMigration] No soul signature found for user');
      return;
    }

    console.log(`[BrainMigration] Found soul signature: ${soulSignature.archetype_name}`);

    // Create archetype node (Level 4 - Core Identity)
    if (!dryRun && soulSignature.archetype_name) {
      try {
        await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.TRAIT,
          category: CATEGORIES.PERSONAL,
          label: soulSignature.archetype_name,
          confidence: 0.85,
          strength: 0.95,
          source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
          data: {
            abstraction_level: 4, // Core Identity
            subtitle: soulSignature.archetype_subtitle,
            narrative: soulSignature.narrative,
            source: 'soul_signature_analysis',
            evidence: {
              type: 'aggregated_analysis',
              description: 'Derived from cross-platform behavioral patterns and personality assessment',
              narrative: soulSignature.narrative
            }
          },
          tags: ['soul-signature', 'archetype', 'core-identity']
        });
        this.stats.nodesCreated++;
      } catch (err) {
        if (!err.message?.includes('duplicate')) {
          this.stats.errors.push(`Archetype node error: ${err.message}`);
        }
      }
    }

    // Migrate defining traits with evidence
    const definingTraits = soulSignature.defining_traits || [];

    for (const trait of definingTraits) {
      if (!trait.trait) continue;

      if (dryRun) {
        console.log(`[DryRun] Would create trait node: ${trait.trait} (score: ${trait.score}, evidence: ${trait.evidence})`);
        continue;
      }

      try {
        await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.TRAIT,
          category: this._inferCategoryFromTrait(trait.trait),
          label: trait.trait,
          confidence: (trait.score || 70) / 100,
          strength: (trait.score || 70) / 100,
          source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
          data: {
            abstraction_level: 3, // Trait level
            score: trait.score,
            evidence: {
              type: 'behavioral_observation',
              description: trait.evidence || 'Derived from cross-platform behavior analysis',
              source: 'soul_signature',
              raw_evidence: trait.evidence
            }
          },
          tags: ['soul-signature', 'defining-trait']
        });
        this.stats.nodesCreated++;
      } catch (err) {
        if (!err.message?.includes('duplicate')) {
          this.stats.errors.push(`Trait node error: ${err.message}`);
        }
      }
    }

    console.log(`[BrainMigration] Soul signature migration: archetype + ${definingTraits.length} traits`);
  }

  /**
   * Infer category from trait description
   */
  _inferCategoryFromTrait(trait) {
    const traitLower = trait.toLowerCase();
    if (['curious', 'creative', 'artistic', 'imaginative'].some(t => traitLower.includes(t))) {
      return CATEGORIES.CREATIVE;
    }
    if (['social', 'outgoing', 'friendly', 'empathetic'].some(t => traitLower.includes(t))) {
      return CATEGORIES.SOCIAL;
    }
    if (['organized', 'disciplined', 'professional', 'ambitious'].some(t => traitLower.includes(t))) {
      return CATEGORIES.PROFESSIONAL;
    }
    if (['healthy', 'active', 'fitness', 'wellness'].some(t => traitLower.includes(t))) {
      return CATEGORIES.HEALTH;
    }
    if (['learning', 'studious', 'intellectual'].some(t => traitLower.includes(t))) {
      return CATEGORIES.LEARNING;
    }
    return CATEGORIES.PERSONAL;
  }

  /**
   * Migrate MoltBot semantic memories to brain nodes
   */
  async migrateMoltbotMemories(userId, options = {}) {
    const { dryRun = false, limit = 100 } = options;

    console.log('[BrainMigration] Processing MoltBot semantic memories...');

    // Get semantic memories from moltbot tables
    // Try multiple possible table names
    let memories = [];

    // Try realtime_events which stores episodic memory
    const { data: events, error: eventsError } = await this.supabase
      .from('realtime_events')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (!eventsError && events?.length > 0) {
      console.log(`[BrainMigration] Found ${events.length} MoltBot events`);
      memories = events;
    }

    // Try behavioral_patterns table
    const { data: patterns, error: patternsError } = await this.supabase
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', 0.6)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (!patternsError && patterns?.length > 0) {
      console.log(`[BrainMigration] Found ${patterns.length} behavioral patterns`);

      for (const pattern of patterns) {
        if (dryRun) {
          console.log(`[DryRun] Would create pattern node: ${pattern.pattern_name}`);
          continue;
        }

        try {
          await twinsBrainService.addNode(userId, {
            node_type: NODE_TYPES.PATTERN,
            category: this._inferCategoryFromPattern(pattern),
            label: pattern.pattern_name || pattern.description || 'Behavioral Pattern',
            confidence: pattern.confidence || 0.6,
            strength: pattern.strength || 0.5,
            source_type: SOURCE_TYPES.MOLTBOT_SEMANTIC,
            data: {
              abstraction_level: 2, // Level 2: Behavioral Patterns
              pattern_type: pattern.pattern_type,
              description: pattern.description,
              observation_count: pattern.observation_count,
              evidence: {
                type: 'moltbot_pattern_detection',
                observations: pattern.observation_count,
                first_detected: pattern.first_detected,
                last_observed: pattern.last_observed,
                triggers: pattern.triggers || [],
                context: pattern.context
              }
            },
            tags: ['moltbot', 'behavioral-pattern', pattern.pattern_type || 'general']
          });
          this.stats.nodesCreated++;
        } catch (err) {
          if (!err.message?.includes('duplicate')) {
            this.stats.errors.push(`MoltBot pattern error: ${err.message}`);
          }
        }
      }
    }

    // Try learned_facts or semantic_knowledge tables
    const { data: facts, error: factsError } = await this.supabase
      .from('learned_facts')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', 0.5)
      .limit(limit);

    if (!factsError && facts?.length > 0) {
      console.log(`[BrainMigration] Found ${facts.length} learned facts`);

      for (const fact of facts) {
        if (dryRun) {
          console.log(`[DryRun] Would create fact node: ${fact.fact || fact.description}`);
          continue;
        }

        try {
          await twinsBrainService.addNode(userId, {
            node_type: NODE_TYPES.FACT,
            category: fact.category || CATEGORIES.PERSONAL,
            label: fact.fact || fact.description || 'Learned Fact',
            confidence: fact.confidence || 0.6,
            strength: fact.importance || 0.5,
            source_type: SOURCE_TYPES.MOLTBOT_SEMANTIC,
            data: {
              abstraction_level: 1, // Level 1: Raw Facts
              fact_type: fact.fact_type,
              evidence: {
                type: 'moltbot_learning',
                source_events: fact.source_events || [],
                learned_at: fact.created_at,
                reinforcement_count: fact.reinforcement_count || 1
              }
            },
            tags: ['moltbot', 'learned-fact']
          });
          this.stats.nodesCreated++;
        } catch (err) {
          if (!err.message?.includes('duplicate')) {
            this.stats.errors.push(`MoltBot fact error: ${err.message}`);
          }
        }
      }
    }

    console.log(`[BrainMigration] MoltBot migration complete`);
  }

  /**
   * Infer category from behavioral pattern
   */
  _inferCategoryFromPattern(pattern) {
    const type = (pattern.pattern_type || '').toLowerCase();
    const name = (pattern.pattern_name || '').toLowerCase();
    const combined = type + ' ' + name;

    if (['music', 'spotify', 'listening', 'entertainment'].some(t => combined.includes(t))) {
      return CATEGORIES.ENTERTAINMENT;
    }
    if (['work', 'meeting', 'calendar', 'professional', 'productivity'].some(t => combined.includes(t))) {
      return CATEGORIES.PROFESSIONAL;
    }
    if (['health', 'fitness', 'sleep', 'recovery', 'whoop'].some(t => combined.includes(t))) {
      return CATEGORIES.HEALTH;
    }
    if (['social', 'communication'].some(t => combined.includes(t))) {
      return CATEGORIES.SOCIAL;
    }
    return CATEGORIES.PERSONAL;
  }

  /**
   * Create edges between personality traits and observed behaviors
   * This creates the crucial cross-category connections
   */
  async createPersonalityBehaviorEdges(userId, options = {}) {
    const { dryRun = false } = options;

    console.log('[BrainMigration] Creating personality-behavior connections...');

    // Get all nodes
    const nodes = await twinsBrainService.getAllNodes(userId);

    // Find personality nodes
    const personalityNodes = nodes.filter(n =>
      n.tags?.includes('personality') || n.tags?.includes('big-five')
    );

    // Find behavior/preference nodes
    const behaviorNodes = nodes.filter(n =>
      n.node_type === NODE_TYPES.BEHAVIOR ||
      n.node_type === NODE_TYPES.PREFERENCE ||
      n.node_type === NODE_TYPES.PATTERN
    );

    if (personalityNodes.length === 0 || behaviorNodes.length === 0) {
      console.log('[BrainMigration] Not enough nodes for personality-behavior connections');
      return;
    }

    // Map personality dimensions to likely behavioral correlations
    const correlations = {
      openness: ['music', 'creative', 'learning', 'exploration', 'diverse'],
      conscientiousness: ['schedule', 'organized', 'meetings', 'focus', 'work'],
      extraversion: ['social', 'meetings', 'collaborative', 'energetic'],
      agreeableness: ['team', 'collaborative', 'support', 'help'],
      neuroticism: ['stress', 'recovery', 'calm', 'relaxation']
    };

    let connectionsCreated = 0;

    for (const pNode of personalityNodes) {
      const dimension = pNode.data?.dimension;
      if (!dimension || !correlations[dimension]) continue;

      const keywords = correlations[dimension];

      // Find behaviors that match this personality dimension
      const matchingBehaviors = behaviorNodes.filter(bNode => {
        const labelLower = (bNode.label || '').toLowerCase();
        const tags = bNode.tags || [];
        return keywords.some(kw =>
          labelLower.includes(kw) || tags.some(t => t.includes(kw))
        );
      });

      for (const bNode of matchingBehaviors.slice(0, 3)) { // Limit to top 3 per dimension
        if (dryRun) {
          console.log(`[DryRun] Would connect ${pNode.label} → ${bNode.label}`);
          continue;
        }

        try {
          await twinsBrainService.connectNodes(userId, pNode.id, bNode.id, {
            relationship_type: RELATIONSHIP_TYPES.REINFORCES,
            context: 'personality_behavior_correlation',
            strength: 0.6,
            evidence: [{
              observation: `${dimension} personality dimension correlates with ${bNode.label}`,
              type: 'cross_category_correlation'
            }]
          });
          connectionsCreated++;
          this.stats.edgesCreated++;
        } catch (err) {
          // Ignore duplicate edges
        }
      }
    }

    console.log(`[BrainMigration] Created ${connectionsCreated} personality-behavior connections`);
  }

  /**
   * Build provenance chains connecting higher-level abstractions to their source evidence
   * This creates DERIVED_FROM and AGGREGATES relationships to show how conclusions were reached
   */
  async buildProvenanceChains(userId, options = {}) {
    const { dryRun = false } = options;

    console.log('[BrainMigration] Building provenance chains...');

    // Get all nodes grouped by abstraction level
    const { data: allNodes, error } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId);

    if (error || !allNodes) {
      console.error('[BrainMigration] Error fetching nodes for provenance:', error);
      return;
    }

    // Group nodes by abstraction level
    const nodesByLevel = {
      1: [], // Raw Facts
      2: [], // Preferences
      3: [], // Traits
      4: []  // Core Identity
    };

    for (const node of allNodes) {
      const level = node.data?.abstraction_level || 2; // Default to Level 2
      if (nodesByLevel[level]) {
        nodesByLevel[level].push(node);
      }
    }

    console.log(`[BrainMigration] Nodes by abstraction level: L1=${nodesByLevel[1].length}, L2=${nodesByLevel[2].length}, L3=${nodesByLevel[3].length}, L4=${nodesByLevel[4].length}`);

    let chainsCreated = 0;

    // Connect Level 4 (Core Identity) to Level 3 (Traits)
    // Soul Signature archetype derives from personality traits
    for (const l4Node of nodesByLevel[4]) {
      // Find related Level 3 nodes by category or tags
      const relatedL3 = nodesByLevel[3].filter(l3 => {
        // Match by category
        if (l3.category === l4Node.category) return true;
        // Match by platform
        if (l3.platform && l4Node.platform === l3.platform) return true;
        // Match by tags overlap
        const l4Tags = l4Node.tags || [];
        const l3Tags = l3.tags || [];
        return l4Tags.some(t => l3Tags.includes(t));
      }).slice(0, 5); // Limit to top 5 connections

      for (const l3Node of relatedL3) {
        if (dryRun) {
          console.log(`[DryRun] Would create provenance: "${l4Node.label}" DERIVED_FROM "${l3Node.label}"`);
          continue;
        }

        try {
          await twinsBrainService.connectNodes(userId, l4Node.id, l3Node.id, {
            relationship_type: RELATIONSHIP_TYPES.DERIVED_FROM,
            context: 'abstraction_derivation',
            strength: 0.8,
            confidence: 0.7,
            evidence: [{
              type: 'abstraction_chain',
              from_level: 4,
              to_level: 3,
              derivation: `Core identity "${l4Node.label}" is derived from trait "${l3Node.label}"`
            }]
          });
          chainsCreated++;
        } catch (err) {
          if (!err.message?.includes('duplicate')) {
            this.stats.errors.push(`Provenance L4->L3 error: ${err.message}`);
          }
        }
      }
    }

    // Connect Level 3 (Traits) to Level 2 (Preferences)
    // Personality traits derive from behavioral preferences
    for (const l3Node of nodesByLevel[3]) {
      // Find related Level 2 nodes
      const relatedL2 = nodesByLevel[2].filter(l2 => {
        // Big Five to music: openness/extraversion to music mood
        if (l3Node.data?.dimension && l2.platform === 'spotify') {
          if (['openness', 'extraversion'].includes(l3Node.data.dimension)) return true;
        }
        // Big Five to schedule: conscientiousness to calendar patterns
        if (l3Node.data?.dimension === 'conscientiousness' && l2.platform === 'calendar') {
          return true;
        }
        // Category match
        if (l3Node.category === l2.category) return true;
        // Platform match
        if (l3Node.platform && l3Node.platform === l2.platform) return true;
        return false;
      }).slice(0, 4); // Limit connections

      for (const l2Node of relatedL2) {
        if (dryRun) {
          console.log(`[DryRun] Would create provenance: "${l3Node.label}" AGGREGATES "${l2Node.label}"`);
          continue;
        }

        try {
          await twinsBrainService.connectNodes(userId, l3Node.id, l2Node.id, {
            relationship_type: RELATIONSHIP_TYPES.AGGREGATES,
            context: 'trait_derivation',
            strength: 0.7,
            confidence: 0.6,
            evidence: [{
              type: 'abstraction_chain',
              from_level: 3,
              to_level: 2,
              derivation: `Trait "${l3Node.label}" aggregates preference "${l2Node.label}"`
            }]
          });
          chainsCreated++;
        } catch (err) {
          if (!err.message?.includes('duplicate')) {
            this.stats.errors.push(`Provenance L3->L2 error: ${err.message}`);
          }
        }
      }
    }

    // Connect Level 2 (Preferences) to Level 1 (Facts) if any facts exist
    for (const l2Node of nodesByLevel[2]) {
      const relatedL1 = nodesByLevel[1].filter(l1 => {
        // Match by category or source
        return l1.category === l2Node.category || l1.platform === l2Node.platform;
      }).slice(0, 3);

      for (const l1Node of relatedL1) {
        if (dryRun) {
          console.log(`[DryRun] Would create provenance: "${l2Node.label}" DERIVED_FROM "${l1Node.label}"`);
          continue;
        }

        try {
          await twinsBrainService.connectNodes(userId, l2Node.id, l1Node.id, {
            relationship_type: RELATIONSHIP_TYPES.DERIVED_FROM,
            context: 'preference_derivation',
            strength: 0.8,
            confidence: 0.7,
            evidence: [{
              type: 'abstraction_chain',
              from_level: 2,
              to_level: 1,
              derivation: `Preference "${l2Node.label}" derived from fact "${l1Node.label}"`
            }]
          });
          chainsCreated++;
        } catch (err) {
          if (!err.message?.includes('duplicate')) {
            this.stats.errors.push(`Provenance L2->L1 error: ${err.message}`);
          }
        }
      }
    }

    this.stats.edgesCreated += chainsCreated;
    console.log(`[BrainMigration] Created ${chainsCreated} provenance chain connections`);
  }

  /**
   * Migrate Web Browsing data to Brain knowledge graph
   * Creates interest, behavior, and preference nodes from browser extension data
   */
  async migrateWebBrowsingData(userId, options = {}) {
    const { dryRun = false, limit = 500 } = options;

    console.log('[BrainMigration] Processing Web Browsing data...');

    // Get web browsing events
    const { data: webData, error } = await this.supabase
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[BrainMigration] Error fetching web data:', error);
      return;
    }

    if (!webData?.length) {
      console.log('[BrainMigration] No web browsing data found');
      return;
    }

    console.log(`[BrainMigration] Found ${webData.length} web browsing records`);

    // Aggregate browsing categories, domains, and topics
    const categoryCounts = {};
    const domainCounts = {};
    const topicCounts = {};
    let totalEngagement = 0;
    let totalTimeOnPage = 0;
    let pageCount = 0;

    for (const record of webData) {
      const raw = record.raw_data || {};

      // Category
      const category = raw.category || raw.metadata?.category || 'uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      // Domain
      const domain = raw.domain || raw.metadata?.domain;
      if (domain) {
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      }

      // Topics
      const topics = raw.topics || raw.metadata?.topics || [];
      for (const topic of topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }

      // Engagement metrics
      const engagement = raw.engagement?.engagementScore || raw.engagementScore || 0;
      totalEngagement += engagement;
      const timeOnPage = raw.engagement?.timeOnPage || raw.timeOnPage || 0;
      totalTimeOnPage += timeOnPage;
      pageCount++;
    }

    const maxCategoryCount = Math.max(...Object.values(categoryCounts), 1);
    const maxTopicCount = Math.max(...Object.values(topicCounts), 1);

    // Create Interest nodes for top browsing categories
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const interestNodes = [];
    for (const [category, count] of topCategories) {
      if (category === 'uncategorized') continue;
      if (dryRun) {
        console.log(`[DryRun] Would create interest node: ${category} (${count} visits)`);
        continue;
      }

      try {
        const node = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.PREFERENCE,
          category: this._mapWebCategoryToBrainCategory(category),
          label: `Interest: ${this._capitalizeWords(category)}`,
          confidence: Math.min(0.9, 0.4 + (count / maxCategoryCount) * 0.5),
          strength: count / maxCategoryCount,
          source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
          platform: 'web',
          data: {
            abstraction_level: 2,
            category,
            visit_count: count,
            domain_count: Object.keys(domainCounts).length
          },
          tags: ['web_browsing', 'auto_detected', category]
        });
        interestNodes.push(node);
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Web interest node error: ${err.message}`);
      }
    }

    // Create Behavior node for reading style
    const avgEngagement = pageCount > 0 ? totalEngagement / pageCount : 0;
    const avgTimeOnPage = pageCount > 0 ? totalTimeOnPage / pageCount : 0;
    let dominantBehavior = 'Scanner';
    if (avgTimeOnPage > 120) dominantBehavior = 'Deep Reader';
    else if (avgTimeOnPage > 60) dominantBehavior = 'Engaged Reader';
    else if (avgTimeOnPage > 30) dominantBehavior = 'Skimmer';

    if (!dryRun) {
      try {
        const behaviorNode = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.BEHAVIOR,
          category: CATEGORIES.PERSONAL,
          label: `Reading Style: ${dominantBehavior}`,
          confidence: 0.7,
          strength: avgEngagement / 100,
          source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
          platform: 'web',
          data: {
            abstraction_level: 3,
            avg_time_on_page: Math.round(avgTimeOnPage),
            engagement_score: Math.round(avgEngagement),
            dominant_behavior: dominantBehavior,
            sample_size: pageCount
          },
          tags: ['web_browsing', 'reading_behavior']
        });

        // Connect reading behavior to top interests
        for (const interestNode of interestNodes.slice(0, 3)) {
          await twinsBrainService.connectNodes(userId, behaviorNode.id, interestNode.id, {
            relationship_type: RELATIONSHIP_TYPES.CORRELATES_WITH,
            context: 'browsing_behavior',
            strength: 0.6
          });
          this.stats.edgesCreated++;
        }
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Web behavior node error: ${err.message}`);
      }
    }

    // Create Preference nodes for top topics (limit 10)
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [topic, count] of topTopics) {
      if (dryRun) {
        console.log(`[DryRun] Would create topic node: ${topic} (${count} mentions)`);
        continue;
      }

      try {
        const node = await twinsBrainService.addNode(userId, {
          node_type: NODE_TYPES.PREFERENCE,
          category: CATEGORIES.PERSONAL,
          label: `Curious about: ${this._capitalizeWords(topic)}`,
          confidence: Math.min(0.85, 0.3 + (count / maxTopicCount) * 0.55),
          strength: count / maxTopicCount,
          source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
          platform: 'web',
          data: {
            abstraction_level: 2,
            topic,
            frequency: count
          },
          tags: ['web_browsing', 'topic_interest', topic.toLowerCase()]
        });
        this.stats.nodesCreated++;
      } catch (err) {
        this.stats.errors.push(`Web topic node error: ${err.message}`);
      }
    }

    // Connect related interests
    if (!dryRun && interestNodes.length > 1) {
      for (let i = 0; i < interestNodes.length - 1; i++) {
        try {
          await twinsBrainService.connectNodes(userId, interestNodes[i].id, interestNodes[i + 1].id, {
            relationship_type: RELATIONSHIP_TYPES.SIMILAR_TO,
            context: 'browsing_interests',
            strength: 0.5
          });
          this.stats.edgesCreated++;
        } catch (err) {
          // Ignore duplicate edge errors
        }
      }
    }

    console.log(`[BrainMigration] Web migration: ${interestNodes.length} interests, ${topTopics.length} topics, reading style: ${dominantBehavior}`);
  }

  /**
   * Map web browsing categories to Brain knowledge graph categories
   */
  _mapWebCategoryToBrainCategory(webCategory) {
    const mapping = {
      'learning': CATEGORIES.LEARNING,
      'reference': CATEGORIES.LEARNING,
      'education': CATEGORIES.LEARNING,
      'entertainment': CATEGORIES.ENTERTAINMENT,
      'gaming': CATEGORIES.ENTERTAINMENT,
      'social': CATEGORIES.SOCIAL,
      'communication': CATEGORIES.SOCIAL,
      'news': CATEGORIES.PERSONAL,
      'shopping': CATEGORIES.PERSONAL,
      'health': CATEGORIES.HEALTH,
      'fitness': CATEGORIES.HEALTH,
      'development': CATEGORIES.PROFESSIONAL,
      'productivity': CATEGORIES.PROFESSIONAL,
      'technology': CATEGORIES.PROFESSIONAL,
      'creative': CATEGORIES.CREATIVE,
      'art': CATEGORIES.CREATIVE,
      'music': CATEGORIES.ENTERTAINMENT,
      'video': CATEGORIES.ENTERTAINMENT,
      'finance': CATEGORIES.PROFESSIONAL
    };
    return mapping[webCategory?.toLowerCase()] || CATEGORIES.PERSONAL;
  }

  // Helper methods
  _classifyEventType(summary) {
    if (/meeting|sync|standup|1:1|check-in/i.test(summary)) return 'meetings';
    if (/focus|deep work|coding|development/i.test(summary)) return 'focus_work';
    if (/lunch|coffee|break/i.test(summary)) return 'breaks';
    if (/review|demo|presentation/i.test(summary)) return 'presentations';
    if (/call|interview/i.test(summary)) return 'calls';
    if (/gym|workout|exercise|run/i.test(summary)) return 'fitness';
    if (/doctor|dentist|appointment/i.test(summary)) return 'appointments';
    return 'other';
  }

  _inferCategoryFromTopic(topic) {
    const topicLower = topic.toLowerCase();
    if (['coding', 'programming', 'ai', 'data', 'business', 'work'].some(t => topicLower.includes(t))) {
      return CATEGORIES.PROFESSIONAL;
    }
    if (['music', 'movie', 'game', 'entertainment', 'fun'].some(t => topicLower.includes(t))) {
      return CATEGORIES.ENTERTAINMENT;
    }
    if (['health', 'fitness', 'workout', 'sleep', 'wellness'].some(t => topicLower.includes(t))) {
      return CATEGORIES.HEALTH;
    }
    if (['art', 'design', 'creative', 'writing'].some(t => topicLower.includes(t))) {
      return CATEGORIES.CREATIVE;
    }
    if (['learn', 'study', 'education', 'course'].some(t => topicLower.includes(t))) {
      return CATEGORIES.LEARNING;
    }
    return CATEGORIES.PERSONAL;
  }

  _capitalizeWords(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  }
}

export const brainMigrationService = new BrainMigrationService();
export default brainMigrationService;
