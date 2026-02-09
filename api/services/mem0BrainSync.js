/**
 * MEM0 → TWINS BRAIN SYNC SERVICE
 *
 * Promotes mem0 facts to Twins Brain knowledge nodes.
 * Inspired by X's Phoenix ranking system - learns patterns from sequences.
 *
 * FLOW:
 * 1. Fetch unsynced mem0 facts
 * 2. Classify each fact (type, category)
 * 3. Check for duplicates/similar nodes in Brain
 * 4. Create new nodes or reinforce existing ones
 * 5. Create edges between related nodes
 * 6. Mark facts as synced
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './database.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Classification prompt for Claude
const CLASSIFICATION_PROMPT = `You are a knowledge classifier for a personal digital twin system.

Given a fact about a user, classify it into:

1. node_type: One of:
   - "preference" (likes/dislikes, favorites)
   - "trait" (personality characteristics, tendencies)
   - "behavior" (habits, routines, patterns)
   - "interest" (topics, hobbies, curiosities)
   - "fact" (objective information about the user)
   - "correlation" (observed relationship between things)

2. category: One of:
   - "personal" (lifestyle, wellness, relationships)
   - "professional" (work, career, skills)
   - "entertainment" (music, movies, games)
   - "health" (fitness, sleep, recovery)
   - "social" (friends, community, communication)
   - "creative" (art, design, creation)
   - "learning" (education, growth, curiosity)

3. label: A short (2-5 word) title for this knowledge node

4. keywords: Array of 2-4 keywords for finding related nodes

5. confidence: 0.0-1.0 based on how certain/specific the fact is

Respond ONLY with valid JSON, no other text:
{"node_type": "...", "category": "...", "label": "...", "keywords": [...], "confidence": 0.X}

FACT TO CLASSIFY:
`;

/**
 * Classify a mem0 fact using Claude
 */
async function classifyFact(factText) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      temperature: 0,
      messages: [{
        role: 'user',
        content: CLASSIFICATION_PROMPT + factText
      }]
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('[Mem0Sync] Classification error:', error.message);
    return null;
  }
}

/**
 * Find similar existing nodes in Twins Brain
 */
async function findSimilarNodes(userId, label, keywords) {
  try {
    // Search by label similarity
    const { data: labelMatches } = await supabaseAdmin
      .from('brain_nodes')
      .select('id, label, node_type, confidence, strength')
      .eq('user_id', userId)
      .ilike('label', `%${label.split(' ')[0]}%`)
      .limit(5);

    // Search by keywords in tags
    const { data: tagMatches } = await supabaseAdmin
      .from('brain_nodes')
      .select('id, label, node_type, confidence, strength, tags')
      .eq('user_id', userId)
      .overlaps('tags', keywords)
      .limit(5);

    // Combine and dedupe
    const allMatches = [...(labelMatches || []), ...(tagMatches || [])];
    const unique = allMatches.filter((node, index, self) =>
      index === self.findIndex(n => n.id === node.id)
    );

    return unique;
  } catch (error) {
    console.error('[Mem0Sync] Error finding similar nodes:', error.message);
    return [];
  }
}

/**
 * Create a new brain node from a mem0 fact
 */
async function createBrainNode(userId, fact, classification) {
  try {
    const node = {
      user_id: userId,
      node_type: classification.node_type,
      category: classification.category,
      label: classification.label,
      description: fact.memory,
      confidence: classification.confidence,
      strength: 0.5, // Start at 50%, increases with reinforcement
      source_type: 'mem0_sync',
      source_id: fact.id,
      platform: fact.metadata?.platform || null,
      data: {
        original_fact: fact.memory,
        extracted_at: fact.timestamp,
        source: fact.metadata?.source || 'conversation',
        classification
      },
      tags: classification.keywords,
      first_detected: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      last_confirmed: new Date().toISOString(),
      privacy_level: 50,
      shared_with_twin: true,
      user_confirmed: false
    };

    const { data, error } = await supabaseAdmin
      .from('brain_nodes')
      .insert(node)
      .select('id, label')
      .single();

    if (error) throw error;

    console.log(`[Mem0Sync] Created brain node: "${classification.label}" (${data.id})`);
    return data;
  } catch (error) {
    console.error('[Mem0Sync] Error creating node:', error.message);
    return null;
  }
}

