/**
 * Fine-Tune Manager — together.ai
 * ================================
 * Manages fine-tuning jobs on together.ai for per-user personality models.
 * Uses Qwen2.5-7B-Instruct as base model (best cost/quality per Simile Paper 4).
 *
 * together.ai API docs: https://docs.together.ai/reference/fine-tuning
 */

import fs from 'fs';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('FinetuneManager');

const BASE_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Reference'; // Supports serverless LoRA inference
const TOGETHER_API = 'https://api.together.xyz/v1';

function getApiKey() {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY environment variable is required');
  return key;
}

/**
 * Upload a JSONL file to together.ai and start a fine-tuning job.
 *
 * @param {string} userId - User ID for tracking
 * @param {string} filePath - Path to JSONL training file
 * @param {Object} [opts]
 * @param {number} [opts.nEpochs=3] - Training epochs
 * @param {number} [opts.batchSize=8] - Batch size
 * @param {number} [opts.learningRate=1e-5] - Learning rate
 * @returns {{ jobId: string, status: string }}
 */
export async function createFinetune(userId, filePath, {
  nEpochs = 3,
  batchSize = 8,
  learningRate = 1e-5,
  suffix = 'twinme',
  trainingMethod = 'sft',
} = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Training file not found: ${filePath}`);
  }

  const apiKey = getApiKey();

  // Step 1: Upload file via together.ai JS SDK
  log.info(`Uploading training file for user ${userId.slice(0, 8)}...`);

  let fileId;
  try {
    log.info(`File exists check: ${fs.existsSync(filePath)}, size: ${fs.existsSync(filePath) ? fs.statSync(filePath).size : 'N/A'} bytes`);
    const Together = (await import('together-ai')).default;
    const together = new Together({ apiKey });
    // SDK upload(file, purpose, check) — file can be path string or ReadStream
    const uploadResult = await together.files.upload(filePath, 'fine-tune', false);
    fileId = uploadResult.id;
  } catch (uploadErr) {
    log.error('Upload error details:', uploadErr.stack || uploadErr.message);
    throw new Error(`File upload failed: ${uploadErr.message}`);
  }
  log.info(`File uploaded: ${fileId}`);

  // Step 2: Create fine-tuning job
  const jobBody = {
    training_file: fileId,
    model: BASE_MODEL,
    n_epochs: nEpochs,
    batch_size: batchSize,
    learning_rate: learningRate,
    suffix: `${suffix}-${userId.slice(0, 8)}`,
    ...(trainingMethod === 'dpo' ? { training_method: 'dpo', dpo_beta: 0.1 } : {}),
  };

  const jobRes = await fetch(`${TOGETHER_API}/fine-tunes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jobBody),
  });

  if (!jobRes.ok) {
    const err = await jobRes.text();
    throw new Error(`Fine-tune job creation failed: ${jobRes.status} — ${err}`);
  }

  const jobData = await jobRes.json();
  log.info(`Fine-tune job created: ${jobData.id} (status: ${jobData.status})`);

  // Step 3: Record in database
  const { error: dbError } = await supabaseAdmin
    .from('user_finetuned_models')
    .upsert({
      user_id: userId,
      provider: 'together',
      base_model: BASE_MODEL,
      job_id: jobData.id,
      status: jobData.status || 'pending',
      training_method: trainingMethod,
      metadata: { file_id: fileId, hyperparams: jobBody },
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id, provider' });

  if (dbError) {
    log.error('Failed to record job in DB:', dbError.message);
  }

  return { jobId: jobData.id, fileId, status: jobData.status || 'pending' };
}

/**
 * Check the status of a fine-tuning job and update DB if complete.
 *
 * @param {string} userId
 * @returns {{ status: string, modelId: string|null }}
 */
export async function checkFinetuneStatus(userId) {
  const { data: record } = await supabaseAdmin
    .from('user_finetuned_models')
    .select('job_id, status, model_id')
    .eq('user_id', userId)
    .eq('provider', 'together')
    .maybeSingle();

  if (!record) return { status: 'no_model', modelId: null };
  if (record.status === 'ready') return { status: 'ready', modelId: record.model_id };
  if (!record.job_id) return { status: record.status, modelId: null };

  // Poll together.ai
  const apiKey = getApiKey();
  const res = await fetch(`${TOGETHER_API}/fine-tunes/${record.job_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    log.error(`Status check failed: ${res.status}`);
    return { status: record.status, modelId: null };
  }

  const job = await res.json();

  // Update DB if status changed
  if (job.status !== record.status || job.output?.model_id) {
    const update = { status: job.status };
    if (job.output?.model_id) {
      update.model_id = job.output.model_id;
      update.status = 'ready';
      update.completed_at = new Date().toISOString();
    }
    if (job.status === 'failed') {
      update.metadata = { ...record.metadata, error: job.error || 'Unknown error' };
    }
    if (job.training_tokens) {
      update.training_examples = job.training_examples || 0;
    }

    await supabaseAdmin
      .from('user_finetuned_models')
      .update(update)
      .eq('user_id', userId)
      .eq('provider', 'together');
  }

  return {
    status: job.output?.model_id ? 'ready' : job.status,
    modelId: job.output?.model_id || null,
    trainedTokens: job.training_tokens || 0,
  };
}

/**
 * Get the finetuned model ID for a user (if ready).
 *
 * @param {string} userId
 * @returns {string|null}
 */
export async function getModelId(userId) {
  const { data } = await supabaseAdmin
    .from('user_finetuned_models')
    .select('model_id')
    .eq('user_id', userId)
    .eq('provider', 'together')
    .eq('status', 'ready')
    .maybeSingle();

  return data?.model_id || null;
}

export default { createFinetune, checkFinetuneStatus, getModelId };
