/**
 * DPO Data Exporter — together.ai Format
 * ========================================
 * Exports preference pairs as JSONL for DPO fine-tuning.
 * Each line: { input, preferred_output, non_preferred_output }
 */

import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../database.js';
import { buildPersonalitySystemPrompt } from './trainingDataExporter.js';
import { createLogger } from '../logger.js';

const log = createLogger('DPODataExporter');
const DATA_DIR = path.resolve('data/training');

/**
 * Export all preference pairs for a user as a DPO JSONL file.
 *
 * @param {string} userId
 * @returns {{ filePath: string|null, stats: { total: number, exported: number } }}
 */
export async function exportDPOTrainingData(userId) {
  if (!userId) throw new Error('userId is required');

  const timestamp = new Date().toISOString().split('T')[0];
  const filePath = path.join(DATA_DIR, `twin-dpo-${userId.slice(0, 8)}-${timestamp}.jsonl`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const personalityPrompt = await buildPersonalitySystemPrompt(userId);

  const { data: pairs, error } = await supabaseAdmin
    .from('preference_pairs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`DB query failed: ${error.message}`);
  if (!pairs || pairs.length === 0) return { filePath: null, stats: { total: 0, exported: 0 } };

  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  let exported = 0;

  for (const pair of pairs) {
    const promptMessages = [
      { role: 'system', content: personalityPrompt },
      ...(Array.isArray(pair.prompt_messages) ? pair.prompt_messages : []),
    ];

    const input = promptMessages.map(m => `<|${m.role}|>\n${m.content}`).join('\n');

    writeStream.write(JSON.stringify({
      input,
      preferred_output: pair.chosen_response,
      non_preferred_output: pair.rejected_response,
    }) + '\n');
    exported++;
  }

  writeStream.end();
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  log.info(`DPO export complete: ${filePath} — ${exported} pairs`);
  return { filePath, stats: { total: pairs.length, exported } };
}
