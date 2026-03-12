/**
 * Training Data Exporter
 * =====================
 * Exports conversation logs into JSONL format for fine-tuning on together.ai.
 * Builds a condensed personality system prompt from reflections + identity data
 * rather than using the full 20K-char rendered system prompt (too noisy for SFT).
 *
 * Usage:
 *   import { exportTrainingData, buildPersonalitySystemPrompt } from './trainingDataExporter.js';
 *   const { filePath, stats } = await exportTrainingData({ userId: '...' });
 */

import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('TrainingDataExporter');

const DATA_DIR = path.resolve('data/training');

/**
 * Build a condensed personality system prompt for fine-tuning.
 * Pulls: twin summary, top reflections, OCEAN scores, interview archetype.
 * Target: ~800 tokens (focused signal, not full context dump).
 */
export async function buildPersonalitySystemPrompt(userId) {
  const [summaryResult, reflectionsResult, profileResult, calibrationResult] = await Promise.all([
    supabaseAdmin
      .from('twin_summaries')
      .select('summary')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .gte('importance_score', 7)
      .order('importance_score', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('user_personality_profiles')
      .select('ocean_scores, stylometric_fingerprint')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('onboarding_calibration')
      .select('archetype, calibration_data')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const parts = [
    'You are a digital twin — an AI that embodies this specific person\'s personality, knowledge, and communication style.',
    'You speak as if you ARE the person, in first person. Match their tone exactly.',
  ];

  // Archetype from onboarding
  if (calibrationResult.data?.archetype) {
    parts.push(`\nArchetype: ${calibrationResult.data.archetype}`);
  }

  // Twin summary (most concentrated personality signal)
  if (summaryResult.data?.summary) {
    const summary = summaryResult.data.summary.slice(0, 1500);
    parts.push(`\n[WHO YOU ARE]\n${summary}`);
  }

  // OCEAN personality
  if (profileResult.data?.ocean_scores) {
    const o = profileResult.data.ocean_scores;
    const traits = [];
    if (o.openness > 0.65) traits.push('highly creative and open');
    if (o.openness < 0.35) traits.push('practical and concrete');
    if (o.conscientiousness > 0.65) traits.push('organized and precise');
    if (o.conscientiousness < 0.35) traits.push('spontaneous and flexible');
    if (o.extraversion > 0.65) traits.push('energetic and social');
    if (o.extraversion < 0.35) traits.push('introspective and measured');
    if (o.agreeableness > 0.65) traits.push('warm and supportive');
    if (o.agreeableness < 0.35) traits.push('direct and blunt');
    if (o.neuroticism > 0.65) traits.push('emotionally intense');
    if (o.neuroticism < 0.35) traits.push('calm and steady');
    if (traits.length > 0) {
      parts.push(`\n[PERSONALITY] ${traits.join(', ')}`);
    }
  }

  // Stylometric fingerprint
  if (profileResult.data?.stylometric_fingerprint) {
    const s = profileResult.data.stylometric_fingerprint;
    const style = [];
    if (s.avg_sentence_length < 12) style.push('short punchy sentences');
    else if (s.avg_sentence_length > 20) style.push('longer flowing sentences');
    if (s.formality < 0.3) style.push('casual tone');
    else if (s.formality > 0.6) style.push('formal tone');
    if (s.humor_markers > 0.02) style.push('uses humor');
    if (s.emotional_expressiveness > 0.05) style.push('emotionally expressive');
    if (style.length > 0) {
      parts.push(`[WRITING STYLE] ${style.join(', ')}`);
    }
  }

  // Top reflections (distilled personality insights)
  if (reflectionsResult.data?.length > 0) {
    const reflections = reflectionsResult.data.map(r => `- ${r.content.slice(0, 200)}`).join('\n');
    parts.push(`\n[KEY INSIGHTS ABOUT THIS PERSON]\n${reflections}`);
  }

  return parts.join('\n');
}

/**
 * Get system prompt for a training example.
 * Uses condensed personality prompt (preferred) or falls back to stored/generic.
 */
function reconstructSystemPrompt(entry, personalityPrompt) {
  // Prefer the condensed personality prompt built from reflections + identity
  if (personalityPrompt) {
    return personalityPrompt;
  }

  // Fallback: stored rendered prompt (too long for SFT, but better than nothing)
  if (entry.rendered_system_prompt) {
    // Truncate to ~2000 chars to avoid overwhelming the model
    return entry.rendered_system_prompt.slice(0, 2000);
  }

  // Last resort: generic prompt
  return [
    'You are a digital twin — an AI that embodies the user\'s personality, knowledge, and communication style.',
    'You speak as if you ARE the user, in first person.',
    'Match their tone: casual, warm, authentic.',
  ].join(' ');
}

/**
 * Export conversation logs as OpenAI fine-tuning JSONL.
 *
 * @param {Object} opts
 * @param {number} [opts.minTurns=2] - Minimum user+assistant turns to include
 * @param {string} [opts.userId] - Filter to specific user (null = all users)
 * @param {number} [opts.batchSize=500] - DB query batch size
 * @returns {{ filePath: string, stats: { total: number, exported: number, skipped: number } }}
 */
export async function exportTrainingData({ minTurns = 1, userId = null, batchSize = 500 } = {}) {
  if (!userId) {
    throw new Error('userId is required — finetuning is per-user');
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filePath = path.join(DATA_DIR, `twin-finetune-${userId.slice(0, 8)}-${timestamp}.jsonl`);

  // Ensure output directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Build condensed personality prompt once (shared across all examples)
  const personalityPrompt = await buildPersonalitySystemPrompt(userId);
  log.info(`Built personality prompt: ${personalityPrompt.length} chars`);

  const stats = { total: 0, exported: 0, skipped: 0, reasons: {} };
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: logs, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('id, user_message, twin_response, platforms_context, rendered_system_prompt, session_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      log.error('DB query error:', error.message);
      break;
    }

    if (!logs || logs.length === 0) {
      hasMore = false;
      break;
    }

    // Group by session_id to reconstruct multi-turn conversations
    const sessionGroups = new Map();
    for (const entry of logs) {
      const sessionKey = entry.session_id || entry.id;
      if (!sessionGroups.has(sessionKey)) {
        sessionGroups.set(sessionKey, []);
      }
      sessionGroups.get(sessionKey).push(entry);
    }

    for (const [, sessionLogs] of sessionGroups) {
      stats.total++;

      sessionLogs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      const validLogs = sessionLogs.filter(entry => {
        if (!entry.user_message?.trim()) return false;
        if (!entry.twin_response?.trim()) return false;
        if (entry.twin_response.startsWith('Error:') || entry.twin_response.startsWith('I encountered')) return false;
        // Skip metadata-only responses (e.g. "[Imported from Claude Desktop]")
        if (entry.twin_response.includes('[Imported from') || entry.twin_response.includes('[imported from')) return false;
        // Skip very short responses (likely errors or empty)
        if (entry.twin_response.trim().length < 20) return false;
        return true;
      });

      if (validLogs.length < minTurns) {
        stats.skipped++;
        stats.reasons['too_few_turns'] = (stats.reasons['too_few_turns'] || 0) + 1;
        continue;
      }

      // Build messages array with condensed personality prompt
      const messages = [
        { role: 'system', content: reconstructSystemPrompt(validLogs[0], personalityPrompt) },
      ];

      for (const entry of validLogs) {
        messages.push({ role: 'user', content: entry.user_message.trim() });
        messages.push({ role: 'assistant', content: entry.twin_response.trim() });
      }

      writeStream.write(JSON.stringify({ messages }) + '\n');
      stats.exported++;
    }

    offset += batchSize;
    if (logs.length < batchSize) {
      hasMore = false;
    }
  }

  writeStream.end();
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  log.info(`Export complete: ${filePath} — ${stats.exported} examples, ${stats.skipped} skipped`);

  return { filePath, stats, personalityPromptLength: personalityPrompt.length };
}

/**
 * Validate a JSONL file for OpenAI fine-tuning format compliance.
 */
export function validateJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);

      if (!Array.isArray(entry.messages)) {
        errors.push(`Line ${i + 1}: missing or invalid 'messages' array`);
        continue;
      }

      if (entry.messages.length < 3) {
        errors.push(`Line ${i + 1}: needs at least system + user + assistant (got ${entry.messages.length})`);
        continue;
      }

      if (entry.messages[0].role !== 'system') {
        errors.push(`Line ${i + 1}: first message must be 'system' role`);
      }

      // Check alternating user/assistant after system
      for (let j = 1; j < entry.messages.length; j++) {
        const expectedRole = j % 2 === 1 ? 'user' : 'assistant';
        if (entry.messages[j].role !== expectedRole) {
          errors.push(`Line ${i + 1}: message ${j} expected '${expectedRole}', got '${entry.messages[j].role}'`);
        }
      }

      // Last message must be assistant
      if (entry.messages[entry.messages.length - 1].role !== 'assistant') {
        errors.push(`Line ${i + 1}: last message must be 'assistant' role`);
      }
    } catch (parseErr) {
      errors.push(`Line ${i + 1}: invalid JSON — ${parseErr.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    totalLines: lines.length,
    errors,
  };
}

export default { exportTrainingData, validateJsonl };
