/**
 * Twins Brain Service
 *
 * Unified knowledge graph service that combines all aspects of the digital twin
 * into an interconnected neural network. Transforms scattered data from multiple
 * sources into a living, evolving representation of the user.
 *
 * Features:
 * - Node management (interests, behaviors, traits, patterns, facts)
 * - Edge connections with relationship types
 * - Temporal snapshots for evolution tracking
 * - Integration with MoltBot, Behavioral Patterns, Claude Sync
 *
 * This file is a thin orchestrator that delegates to domain-specific modules
 * in the brain/ directory.
 */

import { supabaseAdmin } from './database.js';

// Re-export all constants so consumers can import from this file unchanged
export {
  NODE_TYPES,
  CATEGORIES,
  RELATIONSHIP_TYPES,
  CAUSAL_TYPES,
  CORRELATIONAL_TYPES,
  CAUSAL_CONFIDENCE_THRESHOLDS,
  CONTEXT_TYPES,
  CONTEXT_EXPRESSION,
  SOURCE_TYPES,
  DECAY_RATES,
  MIN_CONFIDENCE_FLOOR,
  STALENESS_THRESHOLDS
} from './brain/brainConstants.js';

// Import constants needed internally
import {
  NODE_TYPES,
  CATEGORIES,
  RELATIONSHIP_TYPES,
  SOURCE_TYPES,
  CONTEXT_EXPRESSION
} from './brain/brainConstants.js';

// Import domain modules
import * as nodeOps from './brain/brainNodeOps.js';
import * as temporalDynamics from './brain/brainTemporalDynamics.js';
import * as learning from './brain/brainLearning.js';
import * as edgeOps from './brain/brainEdgeOps.js';
import * as graphQueries from './brain/brainGraphQueries.js';
import * as causal from './brain/brainCausal.js';
import * as contextMethods from './brain/brainContext.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinsBrain');

// ====================================================================
// BRAIN SERVICE CLASS
// ====================================================================

class TwinsBrainService {
  constructor() {
    this.supabase = supabaseAdmin;
  }

  // ------------------------------------------------------------------
  // NODE OPERATIONS
  // ------------------------------------------------------------------

  async addNode(userId, nodeData) {
    return nodeOps.addNode(userId, nodeData, this._logActivity.bind(this));
  }

  async getNode(userId, nodeId) {
    return nodeOps.getNode(userId, nodeId);
  }

  async findNodes(userId, options) {
    return nodeOps.findNodes(userId, options);
  }

  async getAllNodes(userId, options) {
    return nodeOps.getAllNodes(userId, options);
  }

  async updateNodeConfidence(userId, nodeId, delta) {
    return nodeOps.updateNodeConfidence(userId, nodeId, delta);
  }

  async deleteNode(userId, nodeId) {
    return nodeOps.deleteNode(userId, nodeId, this._logActivity.bind(this));
  }

  // ------------------------------------------------------------------
  // TEMPORAL DYNAMICS - PHASE 3
  // ------------------------------------------------------------------

  calculateDecayedConfidence(node) {
    return temporalDynamics.calculateDecayedConfidence(node);
  }

  getNodeFreshness(node) {
    return temporalDynamics.getNodeFreshness(node);
  }

  async reinforceNode(userId, nodeId, options = {}) {
    return temporalDynamics.reinforceNode(userId, nodeId, options, this._logActivity.bind(this));
  }

  async getStaleNodes(userId) {
    return temporalDynamics.getStaleNodes(userId);
  }

  async getNodesWithTemporalInfo(userId) {
    return temporalDynamics.getNodesWithTemporalInfo(userId);
  }

  async reinforceNodesFromPlatform(userId, platform, nodeLabels) {
    return temporalDynamics.reinforceNodesFromPlatform(
      userId,
      platform,
      nodeLabels,
      this.reinforceNode.bind(this)
    );
  }

  // ------------------------------------------------------------------
  // ACTIVE LEARNING & KNOWLEDGE GAPS - PHASE 3
  // ------------------------------------------------------------------

  async identifyKnowledgeGaps(userId) {
    return learning.identifyKnowledgeGaps(userId, {
      getNodesWithTemporalInfo: this.getNodesWithTemporalInfo.bind(this),
      getBrainGraph: this.getBrainGraph.bind(this)
    });
  }

  async generateLearningSuggestions(userId) {
    return learning.generateLearningSuggestions(userId, {
      identifyKnowledgeGapsFn: this.identifyKnowledgeGaps.bind(this)
    });
  }

  // ------------------------------------------------------------------
  // EDGE OPERATIONS
  // ------------------------------------------------------------------

