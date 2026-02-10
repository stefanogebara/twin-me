/**
 * Moltbot Memory Service
 *
 * Implements a four-layer cognitive memory system inspired by human memory:
 *
 * 1. EPISODIC MEMORY - "What happened?"
 *    - Specific events with timestamps
 *    - Platform activities (played song, attended meeting, workout)
 *    - 30-day raw retention, summaries forever
 *
 * 2. SEMANTIC MEMORY - "What do I know?"
 *    - Learned facts divorced from specific events
 *    - "User prefers rock music on Fridays"
 *    - Permanent storage with confidence scores
 *
 * 3. PROCEDURAL MEMORY - "How do I do things?"
 *    - Behavioral patterns and routines
 *    - "Morning routine: coffee → email → music"
 *    - Updated weekly based on observations
 *
 * 4. PREDICTIVE MEMORY - "What will happen?"
 *    - Future behavior forecasts
 *    - "Likely to skip gym tomorrow (low recovery)"
 *    - Recalculated daily
 *
 * Research basis:
 * - MIRIX: Multi-Agent Memory System (arXiv 2507.07957)
 * - M2PA: Multi-Memory Planning Agent (ACL 2025)
 * - IBM AI Agent Memory Architecture
 */

import { getMoltbotClient } from './moltbotClient.js';
import config from '../../config/moltbotConfig.js';
import { createClient } from '@supabase/supabase-js';

// Supabase client for fallback mode
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Detect serverless environment (Vercel, AWS Lambda, etc.)
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Track Moltbot availability for AI operations
// In serverless, default to unavailable (WebSocket connections don't work)
let moltbotAvailable = IS_SERVERLESS ? false : null;

/**
 * Storage Strategy:
 * - Supabase: Primary storage for structured memory data (reliable, queryable)
 * - OpenClaw: AI operations, chat context, pattern inference
 *
 * This hybrid approach ensures data reliability while leveraging OpenClaw's
 * AI capabilities for intelligent memory operations.
 */

class MoltbotMemoryService {
  constructor(userId) {
    if (!userId) {
      throw new Error('userId is required for MoltbotMemoryService');
    }
    this.userId = userId;
    try {
      this.client = getMoltbotClient(userId);
    } catch (e) {
      console.warn('[MoltbotMemory] Failed to create MoltbotClient:', e.message);
      this.client = null;
    }
    // In serverless (Vercel), always use Supabase fallback (WebSocket won't work)
    this.useFallback = !supabase || IS_SERVERLESS;
    this.useOpenClawForAI = !IS_SERVERLESS; // Only use OpenClaw for AI in non-serverless
  }

