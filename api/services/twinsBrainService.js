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
 */

import { supabaseAdmin } from './database.js';

// ====================================================================
// NODE TYPES AND CATEGORIES
// ====================================================================

export const NODE_TYPES = {
  INTEREST: 'interest',
  BEHAVIOR: 'behavior',
  TRAIT: 'trait',
  PREFERENCE: 'preference',
  SKILL: 'skill',
  PATTERN: 'pattern',
  FACT: 'fact'
};

export const CATEGORIES = {
  ENTERTAINMENT: 'entertainment',
  PROFESSIONAL: 'professional',
  SOCIAL: 'social',
  CREATIVE: 'creative',
  HEALTH: 'health',
  PERSONAL: 'personal',
  LEARNING: 'learning'
};

export const RELATIONSHIP_TYPES = {
  // Correlational relationships (no direction of causation)
  CORRELATES_WITH: 'correlates_with',
  SIMILAR_TO: 'similar_to',

  // Causal relationships (directional causation) - Phase 4
  CAUSES: 'causes',             // Strong causal: A directly causes B
  ENABLES: 'enables',           // Enabling condition: A makes B possible
  TRIGGERS: 'triggers',         // Temporal trigger: A triggers B to happen
  INHIBITS: 'inhibits',         // Negative causal: A prevents or reduces B

  // Temporal/sequential relationships
  LEADS_TO: 'leads_to',         // A temporally precedes B (weak causal signal)
  EVOLVED_FROM: 'evolved_from', // B is an evolution of A over time

  // Logical relationships
  CONTRADICTS: 'contradicts',
  REINFORCES: 'reinforces',
  REQUIRES: 'requires',
  CONTEXT_SPECIFIC: 'context_specific',

  // Provenance relationships (Phase 2)
  DERIVED_FROM: 'derived_from', // Higher-level node derived from lower-level evidence
  AGGREGATES: 'aggregates'      // Aggregates multiple lower-level nodes
};

// Causal relationship types for easy filtering (Phase 4)
export const CAUSAL_TYPES = ['causes', 'enables', 'triggers', 'inhibits'];
export const CORRELATIONAL_TYPES = ['correlates_with', 'similar_to'];

// Causal confidence thresholds
export const CAUSAL_CONFIDENCE_THRESHOLDS = {
  STRONG: 0.8,    // High confidence causal relationship
  MODERATE: 0.6,  // Moderate evidence for causation
  WEAK: 0.4       // Weak causal signal, might be correlation
};

// ====================================================================
// MULTI-CONTEXT PERSONALITY SYSTEM (Phase 4)
// ====================================================================

/**
 * Context types - different domains where personality may vary
 * A person may express different traits in different contexts
 */
export const CONTEXT_TYPES = {
  GLOBAL: 'global',           // Universal traits that apply everywhere
  WORK: 'work',               // Professional/work environment
  PERSONAL: 'personal',       // Home/family environment
  SOCIAL: 'social',           // Friends/social gatherings
  CREATIVE: 'creative',       // Creative/artistic pursuits
  LEARNING: 'learning',       // Educational/learning contexts
  HEALTH: 'health',           // Health/fitness contexts
  ROMANTIC: 'romantic'        // Romantic/dating contexts
};

/**
 * Context-specific modifiers for node expression
 * A node can have different "intensity" in different contexts
 */
export const CONTEXT_EXPRESSION = {
  SUPPRESSED: 0.2,   // Trait is suppressed/hidden in this context
  REDUCED: 0.5,      // Trait is somewhat reduced
  NORMAL: 1.0,       // Default expression level
  ENHANCED: 1.5,     // Trait is more prominent
  DOMINANT: 2.0      // Trait is dominant/defining in this context
};

export const SOURCE_TYPES = {
  MOLTBOT_EPISODIC: 'moltbot_episodic',
  MOLTBOT_SEMANTIC: 'moltbot_semantic',
  BEHAVIORAL_PATTERN: 'behavioral_pattern',
  CLAUDE_CONVERSATION: 'claude_conversation',
  PLATFORM_DATA: 'platform_data',
  MANUAL: 'manual'
};

// ====================================================================
// TEMPORAL DECAY CONFIGURATION
// ====================================================================

/**
 * Decay rates by abstraction level (confidence loss per day)
 * Higher levels are more stable and decay slower
 */
export const DECAY_RATES = {
  1: 0.02,   // Level 1: Facts - 2% per day (fast decay, specific events become stale)
  2: 0.01,   // Level 2: Preferences - 1% per day (medium decay, preferences shift)
  3: 0.005,  // Level 3: Traits - 0.5% per day (slow decay, traits are stable)
  4: 0.002   // Level 4: Core Identity - 0.2% per day (very slow, identity is most stable)
};

/**
 * Minimum confidence floor (nodes don't decay below this)
 */
export const MIN_CONFIDENCE_FLOOR = 0.1;

/**
 * Days after which a node is considered "stale" and needs reinforcement
 */
