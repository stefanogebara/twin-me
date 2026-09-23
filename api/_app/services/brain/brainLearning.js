/**
 * Brain Active Learning & Knowledge Gaps - Phase 3
 *
 * Identifies knowledge gaps and generates learning suggestions
 * for improving the brain's understanding of the user.
 */

import { CATEGORIES } from './brainConstants.js';

/**
 * Identify knowledge gaps in the brain
 * Finds areas where more data would improve understanding
 * @param {string} userId - User ID
 * @param {Object} deps - Dependencies { getNodesWithTemporalInfo, getBrainGraph }
 * @returns {Promise<Object>} - Knowledge gaps analysis
 */
export async function identifyKnowledgeGaps(userId, deps) {
  const { getNodesWithTemporalInfo, getBrainGraph } = deps;

  const nodes = await getNodesWithTemporalInfo(userId);
  const { edges } = await getBrainGraph(userId, { minConfidence: 0, minEdgeStrength: 0 });

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
        suggestion: getCategorySuggestion(cat)
      });
    } else if (percentage < 5) {
      gaps.categoryGaps.push({
        category: cat,
        severity: 'medium',
        count,
        percentage: Math.round(percentage),
        message: `Limited knowledge about ${cat} (${count} nodes, ${Math.round(percentage)}%)`,
        suggestion: getCategorySuggestion(cat)
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
 * @param {Object} deps - Dependencies { identifyKnowledgeGapsFn }
 * @returns {Promise<Array>} - Array of learning suggestions
 */
export async function generateLearningSuggestions(userId, deps) {
  const { identifyKnowledgeGapsFn } = deps;

  const gaps = await identifyKnowledgeGapsFn(userId);
  const suggestions = [];

  // Priority 1: Connect missing platforms for major gaps
  gaps.platformSuggestions
    .filter(p => p.priority === 'high')
    .forEach(p => {
      suggestions.push({
        type: 'connect_platform',
        priority: 'high',
        title: `Connect ${capitalizeFirst(p.platform)}`,
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
        title: `Refresh ${capitalizeFirst(s.category)} Knowledge`,
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
      title: `Clarify Your ${capitalizeFirst(area.nodeType)} Patterns`,
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
        title: `Enhance with ${capitalizeFirst(p.platform)}`,
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
export function getCategorySuggestion(category) {
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

/**
 * Capitalize first letter of a string
 */
export function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
