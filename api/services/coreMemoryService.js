/**
 * Core Memory Service — Pinned Context Blocks for Twin Identity
 * ==============================================================
 * Implements Letta-style Core Memory Blocks that are ALWAYS present
 * in the twin's system prompt. Prevents personality drift by anchoring
 * the twin's identity in stable, explicitly managed context.
 *
 * Four blocks:
 *   SOUL_SIGNATURE  — Immutable personality anchor (OCEAN + style + examples)
 *   HUMAN           — Editable user facts (updated by twin + sleep-time agent)
 *   GOALS           — Active goals and priorities
 *   RECENT_CONTEXT  — Auto-generated 48h behavioral summary
 *
 * Research:
 *   - Letta Memory Blocks (docs.letta.com/guides/agents/memory-blocks)
 *   - Identity Drift in LLM Agents (arXiv:2412.00804)
 *   - The Assistant Axis (arXiv:2601.10387)
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('CoreMemory');

// Block definitions with defaults
const BLOCK_DEFINITIONS = Object.freeze({
  soul_signature: {
    displayName: 'Soul Signature',
    maxChars: 1500,
    isImmutable: true, // Only updated via explicit calibration
    defaultContent: ''
  },
  human: {
    displayName: 'Human',
    maxChars: 1500,
    isImmutable: false,
    defaultContent: ''
  },
  goals: {
    displayName: 'Goals',
    maxChars: 800,
    isImmutable: false,
    defaultContent: ''
  },
  recent_context: {
    displayName: 'Recent Context',
    maxChars: 800,
    isImmutable: false, // Updated by background job
    defaultContent: ''
  }
});

const BLOCK_NAMES = Object.keys(BLOCK_DEFINITIONS);

/**
 * Get all core memory blocks for a user.
 * Returns an object keyed by block_name.
 */
export async function getBlocks(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('core_memory_blocks')
      .select('block_name, block_content, max_chars, is_immutable, updated_at, updated_by')
      .eq('user_id', userId);

    if (error) {
      log.error('Failed to fetch core memory blocks', { userId, error });
      return {};
    }

    const blocks = {};
    for (const row of (data || [])) {
      blocks[row.block_name] = {
        content: row.block_content,
        maxChars: row.max_chars,
        isImmutable: row.is_immutable,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by
      };
    }
    return blocks;
  } catch (err) {
    log.error('Error fetching core memory blocks', { userId, error: err.message });
    return {};
  }
}

/**
 * Update a single core memory block.
 * Respects immutability (soul_signature can only be updated by 'calibration' source).
 * Enforces character limit.
 */
export async function updateBlock(userId, blockName, content, updatedBy = 'system') {
  if (!BLOCK_NAMES.includes(blockName)) {
    throw new Error(`Invalid block name: ${blockName}. Valid: ${BLOCK_NAMES.join(', ')}`);
  }

  const def = BLOCK_DEFINITIONS[blockName];

  // Immutability check — soul_signature only via calibration
  if (def.isImmutable && updatedBy !== 'calibration' && updatedBy !== 'system_init') {
    log.warn('Attempted to update immutable block', { userId, blockName, updatedBy });
    throw new Error(`Block "${blockName}" is immutable. Only calibration can update it.`);
  }

  // Enforce character limit
  const trimmedContent = content.slice(0, def.maxChars);
  if (content.length > def.maxChars) {
    log.warn('Block content truncated', {
      userId, blockName,
      original: content.length,
      truncated: trimmedContent.length
    });
  }

  const { data, error } = await supabaseAdmin
    .from('core_memory_blocks')
    .upsert({
      user_id: userId,
      block_name: blockName,
      block_content: trimmedContent,
      max_chars: def.maxChars,
      is_immutable: def.isImmutable,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy
    }, { onConflict: 'user_id,block_name' })
    .select()
    .single();

  if (error) {
    log.error('Failed to update core memory block', { userId, blockName, error });
    throw error;
  }

  log.info('Core memory block updated', { userId, blockName, chars: trimmedContent.length, updatedBy });
  return data;
}

/**
 * Initialize default blocks for a new user.
 * Creates all 4 blocks with empty content.
 * Idempotent — skips blocks that already exist.
 */
