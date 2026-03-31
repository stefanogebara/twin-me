/**
 * Twins Brain API Routes
 *
 * Provides REST endpoints for the unified knowledge graph system.
 * Integrates with existing systems: MoltBot, Behavioral Patterns, Claude Sync.
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinsBrainRoute');
import {
  twinsBrainService,
  NODE_TYPES,
  CATEGORIES,
  RELATIONSHIP_TYPES,
  SOURCE_TYPES,
  DECAY_RATES,
  STALENESS_THRESHOLDS,
  CAUSAL_TYPES,
  CORRELATIONAL_TYPES,
  CAUSAL_CONFIDENCE_THRESHOLDS,
  CONTEXT_TYPES,
  CONTEXT_EXPRESSION
} from '../services/twinsBrainService.js';

const router = express.Router();

// ====================================================================
// NODE ENDPOINTS
// ====================================================================

/**
 * GET /api/twins-brain/nodes
 * Get all brain nodes for a user
 */
router.get('/nodes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeType, category, minConfidence } = req.query;

    const nodes = await twinsBrainService.getAllNodes(userId, {
      nodeType,
      category,
      minConfidence: minConfidence ? parseFloat(minConfidence) : 0
    });

    res.json({
      success: true,
      count: nodes.length,
      nodes
    });
  } catch (error) {
    log.error('Error getting nodes:', error);
    res.status(500).json({ error: 'Failed to get brain nodes', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/nodes/:nodeId
 * Get a specific node with its edges
 */
router.get('/nodes/:nodeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;

    const node = await twinsBrainService.getNode(userId, nodeId);
    const edges = await twinsBrainService.getNodeEdges(userId, nodeId);
    const neighbors = await twinsBrainService.getNeighbors(userId, nodeId);

    res.json({
      success: true,
      node,
      edges,
      neighbors
    });
  } catch (error) {
    log.error('Error getting node:', error);
    res.status(500).json({ error: 'Failed to get node', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/nodes
 * Add a new node to the brain
 */
router.post('/nodes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const nodeData = req.body;

    // Validate required fields
    if (!nodeData.node_type || !nodeData.category || !nodeData.label) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['node_type', 'category', 'label']
      });
    }

    // Validate node_type
    if (!Object.values(NODE_TYPES).includes(nodeData.node_type)) {
      return res.status(400).json({
        error: 'Invalid node_type',
        validTypes: Object.values(NODE_TYPES)
      });
    }

    // Validate category
    if (!Object.values(CATEGORIES).includes(nodeData.category)) {
      return res.status(400).json({
        error: 'Invalid category',
        validCategories: Object.values(CATEGORIES)
      });
    }

    const node = await twinsBrainService.addNode(userId, nodeData);

    res.status(201).json({
      success: true,
      node
    });
  } catch (error) {
    log.error('Error adding node:', error);
    res.status(500).json({ error: 'Failed to add node', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * DELETE /api/twins-brain/nodes/:nodeId
 * Delete a node from the brain
 */
router.delete('/nodes/:nodeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;

    await twinsBrainService.deleteNode(userId, nodeId);

    res.json({ success: true, message: 'Node deleted' });
  } catch (error) {
    log.error('Error deleting node:', error);
    res.status(500).json({ error: 'Failed to delete node', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/nodes/search
 * Search for nodes by pattern
 */
router.post('/nodes/search', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { labelPattern, nodeType, category, minConfidence, limit } = req.body;

    const nodes = await twinsBrainService.findNodes(userId, {
      labelPattern,
      nodeType,
      category,
      minConfidence: minConfidence || 0,
      limit: limit || 50
    });

    res.json({
      success: true,
      count: nodes.length,
      nodes
    });
  } catch (error) {
    log.error('Error searching nodes:', error);
    res.status(500).json({ error: 'Failed to search nodes', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ====================================================================
// TEMPORAL DYNAMICS ENDPOINTS (Phase 3)
// ====================================================================

/**
 * GET /api/twins-brain/nodes/stale
 * Get all stale nodes that need reinforcement
 */
router.get('/nodes/stale', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const staleNodes = await twinsBrainService.getStaleNodes(userId);

    res.json({
      success: true,
      count: staleNodes.length,
      staleNodes
    });
  } catch (error) {
    log.error('Error getting stale nodes:', error);
    res.status(500).json({ error: 'Failed to get stale nodes', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/nodes/temporal
 * Get all nodes with temporal information (decay, freshness)
 */
router.get('/nodes/temporal', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const nodes = await twinsBrainService.getNodesWithTemporalInfo(userId);

    // Group by freshness status
    const byStatus = { fresh: [], aging: [], stale: [], unknown: [] };
    nodes.forEach(node => {
      const status = node.freshness?.status || 'unknown';
      byStatus[status].push(node);
    });

    res.json({
      success: true,
      count: nodes.length,
      summary: {
        fresh: byStatus.fresh.length,
        aging: byStatus.aging.length,
        stale: byStatus.stale.length,
        unknown: byStatus.unknown.length
      },
      nodes
    });
  } catch (error) {
    log.error('Error getting temporal nodes:', error);
    res.status(500).json({ error: 'Failed to get temporal data', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/nodes/:nodeId/reinforce
 * Reinforce a node with new evidence (boost confidence, reset decay timer)
 */
router.post('/nodes/:nodeId/reinforce', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;
    const { evidenceSource, confidenceBoost, newEvidence } = req.body || {};

    const updatedNode = await twinsBrainService.reinforceNode(userId, nodeId, {
      evidenceSource: evidenceSource || 'manual',
      confidenceBoost: confidenceBoost || 0.1,
      newEvidence
    });

    // Get freshness info for the updated node
    const freshness = twinsBrainService.getNodeFreshness(updatedNode);

    res.json({
      success: true,
      message: 'Node reinforced',
      node: {
        ...updatedNode,
        freshness,
        decayed_confidence: twinsBrainService.calculateDecayedConfidence(updatedNode)
      }
    });
  } catch (error) {
    log.error('Error reinforcing node:', error);
    res.status(500).json({ error: 'Failed to reinforce node', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/reinforce/platform
 * Batch reinforce nodes when new platform data arrives
 */
router.post('/reinforce/platform', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, nodeLabels } = req.body;

    if (!platform || !nodeLabels || !Array.isArray(nodeLabels)) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['platform', 'nodeLabels (array)']
      });
    }

    const stats = await twinsBrainService.reinforceNodesFromPlatform(userId, platform, nodeLabels);

    res.json({
      success: true,
      message: `Reinforced ${stats.reinforced} nodes from ${platform}`,
      stats
    });
  } catch (error) {
    log.error('Error batch reinforcing:', error);
    res.status(500).json({ error: 'Failed to batch reinforce', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/temporal/config
 * Get temporal dynamics configuration (decay rates, staleness thresholds)
 */
router.get('/temporal/config', (req, res) => {
  res.json({
    success: true,
    config: {
      decayRates: DECAY_RATES,
      stalenessThresholds: STALENESS_THRESHOLDS,
      description: {
        levels: {
          1: 'Raw Facts - Fast decay (2%/day), stale after 7 days',
          2: 'Preferences - Medium decay (1%/day), stale after 14 days',
          3: 'Personality Traits - Slow decay (0.5%/day), stale after 30 days',
          4: 'Core Identity - Very slow decay (0.2%/day), stale after 60 days'
        }
      }
    }
  });
});

// ====================================================================
// ACTIVE LEARNING & KNOWLEDGE GAPS ENDPOINTS (Phase 3)
// ====================================================================

/**
 * GET /api/twins-brain/knowledge-gaps
 * Identify knowledge gaps in the brain
 */
router.get('/knowledge-gaps', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const gaps = await twinsBrainService.identifyKnowledgeGaps(userId);

    // Calculate overall gap score (higher = more gaps)
    const gapScore = (
      gaps.categoryGaps.filter(g => g.severity === 'high').length * 3 +
      gaps.categoryGaps.filter(g => g.severity === 'medium').length * 2 +
      gaps.levelGaps.filter(g => g.severity === 'high').length * 3 +
      gaps.levelGaps.filter(g => g.severity === 'medium').length * 2 +
      gaps.staleKnowledge.length * 2 +
      gaps.lowConfidenceAreas.length +
      gaps.missingConnections.length
    );

    res.json({
      success: true,
      gapScore,
      gapLevel: gapScore > 10 ? 'high' : (gapScore > 5 ? 'medium' : 'low'),
      gaps,
      summary: {
        categoryGaps: gaps.categoryGaps.length,
        levelGaps: gaps.levelGaps.length,
        staleKnowledge: gaps.staleKnowledge.reduce((sum, s) => sum + s.count, 0),
        lowConfidenceNodes: gaps.lowConfidenceAreas.reduce((sum, a) => sum + a.count, 0),
        isolatedNodes: gaps.missingConnections[0]?.count || 0,
        suggestedPlatforms: gaps.platformSuggestions.length
      }
    });
  } catch (error) {
    log.error('Error identifying knowledge gaps:', error);
    res.status(500).json({ error: 'Failed to identify knowledge gaps', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/learning-suggestions
 * Get actionable suggestions for improving the brain
 */
router.get('/learning-suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const suggestions = await twinsBrainService.generateLearningSuggestions(userId);

    res.json({
      success: true,
      count: suggestions.length,
      suggestions,
      highPriority: suggestions.filter(s => s.priority === 'high').length,
      summary: {
        connectPlatform: suggestions.filter(s => s.type === 'connect_platform').length,
        refreshKnowledge: suggestions.filter(s => s.type === 'refresh_knowledge').length,
        generateAbstraction: suggestions.filter(s => s.type === 'generate_abstraction').length,
        answerQuestions: suggestions.filter(s => s.type === 'answer_questions').length
      }
    });
  } catch (error) {
    log.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ====================================================================
// EDGE ENDPOINTS
// ====================================================================

/**
 * POST /api/twins-brain/edges
 * Connect two nodes with a relationship
 */
router.post('/edges', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fromNodeId, toNodeId, relationship_type, strength, confidence, context, evidence } = req.body;

    if (!fromNodeId || !toNodeId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['fromNodeId', 'toNodeId']
      });
    }

    // Validate relationship_type if provided
    if (relationship_type && !Object.values(RELATIONSHIP_TYPES).includes(relationship_type)) {
      return res.status(400).json({
        error: 'Invalid relationship_type',
        validTypes: Object.values(RELATIONSHIP_TYPES)
      });
    }

    const edge = await twinsBrainService.connectNodes(userId, fromNodeId, toNodeId, {
      relationship_type,
      strength,
      confidence,
      context,
      evidence
    });

    res.status(201).json({
      success: true,
      edge
    });
  } catch (error) {
    log.error('Error creating edge:', error);
    res.status(500).json({ error: 'Failed to create edge', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/nodes/:nodeId/neighbors
 * Get all neighbors of a node
 */
router.get('/nodes/:nodeId/neighbors', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;
    const { relationshipType } = req.query;

    const neighbors = await twinsBrainService.getNeighbors(userId, nodeId, relationshipType);

    res.json({
      success: true,
      count: neighbors.length,
      neighbors
    });
  } catch (error) {
    log.error('Error getting neighbors:', error);
    res.status(500).json({ error: 'Failed to get neighbors', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ====================================================================
// GRAPH ENDPOINTS
// ====================================================================

/**
 * GET /api/twins-brain/graph
 * Get the full brain graph
 */
router.get('/graph', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { minConfidence, minEdgeStrength } = req.query;

    const graph = await twinsBrainService.getBrainGraph(userId, {
      minConfidence: minConfidence ? parseFloat(minConfidence) : 0.3,
      minEdgeStrength: minEdgeStrength ? parseFloat(minEdgeStrength) : 0.3
    });

    res.json({
      success: true,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      ...graph
    });
  } catch (error) {
    log.error('Error getting graph:', error);
    res.status(500).json({ error: 'Failed to get brain graph', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/health
 * Get brain health score and metrics
 */
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const health = await twinsBrainService.getBrainHealth(userId);

    res.json({
      success: true,
      health
    });
  } catch (error) {
    log.error('Error getting health:', error);
    res.status(500).json({ error: 'Failed to get brain health', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/summary
 * Get brain summary with top nodes and recent activity
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await twinsBrainService.getBrainSummary(userId);

    res.json({
      success: true,
      ...summary
    });
  } catch (error) {
    log.error('Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get brain summary', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ====================================================================
// SNAPSHOT ENDPOINTS
// ====================================================================

/**
 * POST /api/twins-brain/snapshots
 * Create a brain snapshot
 */
router.post('/snapshots', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { snapshotType, notes } = req.body;

    const snapshot = await twinsBrainService.createSnapshot(
      userId,
      snapshotType || 'manual',
      notes
    );

    res.status(201).json({
      success: true,
      snapshot: {
        id: snapshot.id,
        snapshot_date: snapshot.snapshot_date,
        node_count: snapshot.node_count,
        edge_count: snapshot.edge_count,
        avg_confidence: snapshot.avg_confidence
      }
    });
  } catch (error) {
    log.error('Error creating snapshot:', error);
    res.status(500).json({ error: 'Failed to create snapshot', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/snapshots
 * Get brain snapshots history
 */
router.get('/snapshots', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit, snapshotType } = req.query;

    const snapshots = await twinsBrainService.getSnapshots(userId, {
      limit: limit ? parseInt(limit) : 10,
      snapshotType
    });

    res.json({
      success: true,
      count: snapshots.length,
      snapshots
    });
  } catch (error) {
    log.error('Error getting snapshots:', error);
    res.status(500).json({ error: 'Failed to get snapshots', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/snapshots/:snapshotId
 * Get a specific snapshot's full graph state
 */
router.get('/snapshots/:snapshotId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { snapshotId } = req.params;

    const snapshot = await twinsBrainService.getSnapshotGraph(userId, snapshotId);

    res.json({
      success: true,
      snapshot
    });
  } catch (error) {
    log.error('Error getting snapshot:', error);
    res.status(500).json({ error: 'Failed to get snapshot', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ====================================================================
// INTEGRATION ENDPOINTS
// ====================================================================

/**
 * POST /api/twins-brain/process/behavioral-pattern
 * Process a behavioral pattern and add to brain
 */
router.post('/process/behavioral-pattern', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const pattern = req.body;

    if (!pattern.event || !pattern.activities) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['event', 'activities']
      });
    }

    const node = await twinsBrainService.processFromBehavioralPattern(userId, pattern);

    res.status(201).json({
      success: true,
      message: 'Behavioral pattern processed',
      node
    });
  } catch (error) {
    log.error('Error processing pattern:', error);
    res.status(500).json({ error: 'Failed to process pattern', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/process/moltbot-event
 * Process a MoltBot memory event and add to brain
 */
router.post('/process/moltbot-event', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const memoryEvent = req.body;

    if (!memoryEvent.platform || !memoryEvent.type) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['platform', 'type']
      });
    }

    const node = await twinsBrainService.processFromMoltbotEvent(userId, memoryEvent);

    res.status(201).json({
      success: true,
      message: 'MoltBot event processed',
      node
    });
  } catch (error) {
    log.error('Error processing MoltBot event:', error);
    res.status(500).json({ error: 'Failed to process event', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/process/claude-conversation
 * Process a Claude conversation and extract insights
 */
router.post('/process/claude-conversation', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversation = req.body;

    if (!conversation.content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['content']
      });
    }

    const nodes = await twinsBrainService.processFromClaudeConversation(userId, conversation);

    res.status(201).json({
      success: true,
      message: 'Claude conversation processed',
      nodesCreated: nodes.length,
      nodes
    });
  } catch (error) {
    log.error('Error processing conversation:', error);
    res.status(500).json({ error: 'Failed to process conversation', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ====================================================================
// METADATA ENDPOINTS
// ====================================================================

/**
 * GET /api/twins-brain/metadata
 * Get available node types, categories, and relationship types
 */
router.get('/metadata', (req, res) => {
  res.json({
    nodeTypes: NODE_TYPES,
    categories: CATEGORIES,
    relationshipTypes: RELATIONSHIP_TYPES,
    sourceTypes: SOURCE_TYPES
  });
});

// ====================================================================
// VISUALIZATION ENDPOINTS
// ====================================================================

/**
 * GET /api/twins-brain/visualization
 * Get brain data formatted for visualization (D3/force-graph compatible)
 * Now includes temporal dynamics (Phase 3): freshness status, decayed confidence
 */
router.get('/visualization', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { minConfidence = 0.3, minEdgeStrength = 0.2, includeStale = 'true' } = req.query;

    const { nodes, edges } = await twinsBrainService.getBrainGraph(userId, {
      minConfidence: parseFloat(minConfidence),
      minEdgeStrength: parseFloat(minEdgeStrength)
    });

    // Format nodes for visualization with temporal info
    const vizNodes = nodes.map(node => {
      // Calculate temporal dynamics (Phase 3)
      const freshness = twinsBrainService.getNodeFreshness(node);
      const decayedConfidence = twinsBrainService.calculateDecayedConfidence(node);

      return {
        id: node.id,
        label: node.label,
        type: node.node_type,
        category: node.category,
        platform: node.platform,
        confidence: node.confidence,
        strength: node.strength,
        // Rich evidence data for detailed view
        data: node.data || null,
        // Hierarchical abstraction level (1=Facts, 2=Preferences, 3=Traits, 4=Identity)
        abstraction_level: node.data?.abstraction_level || 2,
        // Temporal dynamics (Phase 3)
        temporal: {
          freshness: freshness.status,
          daysSinceUpdate: freshness.daysSinceUpdate,
          daysUntilStale: freshness.daysUntilStale,
          lastReinforced: freshness.lastReinforced,
          decayedConfidence: Math.round(decayedConfidence * 100) / 100
        },
        // Visual properties - size based on decayed confidence and abstraction level
        // Stale nodes appear smaller (using decayed confidence)
        size: 10 + (decayedConfidence * 15) + ((node.data?.abstraction_level || 2) * 3),
        color: getCategoryColor(node.category),
        // Stale nodes get reduced opacity (applied in frontend)
        opacity: freshness.status === 'stale' ? 0.5 : (freshness.status === 'aging' ? 0.75 : 1.0),
        group: node.category
      };
    })
      // Optionally filter out stale nodes
      .filter(node => includeStale === 'true' || node.temporal.freshness !== 'stale');

    // Format edges for visualization
    const vizEdges = edges.map(edge => {
      const isCausal = CAUSAL_TYPES.includes(edge.relationship_type);
      const isCorrelational = CORRELATIONAL_TYPES.includes(edge.relationship_type);
      const isProvenance = ['derived_from', 'aggregates'].includes(edge.relationship_type);

      return {
        id: edge.id,
        source: edge.from_node_id,
        target: edge.to_node_id,
        type: edge.relationship_type,
        strength: edge.strength,
        context: edge.context,
        // Provenance chain evidence
        evidence: edge.evidence || null,
        // Causal metadata (Phase 4)
        causal: {
          isCausal,
          isCorrelational,
          // Causal edges get arrows, correlational don't
          directional: isCausal,
          // Extract temporal lag if present
          temporalLag: edge.evidence?.find(e => e.temporal_lag)?.temporal_lag || null
        },
        // Visual properties
        width: 1 + (edge.strength * 3) + (isCausal ? 1 : 0), // Causal edges slightly thicker
        color: getRelationshipColor(edge.relationship_type),
        label: edge.relationship_type.replace(/_/g, ' '),
        // Edge style indicators
        isProvenance,
        isCausal,
        isCorrelational
      };
    });

    // Calculate clusters
    const clusters = {};
    vizNodes.forEach(node => {
      if (!clusters[node.category]) {
        clusters[node.category] = {
          id: node.category,
          label: node.category.charAt(0).toUpperCase() + node.category.slice(1),
          color: getCategoryColor(node.category),
          nodeCount: 0,
          avgConfidence: 0
        };
      }
      clusters[node.category].nodeCount++;
      clusters[node.category].avgConfidence += node.confidence;
    });

    // Calculate cluster averages
    Object.values(clusters).forEach(cluster => {
      cluster.avgConfidence = cluster.avgConfidence / cluster.nodeCount;
    });

    // Calculate temporal stats (Phase 3)
    const temporalStats = {
      fresh: vizNodes.filter(n => n.temporal.freshness === 'fresh').length,
      aging: vizNodes.filter(n => n.temporal.freshness === 'aging').length,
      stale: vizNodes.filter(n => n.temporal.freshness === 'stale').length,
      unknown: vizNodes.filter(n => n.temporal.freshness === 'unknown').length,
      avgDecayedConfidence: vizNodes.length > 0
        ? Math.round((vizNodes.reduce((sum, n) => sum + n.temporal.decayedConfidence, 0) / vizNodes.length) * 100) / 100
        : 0
    };

    // Calculate causal stats (Phase 4)
    const causalStats = {
      causalEdges: vizEdges.filter(e => e.isCausal).length,
      correlationalEdges: vizEdges.filter(e => e.isCorrelational).length,
      otherEdges: vizEdges.filter(e => !e.isCausal && !e.isCorrelational).length,
      causalRatio: vizEdges.length > 0
        ? Math.round((vizEdges.filter(e => e.isCausal).length / vizEdges.length) * 100) / 100
        : 0,
      byType: vizEdges.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      visualization: {
        nodes: vizNodes,
        edges: vizEdges,
        clusters: Object.values(clusters),
        stats: {
          nodeCount: vizNodes.length,
          edgeCount: vizEdges.length,
          clusterCount: Object.keys(clusters).length,
          // Temporal dynamics stats (Phase 3)
          temporal: temporalStats,
          // Causal reasoning stats (Phase 4)
          causal: causalStats
        }
      }
    });
  } catch (error) {
    log.error('Visualization error:', error);
    res.status(500).json({ error: 'Failed to get visualization data', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Helper functions for visualization colors
function getCategoryColor(category) {
  const colors = {
    entertainment: '#FF6B6B',
    professional: '#4ECDC4',
    social: '#45B7D1',
    creative: '#96CEB4',
    health: '#FFEAA7',
    personal: '#DDA0DD',
    learning: '#98D8C8'
  };
  return colors[category] || '#888888';
}

function getRelationshipColor(type) {
  const colors = {
    correlates_with: '#6C5CE7',
    leads_to: '#00B894',
    evolved_from: '#FDCB6E',
    contradicts: '#D63031',
    reinforces: '#0984E3',
    similar_to: '#A29BFE',
    context_specific: '#74B9FF',
    requires: '#E17055',
    // Provenance chain colors (Phase 2)
    derived_from: '#00CEC9',  // Teal - showing derivation
    aggregates: '#81ECEC',    // Light teal - showing aggregation
    // Causal relationship colors (Phase 4)
    causes: '#E74C3C',        // Red - strong causal
    enables: '#F39C12',       // Orange - enabling condition
    triggers: '#9B59B6',      // Purple - temporal trigger
    inhibits: '#34495E'       // Dark gray - inhibiting/blocking
  };
  return colors[type] || '#888888';
}

// ====================================================================
// CAUSAL REASONING ENDPOINTS (Phase 4)
// ====================================================================

/**
 * POST /api/twins-brain/edges/causal
 * Create a causal edge between two nodes
 */
router.post('/edges/causal', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceNodeId, targetNodeId, causalType, confidence, evidence, context, temporalLag } = req.body;

    if (!sourceNodeId || !targetNodeId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sourceNodeId', 'targetNodeId']
      });
    }

    const edge = await twinsBrainService.createCausalEdge(userId, sourceNodeId, targetNodeId, {
      causalType: causalType || 'causes',
      confidence: confidence || 0.5,
      evidence: evidence || [],
      context,
      temporalLag
    });

    res.status(201).json({
      success: true,
      message: 'Causal edge created',
      edge
    });
  } catch (error) {
    log.error('Error creating causal edge:', error);
    res.status(500).json({ error: 'Failed to create causal edge', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/edges/analyze-causality
 * Analyze if a correlational relationship might be causal
 */
router.get('/edges/analyze-causality', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceNodeId, targetNodeId } = req.query;

    if (!sourceNodeId || !targetNodeId) {
      return res.status(400).json({
        error: 'Missing required query params',
        required: ['sourceNodeId', 'targetNodeId']
      });
    }

    const analysis = await twinsBrainService.analyzeCausality(userId, sourceNodeId, targetNodeId);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    log.error('Error analyzing causality:', error);
    res.status(500).json({ error: 'Failed to analyze causality', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/nodes/:nodeId/causal-chain
 * Trace causal chain from a source node
 */
router.get('/nodes/:nodeId/causal-chain', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;
    const { maxDepth = 5, direction = 'downstream' } = req.query;

    const chain = await twinsBrainService.getCausalChain(userId, nodeId, {
      maxDepth: parseInt(maxDepth),
      direction
    });

    res.json({
      success: true,
      chain
    });
  } catch (error) {
    log.error('Error getting causal chain:', error);
    res.status(500).json({ error: 'Failed to get causal chain', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/causal/summary
 * Get summary of causal vs correlational edges
 */
router.get('/causal/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await twinsBrainService.getCausalSummary(userId);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    log.error('Error getting causal summary:', error);
    res.status(500).json({ error: 'Failed to get causal summary', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/edges/upgrade-to-causal
 * Upgrade a correlational edge to causal based on new evidence
 */
router.post('/edges/upgrade-to-causal', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceNodeId, targetNodeId, causalType, evidence, reason } = req.body;

    if (!sourceNodeId || !targetNodeId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sourceNodeId', 'targetNodeId']
      });
    }

    const edge = await twinsBrainService.upgradeToCausal(userId, sourceNodeId, targetNodeId, {
      causalType: causalType || 'causes',
      evidence: evidence || [],
      reason
    });

    res.json({
      success: true,
      message: 'Edge upgraded to causal',
      edge
    });
  } catch (error) {
    log.error('Error upgrading to causal:', error);
    res.status(500).json({ error: 'Failed to upgrade to causal', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/causal/config
 * Get causal reasoning configuration
 */
router.get('/causal/config', (req, res) => {
  res.json({
    success: true,
    config: {
      causalTypes: CAUSAL_TYPES,
      correlationalTypes: CORRELATIONAL_TYPES,
      confidenceThresholds: CAUSAL_CONFIDENCE_THRESHOLDS
    }
  });
});

// ====================================================================
// MULTI-CONTEXT PERSONALITY ENDPOINTS (Phase 4)
// ====================================================================

/**
 * POST /api/twins-brain/nodes/:nodeId/context
 * Set context-specific expression level for a node
 */
router.post('/nodes/:nodeId/context', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;
    const { context, expressionLevel, notes } = req.body;

    if (!context || expressionLevel === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['context', 'expressionLevel']
      });
    }

    const node = await twinsBrainService.setNodeContextExpression(
      userId,
      nodeId,
      context,
      parseFloat(expressionLevel),
      notes
    );

    res.json({
      success: true,
      message: 'Context expression set',
      node
    });
  } catch (error) {
    log.error('Error setting context expression:', error);
    res.status(500).json({ error: 'Failed to set context expression', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/nodes/:nodeId/context
 * Get all context expressions for a node
 */
router.get('/nodes/:nodeId/context', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodeId } = req.params;

    const expressions = await twinsBrainService.getNodeContextExpressions(userId, nodeId);

    res.json({
      success: true,
      ...expressions
    });
  } catch (error) {
    log.error('Error getting context expressions:', error);
    res.status(500).json({ error: 'Failed to get context expressions', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/context/:context/graph
 * Get brain graph filtered for a specific context
 */
router.get('/context/:context/graph', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { context } = req.params;
    const { minConfidence, minEdgeStrength } = req.query;

    const graph = await twinsBrainService.getBrainGraphForContext(userId, context, {
      minConfidence: minConfidence ? parseFloat(minConfidence) : 0.3,
      minEdgeStrength: minEdgeStrength ? parseFloat(minEdgeStrength) : 0.3
    });

    res.json({
      success: true,
      ...graph
    });
  } catch (error) {
    log.error('Error getting context graph:', error);
    res.status(500).json({ error: 'Failed to get context graph', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/context/summary
 * Get summary of how personality varies across contexts
 */
router.get('/context/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await twinsBrainService.getContextPersonalitySummary(userId);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    log.error('Error getting context summary:', error);
    res.status(500).json({ error: 'Failed to get context summary', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/context/detect
 * Detect context patterns from behavioral data
 */
router.get('/context/detect', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const patterns = await twinsBrainService.detectContextPatterns(userId);

    res.json({
      success: true,
      ...patterns
    });
  } catch (error) {
    log.error('Error detecting context patterns:', error);
    res.status(500).json({ error: 'Failed to detect context patterns', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * POST /api/twins-brain/context/apply-suggestions
 * Batch apply context expressions based on suggestions
 */
router.post('/context/apply-suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { suggestions } = req.body;

    if (!suggestions || !Array.isArray(suggestions)) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['suggestions (array)']
      });
    }

    const results = await twinsBrainService.applyContextSuggestions(userId, suggestions);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    log.error('Error applying context suggestions:', error);
    res.status(500).json({ error: 'Failed to apply context suggestions', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * GET /api/twins-brain/context/config
 * Get multi-context configuration
 */
router.get('/context/config', (req, res) => {
  res.json({
    success: true,
    config: {
      contextTypes: CONTEXT_TYPES,
      expressionLevels: CONTEXT_EXPRESSION
    }
  });
});

// ====================================================================
// MIGRATION ENDPOINTS
// ====================================================================

/**
 * POST /api/twins-brain/migrate
 * Run data migration from existing sources to brain
 */
router.post('/migrate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { dryRun = false, limit = 500 } = req.body || {};

    // Dynamic import to avoid circular dependencies
    const { brainMigrationService } = await import('../services/brainMigrationService.js');

    log.info(`Starting migration for user ${userId}, dryRun=${dryRun}`);

    const stats = await brainMigrationService.migrateAllData(userId, { dryRun, limit });

    res.json({
      success: true,
      message: dryRun ? 'Dry run complete' : 'Migration complete',
      stats
    });
  } catch (error) {
    log.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

export default router;
