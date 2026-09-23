/**
 * Brain Constants
 *
 * All exported constants for the Twins Brain knowledge graph system.
 * Node types, categories, relationship types, decay configuration,
 * causal reasoning constants, and multi-context personality constants.
 */

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