/**
 * Reinforce an existing brain node
 */
async function reinforceNode(nodeId, fact) {
  try {
    // Get current node
    const { data: node } = await supabaseAdmin
      .from('brain_nodes')
      .select('strength, confidence, data')
      .eq('id', nodeId)
      .single();

    if (!node) return null;

    // Increase strength (max 1.0)
    const newStrength = Math.min(1.0, (node.strength || 0.5) + 0.1);
    const newConfidence = Math.min(1.0, (node.confidence || 0.5) + 0.05);

    // Update node
    const { error } = await supabaseAdmin
      .from('brain_nodes')
      .update({
        strength: newStrength,
        confidence: newConfidence,
        last_confirmed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        data: {
          ...node.data,
          reinforcement_count: (node.data?.reinforcement_count || 0) + 1,
          last_reinforced_by: fact.id
        }
      })
      .eq('id', nodeId);

    if (error) throw error;

    console.log(`[Mem0Sync] Reinforced node ${nodeId}: strength ${newStrength.toFixed(2)}`);
    return { nodeId, newStrength };
  } catch (error) {
    console.error('[Mem0Sync] Error reinforcing node:', error.message);
    return null;
  }
}

/**
 * Create edges between related nodes
 */
async function createEdgesBetweenKeywords(userId, newNodeId, keywords) {
  try {
    // Find nodes that share keywords
    const { data: relatedNodes } = await supabaseAdmin
      .from('brain_nodes')
      .select('id, label, tags')
      .eq('user_id', userId)
      .neq('id', newNodeId)
      .overlaps('tags', keywords)
      .limit(5);

    if (!relatedNodes || relatedNodes.length === 0) return [];

    const edges = [];
    for (const related of relatedNodes) {
      // Calculate edge strength based on keyword overlap
      const sharedKeywords = keywords.filter(k =>
        related.tags?.includes(k)
      );
      const strength = sharedKeywords.length / Math.max(keywords.length, 1);

      if (strength > 0.2) { // Only create meaningful connections
        const edge = {
          user_id: userId,
          from_node_id: newNodeId,
          to_node_id: related.id,
          relationship_type: 'relates_to',
          strength: strength,
          confidence: 0.6,
          evidence: {
            shared_keywords: sharedKeywords,
            source: 'mem0_sync'
          },
          created_at: new Date().toISOString()
        };

        const { error } = await supabaseAdmin
          .from('brain_edges')
          .insert(edge);

        if (!error) {
          edges.push({ from: newNodeId, to: related.id, strength });
        }
      }
    }

    if (edges.length > 0) {
      console.log(`[Mem0Sync] Created ${edges.length} edges for node`);
    }
    return edges;
  } catch (error) {
    console.error('[Mem0Sync] Error creating edges:', error.message);
    return [];
  }
}

/**
 * Mark a mem0 fact as synced to brain
 */
async function markFactAsSynced(factId, brainNodeId) {
  try {
    // Fetch current metadata and update
    const { data: mem } = await supabaseAdmin
      .from('user_memories')
      .select('metadata')
      .eq('id', factId)
      .single();

    if (mem) {
      const { error } = await supabaseAdmin
        .from('user_memories')
        .update({
          metadata: {
            ...(mem.metadata || {}),
            synced_to_brain: true,
            brain_node_id: brainNodeId,
            synced_at: new Date().toISOString()
          }
        })
        .eq('id', factId);

      if (error) {
        console.error('[Mem0Sync] Error updating metadata:', error.message);
      }
    }
  } catch (error) {
    console.error('[Mem0Sync] Error marking synced:', error.message);
  }
}

/**
 * Get unsynced mem0 facts
 */
async function getUnsyncedFacts(userId, limit = 20) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .or('metadata->synced_to_brain.is.null,metadata->synced_to_brain.eq.false')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Mem0Sync] Error fetching unsynced facts:', error.message);
    return [];
  }
}

/**
 * MAIN SYNC FUNCTION
 * Syncs mem0 facts to Twins Brain for a user
 */