  async connectNodes(userId, fromNodeId, toNodeId, edgeData = {}) {
    return edgeOps.connectNodes(userId, fromNodeId, toNodeId, edgeData, this._logActivity.bind(this));
  }

  async getNodeEdges(userId, nodeId) {
    return edgeOps.getNodeEdges(userId, nodeId);
  }

  async getNeighbors(userId, nodeId, relationshipType = null) {
    return edgeOps.getNeighbors(userId, nodeId, relationshipType);
  }

  // ------------------------------------------------------------------
  // GRAPH QUERIES
  // ------------------------------------------------------------------

  async getBrainGraph(userId, options) {
    return graphQueries.getBrainGraph(userId, options);
  }

  async getBrainHealth(userId) {
    return graphQueries.getBrainHealth(userId);
  }

  async getBrainSummary(userId) {
    return graphQueries.getBrainSummary(userId);
  }

  // ------------------------------------------------------------------
  // SNAPSHOT OPERATIONS
  // ------------------------------------------------------------------

  /**
   * Create a snapshot of the current brain state
   */
  async createSnapshot(userId, snapshotType = 'automatic', notes = null) {
    // Get current graph state
    const { nodes, edges } = await this.getBrainGraph(userId, { minConfidence: 0, minEdgeStrength: 0 });

    // Calculate metrics
    const avgConfidence = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length
      : 0;

    const categoryCount = {};
    nodes.forEach(n => {
      categoryCount[n.category] = (categoryCount[n.category] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    // Get previous snapshot for comparison
    const { data: prevSnapshot, error: prevSnapErr } = await this.supabase
      .from('brain_snapshots')
      .select('node_count, edge_count')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();
    if (prevSnapErr && prevSnapErr.code !== 'PGRST116') log.warn('Failed to fetch previous snapshot:', prevSnapErr.message);

    const nodesAdded = prevSnapshot ? Math.max(0, nodes.length - prevSnapshot.node_count) : nodes.length;
    const nodesRemoved = prevSnapshot ? Math.max(0, prevSnapshot.node_count - nodes.length) : 0;
    const edgesAdded = prevSnapshot ? Math.max(0, edges.length - prevSnapshot.edge_count) : edges.length;
    const edgesRemoved = prevSnapshot ? Math.max(0, prevSnapshot.edge_count - edges.length) : 0;

    // Create snapshot
    const { data, error } = await this.supabase
      .from('brain_snapshots')
      .insert({
        user_id: userId,
        snapshot_date: new Date().toISOString(),
        graph_state: { nodes, edges },
        node_count: nodes.length,
        edge_count: edges.length,
        avg_confidence: avgConfidence,
        top_categories: topCategories,
        snapshot_type: snapshotType,
        notes,
        nodes_added: nodesAdded,
        nodes_removed: nodesRemoved,
        edges_added: edgesAdded,
        edges_removed: edgesRemoved
      })
      .select()
      .single();

    if (error) throw error;

    await this._logActivity(userId, 'snapshot_taken', 'snapshot', data.id, {
      node_count: nodes.length,
      edge_count: edges.length
    });

    log.info(`Created snapshot: ${nodes.length} nodes, ${edges.length} edges`);
    return data;
  }

  /**
   * Get snapshots for time-travel queries
   */
  async getSnapshots(userId, { limit = 10, snapshotType } = {}) {
    let query = this.supabase
      .from('brain_snapshots')
      .select('id, snapshot_date, node_count, edge_count, avg_confidence, top_categories, snapshot_type, notes, nodes_added, nodes_removed')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(limit);

    if (snapshotType) {
      query = query.eq('snapshot_type', snapshotType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  /**
   * Get a specific snapshot's full graph state
   */
  async getSnapshotGraph(userId, snapshotId) {
    const { data, error } = await this.supabase
      .from('brain_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  // ------------------------------------------------------------------
  // INTEGRATION METHODS
  // ------------------------------------------------------------------

  /**
   * Process behavioral pattern and add to brain
   * Called when a new behavioral pattern is detected
   */
  async processFromBehavioralPattern(userId, pattern) {
    const {
      event,
      activities,
      patternType = 'behavioral_correlation'
    } = pattern;

    // Create node for the event trigger
    const eventNode = await this.addNode(userId, {
      node_type: NODE_TYPES.BEHAVIOR,
      category: this._inferCategory(event.eventType),
      label: `${event.eventType}: ${event.summary || 'Event'}`,
      confidence: 0.6,
      source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
      platform: 'calendar',
      data: {
        event_type: event.eventType,
        keywords: event.keywords
      }
    });

    // Create nodes for correlated activities
    for (const activity of activities) {
      const activityNode = await this.addNode(userId, {
        node_type: NODE_TYPES.PATTERN,
        category: this._inferCategoryFromPlatform(activity.platform),
        label: this._generateActivityLabel(activity),
        confidence: 0.5,
        source_type: SOURCE_TYPES.BEHAVIORAL_PATTERN,
        platform: activity.platform,
        data: {
          data_type: activity.dataType,
          time_offset: activity.timeOffsetMinutes
        }
      });

      // Connect event to activity
      await this.connectNodes(userId, eventNode.id, activityNode.id, {
        relationship_type: activity.timeOffsetMinutes < 0 ? RELATIONSHIP_TYPES.LEADS_TO : RELATIONSHIP_TYPES.CORRELATES_WITH,
        context: event.eventType,
        evidence: [{
          timestamp: new Date().toISOString(),
          time_offset: activity.timeOffsetMinutes,
          pattern_type: patternType
        }]
      });
    }

    return eventNode;
  }

  /**
   * Process MoltBot memory event and add to brain
   */
  async processFromMoltbotEvent(userId, memoryEvent) {
    const {
      platform,
      type,
      data,
      layer = 'episodic'
    } = memoryEvent;

    const sourceType = layer === 'semantic'
      ? SOURCE_TYPES.MOLTBOT_SEMANTIC
      : SOURCE_TYPES.MOLTBOT_EPISODIC;

    // Infer node type from memory type
    const nodeType = this._inferNodeTypeFromMemory(type);
    const category = this._inferCategoryFromPlatform(platform);

    return await this.addNode(userId, {
      node_type: nodeType,
      category,
      label: this._generateMoltbotLabel(type, data),
      confidence: layer === 'semantic' ? 0.7 : 0.5,
      source_type: sourceType,
      platform,
      data,
      tags: this._extractTags(data)
    });
  }

  /**
   * Process Claude conversation and extract insights
   */
  async processFromClaudeConversation(userId, conversation) {
    const {
      content,
      topics = [],
      intent
    } = conversation;

    // Create nodes for detected topics
    const createdNodes = [];

    for (const topic of topics) {
      const node = await this.addNode(userId, {
        node_type: NODE_TYPES.INTEREST,
        category: this._inferCategoryFromTopic(topic),
        label: `Interest: ${topic}`,
        confidence: 0.4,
        source_type: SOURCE_TYPES.CLAUDE_CONVERSATION,
        data: {
          conversation_snippet: content.substring(0, 200),
          intent
        },
        tags: [topic]
      });
      createdNodes.push(node);
    }

    // Connect related topics
    for (let i = 0; i < createdNodes.length - 1; i++) {
      await this.connectNodes(userId, createdNodes[i].id, createdNodes[i + 1].id, {
        relationship_type: RELATIONSHIP_TYPES.CORRELATES_WITH,
        context: 'conversation',
        evidence: [{
          timestamp: new Date().toISOString(),
          source: 'claude_conversation'
        }]
      });
    }

    return createdNodes;
  }

  // ------------------------------------------------------------------
  // CAUSAL REASONING METHODS (Phase 4)
  // ------------------------------------------------------------------

  async createCausalEdge(userId, sourceNodeId, targetNodeId, options = {}) {
    return causal.createCausalEdge(userId, sourceNodeId, targetNodeId, options, {
      connectNodes: this.connectNodes.bind(this),
      strengthenEdge: this.strengthenEdge.bind(this)
    });
  }

  async analyzeCausality(userId, sourceNodeId, targetNodeId) {
    return causal.analyzeCausality(userId, sourceNodeId, targetNodeId);
  }

  async getCausalChain(userId, sourceNodeId, options) {
    return causal.getCausalChain(userId, sourceNodeId, options);
  }

  async getCausalSummary(userId) {
    return causal.getCausalSummary(userId);
  }

  async upgradeToCausal(userId, sourceNodeId, targetNodeId, options = {}) {
    return causal.upgradeToCausal(userId, sourceNodeId, targetNodeId, options, this._logActivity.bind(this));
  }

  // ------------------------------------------------------------------
  // MULTI-CONTEXT PERSONALITY METHODS (Phase 4)
  // ------------------------------------------------------------------

  async setNodeContextExpression(userId, nodeId, context, expressionLevel, notes = null) {
    return contextMethods.setNodeContextExpression(userId, nodeId, context, expressionLevel, notes, this._logActivity.bind(this));
  }

  async getNodeContextExpressions(userId, nodeId) {
    return contextMethods.getNodeContextExpressions(userId, nodeId);
  }

  async getBrainGraphForContext(userId, context, options = {}) {
    return contextMethods.getBrainGraphForContext(userId, context, options, {
      getBrainGraph: this.getBrainGraph.bind(this)
    });
  }

  async getContextPersonalitySummary(userId) {
    return contextMethods.getContextPersonalitySummary(userId);
  }

  async detectContextPatterns(userId) {
    return contextMethods.detectContextPatterns(userId);
  }

  async applyContextSuggestions(userId, suggestions) {
    return contextMethods.applyContextSuggestions(userId, suggestions, {
      setNodeContextExpressionFn: this.setNodeContextExpression.bind(this)
    });
  }

  // ------------------------------------------------------------------
  // PRIVATE HELPER METHODS
  // ------------------------------------------------------------------

  async _logActivity(userId, activityType, entityType, entityId, changeData = {}, triggerSource = null) {
    const { error } = await this.supabase
      .from('brain_activity_log')
      .insert({
        user_id: userId,
        activity_type: activityType,
        entity_type: entityType,
        entity_id: entityId,
        change_data: changeData,
        trigger_source: triggerSource
      });
    if (error) {
      log.error('Failed to log activity:', error.message);
    }
  }

  _inferCategory(eventType) {
    const categoryMap = {
      'high_stakes': CATEGORIES.PROFESSIONAL,
      'focus_work': CATEGORIES.PROFESSIONAL,
      'meeting': CATEGORIES.PROFESSIONAL,
      'social': CATEGORIES.SOCIAL,
      'workout': CATEGORIES.HEALTH,
      'other': CATEGORIES.PERSONAL
    };
    return categoryMap[eventType] || CATEGORIES.PERSONAL;
  }

  _inferCategoryFromPlatform(platform) {
    const categoryMap = {
      'spotify': CATEGORIES.ENTERTAINMENT,
      'netflix': CATEGORIES.ENTERTAINMENT,
      'youtube': CATEGORIES.ENTERTAINMENT,
      'github': CATEGORIES.PROFESSIONAL,
      'calendar': CATEGORIES.PROFESSIONAL,
      'whoop': CATEGORIES.HEALTH,
      'discord': CATEGORIES.SOCIAL,
      'reddit': CATEGORIES.SOCIAL
    };
    return categoryMap[platform?.toLowerCase()] || CATEGORIES.PERSONAL;
  }

  _inferCategoryFromTopic(topic) {
    const topicLower = topic.toLowerCase();
    if (['coding', 'programming', 'ai', 'data', 'business'].some(t => topicLower.includes(t))) {
      return CATEGORIES.PROFESSIONAL;
    }
    if (['music', 'movie', 'game', 'entertainment'].some(t => topicLower.includes(t))) {
      return CATEGORIES.ENTERTAINMENT;
    }
    if (['health', 'fitness', 'workout', 'sleep'].some(t => topicLower.includes(t))) {
      return CATEGORIES.HEALTH;
    }
    if (['art', 'design', 'creative', 'writing'].some(t => topicLower.includes(t))) {
      return CATEGORIES.CREATIVE;
    }
    return CATEGORIES.PERSONAL;
  }

  _inferNodeTypeFromMemory(memoryType) {
    const typeMap = {
      'track_played': NODE_TYPES.PREFERENCE,
      'video_watched': NODE_TYPES.PREFERENCE,
      'routine_detected': NODE_TYPES.PATTERN,
      'skill_demonstrated': NODE_TYPES.SKILL,
      'fact_learned': NODE_TYPES.FACT
    };
    return typeMap[memoryType] || NODE_TYPES.BEHAVIOR;
  }

  _generateActivityLabel(activity) {
    const { platform, dataType, data } = activity;

    if (platform === 'spotify') {
      const track = data?.track_name || data?.name || 'Unknown Track';
      return `Listens to: ${track}`;
    }
    if (platform === 'whoop') {
      return `Health: ${dataType}`;
    }

    return `${platform}: ${dataType}`;
  }

  _generateMoltbotLabel(type, data) {
    if (type === 'track_played') {
      return `Loves: ${data?.genre || data?.artist || 'Music'}`;
    }
    if (type === 'routine_detected') {
      return `Routine: ${data?.name || 'Daily Pattern'}`;
    }
    return `${type}: ${JSON.stringify(data).substring(0, 50)}`;
  }

  _extractTags(data) {
    const tags = [];
    if (data?.genre) tags.push(data.genre);
    if (data?.artist) tags.push(data.artist);
    if (data?.keywords) tags.push(...data.keywords);
    return tags.slice(0, 10);
  }
}

// Export singleton instance
export const twinsBrainService = new TwinsBrainService();
export default twinsBrainService;
