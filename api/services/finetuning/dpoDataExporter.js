import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('DPODataExporter');

const MIN_QUALITY_SCORE = 0.15;
const TRAIN_SPLIT_RATIO = 0.9;

/**
 * Format messages array into a prompt string for DPO training.
 * Compatible with together.ai DPO JSONL format.
 */
function formatPrompt(messages) {
  return messages
    .map(m => `<|${m.role}|>\n${m.content}`)
    .join('\n');
}

/**
 * Write an array of JSONL lines to a temporary file.
 * @param {string[]} lines - JSONL lines to write
 * @param {string} label - File label (e.g. 'train', 'eval')
 * @returns {string} Absolute path to the written file
 */
function writeToTempFile(lines, label) {
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const fileName = `dpo_${label}_${uniqueId}.jsonl`;
  const filePath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  return filePath;
}

/**
 * Export DPO training data for a user as together.ai-compatible JSONL files.
 * Filters by quality_score, splits into train/eval sets, writes to temp files,
 * and marks exported pairs as used_in_training.
 *
 * @param {string} userId
 * @param {number} [minPairs=200] - Minimum pairs required (after quality filter)
 * @returns {{ trainFilePath: string, evalFilePath: string, trainCount: number, evalCount: number, error?: string }}
 */
export async function exportDPOTrainingData(userId, minPairs = 200) {
  // Fetch pairs filtered by quality_score, sorted by quality DESC
  const { data, error } = await supabaseAdmin
    .from('preference_pairs')
    .select('id, prompt_messages, chosen_response, rejected_response, quality_score')
    .eq('user_id', userId)
    .gte('quality_score', MIN_QUALITY_SCORE)
    .order('quality_score', { ascending: false });

  if (error) {
    log.error('Failed to fetch preference pairs', { error: error.message });
    return { trainFilePath: null, evalFilePath: null, trainCount: 0, evalCount: 0, error: error.message };
  }

  const pairs = data || [];

  if (pairs.length < minPairs) {
    return {
      trainFilePath: null,
      evalFilePath: null,
      trainCount: 0,
      evalCount: pairs.length,
      error: `Need ${minPairs} quality pairs (score >= ${MIN_QUALITY_SCORE}), have ${pairs.length}`,
    };
  }

  // Convert to JSONL lines
  const allLines = pairs.map(pair => {
    const prompt = formatPrompt(pair.prompt_messages);
    return JSON.stringify({
      input: prompt,
      preferred_output: pair.chosen_response,
      non_preferred_output: pair.rejected_response,
    });
  });

  // Split 90/10 into train/eval
  const splitIndex = Math.floor(allLines.length * TRAIN_SPLIT_RATIO);
  const trainLines = allLines.slice(0, splitIndex);
  const evalLines = allLines.slice(splitIndex);

  // Write to temp files
  const trainFilePath = writeToTempFile(trainLines, 'train');
  const evalFilePath = writeToTempFile(evalLines, 'eval');

  log.info('DPO data exported to temp files', {
    userId: userId.slice(0, 8),
    trainCount: trainLines.length,
    evalCount: evalLines.length,
    trainFilePath,
    evalFilePath,
  });

  // Mark all exported pairs as used_in_training
  const pairIds = pairs.map(p => p.id);
  const { error: updateError } = await supabaseAdmin
    .from('preference_pairs')
    .update({ used_in_training: true })
    .in('id', pairIds);

  if (updateError) {
    log.warn('Failed to mark pairs as used_in_training', { error: updateError.message });
    // Non-fatal: data is already exported, training can proceed
  }

  return {
    trainFilePath,
    evalFilePath,
    trainCount: trainLines.length,
    evalCount: evalLines.length,
  };
}