export async function initializeBlocks(userId) {
  const existing = await getBlocks(userId);
  const toCreate = [];

  for (const [name, def] of Object.entries(BLOCK_DEFINITIONS)) {
    if (!existing[name]) {
      toCreate.push({
        user_id: userId,
        block_name: name,
        block_content: def.defaultContent,
        max_chars: def.maxChars,
        is_immutable: def.isImmutable,
        updated_at: new Date().toISOString(),
        updated_by: 'system_init'
      });
    }
  }

  if (toCreate.length === 0) {
    log.debug('All core memory blocks already exist', { userId });
    return existing;
  }

  const { error } = await supabaseAdmin
    .from('core_memory_blocks')
    .insert(toCreate);

  if (error) {
    log.error('Failed to initialize core memory blocks', { userId, error });
    throw error;
  }

  log.info('Core memory blocks initialized', { userId, created: toCreate.map(b => b.block_name) });
  return getBlocks(userId);
}

/**
 * Generate the SOUL_SIGNATURE block from existing personality data.
 * Pulls from: personality profile (OCEAN), stylometric fingerprint,
 * recent reflections, and conversation patterns.
 *
 * This is called during calibration or initial setup — not every chat.
 */
export async function generateSoulSignature(userId) {
  try {
    // Fetch personality profile
    const { data: profile } = await supabaseAdmin
      .from('user_personality_profiles')
      .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, stylometric_fingerprint, analyzed_platforms')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch recent reflections for behavioral examples
    const { data: reflections } = await supabaseAdmin
      .from('user_memories')
      .select('content, metadata')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .order('importance_score', { ascending: false })
      .limit(10);

    // Fetch soul signature archetype
    const { data: soulSig } = await supabaseAdmin
      .from('soul_signatures')
      .select('archetype_name, archetype_subtitle, narrative, defining_traits')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Build the block
    const parts = [];

    if (soulSig?.archetype_name) {
      parts.push(`Archetype: "${soulSig.archetype_name}"${soulSig.archetype_subtitle ? ` — ${soulSig.archetype_subtitle}` : ''}`);
    }

    if (profile) {
      const traits = [];
      const o = profile.openness ?? 50;
      const c = profile.conscientiousness ?? 50;
      const e = profile.extraversion ?? 50;
      const a = profile.agreeableness ?? 50;
      const n = profile.neuroticism ?? 50;

      if (o >= 65) traits.push('highly curious, open to new experiences');
      else if (o <= 35) traits.push('practical, prefers the familiar');
      if (c >= 65) traits.push('organized and goal-driven');
      else if (c <= 35) traits.push('flexible and spontaneous');
      if (e >= 65) traits.push('energized by people');
      else if (e <= 35) traits.push('introspective, recharges alone');
      if (a >= 65) traits.push('empathetic and cooperative');
      else if (a <= 35) traits.push('direct and competitive');
      if (n >= 60) traits.push('emotionally sensitive');
      else if (n <= 30) traits.push('emotionally steady');

      if (traits.length > 0) {
        parts.push(`Personality: ${traits.join(', ')}`);
      }

      // Stylometric fingerprint
      const style = profile.stylometric_fingerprint;
      if (style) {
        const styleParts = [];
        if (style.avg_sentence_length) {
          styleParts.push(style.avg_sentence_length < 12 ? 'short sentences' : style.avg_sentence_length > 20 ? 'longer sentences' : 'medium-length sentences');
        }
        if (style.formality_score != null) {
          styleParts.push(style.formality_score < 0.3 ? 'very casual' : style.formality_score < 0.6 ? 'casual-balanced' : 'somewhat formal');
        }
        if (style.emoji_frequency != null && style.emoji_frequency > 0.05) {
          styleParts.push('uses emojis');
        }
        if (styleParts.length > 0) {
          parts.push(`Communication style: ${styleParts.join(', ')}`);
        }
      }

      if (profile.analyzed_platforms?.length > 0) {
        parts.push(`Data sources: ${profile.analyzed_platforms.join(', ')}`);
      }
    }

    // Behavioral examples from top reflections
    if (reflections?.length > 0) {
      const examples = reflections
        .slice(0, 3)
        .map(r => `- ${r.content.slice(0, 150)}`)
        .join('\n');
      parts.push(`Key patterns:\n${examples}`);
    }

    if (soulSig?.narrative) {
      parts.push(`Narrative: ${soulSig.narrative.slice(0, 300)}`);
    }

    const content = parts.join('\n');

    await updateBlock(userId, 'soul_signature', content, 'calibration');
    log.info('Soul signature block generated', { userId, chars: content.length });
    return content;
  } catch (err) {
    log.error('Failed to generate soul signature block', { userId, error: err.message });
    return '';
  }
}