export const STALENESS_THRESHOLDS = {
  1: 7,    // Level 1: Stale after 7 days
  2: 14,   // Level 2: Stale after 14 days
  3: 30,   // Level 3: Stale after 30 days
  4: 60    // Level 4: Stale after 60 days
};

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

  /**
   * Add or update a node in the brain
   * @param {string} userId - User ID
   * @param {Object} nodeData - Node data
   * @returns {Promise<Object>} Created/updated node
   */
  async addNode(userId, nodeData) {
    const {
      node_type,
      category,
      label,
      description = null,
      confidence = 0.5,
      strength = 0.5,
      source_type = null,
      source_id = null,
      platform = null,
      data = {},
      tags = [],
      privacy_level = 50
    } = nodeData;

    // Check if node with same label exists for this user
    const { data: existing } = await this.supabase
      .from('brain_nodes')
      .select('id, confidence, strength, data')
      .eq('user_id', userId)
      .eq('label', label)
      .eq('node_type', node_type)
      .single();

    if (existing) {
      // Update existing node - increase confidence and merge data
      const newConfidence = Math.min(1.0, existing.confidence + 0.1);
      const mergedData = { ...existing.data, ...data };

      const { data: updated, error } = await this.supabase
        .from('brain_nodes')
        .update({
          confidence: newConfidence,
          strength: Math.max(existing.strength, strength),
          data: mergedData,
          last_updated: new Date().toISOString(),
          last_confirmed: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await this._logActivity(userId, 'node_updated', 'node', existing.id, {
        previous_confidence: existing.confidence,
        new_confidence: newConfidence
      }, source_type);

      console.log(`[TwinsBrain] Updated node: "${label}" (confidence: ${newConfidence.toFixed(2)})`);
      return updated;
    }

    // Create new node
    const { data: newNode, error } = await this.supabase
      .from('brain_nodes')
      .insert({
        user_id: userId,
        node_type,
        category,
        label,
        description,
        confidence,
        strength,
        source_type,
        source_id,
        platform,
        data,
        tags,
        privacy_level
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await this._logActivity(userId, 'node_created', 'node', newNode.id, {
      node_type,
      category,
      label
    }, source_type);

    console.log(`[TwinsBrain] Created node: "${label}" (type: ${node_type}, category: ${category})`);
    return newNode;
  }

  /**
   * Get a node by ID
   */
  async getNode(userId, nodeId) {
    const { data, error } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId)
      .eq('id', nodeId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Find nodes by label pattern
   */
  async findNodes(userId, { labelPattern, nodeType, category, minConfidence = 0, limit = 50 }) {
    let query = this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (labelPattern) {
      query = query.ilike('label', `%${labelPattern}%`);
    }
    if (nodeType) {
      query = query.eq('node_type', nodeType);
    }
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  /**
   * Get all nodes for a user
   */
  async getAllNodes(userId, { nodeType, category, minConfidence = 0 } = {}) {
    let query = this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false });

    if (nodeType) {
      query = query.eq('node_type', nodeType);
    }
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  /**
   * Update node confidence (decay or boost)
   */
  async updateNodeConfidence(userId, nodeId, delta) {
    const { data: node, error: fetchError } = await this.supabase
      .from('brain_nodes')
      .select('confidence')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newConfidence = Math.max(0, Math.min(1, node.confidence + delta));

    const { data, error } = await this.supabase
      .from('brain_nodes')
      .update({
        confidence: newConfidence,
        last_updated: new Date().toISOString()
      })
      .eq('id', nodeId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a node (and all its edges)
   */
  async deleteNode(userId, nodeId) {
    const { error } = await this.supabase
      .from('brain_nodes')
      .delete()
      .eq('id', nodeId)
      .eq('user_id', userId);

    if (error) throw error;

    await this._logActivity(userId, 'node_deleted', 'node', nodeId, {}, 'manual');
    return true;
  }

  // ------------------------------------------------------------------
  // TEMPORAL DYNAMICS - PHASE 3
  // ------------------------------------------------------------------

  /**
   * Calculate the effective confidence of a node accounting for decay
   * @param {Object} node - The node object
   * @returns {number} - The decayed confidence value (0-1)
   */
  calculateDecayedConfidence(node) {
    const baseConfidence = node.confidence || 0.5;
    const abstractionLevel = node.data?.abstraction_level || 2;
    const decayRate = DECAY_RATES[abstractionLevel] || DECAY_RATES[2];

    // Use last_confirmed or last_updated or created_at for decay calculation
    const lastReinforced = node.last_confirmed || node.last_updated || node.created_at;
    if (!lastReinforced) return baseConfidence;

    const daysSinceReinforcement = (Date.now() - new Date(lastReinforced).getTime()) / (1000 * 60 * 60 * 24);

    // Apply exponential decay: confidence * e^(-rate * days)
    const decayedConfidence = baseConfidence * Math.exp(-decayRate * daysSinceReinforcement);

    // Don't go below the floor
    return Math.max(MIN_CONFIDENCE_FLOOR, decayedConfidence);
  }

  /**
   * Get the freshness status of a node
   * @param {Object} node - The node object
   * @returns {Object} - Freshness info { status: 'fresh'|'aging'|'stale', daysSinceUpdate, daysUntilStale }
   */
  getNodeFreshness(node) {
    const abstractionLevel = node.data?.abstraction_level || 2;
    const stalenessThreshold = STALENESS_THRESHOLDS[abstractionLevel] || STALENESS_THRESHOLDS[2];

    const lastReinforced = node.last_confirmed || node.last_updated || node.created_at;
    if (!lastReinforced) {
      return { status: 'unknown', daysSinceUpdate: null, daysUntilStale: null };
    }

    const daysSinceUpdate = (Date.now() - new Date(lastReinforced).getTime()) / (1000 * 60 * 60 * 24);
    const daysUntilStale = Math.max(0, stalenessThreshold - daysSinceUpdate);

    let status = 'fresh';
    if (daysSinceUpdate >= stalenessThreshold) {
      status = 'stale';
    } else if (daysSinceUpdate >= stalenessThreshold * 0.7) {
      status = 'aging';
    }

    return {
      status,
      daysSinceUpdate: Math.round(daysSinceUpdate),
      daysUntilStale: Math.round(daysUntilStale),
      stalenessThreshold,
      lastReinforced
    };
  }

  /**
   * Reinforce a node with new evidence (boost confidence and reset decay timer)
   * @param {string} userId - User ID
   * @param {string} nodeId - Node ID
   * @param {Object} options - { evidenceSource, confidenceBoost, newEvidence }
   * @returns {Promise<Object>} - Updated node
   */
  async reinforceNode(userId, nodeId, options = {}) {
    const {
      evidenceSource = 'manual',
      confidenceBoost = 0.1,
      newEvidence = null
    } = options;

    // Get current node
    const { data: node, error: fetchError } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    // Calculate new confidence (cap at 1.0)
    const currentDecayedConfidence = this.calculateDecayedConfidence(node);
    const newConfidence = Math.min(1.0, currentDecayedConfidence + confidenceBoost);

    // Prepare reinforcement history
    const reinforcementHistory = node.data?.reinforcement_history || [];
    reinforcementHistory.push({
      timestamp: new Date().toISOString(),
      source: evidenceSource,
      previous_confidence: node.confidence,
      new_confidence: newConfidence,
      evidence: newEvidence
    });

    // Keep only last 20 reinforcement events
    const trimmedHistory = reinforcementHistory.slice(-20);

    // Update the node
    const { data: updatedNode, error: updateError } = await this.supabase
      .from('brain_nodes')
      .update({
        confidence: newConfidence,
        last_updated: new Date().toISOString(),
        last_confirmed: new Date().toISOString(),
        data: {
          ...node.data,
          reinforcement_history: trimmedHistory,
          last_reinforcement_source: evidenceSource
        }
      })
      .eq('id', nodeId)
      .select()
      .single();

    if (updateError) throw updateError;

    await this._logActivity(userId, 'node_reinforced', 'node', nodeId, {
      previous_confidence: node.confidence,
      new_confidence: newConfidence,
      source: evidenceSource
    }, evidenceSource);

    console.log(`[TwinsBrain] Reinforced node: "${node.label}" (confidence: ${node.confidence.toFixed(2)} → ${newConfidence.toFixed(2)})`);
    return updatedNode;
  }

  /**
   * Get all stale nodes that need reinforcement
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of stale nodes with freshness info
   */
  async getStaleNodes(userId) {
    const { data: allNodes, error } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const staleNodes = [];
    for (const node of allNodes || []) {
      const freshness = this.getNodeFreshness(node);
      if (freshness.status === 'stale' || freshness.status === 'aging') {
        staleNodes.push({
          ...node,
          freshness,
          decayed_confidence: this.calculateDecayedConfidence(node)
        });
      }
    }

    // Sort by staleness (most stale first)
    return staleNodes.sort((a, b) => b.freshness.daysSinceUpdate - a.freshness.daysSinceUpdate);
  }

  /**
   * Apply decay calculations and get all nodes with temporal info
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Nodes with temporal information added
   */
  async getNodesWithTemporalInfo(userId) {
    const { data: nodes, error } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return (nodes || []).map(node => ({
      ...node,
      decayed_confidence: this.calculateDecayedConfidence(node),
      freshness: this.getNodeFreshness(node)
    }));
  }

  /**
   * Batch reinforce nodes from a data source (e.g., when new platform data arrives)
   * @param {string} userId - User ID
   * @param {string} platform - Platform name
   * @param {Array<string>} nodeLabels - Labels of nodes to reinforce
   * @returns {Promise<Object>} - Stats about reinforcement
   */
  async reinforceNodesFromPlatform(userId, platform, nodeLabels) {
    const stats = { reinforced: 0, notFound: 0 };

    for (const label of nodeLabels) {
      const { data: node } = await this.supabase
        .from('brain_nodes')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', platform)
        .ilike('label', `%${label}%`)
        .single();

      if (node) {
        await this.reinforceNode(userId, node.id, {
          evidenceSource: `platform_data:${platform}`,
          confidenceBoost: 0.05
        });
        stats.reinforced++;
      } else {
        stats.notFound++;
      }
    }

    console.log(`[TwinsBrain] Platform reinforcement (${platform}): ${stats.reinforced} reinforced, ${stats.notFound} not found`);
    return stats;
  }

  // ------------------------------------------------------------------
  // ACTIVE LEARNING & KNOWLEDGE GAPS - PHASE 3
  // ------------------------------------------------------------------

  /**
   * Identify knowledge gaps in the brain
   * Finds areas where more data would improve understanding
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Knowledge gaps analysis
   */
  async identifyKnowledgeGaps(userId) {
    const nodes = await this.getNodesWithTemporalInfo(userId);
    const { edges } = await this.getBrainGraph(userId, { minConfidence: 0, minEdgeStrength: 0 });

    const gaps = {
      categoryGaps: [],
      levelGaps: [],
      staleKnowledge: [],
      lowConfidenceAreas: [],
      missingConnections: [],
      platformSuggestions: []
    };

    // 1. Category distribution analysis - find underrepresented categories
    const categoryCount = {};
    const expectedCategories = Object.values(CATEGORIES);
    nodes.forEach(n => {
      categoryCount[n.category] = (categoryCount[n.category] || 0) + 1;
    });

    const totalNodes = nodes.length || 1;
    expectedCategories.forEach(cat => {
      const count = categoryCount[cat] || 0;
      const percentage = (count / totalNodes) * 100;

      if (count === 0) {
        gaps.categoryGaps.push({
          category: cat,
          severity: 'high',
          message: `No knowledge about ${cat} category`,
          suggestion: this._getCategorySuggestion(cat)
        });
      } else if (percentage < 5) {
        gaps.categoryGaps.push({
          category: cat,
          severity: 'medium',
          count,
          percentage: Math.round(percentage),
          message: `Limited knowledge about ${cat} (${count} nodes, ${Math.round(percentage)}%)`,
          suggestion: this._getCategorySuggestion(cat)
        });
      }
    });

    // 2. Abstraction level gaps - find missing hierarchical levels
    const levelCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
    nodes.forEach(n => {
      const level = n.data?.abstraction_level || 2;
      levelCount[level]++;
    });

    if (levelCount[4] === 0 && (levelCount[3] > 0 || levelCount[2] > 5)) {
      gaps.levelGaps.push({
        level: 4,
        severity: 'high',
        message: 'No core identity archetype defined yet',
        suggestion: 'Generate Soul Signature to create core identity node'
      });
    }
    if (levelCount[3] < 3 && levelCount[2] > 5) {
      gaps.levelGaps.push({
        level: 3,
        severity: 'medium',
        message: 'Few personality traits derived from preferences',
        suggestion: 'Run personality analysis to derive traits from behavioral patterns'
      });
    }
    if (levelCount[1] < 5) {
      gaps.levelGaps.push({
        level: 1,
        severity: 'low',
        message: 'Limited raw fact data',
        suggestion: 'Connect more platforms to gather concrete data points'
      });
    }

    // 3. Stale knowledge identification
    const staleNodes = nodes.filter(n => n.freshness?.status === 'stale');
    if (staleNodes.length > 0) {
      const groupedByCategory = {};
      staleNodes.forEach(n => {
        groupedByCategory[n.category] = groupedByCategory[n.category] || [];
        groupedByCategory[n.category].push(n.label);
      });

      Object.entries(groupedByCategory).forEach(([category, labels]) => {
        gaps.staleKnowledge.push({
          category,
          count: labels.length,
          examples: labels.slice(0, 3),
          severity: labels.length > 5 ? 'high' : 'medium',
          suggestion: `Re-sync ${category} data or answer questions to refresh this knowledge`
        });
      });
    }

    // 4. Low confidence areas
    const lowConfidenceNodes = nodes.filter(n =>
      n.decayed_confidence < 0.4 && n.freshness?.status !== 'stale'
    );
    if (lowConfidenceNodes.length > 3) {
      const groupedByType = {};
      lowConfidenceNodes.forEach(n => {
        groupedByType[n.node_type] = groupedByType[n.node_type] || [];
        groupedByType[n.node_type].push(n.label);
      });

      Object.entries(groupedByType).forEach(([type, labels]) => {
        if (labels.length >= 2) {
          gaps.lowConfidenceAreas.push({
            nodeType: type,
            count: labels.length,
            examples: labels.slice(0, 3),
            avgConfidence: Math.round((lowConfidenceNodes.filter(n => n.node_type === type)
              .reduce((sum, n) => sum + n.decayed_confidence, 0) / labels.length) * 100),
            suggestion: `More data needed to validate these ${type} insights`
          });
        }
      });
    }

    // 5. Missing connections - nodes without edges
    const nodesWithEdges = new Set();
    edges.forEach(e => {
      nodesWithEdges.add(e.from_node_id);
      nodesWithEdges.add(e.to_node_id);
    });
    const isolatedNodes = nodes.filter(n => !nodesWithEdges.has(n.id));
    if (isolatedNodes.length > 0) {
      gaps.missingConnections.push({
        count: isolatedNodes.length,
        examples: isolatedNodes.slice(0, 5).map(n => ({ label: n.label, category: n.category })),
        severity: isolatedNodes.length > 5 ? 'medium' : 'low',
        suggestion: 'Run migration again to discover relationships between isolated knowledge'
      });
    }

    // 6. Platform suggestions based on existing data
    const platformsConnected = new Set(nodes.filter(n => n.platform).map(n => n.platform));
    const potentialPlatforms = [
      { platform: 'spotify', category: CATEGORIES.ENTERTAINMENT, benefit: 'Music preferences reveal personality and mood patterns' },
      { platform: 'calendar', category: CATEGORIES.PROFESSIONAL, benefit: 'Schedule patterns show work style and life organization' },
      { platform: 'whoop', category: CATEGORIES.HEALTH, benefit: 'Biometrics reveal stress patterns and recovery needs' },
      { platform: 'github', category: CATEGORIES.PROFESSIONAL, benefit: 'Code contributions show technical interests and work patterns' },
      { platform: 'discord', category: CATEGORIES.SOCIAL, benefit: 'Community activity reveals social interests and communication style' },
      { platform: 'reddit', category: CATEGORIES.LEARNING, benefit: 'Subreddit activity shows intellectual interests and curiosity areas' }
    ];

    potentialPlatforms.forEach(({ platform, category, benefit }) => {
      if (!platformsConnected.has(platform)) {
        const categoryNodes = categoryCount[category] || 0;
        if (categoryNodes < 3) {
          gaps.platformSuggestions.push({
            platform,
            category,
            benefit,
            priority: categoryNodes === 0 ? 'high' : 'medium'
          });
        }
      }
    });

    return gaps;
  }

  /**
   * Generate learning suggestions based on knowledge gaps
   * Returns actionable recommendations for improving the brain
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of learning suggestions
   */
  async generateLearningSuggestions(userId) {
    const gaps = await this.identifyKnowledgeGaps(userId);
    const suggestions = [];

    // Priority 1: Connect missing platforms for major gaps
    gaps.platformSuggestions
      .filter(p => p.priority === 'high')
      .forEach(p => {
        suggestions.push({
          type: 'connect_platform',
          priority: 'high',
          title: `Connect ${this._capitalizeFirst(p.platform)}`,
          description: p.benefit,
          action: { type: 'connect', platform: p.platform },
          category: p.category
        });
      });

    // Priority 2: Refresh stale knowledge
    gaps.staleKnowledge
      .filter(s => s.severity === 'high')
      .forEach(s => {
        suggestions.push({
          type: 'refresh_knowledge',
          priority: 'high',
          title: `Refresh ${this._capitalizeFirst(s.category)} Knowledge`,
          description: `${s.count} nodes in this category are stale and may no longer reflect you`,
          action: { type: 'resync', category: s.category },
          examples: s.examples
        });
      });

    // Priority 3: Generate missing abstractions
    gaps.levelGaps.forEach(g => {
      if (g.level === 4 && g.severity === 'high') {
        suggestions.push({
          type: 'generate_abstraction',
          priority: 'medium',
          title: 'Generate Your Soul Signature',
          description: 'Create a core identity archetype from your behavioral patterns',
          action: { type: 'generate_soul_signature' }
        });
      }
      if (g.level === 3) {
        suggestions.push({
          type: 'generate_abstraction',
          priority: 'medium',
          title: 'Run Personality Analysis',
          description: 'Derive personality traits from your preferences and behaviors',
          action: { type: 'analyze_personality' }
        });
      }
    });

    // Priority 4: Questions to answer for low confidence areas
    gaps.lowConfidenceAreas.forEach(area => {
      suggestions.push({
        type: 'answer_questions',
        priority: 'low',
        title: `Clarify Your ${this._capitalizeFirst(area.nodeType)} Patterns`,
        description: `We're only ${area.avgConfidence}% confident about some ${area.nodeType} insights`,
        action: { type: 'questionnaire', nodeType: area.nodeType },
        examples: area.examples
      });
    });

    // Priority 5: Connect medium-priority platforms
    gaps.platformSuggestions
      .filter(p => p.priority === 'medium')
      .slice(0, 2)
      .forEach(p => {
        suggestions.push({
          type: 'connect_platform',
          priority: 'low',
          title: `Enhance with ${this._capitalizeFirst(p.platform)}`,
          description: p.benefit,
          action: { type: 'connect', platform: p.platform },
          category: p.category
        });
      });

    // Sort by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return suggestions.slice(0, 10); // Return top 10 suggestions
  }

  /**
   * Get category-specific suggestions for improving knowledge
   */
  _getCategorySuggestion(category) {
    const suggestions = {
      [CATEGORIES.ENTERTAINMENT]: 'Connect Spotify or YouTube to understand your entertainment preferences',
      [CATEGORIES.PROFESSIONAL]: 'Connect Calendar or GitHub to map your professional patterns',
      [CATEGORIES.SOCIAL]: 'Connect Discord or review social activity to understand your communication style',
      [CATEGORIES.CREATIVE]: 'Share creative projects or connect platforms where you create content',
      [CATEGORIES.HEALTH]: 'Connect Whoop or health apps to track your physical wellbeing patterns',
      [CATEGORIES.PERSONAL]: 'Answer personality questions to reveal more about your personal identity',
      [CATEGORIES.LEARNING]: 'Connect Reddit or share learning activity to map intellectual interests'
    };
    return suggestions[category] || 'Connect more data sources to improve understanding';
  }

  _capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ------------------------------------------------------------------
  // EDGE OPERATIONS
  // ------------------------------------------------------------------

  /**
   * Connect two nodes with a relationship
   */
  async connectNodes(userId, fromNodeId, toNodeId, edgeData = {}) {
    const {
      relationship_type = RELATIONSHIP_TYPES.CORRELATES_WITH,
      strength = 0.5,
      confidence = 0.5,
      context = null,
      evidence = []
    } = edgeData;

    // Check if edge exists
    const { data: existing } = await this.supabase
      .from('brain_edges')
      .select('id, strength, confidence, evidence, observation_count')
      .eq('user_id', userId)
      .eq('from_node_id', fromNodeId)
      .eq('to_node_id', toNodeId)
      .eq('relationship_type', relationship_type)
      .eq('context', context)
      .single();

    if (existing) {
      // Strengthen existing edge
      const newStrength = Math.min(1.0, existing.strength + 0.05);
      const newConfidence = Math.min(1.0, existing.confidence + 0.05);
      const mergedEvidence = [...(existing.evidence || []), ...evidence].slice(-20);

      const { data, error } = await this.supabase
        .from('brain_edges')
        .update({
          strength: newStrength,
          confidence: newConfidence,
          evidence: mergedEvidence,
          observation_count: existing.observation_count + 1,
          last_observed: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      await this._logActivity(userId, 'edge_strengthened', 'edge', existing.id, {
        previous_strength: existing.strength,
        new_strength: newStrength
      });

      console.log(`[TwinsBrain] Strengthened edge: ${relationship_type} (strength: ${newStrength.toFixed(2)})`);
      return data;
    }

    // Create new edge
    const { data, error } = await this.supabase
      .from('brain_edges')
      .insert({
        user_id: userId,
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        relationship_type,
        strength,
        confidence,
        context,
        evidence
      })
      .select()
      .single();

    if (error) throw error;

    await this._logActivity(userId, 'edge_created', 'edge', data.id, {
      relationship_type,
      from_node_id: fromNodeId,
      to_node_id: toNodeId
    });

    console.log(`[TwinsBrain] Created edge: ${relationship_type}`);
    return data;
  }

  /**
   * Get all edges for a node
   */
  async getNodeEdges(userId, nodeId) {
    const { data, error } = await this.supabase
      .from('brain_edges')
      .select(`
        *,
        from_node:brain_nodes!brain_edges_from_node_id_fkey(id, label, node_type, category),
        to_node:brain_nodes!brain_edges_to_node_id_fkey(id, label, node_type, category)
      `)
      .eq('user_id', userId)
      .or(`from_node_id.eq.${nodeId},to_node_id.eq.${nodeId}`)
      .order('strength', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Get neighbors of a node (connected nodes)
   */
  async getNeighbors(userId, nodeId, relationshipType = null) {
    const { data, error } = await this.supabase
      .rpc('get_brain_neighbors', {
        p_user_id: userId,
        p_node_id: nodeId,
        p_relationship_type: relationshipType
      });

    if (error) throw error;
    return data;
  }

  // ------------------------------------------------------------------
  // GRAPH QUERIES
  // ------------------------------------------------------------------

  /**
   * Get the full brain graph for a user
   */
  async getBrainGraph(userId, { minConfidence = 0.3, minEdgeStrength = 0.3 } = {}) {
    // Get all nodes
    const { data: nodes, error: nodesError } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false });

    if (nodesError) throw nodesError;

    // Get all edges
    const { data: edges, error: edgesError } = await this.supabase
      .from('brain_edges')
      .select('*')
      .eq('user_id', userId)
      .gte('strength', minEdgeStrength)
      .order('strength', { ascending: false });

    if (edgesError) throw edgesError;

    return { nodes, edges };
  }

  /**
   * Calculate brain health score
   */
  async getBrainHealth(userId) {
    const { data, error } = await this.supabase
      .rpc('calculate_brain_health', { p_user_id: userId });

    if (error) throw error;
    return data?.[0] || {
      total_nodes: 0,
      total_edges: 0,
      avg_confidence: 0,
      avg_edge_strength: 0,
      category_distribution: {},
      health_score: 0
    };
  }

  /**
   * Get brain summary statistics
   */
  async getBrainSummary(userId) {
    const health = await this.getBrainHealth(userId);

    // Get top nodes by category
    const { data: topNodes } = await this.supabase
      .from('brain_nodes')
      .select('label, node_type, category, confidence')
      .eq('user_id', userId)
      .gte('confidence', 0.7)
      .order('confidence', { ascending: false })
      .limit(10);

    // Get recent activity
    const { data: recentActivity } = await this.supabase
      .from('brain_activity_log')
      .select('activity_type, entity_type, change_data, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      health,
      topNodes: topNodes || [],
      recentActivity: recentActivity || []
    };
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
    const { data: prevSnapshot } = await this.supabase
      .from('brain_snapshots')
      .select('node_count, edge_count')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

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

    console.log(`[TwinsBrain] Created snapshot: ${nodes.length} nodes, ${edges.length} edges`);
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
  // PRIVATE HELPER METHODS
  // ------------------------------------------------------------------

  async _logActivity(userId, activityType, entityType, entityId, changeData = {}, triggerSource = null) {
    try {
      await this.supabase
        .from('brain_activity_log')
        .insert({
          user_id: userId,
          activity_type: activityType,
          entity_type: entityType,
          entity_id: entityId,
          change_data: changeData,
          trigger_source: triggerSource
        });
    } catch (err) {
      console.error('[TwinsBrain] Failed to log activity:', err.message);
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

  // ------------------------------------------------------------------
  // CAUSAL REASONING METHODS (Phase 4)
  // ------------------------------------------------------------------

  /**
   * Create a causal edge between two nodes
   * Causal edges have directionality - source causes/enables/triggers target
   */
  async createCausalEdge(userId, sourceNodeId, targetNodeId, {
    causalType = 'causes',      // causes, enables, triggers, inhibits
    confidence = 0.5,
    evidence = [],
    context = null,
    temporalLag = null         // Time delay between cause and effect (in minutes)
  } = {}) {
    // Validate causal type
    if (!CAUSAL_TYPES.includes(causalType)) {
      throw new Error(`Invalid causal type: ${causalType}. Must be one of: ${CAUSAL_TYPES.join(', ')}`);
    }

    // Create edge with causal metadata
    const edge = await this.connectNodes(userId, sourceNodeId, targetNodeId, {
      relationship_type: causalType,
      context,
      evidence: [
        ...evidence,
        {
          timestamp: new Date().toISOString(),
          type: 'causal_assertion',
          confidence,
          temporal_lag: temporalLag
        }
      ]
    });

    // Update edge strength based on confidence
    await this.strengthenEdge(userId, sourceNodeId, targetNodeId, confidence - 0.5);

    console.log(`[TwinsBrain] Created causal edge: ${sourceNodeId} --${causalType}--> ${targetNodeId} (confidence: ${confidence})`);
    return edge;
  }

  /**
   * Analyze if a correlational relationship might be causal
   * Uses temporal precedence, consistency, and strength as heuristics
   */
  async analyzeCausality(userId, sourceNodeId, targetNodeId) {
    // Get both nodes
    const { data: sourceNode } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('id', sourceNodeId)
      .eq('user_id', userId)
      .single();

    const { data: targetNode } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('id', targetNodeId)
      .eq('user_id', userId)
      .single();

    if (!sourceNode || !targetNode) {
      throw new Error('One or both nodes not found');
    }

    // Get existing edge
    const { data: edge } = await this.supabase
      .from('brain_edges')
      .select('*')
      .eq('user_id', userId)
      .or(`and(from_node_id.eq.${sourceNodeId},to_node_id.eq.${targetNodeId}),and(from_node_id.eq.${targetNodeId},to_node_id.eq.${sourceNodeId})`)
      .single();

    const analysis = {
      sourceNode: { id: sourceNodeId, label: sourceNode.label, type: sourceNode.node_type },
      targetNode: { id: targetNodeId, label: targetNode.label, type: targetNode.node_type },
      currentRelationship: edge?.relationship_type || 'none',
      causalityScore: 0,
      factors: [],
      recommendation: null
    };

    // Factor 1: Temporal Precedence (source created before target suggests causation direction)
    const sourceDate = new Date(sourceNode.created_at);
    const targetDate = new Date(targetNode.created_at);
    if (sourceDate < targetDate) {
      analysis.factors.push({
        name: 'temporal_precedence',
        score: 0.2,
        detail: 'Source node was created before target node'
      });
      analysis.causalityScore += 0.2;
    }

    // Factor 2: Edge Strength (strong correlations more likely to be causal)
    if (edge && edge.strength >= 0.7) {
      analysis.factors.push({
        name: 'strong_correlation',
        score: 0.25,
        detail: `Strong correlation (${edge.strength.toFixed(2)}) suggests causal link`
      });
      analysis.causalityScore += 0.25;
    } else if (edge && edge.strength >= 0.5) {
      analysis.factors.push({
        name: 'moderate_correlation',
        score: 0.15,
        detail: `Moderate correlation (${edge.strength.toFixed(2)})`
      });
      analysis.causalityScore += 0.15;
    }

    // Factor 3: Node Type Compatibility (certain types more likely to be causal)
    const causalPairs = [
      ['behavior', 'pattern'],      // Behaviors cause patterns
      ['interest', 'behavior'],     // Interests cause behaviors
      ['trait', 'preference'],      // Traits cause preferences
      ['pattern', 'fact']           // Patterns lead to facts
    ];
    const isPotentialCausal = causalPairs.some(
      ([src, tgt]) => sourceNode.node_type === src && targetNode.node_type === tgt
    );
    if (isPotentialCausal) {
      analysis.factors.push({
        name: 'type_compatibility',
        score: 0.2,
        detail: `${sourceNode.node_type} -> ${targetNode.node_type} is a typical causal pattern`
      });
      analysis.causalityScore += 0.2;
    }

    // Factor 4: Evidence consistency (multiple pieces of evidence)
    if (edge?.evidence && edge.evidence.length >= 3) {
      analysis.factors.push({
        name: 'evidence_consistency',
        score: 0.2,
        detail: `${edge.evidence.length} pieces of supporting evidence`
      });
      analysis.causalityScore += 0.2;
    }

    // Factor 5: Same platform data (cross-platform is less likely causal)
    if (sourceNode.platform && sourceNode.platform === targetNode.platform) {
      analysis.factors.push({
        name: 'same_platform',
        score: 0.15,
        detail: `Both from ${sourceNode.platform} - same data source increases causal likelihood`
      });
      analysis.causalityScore += 0.15;
    }

    // Generate recommendation
    if (analysis.causalityScore >= CAUSAL_CONFIDENCE_THRESHOLDS.STRONG) {
      analysis.recommendation = {
        action: 'upgrade_to_causal',
        suggestedType: 'causes',
        confidence: 'high',
        message: 'Strong evidence suggests this is a causal relationship'
      };
    } else if (analysis.causalityScore >= CAUSAL_CONFIDENCE_THRESHOLDS.MODERATE) {
      analysis.recommendation = {
        action: 'consider_upgrade',
        suggestedType: 'enables',
        confidence: 'moderate',
        message: 'Moderate evidence for causation - consider upgrading with more evidence'
      };
    } else if (analysis.causalityScore >= CAUSAL_CONFIDENCE_THRESHOLDS.WEAK) {
      analysis.recommendation = {
        action: 'monitor',
        suggestedType: null,
        confidence: 'low',
        message: 'Weak causal signal - keep as correlation, monitor for more evidence'
      };
    } else {
      analysis.recommendation = {
        action: 'keep_correlation',
        suggestedType: null,
        confidence: 'none',
        message: 'No significant causal evidence - relationship appears correlational'
      };
    }

    return analysis;
  }

  /**
   * Trace causal chain from a source node
   * Follows causal edges to find downstream effects
   */
  async getCausalChain(userId, sourceNodeId, { maxDepth = 5, direction = 'downstream' } = {}) {
    const visited = new Set();
    const chain = [];

    const traverse = async (nodeId, depth, path) => {
      if (depth > maxDepth || visited.has(nodeId)) return;
      visited.add(nodeId);

      // Get node info
      const { data: node } = await this.supabase
        .from('brain_nodes')
        .select('id, label, node_type, category')
        .eq('id', nodeId)
        .eq('user_id', userId)
        .single();

      if (!node) return;

      // Get causal edges
      const edgeQuery = direction === 'downstream'
        ? this.supabase
            .from('brain_edges')
            .select('*, target:brain_nodes!brain_edges_to_node_id_fkey(id, label, node_type)')
            .eq('user_id', userId)
            .eq('from_node_id', nodeId)
            .in('relationship_type', CAUSAL_TYPES)
        : this.supabase
            .from('brain_edges')
            .select('*, source:brain_nodes!brain_edges_from_node_id_fkey(id, label, node_type)')
            .eq('user_id', userId)
            .eq('to_node_id', nodeId)
            .in('relationship_type', CAUSAL_TYPES);

      const { data: edges } = await edgeQuery;

      for (const edge of edges || []) {
        const nextNode = direction === 'downstream' ? edge.target : edge.source;
        if (!nextNode || visited.has(nextNode.id)) continue;

        const chainLink = {
          from: { id: node.id, label: node.label, type: node.node_type },
          to: { id: nextNode.id, label: nextNode.label, type: nextNode.type },
          relationship: edge.relationship_type,
          strength: edge.strength,
          depth: depth,
          path: [...path, node.label]
        };
        chain.push(chainLink);

        await traverse(nextNode.id, depth + 1, [...path, node.label]);
      }
    };

    await traverse(sourceNodeId, 0, []);

    return {
      sourceNodeId,
      direction,
      maxDepth,
      chain,
      totalLinks: chain.length,
      maxDepthReached: Math.max(0, ...chain.map(c => c.depth))
    };
  }

  /**
   * Get summary of causal vs correlational edges
   */
  async getCausalSummary(userId) {
    // Get all edges
    const { data: edges, error } = await this.supabase
      .from('brain_edges')
      .select('relationship_type, strength')
      .eq('user_id', userId);

    if (error) throw error;

    const summary = {
      totalEdges: edges?.length || 0,
      causal: {
        count: 0,
        types: {},
        avgStrength: 0
      },
      correlational: {
        count: 0,
        types: {},
        avgStrength: 0
      },
      other: {
        count: 0,
        types: {}
      }
    };

    let causalStrengthSum = 0;
    let correlationalStrengthSum = 0;

    for (const edge of edges || []) {
      const type = edge.relationship_type;

      if (CAUSAL_TYPES.includes(type)) {
        summary.causal.count++;
        summary.causal.types[type] = (summary.causal.types[type] || 0) + 1;
        causalStrengthSum += edge.strength || 0;
      } else if (CORRELATIONAL_TYPES.includes(type)) {
        summary.correlational.count++;
        summary.correlational.types[type] = (summary.correlational.types[type] || 0) + 1;
        correlationalStrengthSum += edge.strength || 0;
      } else {
        summary.other.count++;
        summary.other.types[type] = (summary.other.types[type] || 0) + 1;
      }
    }

    summary.causal.avgStrength = summary.causal.count > 0
      ? causalStrengthSum / summary.causal.count
      : 0;
    summary.correlational.avgStrength = summary.correlational.count > 0
      ? correlationalStrengthSum / summary.correlational.count
      : 0;
    summary.causalRatio = summary.totalEdges > 0
      ? summary.causal.count / summary.totalEdges
      : 0;

    return summary;
  }

  /**
   * Upgrade a correlational edge to causal based on new evidence
   */
  async upgradeToCausal(userId, sourceNodeId, targetNodeId, {
    causalType = 'causes',
    evidence = [],
    reason = null
  } = {}) {
    // Find existing edge
    const { data: edge, error: findError } = await this.supabase
      .from('brain_edges')
      .select('*')
      .eq('user_id', userId)
      .eq('from_node_id', sourceNodeId)
      .eq('to_node_id', targetNodeId)
      .single();

    if (findError || !edge) {
      throw new Error('Edge not found between these nodes');
    }

    // Validate it's currently correlational
    if (CAUSAL_TYPES.includes(edge.relationship_type)) {
      throw new Error('Edge is already causal');
    }

    // Update to causal type
    const updatedEvidence = [
      ...(edge.evidence || []),
      ...evidence,
      {
        timestamp: new Date().toISOString(),
        type: 'causality_upgrade',
        from_type: edge.relationship_type,
        to_type: causalType,
        reason
      }
    ];

    const { data: updated, error: updateError } = await this.supabase
      .from('brain_edges')
      .update({
        relationship_type: causalType,
        evidence: updatedEvidence,
        updated_at: new Date().toISOString()
      })
      .eq('id', edge.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await this._logActivity(userId, 'edge_upgraded_to_causal', 'edge', edge.id, {
      from_type: edge.relationship_type,
      to_type: causalType,
      reason
    });

    console.log(`[TwinsBrain] Upgraded edge to causal: ${edge.relationship_type} -> ${causalType}`);
    return updated;
  }

  // ------------------------------------------------------------------
  // MULTI-CONTEXT PERSONALITY METHODS (Phase 4)
  // ------------------------------------------------------------------

  /**
   * Set context-specific expression level for a node
   * A node might be "enhanced" in work context but "suppressed" in social context
   */
  async setNodeContextExpression(userId, nodeId, context, expressionLevel, notes = null) {
    // Validate context
    if (!Object.values(CONTEXT_TYPES).includes(context)) {
      throw new Error(`Invalid context: ${context}. Valid contexts: ${Object.values(CONTEXT_TYPES).join(', ')}`);
    }

    // Get node
    const { data: node, error: nodeError } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    if (nodeError || !node) {
      throw new Error('Node not found');
    }

    // Update node data with context expression
    const contextExpressions = node.data?.context_expressions || {};
    contextExpressions[context] = {
      level: expressionLevel,
      notes,
      updated_at: new Date().toISOString()
    };

    const { data: updated, error: updateError } = await this.supabase
      .from('brain_nodes')
      .update({
        data: {
          ...node.data,
          context_expressions: contextExpressions
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', nodeId)
      .select()
      .single();

    if (updateError) throw updateError;

    await this._logActivity(userId, 'context_expression_set', 'node', nodeId, {
      context,
      expression_level: expressionLevel,
      notes
    });

    console.log(`[TwinsBrain] Set context expression: node ${nodeId} = ${expressionLevel} in ${context}`);
    return updated;
  }

  /**
   * Get all context expressions for a node
   */
  async getNodeContextExpressions(userId, nodeId) {
    const { data: node, error } = await this.supabase
      .from('brain_nodes')
      .select('id, label, data')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    if (error || !node) {
      throw new Error('Node not found');
    }

    return {
      nodeId: node.id,
      label: node.label,
      contextExpressions: node.data?.context_expressions || {},
      availableContexts: Object.values(CONTEXT_TYPES)
    };
  }

  /**
   * Get brain graph filtered/modified for a specific context
   * Nodes with expression levels in that context are adjusted
   */
  async getBrainGraphForContext(userId, context, { minConfidence = 0.3, minEdgeStrength = 0.3 } = {}) {
    // Get base graph
    const { nodes, edges } = await this.getBrainGraph(userId, { minConfidence, minEdgeStrength });

    // Apply context-specific modifiers
    const contextNodes = nodes.map(node => {
      const contextExpr = node.data?.context_expressions?.[context];
      const expressionLevel = contextExpr?.level || CONTEXT_EXPRESSION.NORMAL;

      // Adjust confidence based on expression level
      const contextualConfidence = Math.min(1, node.confidence * expressionLevel);

      // Determine if node should be visible in this context
      const isRelevant = contextExpr || context === CONTEXT_TYPES.GLOBAL;

      return {
        ...node,
        contextualConfidence,
        expressionLevel,
        contextNotes: contextExpr?.notes || null,
        isContextRelevant: isRelevant,
        // Visual modifiers for frontend
        contextualSize: node.size ? node.size * expressionLevel : undefined,
        contextualOpacity: expressionLevel < 0.5 ? 0.4 : (expressionLevel > 1 ? 1 : 0.7)
      };
    });

    // Filter out nodes that are suppressed below visibility threshold
    const visibleNodes = contextNodes.filter(n => n.expressionLevel >= 0.2);

    // Adjust edges based on connected nodes' expression levels
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const contextEdges = edges
      .filter(e => visibleNodeIds.has(e.from_node_id) && visibleNodeIds.has(e.to_node_id))
      .map(edge => {
        const sourceNode = visibleNodes.find(n => n.id === edge.from_node_id);
        const targetNode = visibleNodes.find(n => n.id === edge.to_node_id);
        const avgExpression = ((sourceNode?.expressionLevel || 1) + (targetNode?.expressionLevel || 1)) / 2;

        return {
          ...edge,
          contextualStrength: edge.strength * avgExpression
        };
      });

    return {
      context,
      nodes: visibleNodes,
      edges: contextEdges,
      stats: {
        totalNodes: nodes.length,
        visibleNodes: visibleNodes.length,
        hiddenNodes: nodes.length - visibleNodes.length,
        nodesWithContextData: nodes.filter(n => n.data?.context_expressions?.[context]).length
      }
    };
  }

  /**
   * Get a summary of how personality varies across contexts
   */
  async getContextPersonalitySummary(userId) {
    const { data: nodes, error } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId)
      .in('node_type', [NODE_TYPES.TRAIT, NODE_TYPES.PREFERENCE, NODE_TYPES.BEHAVIOR]);

    if (error) throw error;

    const summary = {
      contexts: {},
      nodesWithContextData: 0,
      topContextualTraits: {}
    };

    // Initialize all contexts
    Object.values(CONTEXT_TYPES).forEach(ctx => {
      summary.contexts[ctx] = {
        nodeCount: 0,
        enhancedNodes: [],
        suppressedNodes: [],
        avgExpression: 0,
        totalExpression: 0
      };
    });

    // Analyze each node
    for (const node of nodes || []) {
      const contextExpr = node.data?.context_expressions;
      if (!contextExpr) continue;

      summary.nodesWithContextData++;

      for (const [ctx, expr] of Object.entries(contextExpr)) {
        if (!summary.contexts[ctx]) continue;

        summary.contexts[ctx].nodeCount++;
        summary.contexts[ctx].totalExpression += expr.level || 1;

        if (expr.level >= CONTEXT_EXPRESSION.ENHANCED) {
          summary.contexts[ctx].enhancedNodes.push({
            id: node.id,
            label: node.label,
            level: expr.level,
            notes: expr.notes
          });
        } else if (expr.level <= CONTEXT_EXPRESSION.SUPPRESSED) {
          summary.contexts[ctx].suppressedNodes.push({
            id: node.id,
            label: node.label,
            level: expr.level,
            notes: expr.notes
          });
        }
      }
    }

    // Calculate averages
    Object.keys(summary.contexts).forEach(ctx => {
      const context = summary.contexts[ctx];
      context.avgExpression = context.nodeCount > 0
        ? context.totalExpression / context.nodeCount
        : 1.0;
      delete context.totalExpression;

      // Sort enhanced and suppressed by expression level
      context.enhancedNodes.sort((a, b) => b.level - a.level);
      context.suppressedNodes.sort((a, b) => a.level - b.level);

      // Keep only top 5 each
      context.enhancedNodes = context.enhancedNodes.slice(0, 5);
      context.suppressedNodes = context.suppressedNodes.slice(0, 5);
    });

    return summary;
  }

  /**
   * Detect context patterns from behavioral data
   * Analyzes when/where behaviors occur to suggest context assignments
   */
  async detectContextPatterns(userId) {
    // Get all behavior and pattern nodes
    const { data: nodes, error } = await this.supabase
      .from('brain_nodes')
      .select('*')
      .eq('user_id', userId)
      .in('node_type', [NODE_TYPES.BEHAVIOR, NODE_TYPES.PATTERN]);

    if (error) throw error;

    const suggestions = [];

    for (const node of nodes || []) {
      const platform = node.platform?.toLowerCase();
      const category = node.category;
      const label = node.label?.toLowerCase() || '';

      // Suggest contexts based on platform
      if (platform === 'github' || platform === 'linkedin' || platform === 'teams') {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.WORK,
          confidence: 0.8,
          reason: `Platform ${platform} is typically work-related`
        });
      }

      if (platform === 'spotify' || platform === 'netflix') {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.PERSONAL,
          confidence: 0.7,
          reason: `Platform ${platform} is typically personal entertainment`
        });
      }

      if (platform === 'discord' || platform === 'reddit') {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.SOCIAL,
          confidence: 0.6,
          reason: `Platform ${platform} is typically social interaction`
        });
      }

      // Suggest contexts based on category
      if (category === CATEGORIES.HEALTH) {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.HEALTH,
          confidence: 0.9,
          reason: 'Node is in health category'
        });
      }

      if (category === CATEGORIES.CREATIVE) {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.CREATIVE,
          confidence: 0.8,
          reason: 'Node is in creative category'
        });
      }

      if (category === CATEGORIES.LEARNING) {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.LEARNING,
          confidence: 0.8,
          reason: 'Node is in learning category'
        });
      }

      // Keyword-based suggestions
      if (label.includes('meeting') || label.includes('project') || label.includes('deadline')) {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.WORK,
          confidence: 0.7,
          reason: 'Keywords suggest work context'
        });
      }

      if (label.includes('friend') || label.includes('party') || label.includes('hangout')) {
        suggestions.push({
          nodeId: node.id,
          label: node.label,
          suggestedContext: CONTEXT_TYPES.SOCIAL,
          confidence: 0.7,
          reason: 'Keywords suggest social context'
        });
      }
    }

    // Remove duplicates (keep highest confidence)
    const uniqueSuggestions = {};
    for (const s of suggestions) {
      const key = `${s.nodeId}-${s.suggestedContext}`;
      if (!uniqueSuggestions[key] || uniqueSuggestions[key].confidence < s.confidence) {
        uniqueSuggestions[key] = s;
      }
    }

    return {
      suggestions: Object.values(uniqueSuggestions).sort((a, b) => b.confidence - a.confidence),
      availableContexts: Object.values(CONTEXT_TYPES)
    };
  }

  /**
   * Batch apply context expressions based on suggestions
   */
  async applyContextSuggestions(userId, suggestions) {
    const results = {
      applied: 0,
      failed: 0,
      errors: []
    };

    for (const suggestion of suggestions) {
      try {
        await this.setNodeContextExpression(
          userId,
          suggestion.nodeId,
          suggestion.suggestedContext,
          CONTEXT_EXPRESSION.ENHANCED,
          `Auto-detected: ${suggestion.reason}`
        );
        results.applied++;
      } catch (err) {
        results.failed++;
        results.errors.push({
          nodeId: suggestion.nodeId,
          error: err.message
        });
      }
    }

    console.log(`[TwinsBrain] Applied ${results.applied} context suggestions, ${results.failed} failed`);
    return results;
  }
}

// Export singleton instance
export const twinsBrainService = new TwinsBrainService();
export default twinsBrainService;
