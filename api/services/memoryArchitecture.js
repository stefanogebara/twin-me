/**
 * Three-Tier Memory Architecture (Inspired by Cofounder.co)
 * =========================================================
 *
 * WORKING MEMORY: Session-level context (active conversation)
 * CORE MEMORY: Learned preferences and patterns (short-term across sessions)
 * LONG-TERM MEMORY: Aggregated soul signature (durable knowledge)
 */

import { supabaseAdmin } from './database.js';
import Anthropic from '@anthropic-ai/sdk';
import patternLearningService from './patternLearningService.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * WORKING MEMORY - Session-level
 * Maintains active conversation context, recent tool results, scratchpad
 */
export class WorkingMemory {
  constructor(sessionId, userId) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.context = [];
    this.scratchpad = '';
    this.maxContextLength = 50; // messages
  }

  /**
   * Add message to working memory
   */
  async addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: new Date().toISOString()
    };

    this.context.push(message);

    // Archive old messages if context is too long
    if (this.context.length > this.maxContextLength) {
      await this.archiveOldMessages();
    }

    // Persist to database
    await this.save();

    return message;
  }

  /**
   * Update scratchpad (for notes, findings, progress)
   */
  async updateScratchpad(note) {
    this.scratchpad += `\n[${new Date().toISOString()}] ${note}`;
    await this.save();
  }

  /**
   * Archive older messages to reduce context size
   */
  async archiveOldMessages() {
    const messagesToArchive = this.context.splice(0, this.context.length - this.maxContextLength);

    // Store archived messages
    const { error } = await supabaseAdmin
      .from('working_memory_archive')
      .insert({
        session_id: this.sessionId,
        user_id: this.userId,
        archived_messages: messagesToArchive,
        archived_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error archiving messages:', error);
    }
  }

  /**
   * Save working memory to database
   */
  async save() {
    const { error } = await supabaseAdmin
      .from('working_memory')
      .upsert({
        session_id: this.sessionId,
        user_id: this.userId,
        context: this.context,
        scratchpad: this.scratchpad,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      });

    if (error) {
      console.error('Error saving working memory:', error);
      throw new Error('Failed to save working memory');
    }
  }

  /**
   * Load working memory from database
   */
  async load() {
    const { data, error } = await supabaseAdmin
      .from('working_memory')
      .select('*')
      .eq('session_id', this.sessionId)
      .single();

    if (error && error.code !== 'PGRST116') { // Ignore not found error
      console.error('Error loading working memory:', error);
      return;
    }

    if (data) {
      this.context = data.context || [];
      this.scratchpad = data.scratchpad || '';
    }
  }

  /**
   * Get current context for AI
   */
  getContext() {
    return this.context;
  }

  /**
   * Clear session (end conversation)
   */
  async clear() {
    await supabaseAdmin
      .from('working_memory')
      .delete()
      .eq('session_id', this.sessionId);

    this.context = [];
    this.scratchpad = '';
  }
}

/**
 * CORE MEMORY - Short-term across sessions
 * Learns user preferences, communication style, patterns
 */
export class CoreMemory {
  constructor(userId) {
    this.userId = userId;
    this.preferences = {};
  }

  /**
   * Extract preferences from conversation history using Claude
   */
  async extractPreferencesFromConversation(messages) {
    try {
      const conversationText = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Analyze this conversation and extract user preferences, communication style, and behavioral patterns. Return as JSON:

{
  "communication_style": "description",
  "preferences": ["preference1", "preference2"],
  "behavioral_patterns": ["pattern1", "pattern2"],
  "confidence_score": 0.0-1.0
}

Conversation:
${conversationText}`
        }]
      });

      const preferences = JSON.parse(response.content[0].text);

      // Store in core memory
      await this.updatePreference('extracted_from_conversation', preferences, preferences.confidence_score);

      return preferences;
    } catch (error) {
      console.error('Error extracting preferences:', error);
      return null;
    }
  }

  /**
   * Update a specific preference
   */
  async updatePreference(preferenceType, preferenceData, confidenceScore = 1.0) {
    const { error } = await supabaseAdmin
      .from('core_memory')
      .upsert({
        user_id: this.userId,
        preference_type: preferenceType,
        preference_data: preferenceData,
        confidence_score: confidenceScore,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id,preference_type'
      });

    if (error) {
      console.error('Error updating preference:', error);
      throw new Error('Failed to update preference');
    }

    this.preferences[preferenceType] = preferenceData;
  }

  /**
   * Get all preferences for user
   */
  async loadPreferences() {
    const { data, error } = await supabaseAdmin
      .from('core_memory')
      .select('*')
      .eq('user_id', this.userId);

    if (error) {
      console.error('Error loading preferences:', error);
      return;
    }

    if (data) {
      data.forEach(pref => {
        this.preferences[pref.preference_type] = pref.preference_data;
      });
    }

    return this.preferences;
  }

  /**
   * Get specific preference
   */
  async getPreference(preferenceType) {
    if (!this.preferences[preferenceType]) {
      await this.loadPreferences();
    }

    return this.preferences[preferenceType];
  }

  /**
   * Create conversation summary for core memory
   */
  async createConversationSummary(messages) {
    try {
      const conversationText = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Create a concise summary of this conversation highlighting key topics, decisions, and insights. Keep it under 200 words:

${conversationText}`
        }]
      });

      const summary = response.content[0].text;

      // Store summary in core memory
      await supabaseAdmin
        .from('conversation_summaries')
        .insert({
          user_id: this.userId,
          summary,
          message_count: messages.length,
          created_at: new Date().toISOString()
        });

      return summary;
    } catch (error) {
      console.error('Error creating summary:', error);
      return null;
    }
  }
}

