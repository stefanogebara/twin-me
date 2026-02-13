/**
 * Neo4j Graph Database Service
 *
 * Manages heterogeneous user behavior graph for GNN-based pattern detection.
 * Handles connections, node/edge creation, and graph queries.
 *
 * Graph Schema:
 * - Nodes: User, CalendarEvent, MusicActivity, Playlist, Context, EventType
 * - Edges: HAS_EVENT, PERFORMS_ACTIVITY, PRECEDES, CONTAINS, TRIGGERS, CORRELATES_WITH
 */

import neo4j from 'neo4j-driver';

class Neo4jGraphService {
  constructor() {
    this.driver = null;
    this.isConnected = false;
  }

  /**
   * Initialize Neo4j connection
   */
  async connect() {
    try {
      const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
      const user = process.env.NEO4J_USER || 'neo4j';
      const password = process.env.NEO4J_PASSWORD || 'password';

      console.log('🔌 Connecting to Neo4j at', uri);

      this.driver = neo4j.driver(
        uri,
        neo4j.auth.basic(user, password),
        {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
        }
      );

      // Verify connection
      await this.driver.verifyConnectivity();
      this.isConnected = true;

      console.log('✅ Connected to Neo4j successfully');

      // Create indexes for performance
      await this.createIndexes();

      return true;
    } catch (error) {
      console.error('❌ Neo4j connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Create database indexes for performance
   */
  async createIndexes() {
    const session = this.driver.session();
    try {
      // User ID index
      await session.run(`
        CREATE INDEX IF NOT EXISTS user_id_index
        FOR (u:User) ON (u.id)
      `);

      // Calendar event index
      await session.run(`
        CREATE INDEX IF NOT EXISTS event_timestamp_index
        FOR (e:CalendarEvent) ON (e.start_timestamp)
      `);

      // Music activity index
      await session.run(`
        CREATE INDEX IF NOT EXISTS activity_timestamp_index
        FOR (m:MusicActivity) ON (m.timestamp)
      `);

      console.log('✅ Neo4j indexes created');
    } finally {
      await session.close();
    }
  }

  /**
   * Close Neo4j connection
   */
  async close() {
    if (this.driver) {
      await this.driver.close();
      this.isConnected = false;
      console.log('🔌 Neo4j connection closed');
    }
  }

  /**
   * Create or update user node
   */
  async createUserNode(userId, properties = {}) {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MERGE (u:User {id: $userId})
        SET u.created_at = CASE WHEN u.created_at IS NULL THEN datetime() ELSE u.created_at END,
            u.updated_at = datetime(),
            u += $properties
        RETURN u
      `, { userId, properties });

      return result.records[0]?.get('u').properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Create calendar event node
   */
  async createCalendarEventNode(userId, eventData) {
    const session = this.driver.session();
    try {
      const {
        eventId,
        summary,
        description,
        startTime,
        endTime,
        importance,
        attendeeCount,
        duration,
        eventType
      } = eventData;

      const result = await session.run(`
        MATCH (u:User {id: $userId})
        MERGE (e:CalendarEvent {id: $eventId})
        SET e.summary = $summary,
            e.description = $description,
            e.start_timestamp = datetime($startTime),
            e.end_timestamp = datetime($endTime),
            e.importance_score = $importance,
            e.attendee_count = $attendeeCount,
            e.duration_minutes = $duration,
            e.created_at = CASE WHEN e.created_at IS NULL THEN datetime() ELSE e.created_at END,
            e.updated_at = datetime()
        MERGE (u)-[:HAS_EVENT]->(e)

        // Create or update event type
        MERGE (et:EventType {name: $eventType})
        MERGE (e)-[:IS_TYPE]->(et)

        RETURN e
      `, {
        userId,
        eventId,
        summary,
        description,
        startTime,
        endTime,
        importance: importance || 50,
        attendeeCount: attendeeCount || 0,
        duration: duration || 60,
        eventType: eventType || 'general'
      });

      return result.records[0]?.get('e').properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Create music activity node with temporal edges to calendar events
   */
  async createMusicActivityNode(userId, activityData) {
    const session = this.driver.session();
    try {
      const {
        activityId,
        trackName,
        artist,
        album,
        genre,
        timestamp,
        audioFeatures = {}
      } = activityData;

      // Create music activity node
      await session.run(`
        MATCH (u:User {id: $userId})
        MERGE (m:MusicActivity {id: $activityId})
        SET m.track_name = $trackName,
            m.artist = $artist,
            m.album = $album,
            m.genre = $genre,
            m.timestamp = datetime($timestamp),
            m.energy = $energy,
            m.valence = $valence,
            m.tempo = $tempo,
            m.created_at = CASE WHEN m.created_at IS NULL THEN datetime() ELSE m.created_at END,
            m.updated_at = datetime()
        MERGE (u)-[:PERFORMS_ACTIVITY]->(m)
        RETURN m
      `, {
        userId,
        activityId,
        trackName,
        artist,
        album,
        genre,
        timestamp,
        energy: audioFeatures.energy || 0.5,
        valence: audioFeatures.valence || 0.5,
        tempo: audioFeatures.tempo || 120
      });

      // Find calendar events that this activity precedes
      // Activity 10-30 minutes before event = potential pattern
      const precedesResult = await session.run(`
        MATCH (u:User {id: $userId})
        MATCH (u)-[:HAS_EVENT]->(e:CalendarEvent)
        MATCH (u)-[:PERFORMS_ACTIVITY]->(m:MusicActivity {id: $activityId})

        WHERE duration.between(
          m.timestamp,
          e.start_timestamp
        ).minutes > 10
        AND duration.between(
          m.timestamp,
          e.start_timestamp
        ).minutes < 30

        MERGE (m)-[r:PRECEDES]->(e)
        SET r.time_offset_minutes = duration.between(m.timestamp, e.start_timestamp).minutes

        RETURN e, r.time_offset_minutes as offset
      `, { userId, activityId });

      const precedingEvents = precedesResult.records.map(record => ({
        event: record.get('e').properties,
        timeOffsetMinutes: record.get('offset')
      }));

      return {
        activity: activityData,
        precedingEvents
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Detect temporal patterns using Cypher queries
   * Returns patterns like "user listens to lo-fi 20 minutes before presentations"
   */
  async detectTemporalPatterns(userId, options = {}) {
    const session = this.driver.session();
    try {
      const {
        minOccurrences = 3,
        minConfidence = 0.7,
        timeWindowMinutes = 30
      } = options;

      // Find recurring pattern: music genre → event type correlation
      const result = await session.run(`
        MATCH (u:User {id: $userId})
        MATCH (u)-[:PERFORMS_ACTIVITY]->(m:MusicActivity)
        MATCH (u)-[:HAS_EVENT]->(e:CalendarEvent)
        MATCH (e)-[:IS_TYPE]->(et:EventType)
        MATCH (m)-[p:PRECEDES]->(e)

        WHERE p.time_offset_minutes > 10 AND p.time_offset_minutes < $timeWindowMinutes

        WITH
          m.genre as genre,
          et.name as eventType,
          avg(p.time_offset_minutes) as avgOffset,
          count(*) as occurrences,
          collect(e.summary) as eventSummaries,
          avg(m.energy) as avgEnergy,
          avg(m.valence) as avgValence

        WHERE occurrences >= $minOccurrences

        RETURN
          genre,
          eventType,
          occurrences,
          avgOffset,
          avgEnergy,
          avgValence,
          eventSummaries

        ORDER BY occurrences DESC
      `, {
        userId,
        minOccurrences,
        timeWindowMinutes
      });

      const patterns = result.records.map(record => {
        const occurrences = record.get('occurrences').toNumber();
        const avgOffset = record.get('avgOffset');

        // Calculate confidence based on frequency and consistency
        const frequency = Math.min(occurrences / 10, 1); // Normalize to 0-1
        const confidence = frequency * 0.6 + 0.4; // Base confidence + frequency boost

        return {
          pattern_type: 'temporal_music_before_event',
          trigger: {
            type: 'calendar_event',
            event_type: record.get('eventType')
          },
          response: {
            type: 'music_activity',
            genre: record.get('genre'),
            avg_energy: record.get('avgEnergy'),
            avg_valence: record.get('avgValence')
          },
          time_offset_minutes: Math.round(avgOffset),
          occurrence_count: occurrences,
          confidence_score: Math.round(confidence * 100),
          example_events: record.get('eventSummaries').slice(0, 3)
        };
      });

      return patterns.filter(p => p.confidence_score >= minConfidence * 100);
    } finally {
      await session.close();
    }
  }

  /**
   * Build complete heterogeneous graph from user's calendar and music data
   */
  async buildUserBehaviorGraph(userId, options = {}) {
    const {
      lookbackDays = 90,
      includeMusicActivities = true,
      includeCalendarEvents = true
    } = options;

    console.log(`📊 Building behavior graph for user ${userId} (${lookbackDays} days)`);

    try {
      // Create user node
      await this.createUserNode(userId);

      const stats = {
        calendarEvents: 0,
        musicActivities: 0,
        precedesEdges: 0,
        patterns: []
      };

      // TODO: Integrate with existing calendar and music extraction services
      // This will be connected to:
      // - api/services/calendar-extractor.js
      // - api/services/spotifyEnhancedExtractor.js
      // - api/services/youtubeEnhancedExtractor.js

      console.log('✅ Behavior graph built:', stats);

      return stats;
    } catch (error) {
      console.error('❌ Error building behavior graph:', error);
      throw error;
    }
  }

  /**
   * Get graph statistics for a user
   */
  async getUserGraphStats(userId) {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (u:User {id: $userId})
        OPTIONAL MATCH (u)-[:HAS_EVENT]->(e:CalendarEvent)
        OPTIONAL MATCH (u)-[:PERFORMS_ACTIVITY]->(m:MusicActivity)
        OPTIONAL MATCH (m)-[p:PRECEDES]->(e2:CalendarEvent)

        RETURN
          count(DISTINCT e) as eventCount,
          count(DISTINCT m) as activityCount,
          count(DISTINCT p) as precedesCount
      `, { userId });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        userId,
        calendarEvents: record.get('eventCount').toNumber(),
        musicActivities: record.get('activityCount').toNumber(),
        precedesEdges: record.get('precedesCount').toNumber(),
        isConnected: this.isConnected
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Export graph data for GNN training
   * Returns node features and edge index in PyTorch Geometric format
   */
  async exportGraphForGNN(userId) {
    const session = this.driver.session();
    try {
      // Get all nodes with features
      const nodesResult = await session.run(`
        MATCH (u:User {id: $userId})
        OPTIONAL MATCH (u)-[:HAS_EVENT]->(e:CalendarEvent)
        OPTIONAL MATCH (u)-[:PERFORMS_ACTIVITY]->(m:MusicActivity)

        WITH collect(DISTINCT {
          id: e.id,
          type: 'CalendarEvent',
          features: [
            e.importance_score,
            e.attendee_count,
            e.duration_minutes
          ]
        }) as events,
        collect(DISTINCT {
          id: m.id,
          type: 'MusicActivity',
          features: [
            m.energy,
            m.valence,
            m.tempo / 200.0  // Normalize tempo
          ]
        }) as activities

        RETURN events, activities
      `, { userId });

      // Get all edges
      const edgesResult = await session.run(`
        MATCH (u:User {id: $userId})
        MATCH (m:MusicActivity)-[p:PRECEDES]->(e:CalendarEvent)
        WHERE (u)-[:PERFORMS_ACTIVITY]->(m) AND (u)-[:HAS_EVENT]->(e)

        RETURN
          m.id as sourceId,
          e.id as targetId,
          'PRECEDES' as edgeType,
          p.time_offset_minutes as timeOffset
      `, { userId });

      const record = nodesResult.records[0];
      const events = record.get('events');
      const activities = record.get('activities');

      const nodes = [...events, ...activities];
      const edges = edgesResult.records.map(r => ({
        source: r.get('sourceId'),
        target: r.get('targetId'),
        type: r.get('edgeType'),
        timeOffset: r.get('timeOffset')
      }));

      return {
        nodes,
        edges,
        metadata: {
          userId,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          exportedAt: new Date().toISOString()
        }
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.driver) {
        return { healthy: false, error: 'Driver not initialized' };
      }

      await this.driver.verifyConnectivity();

      return {
        healthy: true,
        isConnected: this.isConnected,
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
const neo4jGraphService = new Neo4jGraphService();

export default neo4jGraphService;
