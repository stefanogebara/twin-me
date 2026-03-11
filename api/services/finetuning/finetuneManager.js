/**
 * Fine-Tune Manager
 * =================
 * Manages OpenAI fine-tuning jobs for the twin chat model.
 *
 * Usage:
 *   import { startFineTune, checkFineTuneStatus } from './finetuneManager.js';
 *   const job = await startFineTune('data/training/twin-finetune-2026-03-06.jsonl');
 */

import fs from 'fs';
import OpenAI from 'openai';
import { createLogger } from '../logger.js';

const log = createLogger('Finetunemanager');

const BASE_MODEL = 'gpt-4o-mini-2024-07-18';

/** Lazy-initialized OpenAI client (avoids crash when env isn't loaded at import time) */
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required for fine-tuning');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Upload a JSONL file and start a fine-tuning job.
 *
 * @param {string} filePath - Path to the JSONL training file
 * @param {Object} [opts]
 * @param {string} [opts.suffix] - Model suffix for identification (e.g., 'twinme-v1')
 * @param {number} [opts.nEpochs] - Number of training epochs (default: auto)
 * @returns {{ jobId: string, fileId: string, status: string }}
 */
export async function startFineTune(filePath, { suffix = 'twinme', nEpochs } = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Training file not found: ${filePath}`);
  }

  // Step 1: Upload the training file
  log.info(`Uploading training file: ${filePath}`);
  const file = await getOpenAI().files.create({
    file: fs.createReadStream(filePath),
    purpose: 'fine-tune',
  });
  log.info(`File uploaded: ${file.id}`);

  // Step 2: Create fine-tuning job
  const jobParams = {
    training_file: file.id,
    model: BASE_MODEL,
    suffix,
  };
  if (nEpochs) {
    jobParams.hyperparameters = { n_epochs: nEpochs };
  }

  log.info(`Starting fine-tune job on ${BASE_MODEL}...`);
  const job = await getOpenAI().fineTuning.jobs.create(jobParams);
  log.info(`Job created: ${job.id} (status: ${job.status})`);

  return {
    jobId: job.id,
    fileId: file.id,
    status: job.status,
    model: BASE_MODEL,
  };
}

/**
 * Check the status of a fine-tuning job.
 *
 * @param {string} jobId
 * @returns {{ status: string, fineTunedModel: string|null, error: string|null, trainedTokens: number }}
 */
export async function checkFineTuneStatus(jobId) {
  const job = await getOpenAI().fineTuning.jobs.retrieve(jobId);

  return {
    status: job.status,
    fineTunedModel: job.fine_tuned_model || null,
    error: job.error?.message || null,
    trainedTokens: job.trained_tokens || 0,
    createdAt: job.created_at,
    finishedAt: job.finished_at,
  };
}

/**
 * List recent fine-tuning jobs.
 *
 * @param {number} [limit=10]
 * @returns {Array<{ id: string, status: string, model: string, fineTunedModel: string|null }>}
 */
export async function listFineTuneJobs(limit = 10) {
  const jobs = await getOpenAI().fineTuning.jobs.list({ limit });

  return jobs.data.map(job => ({
    id: job.id,
    status: job.status,
    model: job.model,
    fineTunedModel: job.fine_tuned_model || null,
    createdAt: job.created_at,
    finishedAt: job.finished_at,
    trainedTokens: job.trained_tokens || 0,
  }));
}

export default { startFineTune, checkFineTuneStatus, listFineTuneJobs };