export async function syncMem0ToBrain(userId, options = {}) {
  const { limit = 20, dryRun = false } = options;

  console.log(`\n[Mem0Sync] Starting sync for user ${userId}`);
  console.log(`[Mem0Sync] Options: limit=${limit}, dryRun=${dryRun}`);

  const results = {
    processed: 0,
    created: 0,
    reinforced: 0,
    skipped: 0,
    edges: 0,
    errors: 0
  };

  try {
    // Get unsynced facts
    const facts = await getUnsyncedFacts(userId, limit);
    console.log(`[Mem0Sync] Found ${facts.length} unsynced facts`);

    if (facts.length === 0) {
      return { success: true, message: 'No unsynced facts', results };
    }

    for (const fact of facts) {
      results.processed++;

      try {
        // 1. Classify the fact
        console.log(`\n[Mem0Sync] Processing: "${fact.content?.substring(0, 50)}..."`);
        const classification = await classifyFact(fact.content);

        if (!classification) {
          console.log('[Mem0Sync] Could not classify, skipping');
          results.skipped++;
          continue;
        }

        console.log(`[Mem0Sync] Classified as: ${classification.node_type}/${classification.category} - "${classification.label}"`);

        // 2. Check for similar existing nodes
        const similarNodes = await findSimilarNodes(
          userId,
          classification.label,
          classification.keywords
        );

        if (dryRun) {
          console.log(`[Mem0Sync] DRY RUN - would create/reinforce node`);
          results.created++;
          continue;
        }

        // 3. Create or reinforce
        if (similarNodes.length > 0) {
          // Check for high similarity (same label)
          const exactMatch = similarNodes.find(n =>
            n.label.toLowerCase() === classification.label.toLowerCase()
          );

          if (exactMatch) {
            await reinforceNode(exactMatch.id, fact);
            await markFactAsSynced(fact.id, exactMatch.id);
            results.reinforced++;
          } else {
            // Create new node but link to similar ones
            const newNode = await createBrainNode(userId, {
              ...fact,
              memory: fact.content
            }, classification);

            if (newNode) {
              const edges = await createEdgesBetweenKeywords(
                userId,
                newNode.id,
                classification.keywords
              );
              results.edges += edges.length;
              await markFactAsSynced(fact.id, newNode.id);
              results.created++;
            }
          }
        } else {
          // No similar nodes - create new
          const newNode = await createBrainNode(userId, {
            ...fact,
            memory: fact.content
          }, classification);

          if (newNode) {
            const edges = await createEdgesBetweenKeywords(
              userId,
              newNode.id,
              classification.keywords
            );
            results.edges += edges.length;
            await markFactAsSynced(fact.id, newNode.id);
            results.created++;
          }
        }

      } catch (factError) {
        console.error(`[Mem0Sync] Error processing fact:`, factError.message);
        results.errors++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n[Mem0Sync] Sync complete!`);
    console.log(`[Mem0Sync] Results:`, results);

    return { success: true, results };

  } catch (error) {
    console.error('[Mem0Sync] Sync failed:', error);
    return { success: false, error: error.message, results };
  }
}

/**
 * Get sync status for a user
 */
export async function getSyncStatus(userId) {
  try {
    // Count total facts
    const { count: totalFacts } = await supabaseAdmin
      .from('user_memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('memory_type', 'fact');

    // Count synced facts
    const { data: syncedData } = await supabaseAdmin
      .from('user_memories')
      .select('id')
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .not('metadata->synced_to_brain', 'is', null)
      .eq('metadata->synced_to_brain', true);

    const syncedFacts = syncedData?.length || 0;

    // Count brain nodes from mem0
    const { count: brainNodes } = await supabaseAdmin
      .from('brain_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source_type', 'mem0_sync');

    return {
      totalFacts,
      syncedFacts,
      unsyncedFacts: totalFacts - syncedFacts,
      brainNodesFromMem0: brainNodes || 0,
      syncPercentage: totalFacts > 0 ? Math.round((syncedFacts / totalFacts) * 100) : 0
    };
  } catch (error) {
    console.error('[Mem0Sync] Error getting status:', error.message);
    return null;
  }
}

export default {
  syncMem0ToBrain,
  getSyncStatus,
  classifyFact,
  findSimilarNodes
};