/**
 * Generate the RECENT_CONTEXT block from last 48h of data.
 * Called by the nightly background job (sleep-time agent pattern).
 */
export async function generateRecentContext(userId) {
  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Fetch recent memories (all types)
    const { data: recentMemories } = await supabaseAdmin
      .from('user_memories')
      .select('content, memory_type, importance_score, created_at')
      .eq('user_id', userId)
      .gte('created_at', twoDaysAgo)
      .order('importance_score', { ascending: false })
      .limit(30);

    if (!recentMemories || recentMemories.length === 0) {
      return '';
    }

    // Group by type for summary
    const byType = {};
    for (const m of recentMemories) {
      const type = m.memory_type || 'other';
      if (!byType[type]) byType[type] = [];
      byType[type].push(m.content);
    }

    const parts = [];

    // Platform data highlights
    if (byType.platform_data?.length > 0) {
      parts.push(`Recent activity: ${byType.platform_data.slice(0, 5).join('. ').slice(0, 200)}`);
    }

    // Conversation topics
    if (byType.conversation?.length > 0) {
      parts.push(`Recent conversations touched on: ${byType.conversation.slice(0, 3).map(c => c.slice(0, 50)).join(', ')}`);
    }

    // Key facts
    if (byType.fact?.length > 0) {
      parts.push(`Recently learned: ${byType.fact.slice(0, 3).join('. ').slice(0, 200)}`);
    }

    // Recent reflections
    if (byType.reflection?.length > 0) {
      parts.push(`Recent insight: ${byType.reflection[0].slice(0, 150)}`);
    }

    const content = parts.join('\n');
    await updateBlock(userId, 'recent_context', content, 'background_job');
    log.info('Recent context block generated', { userId, chars: content.length });
    return content;
  } catch (err) {
    log.error('Failed to generate recent context block', { userId, error: err.message });
    return '';
  }
}

/**
 * Generate the GOALS block from active twin goals.
 */
export async function generateGoalsBlock(userId) {
  try {
    const { data: goals } = await supabaseAdmin
      .from('twin_goals')
      .select('title, total_days_met, total_days_tracked, current_streak')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!goals || goals.length === 0) {
      return '';
    }

    const content = goals.map(g => {
      const progress = g.total_days_tracked > 0
        ? ` (${Math.round((g.total_days_met / g.total_days_tracked) * 100)}%)`
        : '';
      const streak = g.current_streak > 0 ? ` - ${g.current_streak} day streak` : '';
      return `- ${g.title}${progress}${streak}`;
    }).join('\n');

    await updateBlock(userId, 'goals', content, 'system');
    log.info('Goals block generated', { userId, goalCount: goals.length });
    return content;
  } catch (err) {
    log.error('Failed to generate goals block', { userId, error: err.message });
    return '';
  }
}

/**
 * Format all core memory blocks for injection into the system prompt.
 * Returns a formatted string ready for prepending to the dynamic context.
 */
export function formatBlocksForPrompt(blocks) {
  if (!blocks || Object.keys(blocks).length === 0) {
    return '';
  }

  const sections = [];

  // Order matters — soul_signature first for maximum attention weight
  const order = ['soul_signature', 'human', 'goals', 'recent_context'];

  for (const name of order) {
    const block = blocks[name];
    if (block?.content && block.content.trim().length > 0) {
      const label = BLOCK_DEFINITIONS[name]?.displayName || name;
      sections.push(`=== ${label.toUpperCase()} ===\n${block.content}`);
    }
  }

  if (sections.length === 0) return '';

  return '\n\n--- CORE IDENTITY (always present, highest priority) ---\n' +
    sections.join('\n\n') +
    '\n--- END CORE IDENTITY ---\n';
}

export { BLOCK_DEFINITIONS, BLOCK_NAMES };