/**
 * LONG-TERM MEMORY - Soul Signature
 * Aggregated essence from all connected platforms
 */
export class LongTermMemory {
  constructor(userId) {
    this.userId = userId;
    this.soulSignature = {};
  }

  /**
   * Consolidate data from multiple platforms into soul signature
   */
  async consolidateSoulSignature(platformData) {
    try {
      // Use Claude to synthesize soul signature from platform data
      const platformSummary = Object.entries(platformData)
        .map(([platform, data]) => `${platform}: ${JSON.stringify(data).substring(0, 500)}`)
        .join('\n\n');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Analyze this user's data from multiple platforms and create a comprehensive soul signature. Extract:

1. Personality traits (Big Five: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism)
2. Interests and passions
3. Behavioral patterns
4. Communication style
5. Values and beliefs
6. Unique characteristics

Return as structured JSON.

Platform Data:
${platformSummary}`
        }]
      });

      const soulSignature = JSON.parse(response.content[0].text);

      // Store in long-term memory
      const { error } = await supabaseAdmin
        .from('long_term_memory')
        .upsert({
          user_id: this.userId,
          soul_signature: soulSignature,
          data_sources: Object.keys(platformData),
          last_consolidated: new Date().toISOString(),
          consolidation_version: Date.now()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error storing soul signature:', error);
        throw new Error('Failed to store soul signature');
      }

      this.soulSignature = soulSignature;
      return soulSignature;
    } catch (error) {
      console.error('Error consolidating soul signature:', error);
      throw error;
    }
  }

  /**
   * Load soul signature from database
   */
  async loadSoulSignature() {
    const { data, error } = await supabaseAdmin
      .from('long_term_memory')
      .select('*')
      .eq('user_id', this.userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading soul signature:', error);
      return null;
    }

    if (data) {
      this.soulSignature = data.soul_signature;
    }

    return this.soulSignature;
  }

  /**
   * Update specific life cluster in soul signature
   */
  async updateLifeCluster(clusterName, clusterData, privacyLevel = 50) {
    const soulSignature = await this.loadSoulSignature() || {};

    // Update the specific cluster
    soulSignature.life_clusters = soulSignature.life_clusters || {};
    soulSignature.life_clusters[clusterName] = {
      data: clusterData,
      privacy_level: privacyLevel,
      last_updated: new Date().toISOString()
    };

    // Save updated soul signature
    const { error } = await supabaseAdmin
      .from('long_term_memory')
      .upsert({
        user_id: this.userId,
        soul_signature: soulSignature,
        last_consolidated: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error updating life cluster:', error);
      throw new Error('Failed to update life cluster');
    }

    return soulSignature;
  }

  /**
   * Hybrid search across long-term memory
   * Considers relevance, recency, and frequency
   */
  async search(query, limit = 10) {
    try {
      // Use Claude to generate search embedding/interpretation
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Given this search query about a user's soul signature, extract key concepts and categories to search for:

Query: "${query}"

Return as JSON array of search terms.`
        }]
      });

      const searchTerms = JSON.parse(response.content[0].text);

      // Search soul_data table with hybrid ranking
      const { data, error } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', this.userId)
        .limit(limit);

      if (error) {
        console.error('Error searching soul data:', error);
        return [];
      }

      // TODO: Implement proper hybrid ranking (relevance + recency + frequency)
      // For now, return most recent data
      return data?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) || [];
    } catch (error) {
      console.error('Error in hybrid search:', error);
      return [];
    }
  }
}

/**
 * Sleep-Time Compute - Background Processing
 * Runs 24/7 to consolidate data and update memory
 */
export class SleepTimeCompute {
  constructor(userId) {
    this.userId = userId;
  }

