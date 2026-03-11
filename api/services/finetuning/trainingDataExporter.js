/**
 * Training Data Exporter
 * =====================
 * Exports conversation logs into OpenAI fine-tuning JSONL format.
 *
 * Usage:
 *   import { exportTrainingData } from './trainingDataExporter.js';
 *   const { filePath, stats } = await exportTrainingData({ minTurns: 2 });
 */

import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('Trainingdataexporter');

const DATA_DIR = path.resolve('data/training');

/**
 * Reconstruct system prompt text from stored rendered_system_prompt or conversation context.
 * Falls back to a generic twin system prompt if no stored prompt exists.
 */
function reconstructSystemPrompt(log) {
  // Best case: we stored the full rendered system prompt (Step 2)
  if (log.rendered_system_prompt) {
    return log.rendered_system_prompt;
  }

  // Fallback: build a minimal system prompt from available context
  const parts = [
    'You are a digital twin — an AI that embodies the user\'s personality, knowledge, and communication style.',
    'You speak as if you ARE the user, in first person.',
    'Match their tone: casual, warm, authentic. Never sound like a therapist or data report.',
  ];

  if (log.platforms_context) {
    const platforms = log.platforms_context.platforms_included;
    if (platforms?.length > 0) {
      parts.push(`Context from platforms: ${platforms.join(', ')}.`);
    }
  }

  return parts.join(' ');
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
  const timestamp = new Date().toISOString().split('T')[0];
  const filePath = path.join(DATA_DIR, `twin-finetune-${timestamp}.jsonl`);

  // Ensure output directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const stats = { total: 0, exported: 0, skipped: 0, reasons: {} };
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch conversation logs in batches
    let query = supabaseAdmin
      .from('mcp_conversation_logs')
      .select('id, user_id, user_message, twin_response, platforms_context, rendered_system_prompt, session_id, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: logs, error } = await query;

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
    for (const log of logs) {
      const sessionKey = log.session_id || log.id;
      if (!sessionGroups.has(sessionKey)) {
        sessionGroups.set(sessionKey, []);
      }
      sessionGroups.get(sessionKey).push(log);
    }

    for (const [sessionId, sessionLogs] of sessionGroups) {
      stats.total++;

      // Sort by created_at within session
      sessionLogs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      // Filter out invalid entries
      const validLogs = sessionLogs.filter(log => {
        if (!log.user_message?.trim()) return false;
        if (!log.twin_response?.trim()) return false;
        // Skip error responses
        if (log.twin_response.startsWith('Error:') || log.twin_response.startsWith('I encountered')) return false;
        return true;
      });

      if (validLogs.length < minTurns) {
        stats.skipped++;
        stats.reasons['too_few_turns'] = (stats.reasons['too_few_turns'] || 0) + 1;
        continue;
      }

      // Build messages array
      const messages = [];

      // System prompt from first log in session
      const systemPrompt = reconstructSystemPrompt(validLogs[0]);
      messages.push({ role: 'system', content: systemPrompt });

      // Add all user/assistant turns
      for (const log of validLogs) {
        messages.push({ role: 'user', content: log.user_message.trim() });
        messages.push({ role: 'assistant', content: log.twin_response.trim() });
      }

      // Write JSONL line
      const jsonlLine = JSON.stringify({ messages });
      writeStream.write(jsonlLine + '\n');
      stats.exported++;
    }

    offset += batchSize;
    if (logs.length < batchSize) {
      hasMore = false;
    }
  }

  writeStream.end();

  // Wait for write to finish
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  log.info(`Export complete: ${filePath}`);
  log.info(`Stats: ${stats.exported} exported, ${stats.skipped} skipped out of ${stats.total} sessions`);
  if (Object.keys(stats.reasons).length > 0) {
    log.info(`Skip reasons:`, stats.reasons);
  }

  return { filePath, stats };
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