  /**
   * Check if Moltbot is available, use Supabase fallback if not
   */
  async checkMoltbotAvailability() {
    // In serverless, WebSocket connections are not possible
    if (IS_SERVERLESS) {
      moltbotAvailable = false;
      this.useFallback = true;
      return false;
    }

    if (moltbotAvailable !== null) {
      return moltbotAvailable;
    }

    if (!this.client) {
      moltbotAvailable = false;
      this.useFallback = true;
      return false;
    }

    try {
      // Try to connect with a short timeout (2s for faster failure)
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);

      // Verify connection by calling health
      const health = await this.client.getHealth();
      if (health?.ok) {
        moltbotAvailable = true;
        console.log('[MoltbotMemory] OpenClaw gateway available');
        return true;
      }
      throw new Error('Health check failed');
    } catch (error) {
      moltbotAvailable = false;
      this.useFallback = true;
      console.log('[MoltbotMemory] OpenClaw unavailable, using Supabase fallback:', error.message);
      return false;
    }
  }

  // ============================================
  // EPISODIC MEMORY - Specific Events
  // ============================================

  /**
   * Store a platform event in episodic memory
   * Uses Supabase as primary storage (reliable, queryable)
   * @param {object} event - Event data with platform, type, and details
   */
  async storeEvent(event) {
    const { platform, type, data } = event;

    const key = `${platform}_${type}_${Date.now()}`;
    const enrichedEvent = {
      ...event,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ttl: this.calculateTTL('episodic')
    };

    // Always use Supabase for reliable event storage
    if (supabase) {
      try {
        await supabase.from('realtime_events').insert({
          user_id: this.userId,
          platform: platform || 'unknown',
          event_type: type || 'unknown',
          event_data: data || {},
          context: enrichedEvent,
          occurred_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('[MoltbotMemory] Supabase store error:', err.message);
        // Don't throw - event storage failures shouldn't break the app
      }
    }

    // Check if this event should update semantic knowledge
    await this.checkSemanticUpdate(event).catch(() => {});

    // Check if this event confirms/updates procedural patterns
    await this.checkProceduralUpdate(event).catch(() => {});

    return { key, stored: true };
  }

  /**
   * Get recent events from episodic memory
   * Uses Supabase for reliable, queryable event retrieval
   * @param {object} options - Query options
   */
  async getRecentEvents(options = {}) {
    const {
      platform,
      type,
      limit = 50,
      since,
      until
    } = options;

    if (!supabase) {
      console.warn('[MoltbotMemory] Supabase not configured');
      return [];
    }

    try {
      let query = supabase
        .from('realtime_events')
        .select('*')
        .eq('user_id', this.userId)
        .order('occurred_at', { ascending: false })
        .limit(limit);

      if (platform) query = query.eq('platform', platform);
      if (type) query = query.eq('event_type', type);
      if (since) query = query.gte('occurred_at', since);
      if (until) query = query.lte('occurred_at', until);

      const { data, error } = await query;
      if (error) throw error;

      // Transform to expected format
      return (data || []).map(row => ({
        id: row.id,
        platform: row.platform,
        type: row.event_type,
        data: row.event_data,
        timestamp: row.occurred_at,
        created_at: row.occurred_at
      }));
    } catch (err) {
      console.error('[MoltbotMemory] Query error:', err.message);
      return [];
    }
  }

  /**
   * Summarize episodic events for long-term storage
   * Called periodically to compress old events
   */
  async summarizeEpisodicPeriod(startDate, endDate) {
    // Get all events in the period
    const events = await this.getRecentEvents({
      since: startDate,
      until: endDate,
      limit: 1000
    });

    if (!events || events.length === 0) {
      return null;
    }

    // Group by platform and type
    const grouped = {};
    for (const event of events) {
      const key = `${event.platform}_${event.type}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    }

    // Create summary
    const summary = {
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      byPlatform: {},
      highlights: [],
      patterns: []
    };

    for (const [key, groupEvents] of Object.entries(grouped)) {
      const [platform, type] = key.split('_');

      if (!summary.byPlatform[platform]) {
        summary.byPlatform[platform] = {};
      }

      summary.byPlatform[platform][type] = {
        count: groupEvents.length,
        first: groupEvents[groupEvents.length - 1].timestamp,
        last: groupEvents[0].timestamp
      };
    }

    // Store summary in semantic memory (permanent)
    const summaryKey = `period_summary_${startDate}_${endDate}`;
    await this.learnFact('activity_summaries', {
      key: summaryKey,
      summary
    }, 1.0);

    return summary;
  }

  // ============================================
  // SEMANTIC MEMORY - Learned Facts
  // ============================================

  /**
   * Learn or update a fact in semantic memory
   * @param {string} category - Fact category
   * @param {object} fact - Fact data with a unique key
   * @param {number} confidence - Confidence score (0-1)
   */
  async learnFact(category, fact, confidence = 0.5) {
    if (confidence < config.memory.semantic.minConfidence) {
      console.log(`[Memory] Skipping low-confidence fact: ${fact.key} (${confidence})`);
      return { stored: false, reason: 'Below confidence threshold' };
    }

    const factKey = `${category}_${fact.key}`;

    // Check for existing fact
    const existing = await this.client.queryMemory('semantic', {
      userId: this.userId,
      key: factKey
    }).catch(() => null);

    if (existing && existing.length > 0) {
      // Bayesian update of confidence
      const existingFact = existing[0];
      const newConfidence = this.bayesianConfidenceUpdate(
        existingFact.confidence,
        confidence
      );

      await this.client.storeMemory('semantic', factKey, {
        ...existingFact,
        ...fact,
        confidence: newConfidence,
        observationCount: (existingFact.observationCount || 1) + 1,
        lastConfirmed: new Date().toISOString()
      });

      return { stored: true, updated: true, confidence: newConfidence };
    }

    // Store new fact
    await this.client.storeMemory('semantic', factKey, {
      userId: this.userId,
      category,
      ...fact,
      confidence,
      observationCount: 1,
      learnedAt: new Date().toISOString(),
      lastConfirmed: new Date().toISOString()
    });

    return { stored: true, updated: false, confidence };
  }

  /**
   * Query semantic facts
   */
  async queryFacts(category, options = {}) {
    // Check Moltbot availability on first call
    if (moltbotAvailable === null) {
      await this.checkMoltbotAvailability();
    }

    if (this.useFallback && supabase) {
      // Use Supabase fallback - query behavioral_patterns as semantic memory
      try {
        let query = supabase
          .from('behavioral_patterns')
          .select('*')
          .eq('user_id', this.userId)
          .order('last_confirmed', { ascending: false })
          .limit(options.limit || 100);

        if (category) query = query.eq('category', category);
        if (options.minConfidence) query = query.gte('confidence', options.minConfidence);

        const { data, error } = await query;
        if (error) throw error;

        // Transform to expected format
        return (data || []).map(row => ({
          id: row.id,
          category: row.category,
          fact: row.pattern_data,
          confidence: row.confidence,
          updated_at: row.last_confirmed
        }));
      } catch (err) {
        console.error('[MoltbotMemory] Supabase facts query error:', err.message);
        return [];
      }
    }

    // Use Moltbot
    const query = {
      userId: this.userId
    };

    if (category) {
      query.category = category;
    }

    if (options.minConfidence) {
      query.minConfidence = options.minConfidence;
    }

    try {
      return await this.client.queryMemory('semantic', {
        ...query,
        limit: options.limit || 100
      });
    } catch (err) {
      console.warn('[MoltbotMemory] Moltbot facts query failed, switching to fallback');
      this.useFallback = true;
      moltbotAvailable = false;
      return this.queryFacts(category, options); // Retry with fallback
    }
  }

  /**
   * Get a specific fact by key
   */
  async getFact(category, factKey) {
    const key = `${category}_${factKey}`;
    const results = await this.client.queryMemory('semantic', {
      userId: this.userId,
      key
    });
    return results?.[0] || null;
  }

  /**
   * Bayesian confidence update
   * Increases confidence when fact is reobserved
   */
  bayesianConfidenceUpdate(priorConfidence, newEvidence) {
    // Simple Bayesian update
    // P(H|E) = P(E|H) * P(H) / P(E)
    // Simplified: weighted average biased toward confirmation
    const confirmationWeight = 0.3;
    const newConfidence = priorConfidence + (confirmationWeight * (newEvidence - priorConfidence));
    return Math.min(0.99, Math.max(0.01, newConfidence));
  }

  // ============================================
  // PROCEDURAL MEMORY - Behavioral Patterns
  // ============================================

  /**
   * Store or update a procedural pattern
   * @param {string} patternName - Unique pattern identifier
   * @param {object} pattern - Pattern definition
   */
  async updateProcedure(patternName, pattern) {
    const key = `${this.userId}_${patternName}`;

    // Get existing pattern
    const existing = await this.client.queryMemory('procedural', {
      userId: this.userId,
      key
    }).catch(() => null);

    const executionCount = (existing?.[0]?.executionCount || 0) + 1;

    await this.client.storeMemory('procedural', key, {
      userId: this.userId,
      name: patternName,
      ...pattern,
      executionCount,
      lastUpdated: new Date().toISOString(),
      confidence: this.calculatePatternConfidence(executionCount, pattern.observationWindow)
    });

    return { stored: true, executionCount };
  }

  /**
   * Get all procedural patterns
   */
  async getProcedures(options = {}) {
    return this.client.queryMemory('procedural', {
      userId: this.userId,
      minConfidence: options.minConfidence || 0.3,
      limit: options.limit || 50
    });
  }

  /**
   * Get a specific procedure
   */
  async getProcedure(patternName) {
    const key = `${this.userId}_${patternName}`;
    const results = await this.client.queryMemory('procedural', {
      userId: this.userId,
      key
    });
    return results?.[0] || null;
  }

  /**
   * Detect patterns from episodic events
   * Called periodically to update procedural memory
   */
  async detectPatterns(timeWindow = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    const since = new Date(Date.now() - timeWindow).toISOString();
    const events = await this.getRecentEvents({ since, limit: 500 });

    if (!events || events.length < config.memory.procedural.minObservations) {
      return { patterns: [], message: 'Insufficient data for pattern detection' };
    }

    const detectedPatterns = [];

    // Detect time-based patterns
    const timePatterns = this.detectTimePatterns(events);
    detectedPatterns.push(...timePatterns);

    // Detect sequence patterns
    const sequencePatterns = this.detectSequencePatterns(events);
    detectedPatterns.push(...sequencePatterns);

    // Store detected patterns
    for (const pattern of detectedPatterns) {
      await this.updateProcedure(pattern.name, pattern);
    }

    return { patterns: detectedPatterns };
  }

  /**
   * Detect time-based patterns (e.g., "listens to music at 8am")
   */
  detectTimePatterns(events) {
    const patterns = [];
    const timeGroups = {};

    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      const dayOfWeek = new Date(event.timestamp).getDay();
      const key = `${event.platform}_${event.type}_hour_${hour}`;

      if (!timeGroups[key]) {
        timeGroups[key] = { count: 0, days: new Set() };
      }
      timeGroups[key].count++;
      timeGroups[key].days.add(dayOfWeek);
    }

    for (const [key, data] of Object.entries(timeGroups)) {
      if (data.count >= config.memory.procedural.minObservations) {
        const [platform, type, _, hour] = key.split('_');
        patterns.push({
          name: key,
          type: 'time_based',
          platform,
          eventType: type,
          hour: parseInt(hour),
          frequency: data.count,
          daysObserved: Array.from(data.days),
          observationWindow: '7d'
        });
      }
    }

    return patterns;
  }

  /**
   * Detect sequence patterns (e.g., "checks calendar before meetings")
   */
  detectSequencePatterns(events) {
    // Simplified sequence detection
    // In production, would use more sophisticated pattern mining
    return [];
  }

  /**
   * Calculate pattern confidence based on observations
   */
  calculatePatternConfidence(observations, window) {
    const minObs = config.memory.procedural.minObservations;
    const maxObs = minObs * 10;
    const normalized = Math.min(1, (observations - minObs) / (maxObs - minObs));
    return 0.3 + (0.6 * normalized); // Range: 0.3 to 0.9
  }

  // ============================================
  // PREDICTIVE MEMORY - Future Forecasts
  // ============================================

  /**
   * Store a prediction
   * @param {string} predictionType - Type of prediction
   * @param {object} prediction - Prediction data
   */
  async updatePrediction(predictionType, prediction) {
    const key = `${this.userId}_${predictionType}`;

    const expiresAt = prediction.expiresAt ||
      new Date(Date.now() + config.memory.predictive.expirationHours * 60 * 60 * 1000).toISOString();

    await this.client.storeMemory('predictive', key, {
      userId: this.userId,
      type: predictionType,
      ...prediction,
      confidence: prediction.confidence || 0.5,
      basedOn: prediction.evidence || [],
      generatedAt: new Date().toISOString(),
      expiresAt
    });

    return { stored: true, expiresAt };
  }

  /**
   * Get predictions
   */
  async getPredictions(options = {}) {
    const now = new Date().toISOString();

    return this.client.queryMemory('predictive', {
      userId: this.userId,
      notExpired: true, // Filter expired predictions
      minConfidence: options.minConfidence || 0.3,
      limit: options.limit || 20
    });
  }

  /**
   * Generate predictions based on patterns and current context
   */
  async generatePredictions(context = {}) {
    const predictions = [];

    // Get current patterns
    const patterns = await this.getProcedures({ minConfidence: 0.5 });

    // Get recent semantic facts
    const facts = await this.queryFacts(null, { minConfidence: 0.6 });

    // Generate predictions based on patterns
    for (const pattern of patterns || []) {
      if (pattern.type === 'time_based') {
        const prediction = this.generateTimeBasedPrediction(pattern, context);
        if (prediction) {
          predictions.push(prediction);
        }
      }
    }

    // Store predictions
    for (const prediction of predictions) {
      await this.updatePrediction(prediction.type, prediction);
    }

    return predictions;
  }

  /**
   * Generate prediction from time-based pattern
   */
  generateTimeBasedPrediction(pattern, context) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Check if pattern applies to current day
    if (pattern.daysObserved && !pattern.daysObserved.includes(currentDay)) {
      return null;
    }

    // If pattern hour is upcoming today
    if (pattern.hour > currentHour) {
      return {
        type: `will_${pattern.eventType}_${pattern.platform}`,
        platform: pattern.platform,
        eventType: pattern.eventType,
        predictedTime: new Date(now.setHours(pattern.hour, 0, 0, 0)).toISOString(),
        confidence: pattern.confidence || 0.5,
        evidence: [`Pattern observed ${pattern.frequency} times`],
        expiresAt: new Date(now.setHours(23, 59, 59, 999)).toISOString()
      };
    }

    return null;
  }

  // ============================================
  // Cross-Memory Operations
  // ============================================

  /**
   * Check if episodic event should update semantic memory
   */
  async checkSemanticUpdate(event) {
    // Define rules for semantic updates
    const semanticRules = {
      spotify_track_played: (e) => ({
        category: 'music_preferences',
        fact: {
          key: `genre_${e.data?.genre || 'unknown'}`,
          genre: e.data?.genre,
          lastPlayed: e.timestamp
        },
        confidence: 0.4
      }),
      whoop_recovery_updated: (e) => ({
        category: 'health_patterns',
        fact: {
          key: 'typical_recovery',
          avgRecovery: e.data?.recovery,
          lastUpdated: e.timestamp
        },
        confidence: 0.5
      }),
      calendar_event_attended: (e) => ({
        category: 'schedule_patterns',
        fact: {
          key: `typical_${e.data?.eventType || 'meeting'}_time`,
          eventType: e.data?.eventType,
          typicalHour: new Date(e.timestamp).getHours()
        },
        confidence: 0.3
      })
    };

    const ruleKey = `${event.platform}_${event.type}`;
    const rule = semanticRules[ruleKey];

    if (rule) {
      const { category, fact, confidence } = rule(event);
      await this.learnFact(category, fact, confidence);
    }
  }

  /**
   * Check if episodic event should update procedural memory
   */
  async checkProceduralUpdate(event) {
    // Track event for pattern detection
    // Pattern detection runs periodically, but we can increment counters immediately
    const hourKey = `${event.platform}_${event.type}_hour_${new Date(event.timestamp).getHours()}`;

    // This would update pattern observation counters
    // Full pattern detection runs via detectPatterns()
  }

  /**
   * Get memory context for chat/AI operations
   * Combines Supabase data retrieval with OpenClaw AI processing
   */
  async getMemoryContext(query, options = {}) {
    const context = {
      relevant_memories: [],
      current_patterns: [],
      predictions: [],
      facts: [],
      ai_summary: null
    };

    // Get relevant episodic memories from Supabase
    context.relevant_memories = await this.getRecentEvents({
      limit: options.episodicLimit || 10
    });

    // Get current patterns from Supabase
    context.current_patterns = await this.getProcedures({
      minConfidence: 0.5,
      limit: options.proceduralLimit || 10
    }).catch(() => []);

    // Get active predictions
    context.predictions = await this.getPredictions({
      minConfidence: 0.4,
      limit: options.predictiveLimit || 5
    }).catch(() => []);

    // Get relevant facts from Supabase
    context.facts = await this.queryFacts(null, {
      minConfidence: 0.5,
      limit: options.semanticLimit || 20
    });

    // Use OpenClaw to generate an AI summary if available
    if (this.useOpenClawForAI && options.generateSummary) {
      try {
        await this.checkMoltbotAvailability();
        if (moltbotAvailable) {
          context.ai_summary = await this.generateAIMemorySummary(context, query);
        }
      } catch (err) {
        console.warn('[MoltbotMemory] AI summary generation failed:', err.message);
      }
    }

    return context;
  }

  /**
   * Use OpenClaw AI to generate intelligent memory summary
   * This provides contextual understanding of raw memory data
   */
  async generateAIMemorySummary(context, userQuery) {
    if (!moltbotAvailable) return null;

    const prompt = `Based on the following user memory context, provide a brief summary relevant to their query.

User Query: "${userQuery || 'general context'}"

Recent Activity (last ${context.relevant_memories.length} events):
${JSON.stringify(context.relevant_memories.slice(0, 5), null, 2)}

Known Facts:
${JSON.stringify(context.facts.slice(0, 5), null, 2)}

Behavioral Patterns:
${JSON.stringify(context.current_patterns.slice(0, 3), null, 2)}

Provide a 2-3 sentence summary of relevant context. Be concise and focus on what's most relevant to the query.`;

    try {
      const response = await this.client.runAgent(prompt, {
        sessionKey: `memory_summary_${this.userId}`
      });
      return response;
    } catch (err) {
      console.warn('[MoltbotMemory] AI summary failed:', err.message);
      return null;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Calculate TTL for memory entries
   */
  calculateTTL(layer) {
    switch (layer) {
      case 'episodic':
        return Date.now() + (config.memory.episodic.rawRetentionDays * 24 * 60 * 60 * 1000);
      case 'predictive':
        return Date.now() + (config.memory.predictive.expirationHours * 60 * 60 * 1000);
      default:
        return null; // No expiration
    }
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpiredMemories() {
    // This would be called by a scheduled job
    // Removes episodic events past retention, expired predictions
    console.log(`[Memory] Cleanup for user ${this.userId}`);

    // Implementation would query and delete expired entries
    return { cleaned: true };
  }
}

/**
 * Factory function to get memory service for a user
 */
export function getMemoryService(userId) {
  return new MoltbotMemoryService(userId);
}

export { MoltbotMemoryService };
export default MoltbotMemoryService;