  /**
   * Run background consolidation
   * Called by scheduled job (e.g., every hour)
   */
  async runConsolidation() {
    console.log(`[Sleep-Time Compute] Running for user ${this.userId}`);

    try {
      // 1. Load all recent platform data
      const { data: platformData, error } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', this.userId)
        .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

      if (error) {
        console.error('Error loading platform data:', error);
        return;
      }

      let consolidatedPlatforms = [];
      let dataPoints = 0;

      if (platformData && platformData.length > 0) {
        // 2. Group by platform
        const groupedData = {};
        platformData.forEach(item => {
          if (!groupedData[item.platform]) {
            groupedData[item.platform] = [];
          }
          groupedData[item.platform].push(item.extracted_insights || item.raw_data);
        });

        // 3. Consolidate into long-term memory
        const longTermMemory = new LongTermMemory(this.userId);
        await longTermMemory.consolidateSoulSignature(groupedData);

        console.log(`[Sleep-Time Compute] Successfully consolidated soul signature for user ${this.userId}`);

        // 4. Update core memory preferences based on recent activity
        const coreMemory = new CoreMemory(this.userId);
        // Extract patterns from recent data...

        consolidatedPlatforms = Object.keys(groupedData);
        dataPoints = platformData.length;
      }

      // 5. Process user feedback and generate personalized insights
      console.log(`[Sleep-Time Compute] Processing feedback for user ${this.userId}`);
      const learningResult = await patternLearningService.processUserFeedback(this.userId);

      return {
        success: true,
        consolidatedPlatforms,
        dataPoints,
        learning: learningResult
      };
    } catch (error) {
      console.error(`[Sleep-Time Compute] Error for user ${this.userId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Schedule sleep-time compute for user
   */
  static async scheduleForUser(userId) {
    const compute = new SleepTimeCompute(userId);
    return await compute.runConsolidation();
  }

  /**
   * Run for all active users (called by cron job)
   */
  static async runForAllUsers() {
    console.log('[Sleep-Time Compute] Running for all users...');

    try {
      // Get all users with recent platform connections
      const { data: users, error } = await supabaseAdmin
        .from('platform_connections')
        .select('user_id')
        .not('connected_at', 'is', null)
        .gt('last_sync_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Active in last 7 days

      if (error) {
        console.error('Error fetching active users:', error);
        return;
      }

      const uniqueUserIds = [...new Set(users.map(u => u.user_id))];
      console.log(`[Sleep-Time Compute] Processing ${uniqueUserIds.length} active users`);

      // Process in batches to avoid overload
      const batchSize = 10;
      for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
        const batch = uniqueUserIds.slice(i, i + batchSize);
        await Promise.all(batch.map(userId => SleepTimeCompute.scheduleForUser(userId)));

        // Small delay between batches
        if (i + batchSize < uniqueUserIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('[Sleep-Time Compute] Completed for all users');
    } catch (error) {
      console.error('[Sleep-Time Compute] Error running for all users:', error);
    }
  }
}

/**
 * Memory Manager - Unified interface
 */
export class MemoryManager {
  constructor(userId, sessionId = null) {
    this.userId = userId;
    this.sessionId = sessionId || `session_${Date.now()}`;

    // Initialize all three memory tiers
    this.workingMemory = new WorkingMemory(this.sessionId, this.userId);
    this.coreMemory = new CoreMemory(this.userId);
    this.longTermMemory = new LongTermMemory(this.userId);
  }

  /**
   * Initialize memory system
   */
  async initialize() {
    await this.workingMemory.load();
    await this.coreMemory.loadPreferences();
    await this.longTermMemory.loadSoulSignature();
  }

  /**
   * Get complete memory context for AI
   */
  async getContextForAI() {
    return {
      workingMemory: this.workingMemory.getContext(),
      coreMemory: this.coreMemory.preferences,
      longTermMemory: this.longTermMemory.soulSignature
    };
  }

  /**
   * Add user message and update memory
   */
  async addUserMessage(content) {
    await this.workingMemory.addMessage('user', content);

    // Optionally extract preferences from user message
    // (This would run less frequently in production)
    return content;
  }

  /**
   * Add assistant message
   */
  async addAssistantMessage(content) {
    await this.workingMemory.addMessage('assistant', content);
    return content;
  }

  /**
   * End session and create summary
   */
  async endSession() {
    const messages = this.workingMemory.getContext();

    // Create conversation summary for core memory
    await this.coreMemory.createConversationSummary(messages);

    // Clear working memory
    await this.workingMemory.clear();
  }
}

export default {
  WorkingMemory,
  CoreMemory,
  LongTermMemory,
  SleepTimeCompute,
  MemoryManager,
  patternLearningService
};
