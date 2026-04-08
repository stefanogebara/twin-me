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
    const fileContent = fs.readFileSync(filePath);
    const fileSize = fileContent.length;
    const fileName = filePath.split(/[/\\]/).pop() || 'training.jsonl';
    log.info(`File ready: ${fileName}, ${fileSize} bytes`);

    // Step 1a: Request upload URL from together.ai (returns 302 redirect)
    const params = new URLSearchParams({ file_name: fileName, file_type: 'jsonl', purpose: 'fine-tune' });
    const initRes = await fetch(`${TOGETHER_API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${apiKey}` },
      redirect: 'manual',
      body: params.toString(),
    });

    if (initRes.status !== 302) {
      throw new Error(`Init upload failed: ${initRes.status} ${await initRes.text()}`);
    }

    const uploadUrl = initRes.headers.get('location');
    fileId = initRes.headers.get('x-together-file-id');
    if (!uploadUrl || !fileId) throw new Error('Missing upload URL or file ID from redirect');

    // Step 1b: PUT file content to the signed upload URL
    const fileString = fileContent.toString('utf-8');
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': Buffer.byteLength(fileString).toString() },
      body: fileString,
    });
    log.info(`PUT response: ${putRes.status}, uploaded ${Buffer.byteLength(fileString)} bytes`);

    if (!putRes.ok) throw new Error(`PUT upload failed: ${putRes.status} ${putRes.statusText}`);
  } catch (uploadErr) {
    throw new Error(`File upload failed: ${uploadErr.message}`);
  }
  log.info(`File uploaded: ${fileId}`);

  // Wait for together.ai to process the file (poll up to 60s)
  const FILE_POLL_INTERVAL_MS = 5_000;
  const FILE_POLL_MAX_MS = 60_000;
  const fileStart = Date.now();
  while (Date.now() - fileStart < FILE_POLL_MAX_MS) {
    try {
      const checkRes = await fetch(`${TOGETHER_API}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (checkRes.ok) {
        const fileInfo = await checkRes.json();
        if (fileInfo.object === 'file' && (fileInfo.status === 'processed' || fileInfo.bytes > 0)) {
          log.info(`File processed: ${fileId}`, { status: fileInfo.status });
          break;
        }
        log.info(`File processing: ${fileId}`, { status: fileInfo.status });
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, FILE_POLL_INTERVAL_MS));
  }

  // Step 2: Create fine-tuning job
  const jobBody = {
    training_file: fileId,
    model: BASE_MODEL,
    n_epochs: nEpochs,
    batch_size: batchSize,
    learning_rate: learningRate,
    suffix: `${suffix}-${userId.slice(0, 8)}`,
    lora: true,
    n_checkpoints: 1,
    ...(trainingMethod === 'dpo' ? { training_method: { method: 'dpo', dpo_beta: 0.1 } } : {}),
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
    throw new Error(`Fine-tune job creation failed: ${jobRes.status} — fileId=${fileId} — ${err} — body=${JSON.stringify(jobBody)}`);
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
    .select('model_id, sft_model_id, training_method')
    .eq('user_id', userId)
    .eq('provider', 'together')
    .eq('status', 'ready')
    .maybeSingle();

  if (!data) return null;

  return {
    modelId: data.model_id,
    sftModelId: data.sft_model_id,
    trainingMethod: data.training_method || 'sft',
  };
}

export default { createFinetune, checkFinetuneStatus, getModelId };
